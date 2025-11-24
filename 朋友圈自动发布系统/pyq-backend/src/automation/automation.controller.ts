import { Controller, Post, Body, Logger, Sse, MessageEvent, Query, Get, Put, Param } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { FollowCircleService } from './follow-circle.service';
import { WechatReachService } from './wechat-reach.service';
import { VideoMaterialService } from './video-material.service';
import { LinkMaterialService } from './link-material.service';
import { DuixueqiuFriendsService } from './duixueqiu-friends.service';
import { Observable } from 'rxjs';

@Controller('automation')
export class AutomationController {
  private readonly logger = new Logger(AutomationController.name);

  constructor(
    private readonly automationService: AutomationService,
    private readonly followCircleService: FollowCircleService,
    private readonly wechatReachService: WechatReachService,
    private readonly videoMaterialService: VideoMaterialService,
    private readonly linkMaterialService: LinkMaterialService,
    private readonly duixueqiuFriendsService: DuixueqiuFriendsService,
  ) {}

  /**
   * 脚本1: 输入链接自动发布 (流式输出版本)
   */
  @Sse('script1/link-auto-publish-stream')
  script1LinkAutoPublishStream(
    @Query('url') url: string,
    @Query('userId') userId: string,
    @Query('isImmediate') isImmediate?: string,
    @Query('publishTime') publishTime?: string,
    @Query('contentType') contentType?: string,
    @Query('selectedAccounts') selectedAccounts?: string,
    @Query('selectedTags') selectedTags?: string,
    @Query('useLocation') useLocation?: string,
    @Query('comments') comments?: string,
    @Query('randomContent') randomContent?: string,
  ): Observable<MessageEvent> {
    this.logger.log(`收到脚本1流式请求: ${url}`);

    return this.automationService.script1_LinkAutoPublishStream(
      url,
      userId,
      {
        isImmediate: isImmediate === 'true',
        publishTime: publishTime,
        contentType: contentType,
        selectedAccounts: selectedAccounts ? selectedAccounts.split(',') : [],
        selectedTags: selectedTags ? selectedTags.split(',') : [],
        useLocation: useLocation === 'true',
        comments: comments ? comments.split(',') : [],
        randomContent: randomContent,
      },
    );
  }

  /**
   * 脚本1: 输入链接自动发布 (原版本,保留兼容性)
   */
  @Post('script1/link-auto-publish')
  async script1LinkAutoPublish(
    @Body()
    body: {
      url: string;
      userId: string;
      isImmediate?: boolean;
      publishTime?: string;
      contentType?: string;
      tempTaskId?: string; // 🆕 前端传递的临时任务ID
      selectedAccounts?: string[];
      selectedTags?: string[];
      useLocation?: boolean;
      comments?: string[];
      randomContent?: string;
    },
  ) {
    this.logger.log(`收到脚本1请求: ${body.url}`);
    this.logger.log(`临时任务ID: ${body.tempTaskId}`);

    return await this.automationService.script1_LinkAutoPublish(
      body.url,
      body.userId,
      {
        isImmediate: body.isImmediate,
        publishTime: body.publishTime,
        contentType: body.contentType,
        selectedAccounts: body.selectedAccounts,
        selectedTags: body.selectedTags,
        useLocation: body.useLocation,
        comments: body.comments,
        randomContent: body.randomContent,
      },
    );
  }

  /**
   * 脚本3: 定时监控自动发布
   */
  @Post('script3/monitor-auto-publish')
  async script3MonitorAutoPublish(
    @Body()
    body: {
      userId: string;
      accountIds?: string[];
      autoRewrite?: boolean;
      autoPublish?: boolean;
      publishDelay?: number;
      contentType?: string;
      selectedAccounts?: string[];
      selectedTags?: string[];
      useLocation?: boolean;
      comments?: string[];
      randomContent?: string;
    },
  ) {
    this.logger.log(`收到脚本3请求: 监控自动发布`);

    return await this.automationService.script3_MonitorAutoPublish(body.userId, {
      accountIds: body.accountIds,
      autoRewrite: body.autoRewrite,
      autoPublish: body.autoPublish,
      publishDelay: body.publishDelay,
      contentType: body.contentType,
      selectedAccounts: body.selectedAccounts,
      selectedTags: body.selectedTags,
      useLocation: body.useLocation,
      comments: body.comments,
      randomContent: body.randomContent,
    });
  }

  /**
   * 脚本4: 跟圈自动化 (POST版本 - 带详细日志)
   */
  @Post('script4/follow-circle')
  async script4FollowCircle(
    @Body()
    body: {
      userId: string; // 🔥 修改为string类型,支持UUID
      content: string;
      images: string[];
      followCount: number;
      intervalMinutes: number;
      randomDelayMinutes?: number;
      delayStartMinutes?: number; // 🆕 延迟启动时间(分钟)
      contentType?: string;
      tempTaskGroupId?: string; // 🆕 前端传递的临时任务ID
    },
  ) {
    this.logger.log(`收到脚本4请求: 跟圈自动化`);
    this.logger.log(`跟圈次数: ${body.followCount}, 时间间隔: ${body.intervalMinutes}分钟, 随机延迟: ±${body.randomDelayMinutes || 0}分钟, 延迟启动: ${body.delayStartMinutes || 0}分钟, 类型: ${body.contentType || 'text'}`);
    this.logger.log(`临时任务ID: ${body.tempTaskGroupId}`);

    const logs = [];

    try {
      logs.push('🚀 开始创建跟圈任务...');

      // 🔥 传递userId和tempTaskGroupId到Service
      const taskGroupId = await this.followCircleService.createFollowCircleTasksWithLogs(
        body.content,
        body.images,
        body.followCount,
        body.intervalMinutes,
        body.randomDelayMinutes || 0,
        body.delayStartMinutes || 0, // 🆕 传递延迟启动参数
        body.contentType || 'text',
        logs,
        body.userId, // 🔥 传递用户ID
        body.tempTaskGroupId, // 🆕 传递临时任务ID
      );

      logs.push(`🎉 跟圈任务创建完成!任务组ID: ${taskGroupId}`);

      return {
        success: true,
        message: '跟圈任务创建成功',
        taskGroupId: taskGroupId,
        logs: logs,
        data: {
          followCount: body.followCount,
          intervalMinutes: body.intervalMinutes,
          firstPublishTime: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(`脚本4执行失败: ${error.message}`, error.stack);
      logs.push(`❌ 创建跟圈任务失败: ${error.message}`);
      return {
        success: false,
        message: error.message || '执行失败',
        logs: logs,
      };
    }
  }

  /**
   * 停止跟圈任务
   */
  @Post('script4/stop')
  async stopScript4(@Body() body: { taskGroupId: string }) {
    this.logger.log(`收到停止跟圈任务请求: ${body.taskGroupId}`);

    try {
      await this.followCircleService.stopFollowCircleTasks(body.taskGroupId);

      return {
        success: true,
        message: '跟圈任务已停止',
      };
    } catch (error) {
      this.logger.error(`停止跟圈任务失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '脚本4执行失败',
      };
    }
  }

  /**
   * 脚本2: 微信好友触达（文字消息）
   */
  @Post('script2/wechat-reach')
  async script2WechatReach(
    @Body()
    body: {
      userId: string;
      message: string;
      targetDays: number;
      taskId?: string;
      forbiddenTimeRanges?: Array<{startTime: string, endTime: string}>;
    },
  ) {
    this.logger.log(`收到脚本2请求: 微信好友触达（文字消息）`);
    this.logger.log(`目标完成时间: ${body.targetDays}天`);
    if (body.forbiddenTimeRanges && body.forbiddenTimeRanges.length > 0) {
      this.logger.log(`禁发时间段: ${body.forbiddenTimeRanges.map(r => `${r.startTime}-${r.endTime}`).join(', ')}`);
    }

    const taskId = body.taskId || `wechat_reach_${Date.now()}`;

    try {
      // 异步执行任务
      this.wechatReachService.startWechatReachTask(
        body.message,
        body.targetDays,
        body.userId,
        taskId,
        body.forbiddenTimeRanges
      ).catch(error => {
        this.logger.error(`脚本2执行失败: ${error.message}`, error.stack);
      });

      return {
        success: true,
        message: '微信好友触达任务已启动',
        taskId: taskId,
      };
    } catch (error) {
      this.logger.error(`脚本2启动失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '启动失败',
      };
    }
  }

  /**
   * 脚本2: 微信好友触达（视频号消息）
   */
  @Post('script2/video-material-reach')
  async script2VideoMaterialReach(
    @Body()
    body: {
      userId: string;
      materialId: number;
      additionalMessage?: string;
      targetDays: number;
      taskId?: string;
      forbiddenTimeRanges?: Array<{startTime: string, endTime: string}>;
    },
  ) {
    this.logger.log(`收到脚本2请求: 微信好友触达（视频号消息）`);
    this.logger.log(`素材ID: ${body.materialId}, 目标完成时间: ${body.targetDays}天`);
    if (body.forbiddenTimeRanges && body.forbiddenTimeRanges.length > 0) {
      this.logger.log(`禁发时间段: ${body.forbiddenTimeRanges.map(r => `${r.startTime}-${r.endTime}`).join(', ')}`);
    }

    const taskId = body.taskId || `video_material_reach_${Date.now()}`;

    try {
      // 异步执行任务
      this.wechatReachService.startVideoMaterialReachTask(
        body.materialId,
        body.additionalMessage,
        body.targetDays,
        body.userId,
        taskId,
        body.forbiddenTimeRanges
      ).catch(error => {
        this.logger.error(`脚本2（视频号）执行失败: ${error.message}`, error.stack);
      });

      return {
        success: true,
        message: '视频号批量发送任务已启动',
        taskId: taskId,
      };
    } catch (error) {
      this.logger.error(`脚本2（视频号）启动失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '启动失败',
      };
    }
  }

  /**
   * 脚本2: 微信好友触达（组合发送）
   */
  @Post('script2/combined-reach')
  async script2CombinedReach(
    @Body()
    body: {
      userId: string;
      contents: Array<{
        type: 'text' | 'video' | 'link' | 'image';
        message?: string;
        materialId?: number;
        imageUrls?: string[];
      }>;
      targetDays: number;
      taskId?: string;
      forbiddenTimeRanges?: Array<{startTime: string, endTime: string}>;
      selectedWechatAccountIndexes?: number[];
      selectedFriendIds?: string[]; // 新增: 选中的好友ID列表
    },
  ) {
    this.logger.log(`收到脚本2请求: 微信好友触达（组合发送）`);
    this.logger.log(`内容类型: ${body.contents.map(c => c.type).join(', ')}, 目标完成时间: ${body.targetDays}天`);
    if (body.selectedWechatAccountIndexes && body.selectedWechatAccountIndexes.length > 0) {
      this.logger.log(`选中微信号数量: ${body.selectedWechatAccountIndexes.length}个`);
    }
    if (body.selectedFriendIds && body.selectedFriendIds.length > 0) {
      this.logger.log(`选中好友数量: ${body.selectedFriendIds.length}个`);
    }
    if (body.forbiddenTimeRanges && body.forbiddenTimeRanges.length > 0) {
      this.logger.log(`禁发时间段: ${body.forbiddenTimeRanges.map(r => `${r.startTime}-${r.endTime}`).join(', ')}`);
    }

    const taskId = body.taskId || `combined_reach_${Date.now()}`;

    try {
      // 验证contents不为空
      if (!body.contents || body.contents.length === 0) {
        throw new Error('请至少选择一种内容类型');
      }

      // 异步执行任务
      this.wechatReachService.startCombinedReachTask(
        body.contents,
        body.targetDays,
        body.userId,
        taskId,
        body.forbiddenTimeRanges,
        body.selectedWechatAccountIndexes,
        body.selectedFriendIds // 传递选中的好友ID列表
      ).catch(error => {
        this.logger.error(`脚本2（组合发送）执行失败: ${error.message}`, error.stack);
      });

      return {
        success: true,
        message: '组合发送任务已启动',
        taskId: taskId,
      };
    } catch (error) {
      this.logger.error(`脚本2（组合发送）启动失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '启动失败',
      };
    }
  }

  /**
   * 暂停脚本2任务
   */
  @Post('script2/pause')
  async pauseScript2() {
    this.logger.log(`收到暂停脚本2请求`);

    try {
      this.wechatReachService.pauseTask();

      return {
        success: true,
        message: '任务已暂停',
      };
    } catch (error) {
      this.logger.error(`暂停任务失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '暂停失败',
      };
    }
  }

  /**
   * 恢复脚本2任务
   */
  @Post('script2/resume')
  async resumeScript2() {
    this.logger.log(`收到恢复脚本2请求`);

    try {
      this.wechatReachService.resumeTask();

      return {
        success: true,
        message: '任务已恢复',
      };
    } catch (error) {
      this.logger.error(`恢复任务失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '恢复失败',
      };
    }
  }

  /**
   * 停止脚本2任务
   */
  @Post('script2/stop')
  async stopScript2() {
    this.logger.log(`收到停止脚本2请求`);

    try {
      this.wechatReachService.stopTask();

      return {
        success: true,
        message: '任务已停止',
      };
    } catch (error) {
      this.logger.error(`停止任务失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '停止失败',
      };
    }
  }

  /**
   * 获取脚本2任务状态
   */
  @Post('script2/status')
  async getScript2Status() {
    try {
      const status = this.wechatReachService.getTaskStatus();

      return {
        success: true,
        data: status,
      };
    } catch (error) {
      this.logger.error(`获取任务状态失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取状态失败',
      };
    }
  }

  /**
   * 同步视频号素材库
   */
  @Post('script2/sync-materials')
  async syncVideoMaterials(@Body() body: { userId: string }) {
    this.logger.log(`收到同步素材库请求: ${body.userId}`);

    try {
      const result = await this.videoMaterialService.syncMaterialLibrary(body.userId);

      return {
        success: result.success,
        message: result.success ? `成功同步 ${result.count} 个视频号素材` : result.error,
        data: {
          count: result.count,
        },
      };
    } catch (error) {
      this.logger.error(`同步素材库失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '同步失败',
      };
    }
  }

  /**
   * 同步链接素材库
   */
  @Post('script2/sync-link-materials')
  async syncLinkMaterials(@Body() body: { userId: string }) {
    this.logger.log(`收到同步链接素材库请求: ${body.userId}`);

    try {
      const result = await this.linkMaterialService.syncMaterialLibrary(body.userId);

      return {
        success: result.success,
        message: result.success ? `成功同步 ${result.count} 个链接素材` : result.error,
        data: {
          count: result.count,
        },
      };
    } catch (error) {
      this.logger.error(`同步链接素材库失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '同步失败',
      };
    }
  }

  /**
   * 获取视频号素材列表
   */
  @Get('script2/materials')
  async getVideoMaterials(
    @Query('userId') userId: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`获取素材列表: ${userId}, 搜索: ${search || '无'}`);

    try {
      const materials = await this.videoMaterialService.getMaterialList(userId, search);

      return {
        success: true,
        data: materials,
      };
    } catch (error) {
      this.logger.error(`获取素材列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: [],
      };
    }
  }

  /**
   * 获取素材库统计信息
   */
  @Get('script2/material-stats')
  async getMaterialStats(@Query('userId') userId: string) {
    this.logger.log(`获取素材统计: ${userId}`);

    try {
      const stats = await this.videoMaterialService.getMaterialStats(userId);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`获取素材统计失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: { total: 0, lastSyncTime: null },
      };
    }
  }

  /**
   * 获取链接素材列表
   */
  @Get('script2/link-materials')
  async getLinkMaterials(
    @Query('userId') userId: string,
    @Query('search') search?: string,
  ) {
    this.logger.log(`获取链接素材列表: ${userId}, 搜索: ${search || '无'}`);

    try {
      const materials = await this.linkMaterialService.getMaterialList(userId, search);

      return {
        success: true,
        data: materials,
      };
    } catch (error) {
      this.logger.error(`获取链接素材列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: [],
      };
    }
  }

  /**
   * 获取链接素材库统计信息
   */
  @Get('script2/link-material-stats')
  async getLinkMaterialStats(@Query('userId') userId: string) {
    this.logger.log(`获取链接素材统计: ${userId}`);

    try {
      const stats = await this.linkMaterialService.getMaterialStats(userId);

      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error(`获取链接素材统计失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: { total: 0, lastSyncTime: null },
      };
    }
  }

  /**
   * 同步堆雪球好友列表
   * @param body.userId - 用户ID
   * @param body.wechatAccountNames - 可选，要同步的微信号名称数组，不传则同步所有
   */
  @Post('friends/sync')
  async syncFriends(@Body() body: { userId: string; wechatAccountNames?: string[] }) {
    this.logger.log(`收到同步好友列表请求: ${body.userId}, 微信号: ${body.wechatAccountNames ? body.wechatAccountNames.join(',') : '全部'}`);
    try {
      const result = await this.duixueqiuFriendsService.syncFriends(body.userId, body.wechatAccountNames);
      return result;
    } catch (error) {
      this.logger.error(`同步好友列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '同步失败',
      };
    }
  }

  /**
   * 停止同步好友列表
   */
  @Post('friends/stop-sync')
  async stopSyncFriends(@Body() body: { userId: string }) {
    this.logger.log(`收到停止同步好友列表请求: ${body.userId}`);
    try {
      const result = await this.duixueqiuFriendsService.stopSync(body.userId);
      return result;
    } catch (error) {
      this.logger.error(`停止同步失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '停止同步失败',
      };
    }
  }

  /**
   * 获取好友列表(一次性返回所有数据)
   */
  @Get('friends')
  async getFriends(@Query('userId') userId: string) {
    this.logger.log(`获取好友列表: ${userId}`);
    try {
      const friends = await this.duixueqiuFriendsService.getFriends(userId);
      this.logger.log(`获取好友列表成功: 共${friends.length}个好友`);
      return {
        success: true,
        data: friends,
      };
    } catch (error) {
      this.logger.error(`获取好友列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: [],
      };
    }
  }

  /**
   * 更新单个好友选中状态
   */
  @Put('friends/:id/select')
  async updateFriendSelection(
    @Param('id') id: string,
    @Body() body: { userId: string; isSelected: boolean }
  ) {
    this.logger.log(`更新好友选中状态: ${id}, ${body.isSelected}`);
    try {
      await this.duixueqiuFriendsService.updateFriendSelection(
        body.userId,
        parseInt(id),
        body.isSelected
      );
      return {
        success: true,
        message: '更新成功',
      };
    } catch (error) {
      this.logger.error(`更新好友选中状态失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '更新失败',
      };
    }
  }

  /**
   * 批量更新好友选中状态
   */
  @Put('friends/batch-select')
  async batchUpdateFriendSelection(
    @Body() body: { userId: string; friendIds: number[]; isSelected: boolean }
  ) {
    this.logger.log(`批量更新好友选中状态: ${body.friendIds.length} 个好友`);
    try {
      await this.duixueqiuFriendsService.batchUpdateFriendSelection(
        body.userId,
        body.friendIds,
        body.isSelected
      );
      return {
        success: true,
        message: '批量更新成功',
      };
    } catch (error) {
      this.logger.error(`批量更新好友选中状态失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '批量更新失败',
      };
    }
  }

  /**
   * 全选/取消全选好友
   */
  @Put('friends/select-all')
  async selectAllFriends(
    @Body() body: { userId: string; isSelected: boolean }
  ) {
    this.logger.log(`全选/取消全选好友: ${body.isSelected}`);
    try {
      await this.duixueqiuFriendsService.selectAllFriends(
        body.userId,
        body.isSelected
      );
      return {
        success: true,
        message: body.isSelected ? '已全选' : '已取消全选',
      };
    } catch (error) {
      this.logger.error(`全选/取消全选失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '操作失败',
      };
    }
  }

  /**
   * 获取选中的好友列表
   */
  @Get('friends/selected')
  async getSelectedFriends(@Query('userId') userId: string) {
    this.logger.log(`获取选中的好友列表: ${userId}`);
    try {
      const friends = await this.duixueqiuFriendsService.getSelectedFriends(userId);
      return {
        success: true,
        data: friends,
      };
    } catch (error) {
      this.logger.error(`获取选中好友列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: [],
      };
    }
  }

  /**
   * 同步微信号列表
   */
  @Post('wechat-accounts/sync')
  async syncWechatAccounts(@Body() body: { userId: string }) {
    this.logger.log(`收到同步微信号列表请求: ${body.userId}`);
    try {
      const result = await this.wechatReachService.syncWechatAccounts(body.userId);
      return result;
    } catch (error) {
      this.logger.error(`同步微信号列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '同步失败',
      };
    }
  }

  /**
   * 获取微信号列表(从数据库)
   */
  @Get('wechat-accounts')
  async getWechatAccounts(@Query('userId') userId: string) {
    this.logger.log(`获取微信号列表: ${userId}`);
    try {
      const accounts = await this.wechatReachService.getWechatAccountsFromDatabase(userId);
      return {
        success: true,
        data: accounts,
      };
    } catch (error) {
      this.logger.error(`获取微信号列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '获取失败',
        data: [],
      };
    }
  }

  /**
   * 发送私聊消息给多个好友(使用搜索框,更快更准确)
   */
  @Post('send-private-messages')
  async sendPrivateMessages(
    @Body()
    body: {
      userId: string;
      friendIds: string[]; // 选中的好友ID列表
      messageType: 'text' | 'video' | 'link';
      messageContent: string; // 文字内容或附加文案
      materialId?: string; // 视频号或链接素材ID
    },
  ) {
    this.logger.log(`收到发送私聊消息请求: ${body.friendIds.length} 个好友`);
    this.logger.log(`消息类型: ${body.messageType}`);

    try {
      // 异步执行,立即返回
      this.wechatReachService.sendPrivateMessages(body).catch((error) => {
        this.logger.error(`发送私聊消息失败: ${error.message}`, error.stack);
      });

      return {
        success: true,
        message: '发送任务已启动',
      };
    } catch (error) {
      this.logger.error(`启动发送任务失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '启动失败',
      };
    }
  }
}

