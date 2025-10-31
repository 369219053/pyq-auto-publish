import { Controller, Post, Body, Logger, Sse, MessageEvent, Query } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { FollowCircleService } from './follow-circle.service';
import { Observable } from 'rxjs';

@Controller('automation')
export class AutomationController {
  private readonly logger = new Logger(AutomationController.name);

  constructor(
    private readonly automationService: AutomationService,
    private readonly followCircleService: FollowCircleService,
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
      selectedAccounts?: string[];
      selectedTags?: string[];
      useLocation?: boolean;
      comments?: string[];
      randomContent?: string;
    },
  ) {
    this.logger.log(`收到脚本1请求: ${body.url}`);

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
      userId: number; // 🔥 添加userId参数
      content: string;
      images: string[];
      followCount: number;
      intervalMinutes: number;
      randomDelayMinutes?: number;
      contentType?: string;
    },
  ) {
    this.logger.log(`收到脚本4请求: 跟圈自动化`);
    this.logger.log(`跟圈次数: ${body.followCount}, 时间间隔: ${body.intervalMinutes}分钟, 随机延迟: ±${body.randomDelayMinutes || 0}分钟, 类型: ${body.contentType || 'text'}`);

    const logs = [];

    try {
      logs.push('🚀 开始创建跟圈任务...');

      // 🔥 传递userId到Service
      const taskGroupId = await this.followCircleService.createFollowCircleTasksWithLogs(
        body.content,
        body.images,
        body.followCount,
        body.intervalMinutes,
        body.randomDelayMinutes || 0,
        body.contentType || 'text',
        logs,
        body.userId, // 🔥 传递用户ID
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
}

