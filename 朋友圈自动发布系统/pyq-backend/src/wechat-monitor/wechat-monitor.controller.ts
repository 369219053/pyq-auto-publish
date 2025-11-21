import { Controller, Post, Get, Delete, Body, Param, Query, Logger, Res, HttpException, HttpStatus, Request, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { WechatMonitorService } from './wechat-monitor.service';
import { WeMpRssService } from './we-mp-rss.service';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { SupabaseService } from '../common/supabase.service';
import axios from 'axios';

/**
 * 微信公众号监控控制器
 */
@Controller('wechat-monitor')
@UseGuards(JwtAuthGuard)
export class WechatMonitorController {
  private readonly logger = new Logger(WechatMonitorController.name);

  constructor(
    private readonly wechatMonitorService: WechatMonitorService,
    private readonly weMpRssService: WeMpRssService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * Webhook接口 - 接收we-mp-rss推送的文章数据
   */
  @Public()
  @Post('webhook')
  async handleWebhook(@Body() articleData: any) {
    this.logger.log('收到we-mp-rss Webhook推送');
    return await this.wechatMonitorService.handleArticleWebhook(articleData);
  }

  /**
   * 获取微信公众平台登录二维码
   */
  @Public()
  @Get('qr-code')
  async getQrCode() {
    return await this.weMpRssService.getQrCode();
  }

  /**
   * 获取二维码图片
   */
  @Public()
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
  @Public()
  @Get('qr-status')
  async checkQrStatus(@Res() res: Response) {
    try {
      const result = await this.weMpRssService.checkQrStatus();
      // 禁止缓存,确保每次都获取最新状态
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(result);
    } catch (error) {
      this.logger.error(`检查二维码状态失败: ${error.message}`);
      res.status(500).json({
        code: -1,
        message: '检查二维码状态失败',
        error: error.message,
      });
    }
  }

  /**
   * 检查微信公众平台登录状态
   */
  @Get('wechat-login-status')
  async checkWechatLoginStatus() {
    try {
      const result = await this.wechatMonitorService.checkWechatLoginStatus();
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      this.logger.error(`检查微信登录状态失败: ${error.message}`);
      return {
        success: false,
        message: '检查微信登录状态失败',
        error: error.message,
      };
    }
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
  async addSubscription(
    @Request() req,
    @Body() body: {
      mp_name: string;
      mp_id: string;
      mp_cover?: string;
      avatar?: string;
      mp_intro?: string;
    },
  ) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new HttpException('用户未登录', HttpStatus.UNAUTHORIZED);
    }
    return await this.weMpRssService.addSubscription(userId, body);
  }

  /**
   * 获取订阅列表
   */
  @Get('subscriptions')
  async getSubscriptions(@Request() req) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new HttpException('用户未登录', HttpStatus.UNAUTHORIZED);
    }
    return await this.weMpRssService.getSubscriptions(userId);
  }

  /**
   * 更新所有订阅的头像
   */
  @Post('subscriptions/update-avatars')
  async updateSubscriptionAvatars(@Request() req) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new HttpException('用户未登录', HttpStatus.UNAUTHORIZED);
    }
    return await this.weMpRssService.updateSubscriptionAvatars(userId);
  }

  /**
   * 删除公众号订阅
   */
  @Delete('subscriptions/:id')
  async deleteSubscription(@Request() req, @Param('id') id: string) {
    const userId = req.user?.userId;
    if (!userId) {
      throw new HttpException('用户未登录', HttpStatus.UNAUTHORIZED);
    }

    // 1. 删除we-mp-rss中的订阅(会检查权限)
    const result = await this.weMpRssService.deleteSubscription(userId, id);

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

    // 查询数据库获取standard_mp_id和user_id
    const { data: subscription } = await this.supabaseService
      .getClient()
      .from('wechat_subscriptions')
      .select('standard_mp_id, mp_name, user_id')
      .eq('mp_id', id)
      .single();

    const mpIdToUse = subscription?.standard_mp_id || id;
    const mpName = subscription?.mp_name || '未知公众号';
    const userId = subscription?.user_id;

    this.logger.log(`使用mp_id: ${mpIdToUse} (原始: ${id})`);

    // 1. 触发we-mp-rss更新
    const result = await this.weMpRssService.updateMpArticles(mpIdToUse, 0, pages);

    // 如果返回的code不是0,说明有错误,抛出HttpException
    if (result.code !== 0) {
      this.logger.warn(`更新公众号失败: ${result.message}, code: ${result.code}`);
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }

    // 2. 等待2秒,确保we-mp-rss更新完成
    this.logger.log(`⏳ 等待we-mp-rss更新完成...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. 立即同步这个公众号的文章到数据库
    this.logger.log(`🔄 开始同步文章到数据库: ${mpName}`);
    try {
      const syncResult = await this.wechatMonitorService.syncSingleAccount(mpIdToUse, mpName, userId);
      this.logger.log(`✅ 同步完成,新增 ${syncResult.synced} 篇文章`);

      return {
        code: 0,
        message: 'success',
        data: {
          updated: true,
          synced: syncResult.synced,
        },
      };
    } catch (error) {
      this.logger.error(`❌ 同步文章失败: ${error.message}`);
      // 即使同步失败,也返回更新成功(因为we-mp-rss更新成功了)
      return result;
    }
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
  async importHistoryArticles(
    @Request() req,
    @Body() body: {
      mpId?: string; // 可选:只导入特定公众号的文章
      limit?: number; // 可选:限制导入数量
    },
  ) {
    const userId = req.user?.userId;
    this.logger.log(`用户 ${userId} 开始导入历史文章`);
    return await this.wechatMonitorService.importHistoryArticles(
      userId,
      body.mpId,
      body.limit,
    );
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
   * 注意: 此接口不需要JWT认证,因为图片是在HTML中直接引用的
   */
  @Public()
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

