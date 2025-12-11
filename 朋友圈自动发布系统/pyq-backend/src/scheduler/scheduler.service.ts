import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry, Cron, CronExpression } from '@nestjs/schedule';
import { WechatMonitorService } from '../wechat-monitor/wechat-monitor.service';
import { ConfigService } from '../config/config.service';
import { PublishService } from '../publish/publish.service';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { StorageService } from '../storage/storage.service';
import { SupabaseService } from '../common/supabase.service';
import { DuixueqiuFriendsService } from '../automation/duixueqiu-friends.service';
import { VideoMaterialService } from '../automation/video-material.service';
import { LinkMaterialService } from '../automation/link-material.service';
import { Pool } from 'pg';

/**
 * 定时任务服务
 * 负责定时同步文章、视频号素材、链接素材等自动化任务
 * 支持动态调整同步间隔
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private syncIntervalHandle: NodeJS.Timeout | null = null;
  private materialSyncIntervalHandle: NodeJS.Timeout | null = null; // 素材同步定时器
  private isProcessingPublish = false;
  private isProcessingDelete = false; // 防止重复执行删除任务
  private isProcessingMaterialSync = false; // 防止重复执行素材同步

  constructor(
    private readonly wechatMonitorService: WechatMonitorService,
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly publishService: PublishService,
    private readonly puppeteerService: PuppeteerService,
    private readonly storageService: StorageService,
    private readonly supabaseService: SupabaseService,
    private readonly duixueqiuFriendsService: DuixueqiuFriendsService,
    private readonly videoMaterialService: VideoMaterialService,
    private readonly linkMaterialService: LinkMaterialService,
    @Inject('DATABASE_POOL') private readonly pool: Pool,
  ) {}

  /**
   * 模块初始化时执行
   */
  async onModuleInit() {
    this.logger.log('📋 SchedulerService 模块初始化开始...');

    // 初始化定时同步任务
    await this.initializeSyncTask();

    // 初始化素材同步任务
    await this.initializeMaterialSyncTask();

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
   * 初始化素材同步任务
   */
  async initializeMaterialSyncTask() {
    try {
      this.logger.log('🔧 开始初始化素材同步任务...');

      const intervalMinutes = await this.configService.getMaterialSyncInterval();
      this.logger.log(`⏰ 从配置中获取素材同步间隔: ${intervalMinutes} 分钟`);

      await this.restartMaterialSyncTask(intervalMinutes);

      this.logger.log('✅ 素材同步任务初始化成功');
    } catch (error) {
      this.logger.error(`❌ 初始化素材同步任务失败: ${error.message}`, error.stack);
      // 使用默认间隔重试
      this.logger.log('🔄 尝试使用默认间隔(60分钟)重新初始化...');
      try {
        await this.restartMaterialSyncTask(60);
        this.logger.log('✅ 使用默认间隔初始化成功');
      } catch (retryError) {
        this.logger.error(`❌ 使用默认间隔初始化也失败: ${retryError.message}`);
      }
    }
  }

  /**
   * 重启素材同步任务(使用新的间隔)
   */
  async restartMaterialSyncTask(intervalMinutes: number) {
    // 清除旧的定时任务
    if (this.materialSyncIntervalHandle) {
      clearInterval(this.materialSyncIntervalHandle);
      this.logger.log('🗑️  已清除旧的素材同步任务');
    }

    // 创建新的定时任务
    const intervalMs = intervalMinutes * 60 * 1000;
    this.materialSyncIntervalHandle = setInterval(async () => {
      await this.executeMaterialSync();
    }, intervalMs);

    const nextSyncTime = new Date(Date.now() + intervalMs);
    this.logger.log(`🚀 新的素材同步任务已启动!`);
    this.logger.log(`   ⏰ 同步间隔: ${intervalMinutes} 分钟`);
    this.logger.log(`   📅 下次同步时间: ${nextSyncTime.toLocaleString('zh-CN')}`);

    // 异步执行首次同步,不阻塞启动流程
    this.logger.log('🔄 将在后台执行首次素材同步...');
    setImmediate(() => {
      this.executeMaterialSync().catch(error => {
        this.logger.error('❌ 首次素材同步失败', error);
      });
    });
  }

  /**
   * 执行素材同步任务
   */
  async executeMaterialSync() {
    if (this.isProcessingMaterialSync) {
      this.logger.log('⏳ 上一个素材同步任务还在处理中,跳过本次同步');
      return;
    }

    const startTime = Date.now();
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('🔄 开始执行定时素材同步任务...');
    this.logger.log(`⏰ 执行时间: ${new Date().toLocaleString('zh-CN')}`);

    try {
      this.isProcessingMaterialSync = true;

      // 获取所有需要同步的用户(status='active')
      const { data: users, error: userError } = await this.supabaseService.getClient()
        .from('duixueqiu_accounts')
        .select('user_id, username')
        .eq('status', 'active');

      if (userError) {
        throw new Error(`获取用户列表失败: ${userError.message}`);
      }

      if (!users || users.length === 0) {
        this.logger.log('⚠️  没有找到活跃的堆雪球账号,跳过素材同步');
        this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      }

      this.logger.log(`📋 找到 ${users.length} 个活跃用户,开始同步素材...`);

      let totalVideoMaterials = 0;
      let totalLinkMaterials = 0;
      let successCount = 0;
      let failCount = 0;

      // 逐个用户同步素材
      for (const user of users) {
        try {
          this.logger.log(`👤 开始同步用户 ${user.username} (${user.user_id}) 的素材...`);

          // 同步视频号素材
          this.logger.log('📹 同步视频号素材...');
          const videoResult = await this.videoMaterialService.syncMaterialLibrary(user.user_id);
          if (videoResult.success) {
            totalVideoMaterials += videoResult.count;
            this.logger.log(`✅ 视频号素材同步成功: ${videoResult.count} 个`);
          } else {
            this.logger.warn(`⚠️  视频号素材同步失败: ${videoResult.error}`);
          }

          // 等待5秒,避免频繁操作
          await new Promise(resolve => setTimeout(resolve, 5000));

          // 同步链接素材
          this.logger.log('🔗 同步链接素材...');
          const linkResult = await this.linkMaterialService.syncMaterialLibrary(user.user_id);
          if (linkResult.success) {
            totalLinkMaterials += linkResult.count;
            this.logger.log(`✅ 链接素材同步成功: ${linkResult.count} 个`);
          } else {
            this.logger.warn(`⚠️  链接素材同步失败: ${linkResult.error}`);
          }

          successCount++;
          this.logger.log(`✅ 用户 ${user.username} 素材同步完成`);

          // 等待10秒再同步下一个用户,避免频繁操作
          if (users.indexOf(user) < users.length - 1) {
            this.logger.log('⏳ 等待10秒后同步下一个用户...');
            await new Promise(resolve => setTimeout(resolve, 10000));
          }

        } catch (error) {
          failCount++;
          this.logger.error(`❌ 用户 ${user.username} 素材同步失败: ${error.message}`);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      this.logger.log(`✅ 定时素材同步完成!`);
      this.logger.log(`   📊 成功: ${successCount} 个用户, 失败: ${failCount} 个用户`);
      this.logger.log(`   📹 视频号素材: ${totalVideoMaterials} 个`);
      this.logger.log(`   🔗 链接素材: ${totalLinkMaterials} 个`);
      this.logger.log(`   ⏱️  总耗时: ${duration}秒`);
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
      this.logger.error(`❌ 定时素材同步失败: ${error.message}`, error.stack);
      this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    } finally {
      this.isProcessingMaterialSync = false;
    }
  }

  /**
   * 手动触发素材同步
   */
  async triggerMaterialSync() {
    this.logger.log('手动触发素材同步任务...');
    await this.executeMaterialSync();
  }

  /**
   * 更新素材同步间隔
   */
  async updateMaterialSyncInterval(intervalMinutes: number) {
    this.logger.log(`更新素材同步间隔为: ${intervalMinutes} 分钟`);
    await this.restartMaterialSyncTask(intervalMinutes);
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

  /**
   * 每天凌晨2点自动同步所有用户的好友列表
   */
  @Cron('0 2 * * *')
  async autoSyncFriends() {
    try {
      this.logger.log('🔄 开始自动同步好友列表...');

      // 获取所有有堆雪球账号的用户
      const { data: accounts, error } = await this.supabaseService.getClient()
        .from('duixueqiu_accounts')
        .select('user_id')
        .eq('is_active', true);

      if (error) {
        this.logger.error(`查询堆雪球账号失败: ${error.message}`);
        throw error;
      }

      if (!accounts || accounts.length === 0) {
        this.logger.log('✅ 没有需要同步的用户');
        return;
      }

      // 去重用户ID
      const uniqueUserIds = [...new Set(accounts.map(acc => acc.user_id))];
      this.logger.log(`📋 发现 ${uniqueUserIds.length} 个用户需要同步好友`);

      // 逐个用户同步
      for (const userId of uniqueUserIds) {
        try {
          this.logger.log(`👤 开始同步用户 ${userId} 的好友列表...`);
          const result = await this.duixueqiuFriendsService.syncFriends(userId);

          if (result.success) {
            this.logger.log(`✅ 用户 ${userId} 同步成功: ${result.message}`);
          } else {
            this.logger.error(`❌ 用户 ${userId} 同步失败: ${result.message}`);
          }

          // 每个用户之间间隔5分钟,避免频繁操作
          if (uniqueUserIds.indexOf(userId) < uniqueUserIds.length - 1) {
            this.logger.log('⏳ 等待5分钟后同步下一个用户...');
            await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
          }
        } catch (error) {
          this.logger.error(`❌ 用户 ${userId} 同步失败:`, error);
          // 继续处理下一个用户
        }
      }

      this.logger.log('🎉 所有用户好友列表自动同步完成');
    } catch (error) {
      this.logger.error('❌ 自动同步好友列表失败:', error);
    }
  }
}

