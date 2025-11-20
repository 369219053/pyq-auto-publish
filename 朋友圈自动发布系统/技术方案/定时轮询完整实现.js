/**
 * 定时轮询完整实现方案
 * 功能：定时检查飞书表格 → 提取文案 → 触发影刀RPA → 控制堆雪球发布
 */

const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AutoPublishService {
  constructor(config) {
    this.config = config;
    this.isProcessing = false; // 防止重复执行
  }

  /**
   * 启动定时轮询服务
   */
  start() {
    console.log('🚀 启动朋友圈自动发布服务...');
    
    // 每10分钟检查一次飞书表格
    cron.schedule('*/10 * * * *', async () => {
      if (this.isProcessing) {
        console.log('⏳ 上次任务还在执行中，跳过本次检查');
        return;
      }
      
      console.log('🔍 开始检查飞书表格...', new Date().toLocaleString());
      await this.checkAndProcess();
    });

    // 每小时执行一次状态同步
    cron.schedule('0 * * * *', async () => {
      console.log('🔄 执行状态同步检查...');
      await this.syncStatus();
    });

    console.log('✅ 定时轮询服务已启动');
    console.log('📅 检查频率：每10分钟');
    console.log('🔄 状态同步：每小时');
  }

  /**
   * 检查并处理发布任务
   */
  async checkAndProcess() {
    try {
      this.isProcessing = true;
      
      // 1. 从飞书表格获取待发布内容
      const pendingTasks = await this.getFeishuPendingTasks();
      
      if (pendingTasks.length === 0) {
        console.log('📝 暂无待发布任务');
        return;
      }

      console.log(`📋 发现 ${pendingTasks.length} 个待发布任务`);

      // 2. 逐个处理任务
      for (let task of pendingTasks) {
        try {
          console.log(`🎯 开始处理任务: ${task.record_id}`);
          
          // 更新状态为"处理中"
          await this.updateFeishuStatus(task.record_id, '处理中');
          
          // 准备RPA执行数据
          const rpaData = await this.prepareRPAData(task);
          
          // 触发影刀RPA执行
          const result = await this.triggerYingdaoRPA(rpaData);
          
          if (result.success) {
            console.log(`✅ 任务 ${task.record_id} 提交成功`);
          } else {
            console.error(`❌ 任务 ${task.record_id} 提交失败:`, result.error);
            await this.updateFeishuStatus(task.record_id, '提交失败', {
              error_message: result.error
            });
          }
          
          // 任务间隔（防止频繁操作）
          await this.sleep(30000); // 30秒间隔
          
        } catch (error) {
          console.error(`❌ 处理任务 ${task.record_id} 失败:`, error);
          await this.updateFeishuStatus(task.record_id, '处理失败', {
            error_message: error.message
          });
        }
      }
      
    } catch (error) {
      console.error('❌ 检查处理失败:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 从飞书表格获取待发布任务
   */
  async getFeishuPendingTasks() {
    try {
      console.log('📡 调用飞书API获取表格数据...');
      
      const response = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.config.feishu.appToken}/tables/${this.config.feishu.tableId}/records`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.feishu.accessToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            page_size: 100, // 每次最多获取100条
            filter: JSON.stringify({
              conditions: [
                {
                  field_name: 'status',
                  operator: 'is',
                  value: ['待发布']
                }
              ],
              conjunction: 'and'
            })
          }
        }
      );

      const records = response.data.data.items || [];
      console.log(`📊 获取到 ${records.length} 条记录`);

      // 筛选时间已到的任务
      const now = new Date();
      const pendingTasks = records.filter(record => {
        const scheduleTime = new Date(record.fields.schedule_time);
        return scheduleTime <= now;
      });

      console.log(`⏰ 其中 ${pendingTasks.length} 个任务时间已到`);
      
      return pendingTasks.map(record => ({
        record_id: record.record_id,
        content: record.fields.draft || '',
        images: record.fields.images || [],
        links: record.fields.links || [],
        target_wechats: record.fields.target_wechats || [],
        schedule_time: record.fields.schedule_time,
        publish_type: record.fields.publish_type || 'immediate',
        priority: record.fields.priority || 'normal'
      }));

    } catch (error) {
      console.error('❌ 获取飞书数据失败:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * 准备影刀RPA执行数据
   */
  async prepareRPAData(task) {
    console.log(`🔧 准备任务 ${task.record_id} 的RPA数据...`);
    
    // 1. 处理图片：下载到本地
    const processedImages = [];
    for (let i = 0; i < task.images.length; i++) {
      const image = task.images[i];
      try {
        const localPath = await this.downloadImage(image.url, task.record_id, i);
        processedImages.push({
          originalUrl: image.url,
          localPath: localPath,
          name: image.name || `image_${i}.jpg`
        });
        console.log(`📷 图片 ${i + 1} 下载完成: ${localPath}`);
      } catch (error) {
        console.error(`❌ 图片 ${i + 1} 下载失败:`, error);
      }
    }

    // 2. 创建RPA配置文件
    const rpaConfig = {
      taskId: task.record_id,
      content: task.content,
      images: processedImages,
      links: task.links,
      targetAccounts: task.target_wechats,
      scheduleTime: task.schedule_time,
      publishType: task.publish_type,
      duixueqiu: {
        loginUrl: this.config.duixueqiu.loginUrl,
        username: this.config.duixueqiu.username,
        password: this.config.duixueqiu.password,
        createUrl: this.config.duixueqiu.createUrl
      },
      callback: {
        url: `${this.config.server.baseUrl}/rpa/callback`,
        method: 'POST'
      }
    };

    // 3. 保存配置文件
    const configPath = path.join(__dirname, 'temp', `rpa_config_${task.record_id}.json`);
    fs.writeFileSync(configPath, JSON.stringify(rpaConfig, null, 2));
    
    console.log(`💾 RPA配置文件已保存: ${configPath}`);
    
    return {
      configPath: configPath,
      taskId: task.record_id,
      config: rpaConfig
    };
  }

  /**
   * 下载图片到本地
   */
  async downloadImage(imageUrl, taskId, index) {
    const response = await axios.get(imageUrl, { responseType: 'stream' });
    
    const filename = `${taskId}_${index}_${Date.now()}.jpg`;
    const localPath = path.join(__dirname, 'temp', 'images', filename);
    
    // 确保目录存在
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 保存图片
    const writer = fs.createWriteStream(localPath);
    response.data.pipe(writer);
    
    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(localPath));
      writer.on('error', reject);
    });
  }

  /**
   * 触发影刀RPA执行
   */
  async triggerYingdaoRPA(rpaData) {
    try {
      console.log(`🤖 触发影刀RPA执行任务: ${rpaData.taskId}`);
      
      // 方案1：如果影刀有API接口
      if (this.config.yingdao.apiEndpoint) {
        const response = await axios.post(
          `${this.config.yingdao.apiEndpoint}/execute`,
          {
            appId: this.config.yingdao.appId,
            configPath: rpaData.configPath,
            params: rpaData.config
          },
          {
            headers: {
              'Authorization': `Bearer ${this.config.yingdao.apiToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        return {
          success: true,
          taskId: response.data.taskId,
          message: '影刀RPA任务已提交'
        };
      }
      
      // 方案2：通过命令行启动影刀RPA
      else {
        const { spawn } = require('child_process');
        
        const rpaProcess = spawn('yingdao', [
          'run',
          '--app-id', this.config.yingdao.appId,
          '--config', rpaData.configPath
        ], {
          detached: true,
          stdio: 'ignore'
        });
        
        rpaProcess.unref(); // 让进程在后台运行
        
        return {
          success: true,
          taskId: rpaData.taskId,
          processId: rpaProcess.pid,
          message: '影刀RPA进程已启动'
        };
      }
      
    } catch (error) {
      console.error('❌ 触发影刀RPA失败:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 更新飞书表格状态
   */
  async updateFeishuStatus(recordId, status, extraData = {}) {
    try {
      const updateData = {
        fields: {
          status: status,
          updated_time: new Date().toISOString(),
          ...extraData
        }
      };

      await axios.put(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.config.feishu.appToken}/tables/${this.config.feishu.tableId}/records/${recordId}`,
        updateData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.feishu.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`📝 飞书状态更新成功: ${recordId} -> ${status}`);
    } catch (error) {
      console.error('❌ 更新飞书状态失败:', error.response?.data || error.message);
    }
  }

  /**
   * 状态同步检查
   */
  async syncStatus() {
    try {
      console.log('🔄 开始状态同步检查...');
      
      // 检查"处理中"状态超过1小时的任务
      const response = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.config.feishu.appToken}/tables/${this.config.feishu.tableId}/records`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.feishu.accessToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            filter: JSON.stringify({
              conditions: [
                {
                  field_name: 'status',
                  operator: 'is',
                  value: ['处理中']
                }
              ]
            })
          }
        }
      );

      const processingTasks = response.data.data.items || [];
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      for (let task of processingTasks) {
        const updatedTime = new Date(task.fields.updated_time);
        if (updatedTime < oneHourAgo) {
          console.log(`⚠️ 任务 ${task.record_id} 处理超时，重置状态`);
          await this.updateFeishuStatus(task.record_id, '处理超时', {
            timeout_message: '任务处理超过1小时，可能需要人工检查'
          });
        }
      }
      
    } catch (error) {
      console.error('❌ 状态同步失败:', error);
    }
  }

  /**
   * 延时函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 配置
const config = {
  feishu: {
    appToken: 'your_app_token',
    tableId: 'your_table_id',
    accessToken: 'your_access_token'
  },
  yingdao: {
    apiEndpoint: 'https://api.yingdao.com/v1/rpa', // 如果有API
    apiToken: 'your_api_token',
    appId: 'your_yingdao_app_id'
  },
  duixueqiu: {
    loginUrl: 'https://duixueqiu.com/login',
    username: 'your_username',
    password: 'your_password',
    createUrl: 'https://duixueqiu.com/moments/create'
  },
  server: {
    baseUrl: 'http://localhost:3000'
  }
};

// 启动服务
const autoPublish = new AutoPublishService(config);
autoPublish.start();

console.log('🎉 朋友圈自动发布系统已启动！');
console.log('📱 系统将每10分钟自动检查飞书表格');
console.log('🤖 发现待发布内容时自动触发影刀RPA');
console.log('📊 可通过飞书表格实时查看发布状态');

module.exports = AutoPublishService;
