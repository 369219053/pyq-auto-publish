/**
 * 飞书与RPA衔接服务
 * 功能：作为中间服务器，连接飞书表格和RPA脚本
 */

const express = require('express');
const cron = require('node-cron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class FeishuRPABridge {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.isRPARunning = false;
    this.taskQueue = [];
    
    this.setupExpress();
    this.startScheduler();
  }

  /**
   * 设置Express服务器
   */
  setupExpress() {
    this.app.use(express.json());
    
    // RPA状态回调接口
    this.app.post('/rpa/callback', (req, res) => {
      this.handleRPACallback(req.body);
      res.json({ success: true });
    });
    
    // 手动触发发布接口
    this.app.post('/publish/trigger', async (req, res) => {
      try {
        await this.processPublishTasks();
        res.json({ success: true, message: '发布任务已触发' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // 查看任务队列状态
    this.app.get('/status', (req, res) => {
      res.json({
        isRPARunning: this.isRPARunning,
        queueLength: this.taskQueue.length,
        tasks: this.taskQueue
      });
    });
  }

  /**
   * 启动定时调度器
   */
  startScheduler() {
    // 每10分钟检查一次飞书表格
    cron.schedule('*/10 * * * *', async () => {
      console.log('开始检查飞书表格...');
      await this.checkFeishuTasks();
    });
    
    // 每5分钟处理一次发布队列
    cron.schedule('*/5 * * * *', async () => {
      if (!this.isRPARunning && this.taskQueue.length > 0) {
        console.log('开始处理发布队列...');
        await this.processPublishTasks();
      }
    });
    
    console.log('定时调度器已启动');
  }

  /**
   * 检查飞书表格中的待发布任务
   */
  async checkFeishuTasks() {
    try {
      const response = await fetch(`${this.config.feishu.apiBase}/bitable/v1/apps/${this.config.feishu.appToken}/tables/${this.config.feishu.tableId}/records`, {
        headers: {
          'Authorization': `Bearer ${this.config.feishu.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      // 筛选待发布的内容
      const pendingTasks = data.data.items.filter(item => {
        const status = item.fields.status;
        const scheduleTime = new Date(item.fields.schedule_time);
        const now = new Date();
        
        return status === '待发布' && scheduleTime <= now;
      });

      console.log(`发现 ${pendingTasks.length} 个待发布任务`);

      // 添加到任务队列
      for (let task of pendingTasks) {
        const taskData = {
          id: task.record_id,
          content: task.fields.draft,
          images: task.fields.images || [],
          links: task.fields.links || [],
          targetAccounts: task.fields.target_wechats || [],
          scheduleTime: task.fields.schedule_time,
          publishMode: task.fields.publish_type || 'immediate',
          priority: task.fields.priority || 'normal',
          createdAt: new Date().toISOString()
        };
        
        // 避免重复添加
        if (!this.taskQueue.find(t => t.id === taskData.id)) {
          this.taskQueue.push(taskData);
          
          // 更新飞书状态为"处理中"
          await this.updateFeishuStatus(taskData.id, '处理中');
        }
      }

      // 按优先级和时间排序
      this.taskQueue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority === 'high' ? -1 : 1;
        }
        return new Date(a.scheduleTime) - new Date(b.scheduleTime);
      });

    } catch (error) {
      console.error('检查飞书任务失败:', error);
    }
  }

  /**
   * 处理发布任务队列
   */
  async processPublishTasks() {
    if (this.isRPARunning) {
      console.log('RPA正在运行中，跳过本次处理');
      return;
    }

    if (this.taskQueue.length === 0) {
      console.log('任务队列为空');
      return;
    }

    this.isRPARunning = true;
    console.log(`开始处理 ${this.taskQueue.length} 个发布任务`);

    try {
      // 取出第一个任务
      const currentTask = this.taskQueue.shift();
      
      // 准备RPA执行数据
      const rpaData = await this.prepareRPAData(currentTask);
      
      // 启动RPA脚本
      await this.executeRPA(rpaData);
      
    } catch (error) {
      console.error('处理发布任务失败:', error);
      this.isRPARunning = false;
    }
  }

  /**
   * 准备RPA执行数据
   */
  async prepareRPAData(task) {
    console.log(`准备任务 ${task.id} 的RPA数据...`);
    
    // 处理图片：下载到本地
    const processedImages = [];
    for (let image of task.images) {
      try {
        const localPath = await this.downloadImage(image.url, task.id);
        processedImages.push({
          originalUrl: image.url,
          localPath: localPath,
          name: image.name
        });
      } catch (error) {
        console.error('图片下载失败:', error);
      }
    }

    // 创建RPA配置文件
    const rpaConfig = {
      taskId: task.id,
      content: task.content,
      images: processedImages,
      links: task.links,
      targetAccounts: task.targetAccounts,
      scheduleTime: task.scheduleTime,
      publishMode: task.publishMode,
      callbackUrl: `http://localhost:${this.config.server.port}/rpa/callback`
    };

    // 保存配置文件
    const configPath = path.join(__dirname, 'temp', `rpa_config_${task.id}.json`);
    fs.writeFileSync(configPath, JSON.stringify(rpaConfig, null, 2));

    return { configPath, taskId: task.id };
  }

  /**
   * 执行RPA脚本
   */
  async executeRPA(rpaData) {
    return new Promise((resolve, reject) => {
      console.log(`启动RPA脚本，任务ID: ${rpaData.taskId}`);
      
      // 启动RPA子进程
      const rpaProcess = spawn('node', [
        path.join(__dirname, 'RPA堆雪球控制脚本.js'),
        rpaData.configPath
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // 监听RPA输出
      rpaProcess.stdout.on('data', (data) => {
        console.log(`RPA输出: ${data}`);
      });

      rpaProcess.stderr.on('data', (data) => {
        console.error(`RPA错误: ${data}`);
      });

      // RPA进程结束
      rpaProcess.on('close', (code) => {
        console.log(`RPA进程结束，退出码: ${code}`);
        this.isRPARunning = false;
        
        if (code === 0) {
          resolve({ success: true, taskId: rpaData.taskId });
        } else {
          reject(new Error(`RPA执行失败，退出码: ${code}`));
        }
      });

      // 设置超时
      setTimeout(() => {
        rpaProcess.kill();
        this.isRPARunning = false;
        reject(new Error('RPA执行超时'));
      }, 30 * 60 * 1000); // 30分钟超时
    });
  }

  /**
   * 处理RPA回调
   */
  async handleRPACallback(callbackData) {
    console.log('收到RPA回调:', callbackData);
    
    const { taskId, success, error, publishResults } = callbackData;
    
    try {
      if (success) {
        // 发布成功，更新飞书状态
        await this.updateFeishuStatus(taskId, '已发布', {
          publishTime: new Date().toISOString(),
          publishResults: publishResults
        });
        
        console.log(`任务 ${taskId} 发布成功`);
      } else {
        // 发布失败，更新状态并记录错误
        await this.updateFeishuStatus(taskId, '发布失败', {
          errorMessage: error,
          failTime: new Date().toISOString()
        });
        
        console.error(`任务 ${taskId} 发布失败:`, error);
      }
      
      // 清理临时文件
      this.cleanupTempFiles(taskId);
      
    } catch (error) {
      console.error('处理RPA回调失败:', error);
    }
  }

  /**
   * 下载图片到本地
   */
  async downloadImage(url, taskId) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    
    const filename = `${taskId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    const localPath = path.join(__dirname, 'temp', 'images', filename);
    
    // 确保目录存在
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(localPath, buffer);
    return localPath;
  }

  /**
   * 更新飞书表格状态
   */
  async updateFeishuStatus(recordId, status, extraData = {}) {
    const updateData = {
      fields: {
        status: status,
        updated_time: new Date().toISOString(),
        ...extraData
      }
    };

    try {
      await fetch(`${this.config.feishu.apiBase}/bitable/v1/apps/${this.config.feishu.appToken}/tables/${this.config.feishu.tableId}/records/${recordId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.feishu.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      console.log(`飞书状态更新成功: ${recordId} -> ${status}`);
    } catch (error) {
      console.error('更新飞书状态失败:', error);
    }
  }

  /**
   * 清理临时文件
   */
  cleanupTempFiles(taskId) {
    try {
      // 删除配置文件
      const configPath = path.join(__dirname, 'temp', `rpa_config_${taskId}.json`);
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }
      
      // 删除图片文件
      const tempDir = path.join(__dirname, 'temp', 'images');
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
          if (file.startsWith(taskId)) {
            fs.unlinkSync(path.join(tempDir, file));
          }
        });
      }
      
      console.log(`任务 ${taskId} 临时文件清理完成`);
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  }

  /**
   * 启动服务器
   */
  start() {
    const port = this.config.server.port || 3000;
    this.app.listen(port, () => {
      console.log(`飞书RPA衔接服务已启动，端口: ${port}`);
      console.log(`状态查看: http://localhost:${port}/status`);
      console.log(`手动触发: POST http://localhost:${port}/publish/trigger`);
    });
  }
}

// 配置
const config = {
  feishu: {
    apiBase: 'https://open.feishu.cn/open-apis',
    appToken: 'your_app_token',
    tableId: 'your_table_id',
    accessToken: 'your_access_token'
  },
  server: {
    port: 3000
  }
};

// 启动服务
const bridge = new FeishuRPABridge(config);
bridge.start();

module.exports = FeishuRPABridge;
