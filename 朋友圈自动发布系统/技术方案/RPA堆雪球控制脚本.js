/**
 * RPA堆雪球控制脚本
 * 功能：自动化控制堆雪球网页系统进行朋友圈发布
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class DuiXueQiuRPA {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
  }

  /**
   * 初始化浏览器
   */
  async initBrowser() {
    this.browser = await chromium.launch({
      headless: false, // 设为true可无头运行
      slowMo: 100, // 操作间隔，模拟人工操作
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    this.page = await this.browser.newPage();
    
    // 设置用户代理，模拟真实浏览器
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // 设置视口大小
    await this.page.setViewportSize({ width: 1920, height: 1080 });
  }

  /**
   * 登录堆雪球系统
   */
  async login() {
    try {
      console.log('正在登录堆雪球系统...');
      
      await this.page.goto(this.config.duixueqiu.baseUrl);
      
      // 等待登录页面加载
      await this.page.waitForSelector('#username', { timeout: 10000 });
      
      // 输入用户名
      await this.page.fill('#username', this.config.duixueqiu.loginCredentials.username);
      await this.randomDelay(500, 1500);
      
      // 输入密码
      await this.page.fill('#password', this.config.duixueqiu.loginCredentials.password);
      await this.randomDelay(500, 1500);
      
      // 点击登录按钮
      await this.page.click('#login-button');
      
      // 等待登录成功，检查是否跳转到主页
      await this.page.waitForURL('**/dashboard', { timeout: 15000 });
      
      this.isLoggedIn = true;
      console.log('登录成功');
      
    } catch (error) {
      console.error('登录失败:', error);
      throw error;
    }
  }

  /**
   * 发布朋友圈内容
   */
  async publishMoments(contentData) {
    try {
      if (!this.isLoggedIn) {
        await this.login();
      }

      console.log('开始发布朋友圈内容...');
      
      // 导航到朋友圈发布页面
      await this.page.goto(`${this.config.duixueqiu.baseUrl}/moments/create`);
      await this.page.waitForSelector('#content-editor', { timeout: 10000 });

      // 1. 填写文案内容
      await this.fillContent(contentData.content);
      
      // 2. 上传图片
      if (contentData.images && contentData.images.length > 0) {
        await this.uploadImages(contentData.images);
      }
      
      // 3. 添加链接
      if (contentData.links && contentData.links.length > 0) {
        await this.addLinks(contentData.links);
      }
      
      // 4. 选择目标微信号
      await this.selectWeChatAccounts(contentData.targetAccounts);
      
      // 5. 设置发布时间
      await this.setPublishTime(contentData.scheduleTime, contentData.publishMode);
      
      // 6. 提交发布
      const taskId = await this.submitPublish();
      
      console.log('朋友圈内容发布成功，任务ID:', taskId);
      return { success: true, taskId };
      
    } catch (error) {
      console.error('发布朋友圈失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 填写文案内容
   */
  async fillContent(content) {
    console.log('填写文案内容...');
    
    // 清空编辑器
    await this.page.click('#content-editor');
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
    
    // 模拟人工输入，分段输入
    const sentences = content.split('。');
    for (let sentence of sentences) {
      if (sentence.trim()) {
        await this.page.type('#content-editor', sentence + '。', { delay: 50 });
        await this.randomDelay(200, 800);
      }
    }
  }

  /**
   * 上传图片
   */
  async uploadImages(images) {
    console.log(`上传 ${images.length} 张图片...`);
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      
      // 点击添加图片按钮
      await this.page.click('#add-image-button');
      await this.randomDelay(500, 1000);
      
      // 上传图片文件
      const fileInput = await this.page.locator('input[type="file"]');
      await fileInput.setInputFiles(image.localPath);
      
      // 等待图片上传完成
      await this.page.waitForSelector(`#uploaded-image-${i}`, { timeout: 30000 });
      
      console.log(`图片 ${i + 1} 上传完成`);
      await this.randomDelay(1000, 2000);
    }
  }

  /**
   * 添加链接
   */
  async addLinks(links) {
    console.log(`添加 ${links.length} 个链接...`);
    
    for (let link of links) {
      await this.page.click('#add-link-button');
      await this.randomDelay(500, 1000);
      
      await this.page.fill('#link-url-input', link.url);
      await this.page.fill('#link-title-input', link.title || '');
      
      await this.page.click('#confirm-link-button');
      await this.randomDelay(1000, 2000);
    }
  }

  /**
   * 选择目标微信号
   */
  async selectWeChatAccounts(accountIds) {
    console.log(`选择 ${accountIds.length} 个微信号...`);
    
    // 点击微信号选择区域
    await this.page.click('#wechat-selector');
    await this.randomDelay(500, 1000);
    
    // 先取消所有选择
    await this.page.click('#deselect-all-button');
    await this.randomDelay(500, 1000);
    
    // 选择指定的微信号
    for (let accountId of accountIds) {
      await this.page.check(`#wechat-account-${accountId}`);
      await this.randomDelay(300, 800);
    }
    
    // 确认选择
    await this.page.click('#confirm-selection-button');
  }

  /**
   * 设置发布时间
   */
  async setPublishTime(scheduleTime, publishMode) {
    console.log('设置发布时间...');
    
    if (publishMode === 'immediate') {
      // 立即发布
      await this.page.check('#immediate-publish');
    } else {
      // 定时发布
      await this.page.check('#scheduled-publish');
      await this.randomDelay(500, 1000);
      
      // 设置发布时间
      const publishDate = new Date(scheduleTime);
      const dateStr = publishDate.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = publishDate.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
      
      await this.page.fill('#publish-date', dateStr);
      await this.page.fill('#publish-time', timeStr);
    }
  }

  /**
   * 提交发布
   */
  async submitPublish() {
    console.log('提交发布...');
    
    // 点击发布按钮
    await this.page.click('#publish-button');
    
    // 等待确认对话框
    await this.page.waitForSelector('#confirm-dialog', { timeout: 5000 });
    await this.randomDelay(1000, 2000);
    
    // 确认发布
    await this.page.click('#confirm-publish-button');
    
    // 等待发布成功提示，获取任务ID
    await this.page.waitForSelector('#success-message', { timeout: 10000 });
    const taskId = await this.page.textContent('#task-id');
    
    return taskId;
  }

  /**
   * 随机延时（模拟人工操作）
   */
  async randomDelay(min, max) {
    const delay = Math.random() * (max - min) + min;
    await this.page.waitForTimeout(delay);
  }

  /**
   * 检查发布状态
   */
  async checkPublishStatus(taskId) {
    try {
      await this.page.goto(`${this.config.duixueqiu.baseUrl}/tasks/${taskId}`);
      await this.page.waitForSelector('#task-status', { timeout: 5000 });
      
      const status = await this.page.textContent('#task-status');
      const progress = await this.page.textContent('#task-progress');
      
      return {
        taskId,
        status,
        progress,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('检查发布状态失败:', error);
      return { taskId, status: 'unknown', error: error.message };
    }
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('浏览器已关闭');
    }
  }

  /**
   * 批量发布处理
   */
  async batchPublish(contentList) {
    const results = [];
    
    try {
      await this.initBrowser();
      await this.login();
      
      for (let i = 0; i < contentList.length; i++) {
        const content = contentList[i];
        console.log(`处理第 ${i + 1}/${contentList.length} 条内容...`);
        
        const result = await this.publishMoments(content);
        results.push({
          contentId: content.id,
          ...result
        });
        
        // 发布间隔（防封策略）
        if (i < contentList.length - 1) {
          const delay = Math.random() * (120 - 30) + 30; // 30-120分钟
          console.log(`等待 ${delay} 分钟后发布下一条...`);
          await this.page.waitForTimeout(delay * 60 * 1000);
        }
      }
      
    } catch (error) {
      console.error('批量发布失败:', error);
    } finally {
      await this.close();
    }
    
    return results;
  }
}

// 使用示例
async function main() {
  const config = {
    duixueqiu: {
      baseUrl: 'https://duixueqiu.com',
      loginCredentials: {
        username: 'your_username',
        password: 'your_password'
      }
    }
  };

  const rpa = new DuiXueQiuRPA(config);
  
  // 示例内容数据
  const contentData = {
    content: '今天分享一个很有意思的技术话题...',
    images: [
      { localPath: './temp/images/image1.jpg' },
      { localPath: './temp/images/image2.jpg' }
    ],
    links: [
      { url: 'https://example.com', title: '相关链接' }
    ],
    targetAccounts: ['wechat_001', 'wechat_002'],
    scheduleTime: '2024-01-01T10:00:00Z',
    publishMode: 'scheduled'
  };

  try {
    await rpa.initBrowser();
    const result = await rpa.publishMoments(contentData);
    console.log('发布结果:', result);
  } catch (error) {
    console.error('发布失败:', error);
  } finally {
    await rpa.close();
  }
}

module.exports = DuiXueQiuRPA;
