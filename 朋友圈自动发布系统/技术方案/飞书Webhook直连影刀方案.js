/**
 * 飞书Webhook直连影刀RPA方案
 * 功能：飞书表格变化时立即触发影刀RPA执行
 */

const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

class FeishuWebhookToYingdao {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.setupWebhookServer();
  }

  /**
   * 设置Webhook服务器
   */
  setupWebhookServer() {
    this.app.use(express.json());
    
    // 飞书Webhook接收端点
    this.app.post('/feishu/webhook', async (req, res) => {
      try {
        // 验证飞书Webhook签名
        if (!this.verifyFeishuSignature(req)) {
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // 处理飞书事件
        await this.handleFeishuEvent(req.body);
        
        res.json({ success: true });
      } catch (error) {
        console.error('处理飞书Webhook失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // 影刀RPA回调接收端点
    this.app.post('/yingdao/callback', async (req, res) => {
      try {
        await this.handleYingdaoCallback(req.body);
        res.json({ success: true });
      } catch (error) {
        console.error('处理影刀回调失败:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // 健康检查端点
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'feishu-webhook-to-yingdao'
      });
    });
  }

  /**
   * 验证飞书Webhook签名
   */
  verifyFeishuSignature(req) {
    const signature = req.headers['x-lark-signature'];
    const timestamp = req.headers['x-lark-request-timestamp'];
    const nonce = req.headers['x-lark-request-nonce'];
    
    if (!signature || !timestamp || !nonce) {
      return false;
    }

    // 检查时间戳（防重放攻击）
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) { // 5分钟内有效
      return false;
    }

    // 计算签名
    const body = JSON.stringify(req.body);
    const stringToSign = timestamp + nonce + this.config.feishu.encryptKey + body;
    const expectedSignature = crypto
      .createHmac('sha256', this.config.feishu.encryptKey)
      .update(stringToSign)
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * 处理飞书事件
   */
  async handleFeishuEvent(eventData) {
    console.log('收到飞书事件:', JSON.stringify(eventData, null, 2));

    const { type, event } = eventData;

    switch (type) {
      case 'url_verification':
        // Webhook验证
        return { challenge: event.challenge };

      case 'event_callback':
        // 处理实际事件
        await this.processFeishuEvent(event);
        break;

      default:
        console.log('未知事件类型:', type);
    }
  }

  /**
   * 处理飞书具体事件
   */
  async processFeishuEvent(event) {
    const { event_type } = event;

    switch (event_type) {
      case 'bitable.app_table.record.created':
        // 表格记录创建
        await this.handleRecordCreated(event);
        break;

      case 'bitable.app_table.record.updated':
        // 表格记录更新
        await this.handleRecordUpdated(event);
        break;

      case 'bitable.app_table.record.deleted':
        // 表格记录删除
        console.log('记录被删除:', event);
        break;

      default:
        console.log('未处理的事件类型:', event_type);
    }
  }

  /**
   * 处理记录创建事件
   */
  async handleRecordCreated(event) {
    console.log('新记录创建:', event);
    
    const { app_token, table_id, record_id } = event;
    
    // 获取完整记录数据
    const recordData = await this.getFeishuRecord(app_token, table_id, record_id);
    
    // 检查是否需要发布
    if (this.shouldTriggerPublish(recordData)) {
      await this.triggerYingdaoRPA(recordData);
    }
  }

  /**
   * 处理记录更新事件
   */
  async handleRecordUpdated(event) {
    console.log('记录更新:', event);
    
    const { app_token, table_id, record_id } = event;
    
    // 获取完整记录数据
    const recordData = await this.getFeishuRecord(app_token, table_id, record_id);
    
    // 检查是否需要发布
    if (this.shouldTriggerPublish(recordData)) {
      await this.triggerYingdaoRPA(recordData);
    }
  }

  /**
   * 获取飞书记录详细数据
   */
  async getFeishuRecord(appToken, tableId, recordId) {
    try {
      const response = await axios.get(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.config.feishu.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.data.record;
    } catch (error) {
      console.error('获取飞书记录失败:', error);
      throw error;
    }
  }

  /**
   * 判断是否应该触发发布
   */
  shouldTriggerPublish(recordData) {
    const fields = recordData.fields;
    
    // 检查状态是否为"待发布"
    if (fields.status !== '待发布') {
      return false;
    }

    // 检查发布时间是否已到
    const scheduleTime = new Date(fields.schedule_time);
    const now = new Date();
    
    if (scheduleTime > now) {
      console.log('发布时间未到，跳过触发');
      return false;
    }

    // 检查必要字段是否完整
    if (!fields.draft || !fields.target_wechats) {
      console.log('必要字段不完整，跳过触发');
      return false;
    }

    return true;
  }

  /**
   * 触发影刀RPA执行
   */
  async triggerYingdaoRPA(recordData) {
    try {
      console.log('触发影刀RPA执行...');

      // 准备影刀RPA执行参数
      const rpaParams = {
        taskId: recordData.record_id,
        content: recordData.fields.draft,
        images: recordData.fields.images || [],
        links: recordData.fields.links || [],
        targetAccounts: recordData.fields.target_wechats || [],
        scheduleTime: recordData.fields.schedule_time,
        publishMode: recordData.fields.publish_type || 'immediate',
        callbackUrl: `${this.config.server.baseUrl}/yingdao/callback`
      };

      // 调用影刀RPA API
      const response = await axios.post(
        `${this.config.yingdao.apiEndpoint}/execute`,
        {
          appId: this.config.yingdao.appId,
          params: rpaParams
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.yingdao.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('影刀RPA触发成功:', response.data);

      // 更新飞书记录状态为"执行中"
      await this.updateFeishuRecord(recordData.record_id, {
        status: '执行中',
        rpa_task_id: response.data.taskId,
        start_time: new Date().toISOString()
      });

    } catch (error) {
      console.error('触发影刀RPA失败:', error);
      
      // 更新飞书记录状态为"执行失败"
      await this.updateFeishuRecord(recordData.record_id, {
        status: '执行失败',
        error_message: error.message,
        fail_time: new Date().toISOString()
      });
    }
  }

  /**
   * 处理影刀RPA回调
   */
  async handleYingdaoCallback(callbackData) {
    console.log('收到影刀RPA回调:', callbackData);

    const { taskId, success, error, results } = callbackData;

    try {
      if (success) {
        // 执行成功
        await this.updateFeishuRecord(taskId, {
          status: '已发布',
          publish_time: new Date().toISOString(),
          publish_results: JSON.stringify(results)
        });
        
        console.log(`任务 ${taskId} 执行成功`);
      } else {
        // 执行失败
        await this.updateFeishuRecord(taskId, {
          status: '发布失败',
          error_message: error,
          fail_time: new Date().toISOString()
        });
        
        console.error(`任务 ${taskId} 执行失败:`, error);
      }
    } catch (error) {
      console.error('处理影刀回调失败:', error);
    }
  }

  /**
   * 更新飞书记录
   */
  async updateFeishuRecord(recordId, updateFields) {
    try {
      const response = await axios.put(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${this.config.feishu.appToken}/tables/${this.config.feishu.tableId}/records/${recordId}`,
        {
          fields: updateFields
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.feishu.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('飞书记录更新成功:', recordId);
    } catch (error) {
      console.error('更新飞书记录失败:', error);
    }
  }

  /**
   * 启动Webhook服务器
   */
  start() {
    const port = this.config.server.port || 3000;
    this.app.listen(port, () => {
      console.log(`飞书Webhook服务器已启动，端口: ${port}`);
      console.log(`Webhook地址: ${this.config.server.baseUrl}/feishu/webhook`);
      console.log(`健康检查: ${this.config.server.baseUrl}/health`);
    });
  }
}

// 配置示例
const config = {
  feishu: {
    appToken: 'your_app_token',
    tableId: 'your_table_id',
    accessToken: 'your_access_token',
    encryptKey: 'your_encrypt_key' // Webhook加密密钥
  },
  yingdao: {
    apiEndpoint: 'https://api.yingdao.com/v1/rpa',
    apiToken: 'your_yingdao_api_token',
    appId: 'your_yingdao_app_id'
  },
  server: {
    port: 3000,
    baseUrl: 'https://your-domain.com' // 需要公网可访问的域名
  }
};

// 启动服务
const webhookService = new FeishuWebhookToYingdao(config);
webhookService.start();

module.exports = FeishuWebhookToYingdao;
