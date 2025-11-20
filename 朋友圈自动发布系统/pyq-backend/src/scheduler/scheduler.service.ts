import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
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
export class SchedulerService implements OnModuleInit {
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
  ) {}

  /**
   * 模块初始化时执行
   */
  async onModuleInit() {
    this.logger.log('📋 SchedulerService 模块初始化开始...');

    // 初始化定时同步任务
    await this.initializeSyncTask();

    // 确保Storage Bucket存在
    try {
      await this.storageService.ensureBucketExists();
      this.logger.log('✅ Storage Bucket 初始化成功');
    } catch (error) {
      this.logger.error('❌ 初始化Storage Bucket失败', error);
    }

    this.logger.log('✅ SchedulerService 模块初始化完成');
  }

  /**
   * 初始化同步任务
   */
  async initializeSyncTask() {
    try {
      this.logger.log('🔧 开始初始化文章同步任务...');

      const intervalMinutes = await this.configService.getSyncInterval();
      this.logger.log(`⏰ 从配置中获取同步间隔: ${intervalMinutes} 分钟`);

      await this.restartSyncTask(intervalMinutes);

      this.logger.log('✅ 文章同步任务初始化成功');
    } catch (error) {
      this.logger.error(`❌ 初始化同步任务失败: ${error.message}`, error.stack);
      // 使用默认间隔重试
      this.logger.log('🔄 尝试使用默认间隔(30分钟)重新初始化...');
      try {
        await this.restartSyncTask(30);
        this.logger.log('✅ 使用默认间隔初始化成功');
      } catch (retryError) {
        this.logger.error(`❌ 使用默认间隔初始化也失败: ${retryError.message}`);
      }
    }
  }

  /**
   * 重启同步任务(使用新的间隔)
   */
  async restartSyncTask(intervalMinutes: number) {
    // 清除旧的定时任务
    if (this.syncIntervalHandle) {
      clearInterval(this.syncIntervalHandle);
      this.logger.log('🗑️  已清除旧的同步任务');
    }

    // 创建新的定时任务
    const intervalMs = intervalMinutes * 60 * 1000;
    this.syncIntervalHandle = setInterval(async () => {
      await this.executeSync();
    }, intervalMs);

    const nextSyncTime = new Date(Date.now() + intervalMs);
    this.logger.log(`🚀 新的同步任务已启动!`);
    this.logger.log(`   ⏰ 同步间隔: ${intervalMinutes} 分钟`);
    this.logger.log(`   📅 下次同步时间: ${nextSyncTime.toLocaleString('zh-CN')}`);

    // 异步执行首次同步,不阻塞启动流程
    this.logger.log('🔄 将在后台执行首次同步...');
    setImmediate(() => {
      this.executeSync().catch(error => {
        this.logger.error('❌ 首次同步失败', error);
      });
    });
  }

  /**
   * 执行同步任务
   */
  async executeSync() {
    const startTime = Date.now();
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('🔄 开始执行定时同步任务...');
    this.logger.log(`⏰ 执行时间: ${new Date().toLocaleString('zh-CN')}`);

    try {
      // 1. 先检查微信公众平台登录状态
      this.logger.log('🔍 检查微信公众平台登录状态...');
      const loginStatus = await this.wechatMonitorService.checkWechatLoginStatus();

      if (!loginStatus.isLoggedIn) {
        this.logger.warn('⚠️  微信公众平台未登录或登录已过期!');
        this.logger.warn('   请前往"公众号监控 > 扫码登录"页面重新扫码登录');

        // 记录到数据库,供前端查询
        await this.saveLoginStatusToDb(false, '微信公众平台登录已过期,请重新扫码登录');

        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return {
          success: false,
          message: '微信公众平台未登录,同步任务已跳过',
          needRelogin: true,
        };
      }

      this.logger.log('✅ 微信公众平台登录状态正常');

      // 2. 执行同步
      const result = await this.wechatMonitorService.syncArticles();
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      this.logger.log(`✅ 定时同步完成!`);
      this.logger.log(`   📊 结果: ${result.message}`);
      this.logger.log(`   ⏱️  耗时: ${duration}秒`);

      if (result.synced > 0) {
        this.logger.log(`   🎉 新增文章: ${result.synced}篇`);
      }

      // 记录成功状态到数据库
      await this.saveLoginStatusToDb(true, '同步成功');

      return result;
    } catch (error) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.error(`❌ 定时同步失败!`);
      this.logger.error(`   ⏱️  耗时: ${duration}秒`);
      this.logger.error(`   💥 错误: ${error.message}`, error.stack);

      // 记录错误状态到数据库
      await this.saveLoginStatusToDb(false, error.message);

      throw error;
    } finally {
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
  }

  /**
   * 保存登录状态到数据库
   */
  private async saveLoginStatusToDb(isLoggedIn: boolean, message: string) {
    try {
      const { error } = await this.supabaseService.getClient()
        .from('monitor_config')
        .upsert({
          config_key: 'wechat_login_status',
          config_value: JSON.stringify({
            is_logged_in: isLoggedIn,
            message: message,
            last_check_time: new Date().toISOString(),
          }),
          description: '微信公众平台登录状态',
        }, {
          onConflict: 'config_key',
        });

      if (error) {
        this.logger.error(`保存登录状态失败: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`保存登录状态异常: ${error.message}`);
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
   * 🆕 每天凌晨3点清理7天前的跟圈图片
   */
  @Cron('0 3 * * *')
  async cleanOldFollowCircleImages() {
    try {
      this.logger.log('🧹 开始清理7天前的跟圈图片...');
      const deletedCount = await this.storageService.cleanOldFollowCircleImages();
      this.logger.log(`✅ 跟圈图片清理完成, 删除了 ${deletedCount} 个任务组的图片`);
    } catch (error) {
      this.logger.error('❌ 清理跟圈图片失败:', error);
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

