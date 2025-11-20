/**
 * 朋友圈自动发布系统 - 数据处理中间层
 * 功能：从飞书多维表格提取数据，处理后传递给RPA系统
 */

class ContentProcessor {
  constructor(config) {
    this.feishuConfig = config.feishu;
    this.rpaConfig = config.rpa;
    this.duixueqiuConfig = config.duixueqiu;
  }

  /**
   * 从飞书多维表格获取待发布内容
   */
  async getContentFromFeishu() {
    try {
      const response = await fetch(`${this.feishuConfig.apiBase}/bitable/v1/apps/${this.feishuConfig.appToken}/tables/${this.feishuConfig.tableId}/records`, {
        headers: {
          'Authorization': `Bearer ${this.feishuConfig.accessToken}`,
          'Content-Type': 'application/json'
        },
        method: 'GET'
      });

      const data = await response.json();
      
      // 筛选状态为"待发布"的内容
      const pendingContent = data.data.items.filter(item => 
        item.fields.status === '待发布' && 
        item.fields.schedule_time <= new Date().toISOString()
      );

      return pendingContent.map(this.formatContentData);
    } catch (error) {
      console.error('获取飞书数据失败:', error);
      throw error;
    }
  }

  /**
   * 格式化内容数据
   */
  formatContentData(item) {
    return {
      id: item.record_id,
      text: item.fields.draft,
      images: item.fields.images || [],
      links: item.fields.links || [],
      scheduleTime: item.fields.schedule_time,
      wechatIds: item.fields.target_wechats || [],
      publishType: item.fields.publish_type || 'immediate'
    };
  }

  /**
   * 处理图片资源
   */
  async processImages(images) {
    const processedImages = [];
    
    for (let image of images) {
      try {
        // 下载图片到本地
        const localPath = await this.downloadImage(image.url);
        
        // 图片优化（尺寸、格式等）
        const optimizedPath = await this.optimizeImage(localPath);
        
        processedImages.push({
          originalUrl: image.url,
          localPath: optimizedPath,
          name: image.name
        });
      } catch (error) {
        console.error('图片处理失败:', error);
      }
    }
    
    return processedImages;
  }

  /**
   * 下载图片到本地
   */
  async downloadImage(url) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    const filename = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
    const localPath = `./temp/images/${filename}`;
    
    require('fs').writeFileSync(localPath, buffer);
    return localPath;
  }

  /**
   * 图片优化处理
   */
  async optimizeImage(imagePath) {
    // 使用sharp库进行图片处理
    const sharp = require('sharp');
    const outputPath = imagePath.replace('.jpg', '_optimized.jpg');
    
    await sharp(imagePath)
      .resize(1080, 1080, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
    
    return outputPath;
  }

  /**
   * 调用RPA执行发布
   */
  async executeRPAPublish(contentData) {
    const rpaPayload = {
      action: 'publish_wechat_moments',
      data: {
        content: contentData.text,
        images: contentData.processedImages,
        links: contentData.links,
        scheduleTime: contentData.scheduleTime,
        targetAccounts: contentData.wechatIds,
        publishMode: contentData.publishType
      }
    };

    try {
      // 调用影刀RPA API
      const response = await fetch(`${this.rpaConfig.apiEndpoint}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.rpaConfig.token}`
        },
        body: JSON.stringify(rpaPayload)
      });

      const result = await response.json();
      
      if (result.success) {
        // 更新飞书表格状态为"已发布"
        await this.updateFeishuStatus(contentData.id, '已发布', result.taskId);
        return { success: true, taskId: result.taskId };
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error('RPA执行失败:', error);
      await this.updateFeishuStatus(contentData.id, '发布失败', null, error.message);
      throw error;
    }
  }

  /**
   * 更新飞书表格状态
   */
  async updateFeishuStatus(recordId, status, taskId = null, errorMsg = null) {
    const updateData = {
      fields: {
        status: status,
        actual_time: new Date().toISOString(),
        task_id: taskId,
        error_message: errorMsg
      }
    };

    await fetch(`${this.feishuConfig.apiBase}/bitable/v1/apps/${this.feishuConfig.appToken}/tables/${this.feishuConfig.tableId}/records/${recordId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.feishuConfig.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });
  }

  /**
   * 主执行流程
   */
  async processAndPublish() {
    try {
      console.log('开始处理发布任务...');
      
      // 1. 获取待发布内容
      const contentList = await this.getContentFromFeishu();
      console.log(`获取到 ${contentList.length} 条待发布内容`);

      // 2. 逐条处理发布
      for (let content of contentList) {
        try {
          console.log(`处理内容ID: ${content.id}`);
          
          // 处理图片
          content.processedImages = await this.processImages(content.images);
          
          // 执行RPA发布
          const result = await this.executeRPAPublish(content);
          
          console.log(`内容 ${content.id} 发布成功，任务ID: ${result.taskId}`);
          
          // 发布间隔（防封策略）
          const delay = Math.random() * (120 - 30) + 30; // 30-120分钟随机间隔
          console.log(`等待 ${delay} 分钟后处理下一条...`);
          await this.sleep(delay * 60 * 1000);
          
        } catch (error) {
          console.error(`内容 ${content.id} 发布失败:`, error);
          continue; // 继续处理下一条
        }
      }
      
      console.log('所有发布任务处理完成');
    } catch (error) {
      console.error('处理发布任务失败:', error);
      throw error;
    }
  }

  /**
   * 延时函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 配置示例
const config = {
  feishu: {
    apiBase: 'https://open.feishu.cn/open-apis',
    appToken: 'your_app_token',
    tableId: 'your_table_id',
    accessToken: 'your_access_token'
  },
  rpa: {
    apiEndpoint: 'http://localhost:8080/rpa',
    token: 'your_rpa_token'
  },
  duixueqiu: {
    baseUrl: 'https://duixueqiu.com',
    loginCredentials: {
      username: 'your_username',
      password: 'your_password'
    }
  }
};

// 使用示例
const processor = new ContentProcessor(config);

// 定时执行（每10分钟检查一次）
setInterval(async () => {
  try {
    await processor.processAndPublish();
  } catch (error) {
    console.error('定时任务执行失败:', error);
  }
}, 10 * 60 * 1000);

module.exports = ContentProcessor;
