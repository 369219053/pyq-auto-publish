import { Injectable, Logger, Inject } from '@nestjs/common';
import { SchedulerRegistry, Cron, CronExpression } from '@nestjs/schedule';
import { WechatMonitorService } from '../wechat-monitor/wechat-monitor.service';
import { ConfigService } from '../config/config.service';
import { PublishService } from '../publish/publish.service';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { StorageService } from '../storage/storage.service';
import { SupabaseService } from '../common/supabase.service';
import { Pool } from 'pg';

/**
 * 定时任务服务
 * 负责定时同步文章等自动化任务
 * 支持动态调整同步间隔
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private syncIntervalHandle: NodeJS.Timeout | null = null;
  private isProcessingPublish = false;
  private isProcessingDelete = false; // 防止重复执行删除任务

  constructor(
    private readonly wechatMonitorService: WechatMonitorService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly publishService: PublishService,
    private readonly puppeteerService: PuppeteerService,
    private readonly storageService: StorageService,
    private readonly supabaseService: SupabaseService,
    @Inject('DATABASE_POOL') private readonly pool: Pool,
  ) {
    // 启动时初始化定时任务
    this.initializeSyncTask();
    // 启动时确保Storage Bucket存在
    this.storageService.ensureBucketExists().catch((error) => {
      this.logger.error('初始化Storage Bucket失败', error);
    });
  }

  /**
   * 初始化同步任务
   */
  async initializeSyncTask() {
    try {
      const intervalMinutes = await this.configService.getSyncInterval();
      this.logger.log(`初始化同步任务,间隔: ${intervalMinutes} 分钟`);
      await this.restartSyncTask(intervalMinutes);
    } catch (error) {
      this.logger.error(`初始化同步任务失败: ${error.message}`);
    }
  }

  /**
   * 重启同步任务(使用新的间隔)
   */
  async restartSyncTask(intervalMinutes: number) {
    // 清除旧的定时任务
    if (this.syncIntervalHandle) {
      clearInterval(this.syncIntervalHandle);
      this.logger.log('已清除旧的同步任务');
    }

    // 创建新的定时任务
    const intervalMs = intervalMinutes * 60 * 1000;
    this.syncIntervalHandle = setInterval(async () => {
      await this.executeSync();
    }, intervalMs);

    this.logger.log(`新的同步任务已启动,间隔: ${intervalMinutes} 分钟`);

    // 立即执行一次同步
    await this.executeSync();
  }

  /**
   * 执行同步任务
   */
  async executeSync() {
    this.logger.log('开始执行定时同步任务...');

    try {
      const result = await this.wechatMonitorService.syncArticles();
      this.logger.log(`定时同步完成: ${result.message}`);
    } catch (error) {
      this.logger.error(`定时同步失败: ${error.message}`);
    }
  }

  /**
   * 手动触发同步
   */
  async triggerSync() {
    this.logger.log('手动触发同步任务...');
    await this.executeSync();
  }

  /**
   * 更新同步间隔
   */
  async updateSyncInterval(intervalMinutes: number) {
    this.logger.log(`更新同步间隔为: ${intervalMinutes} 分钟`);
    await this.restartSyncTask(intervalMinutes);
  }

  /**
   * 每分钟检查一次待发布的任务 (仅检查定时发布的任务)
   * 立即发布的任务会在创建时直接执行,不需要轮询
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkPendingTasks() {
    if (this.isProcessingPublish) {
      this.logger.log('上一个发布任务还在处理中,跳过本次检查');
      return;
    }

    try {
      this.isProcessingPublish = true;
      this.logger.log('🔍 检查定时发布任务...');

      // 只获取定时发布的任务 (is_immediate=false)
      const pendingTasks = await this.publishService.getPendingTasks();

      if (pendingTasks.length === 0) {
        this.logger.log('✅ 没有待发布的定时任务');
        return;
      }

      this.logger.log(`📋 发现 ${pendingTasks.length} 个定时发布任务`);

      // 逐个处理任务
      for (const task of pendingTasks) {
        try {
          this.logger.log(`⏰ 开始处理定时任务: ${task.id}`);
          await this.puppeteerService.publishToDuixueqiu(task);
          this.logger.log(`✅ 定时任务处理成功: ${task.id}`);
        } catch (error) {
          this.logger.error(`❌ 定时任务处理失败: ${task.id}`, error);
          // 继续处理下一个任务
        }
      }

      this.logger.log('🎉 所有定时任务处理完成');
    } catch (error) {
      this.logger.error('❌ 检查定时任务失败:', error);
    } finally {
      this.isProcessingPublish = false;
    }
  }

  /**
   * 每周日凌晨3点清理旧图片
   */
  @Cron('0 3 * * 0')
  async cleanOldImages() {
    try {
      this.logger.log('🗑️  开始每周清理旧图片任务');
      const deletedCount = await this.storageService.cleanOldImages(7);
      this.logger.log(`✅ 清理完成, 删除了 ${deletedCount} 个旧文件`);
    } catch (error) {
      this.logger.error('❌ 清理旧图片失败:', error);
    }
  }

  /**
   * 每分钟检查一次待删除的跟圈任务
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkDeleteCircleTasks() {
    if (this.isProcessingDelete) {
      this.logger.log('上一个删除任务还在处理中,跳过本次检查');
      return;
    }

    try {
      this.isProcessingDelete = true;
      this.logger.log('🔍 检查待删除的跟圈任务...');

      const now = new Date().toISOString();

      // 查找所有待删除的任务 (删除时间 <= 当前时间) - 使用Supabase客户端
      const { data: tasks, error } = await this.supabaseService.getClient()
        .from('delete_circle_tasks')
        .select('*')
        .eq('status', 'pending')
        .lte('delete_time', now)
        .order('delete_time', { ascending: true });

      if (error) {
        this.logger.error(`查询删除任务失败: ${error.message}`);
        throw error;
      }

      if (!tasks || tasks.length === 0) {
        this.logger.log('✅ 没有待删除的跟圈任务');
        return;
      }

      this.logger.log(`📋 发现 ${tasks.length} 个待删除任务`);

      // 逐个处理删除任务
      for (const task of tasks) {
        try {
          this.logger.log(`🗑️ 开始删除任务: ${task.delete_title}`);

          // 获取userId (从task对象中)
          const userId = task.user_id;
          if (!userId) {
            throw new Error('删除任务缺少user_id字段');
          }

          // 调用Puppeteer删除朋友圈 (双重验证)
          const success = await this.puppeteerService.deleteCircleByTitleAndContent(
            task.delete_title,
            task.delete_content,
            userId,  // 传递userId
          );

          if (success) {
            // 更新状态为已完成 - 使用Supabase客户端
            await this.supabaseService.getClient()
              .from('delete_circle_tasks')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            this.logger.log(`✅ 删除任务完成: ${task.delete_title}`);
          } else {
            // 更新状态为失败 - 使用Supabase客户端
            await this.supabaseService.getClient()
              .from('delete_circle_tasks')
              .update({
                status: 'failed',
                error_message: '未找到匹配任务',
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);

            this.logger.error(`❌ 删除任务失败: ${task.delete_title}`);
          }
        } catch (error) {
          this.logger.error(`❌ 删除任务异常: ${task.delete_title}`, error);

          // 更新状态为失败 - 使用Supabase客户端
          await this.supabaseService.getClient()
            .from('delete_circle_tasks')
            .update({
              status: 'failed',
              error_message: error.message,
              updated_at: new Date().toISOString(),
            })
            .eq('id', task.id);
        }
      }

      this.logger.log('🎉 所有删除任务处理完成');
    } catch (error) {
      this.logger.error('❌ 检查删除任务失败:', error);
    } finally {
      this.isProcessingDelete = false;
    }
  }
}

