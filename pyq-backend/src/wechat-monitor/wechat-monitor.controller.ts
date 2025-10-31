import { Controller, Post, Get, Delete, Body, Param, Query, Logger, Res } from '@nestjs/common';
import { Response } from 'express';
import { WechatMonitorService } from './wechat-monitor.service';
import { WeMpRssService } from './we-mp-rss.service';
import axios from 'axios';

/**
 * 微信公众号监控控制器
 */
@Controller('wechat-monitor')
export class WechatMonitorController {
  private readonly logger = new Logger(WechatMonitorController.name);

  constructor(
    private readonly wechatMonitorService: WechatMonitorService,
    private readonly weMpRssService: WeMpRssService,
  ) {}

  /**
   * Webhook接口 - 接收we-mp-rss推送的文章数据
   */
  @Post('webhook')
  async handleWebhook(@Body() articleData: any) {
    this.logger.log('收到we-mp-rss Webhook推送');
    return await this.wechatMonitorService.handleArticleWebhook(articleData);
  }

  /**
   * 获取微信公众平台登录二维码
   */
  @Get('qr-code')
  async getQrCode() {
    return await this.weMpRssService.getQrCode();
  }

  /**
   * 获取二维码图片
   */
  @Get('qr-image')
  async getQrImage(@Res() res: Response) {
    try {
      const imageBuffer = await this.weMpRssService.getQrImage();
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(imageBuffer);
    } catch (error) {
      this.logger.error(`获取二维码图片失败: ${error.message}`);
      res.status(500).json({
        code: -1,
        message: '获取二维码图片失败',
        error: error.message,
      });
    }
  }

  /**
   * 检查二维码扫描状态
   */
  @Get('qr-status')
  async checkQrStatus() {
    return await this.weMpRssService.checkQrStatus();
  }

  /**
   * 搜索公众号
   */
  @Get('search')
  async searchAccount(@Query('keyword') keyword: string) {
    return await this.weMpRssService.searchAccount(keyword);
  }

  /**
   * 添加公众号订阅
   */
  @Post('subscriptions')
  async addSubscription(@Body() body: {
    mp_name: string;
    mp_id: string;
    mp_cover?: string;
    avatar?: string;
    mp_intro?: string;
  }) {
    return await this.weMpRssService.addSubscription(body);
  }

  /**
   * 获取订阅列表
   */
  @Get('subscriptions')
  async getSubscriptions() {
    return await this.weMpRssService.getSubscriptions();
  }

  /**
   * 删除公众号订阅
   */
  @Delete('subscriptions/:id')
  async deleteSubscription(@Param('id') id: string) {
    // 1. 删除we-mp-rss中的订阅
    const result = await this.weMpRssService.deleteSubscription(id);

    // 2. 删除数据库中该公众号的所有文章
    try {
      await this.wechatMonitorService.deleteArticlesByAccountId(id);
      this.logger.log(`已删除公众号 ${id} 的所有文章`);
    } catch (error) {
      this.logger.error(`删除公众号文章失败: ${error.message}`);
    }

    return result;
  }

  /**
   * 手动触发更新公众号文章
   */
  @Post('subscriptions/:id/update')
  async triggerUpdate(
    @Param('id') id: string,
    @Query('pages') pages: number = 10,
  ) {
    this.logger.log(`手动触发更新公众号: ${id}, 爬取页数: ${pages}`);
    return await this.weMpRssService.updateMpArticles(id, 0, pages);
  }

  /**
   * 获取文章列表
   */
  @Get('articles')
  async getArticles(
    @Query('accountId') accountId: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return await this.weMpRssService.getArticles(accountId, page, pageSize);
  }

  /**
   * 获取文章详情
   */
  @Get('articles/:id')
  async getArticleDetail(@Param('id') id: string) {
    return await this.weMpRssService.getArticleDetail(id);
  }

  /**
   * 检查we-mp-rss服务状态
   */
  @Get('health')
  async checkHealth() {
    return await this.weMpRssService.checkHealth();
  }

  /**
   * 导入历史文章 - 方案一:一键导入所有历史文章
   */
  @Post('import-history')
  async importHistoryArticles(@Body() body: {
    mpId?: string; // 可选:只导入特定公众号的文章
    limit?: number; // 可选:限制导入数量
  }) {
    this.logger.log('开始导入历史文章');
    return await this.wechatMonitorService.importHistoryArticles(body.mpId, body.limit);
  }

  /**
   * 定时同步任务 - 方案三:定时自动同步
   * 根据订阅列表,同步每个订阅的所有文章
   */
  @Post('sync-articles')
  async syncArticles() {
    this.logger.log('开始同步文章');
    return await this.wechatMonitorService.syncArticles();
  }

  /**
   * 图片代理 - 解决微信图片跨域问题
   */
  @Get('image-proxy')
  async imageProxy(@Query('url') imageUrl: string, @Res() res: Response) {
    try {
      if (!imageUrl) {
        return res.status(400).json({
          code: -1,
          message: '缺少图片URL参数',
        });
      }

      this.logger.log(`代理图片请求: ${imageUrl}`);

      // 请求微信图片
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://mp.weixin.qq.com/',
        },
        timeout: 10000,
      });

      // 设置响应头
      const contentType = response.headers['content-type'] || 'image/png';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存1天
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 返回图片数据
      res.send(Buffer.from(response.data));
    } catch (error) {
      this.logger.error(`代理图片失败: ${error.message}`);
      res.status(500).json({
        code: -1,
        message: '获取图片失败',
        error: error.message,
      });
    }
  }

  /**
   * 清理孤立文章 - 删除不在订阅列表中的公众号的文章
   * POST /api/wechat-monitor/clean-orphan-articles
   */
  @Post('clean-orphan-articles')
  async cleanOrphanArticles() {
    this.logger.log('开始清理孤立文章');
    return await this.wechatMonitorService.cleanOrphanArticles();
  }
}

