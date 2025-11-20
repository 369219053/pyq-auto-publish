import { Injectable, Logger, MessageEvent, Inject, forwardRef } from '@nestjs/common';
import { CollectionService } from '../collection/collection.service';
import { CozeService } from '../coze/coze.service';
import { PublishService } from '../publish/publish.service';
import { ArticlesService } from '../articles/articles.service';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { TaskQueueService, TaskType, TaskPriority } from '../puppeteer/task-queue.service';
import { SupabaseService } from '../common/supabase.service';
import { AutomationGateway } from './automation.gateway';
import { Pool } from 'pg';
import { Observable, Subject } from 'rxjs';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly collectionService: CollectionService,
    private readonly cozeService: CozeService,
    private readonly publishService: PublishService,
    private readonly articlesService: ArticlesService,
    private readonly puppeteerService: PuppeteerService,
    private readonly taskQueueService: TaskQueueService,
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => AutomationGateway))
    private readonly gateway: AutomationGateway,
    @Inject('DATABASE_POOL') private readonly pool: Pool,
  ) {}

  /**
   * 脚本1: 输入链接自动发布 (WebSocket版本)
   * @param url 公众号文章链接
   * @param userId 用户ID
   * @param options 发布选项
   */
  async script1_LinkAutoPublish(
    url: string,
    userId: string,
    options: {
      isImmediate?: boolean; // 是否立即发布
      publishTime?: string; // 定时发布时间
      contentType?: string; // 内容类型
      selectedAccounts?: string[]; // 选择的微小号
      selectedTags?: string[]; // 选择的标签
      useLocation?: boolean; // 是否显示定位
      comments?: string[]; // 追评论
      randomContent?: string; // 随机补充内容
      tempTaskId?: string; // 🆕 前端传递的临时任务ID
    } = {},
  ) {
    // 生成任务ID
    const taskId = `script1_${Date.now()}`;

    // 🆕 使用临时ID发送日志,直到真实ID生成
    const currentTaskId = options.tempTaskId || taskId;

    // 🆕 将任务添加到队列 (Script 1是短任务,高优先级)
    await this.taskQueueService.addTask({
      taskId: currentTaskId,
      type: TaskType.SCRIPT1,
      priority: TaskPriority.HIGH,
      execute: async () => {
        await this.executeScript1Task(url, userId, options, currentTaskId, taskId);
      },
      createdAt: new Date(),
    });

    return {
      success: true,
      message: '任务已加入队列',
      taskId,
    };
  }

  /**
   * 执行Script 1任务 (内部方法)
   */
  private async executeScript1Task(
    url: string,
    userId: string,
    options: any,
    currentTaskId: string,
    taskId: string,
  ) {
    try {
      this.gateway.emitScript1Log(currentTaskId, '🚀 开始执行自动发布流程...');
      this.gateway.emitScript1Log(currentTaskId, `📝 文章链接: ${url}`);

      // 步骤1: 自动采集文章内容和图片
      this.gateway.emitScript1Log(currentTaskId, '📥 [步骤1/5] 正在采集文章内容...');
      const articleData = await this.collectionService.extractArticle(url);
      this.gateway.emitScript1Log(currentTaskId, `✅ [步骤1/5] 采集成功: ${articleData.title}`);

      // 步骤2: 自动调用Coze AI转写
      this.gateway.emitScript1Log(currentTaskId, '🤖 [步骤2/5] 正在调用Coze AI转写文案...');
      const rewriteResult = await this.cozeService.rewriteContent(
        articleData.content,
        userId,
      );
      this.gateway.emitScript1Log(currentTaskId, '✅ [步骤2/5] 转写成功');

      // 步骤3: 自动选择版本1创建发布任务
      this.gateway.emitScript1Log(currentTaskId, '📋 [步骤3/5] 正在创建发布任务...');
      const selectedContent = rewriteResult; // Coze返回的是字符串

      // 步骤4: 自动设置发布时间
      const isImmediate = options.isImmediate ?? true; // 默认立即发布
      const publishTime = options.publishTime || new Date().toISOString();
      this.gateway.emitScript1Log(
        currentTaskId,
        `⏰ [步骤4/5] 发布时间: ${isImmediate ? '立即发布' : publishTime}`,
      );

      // 步骤5: 创建发布任务
      this.gateway.emitScript1Log(currentTaskId, '📤 [步骤5/5] 正在创建发布任务...');

      // 自动生成任务标题: 使用文章标题的前20个字 + 时间戳
      const timestamp = new Date().toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).replace(/\//g, '-').replace(/\s/g, '');
      const articleTitleShort = articleData.title.substring(0, 20);
      const autoTaskTitle = `${articleTitleShort}-${timestamp}`;

      const publishTask = await this.publishService.createTask({
        userId,
        taskTitle: autoTaskTitle, // 添加自动生成的任务标题
        content: selectedContent,
        images: articleData.images || [],
        publishTime: new Date(publishTime),
        isImmediate,
        selectedTags: options.selectedTags || [],
        useLocation: options.useLocation || false,
        comments: options.comments || [],
        randomContent: options.randomContent || '',
      });
      this.gateway.emitScript1Log(currentTaskId, `✅ [步骤5/5] 发布任务创建成功: ${publishTask.id}`);

      // 发送完成通知
      const resultData = {
        articleTitle: articleData.title,
        rewriteVersions: [rewriteResult],
        selectedVersion: selectedContent,
        publishTaskId: publishTask.id,
        publishTime: isImmediate ? '立即发布' : publishTime,
      };

      this.gateway.emitScript1Complete(taskId, true, '自动发布流程执行成功', resultData);

      this.logger.log(`✅ [脚本1] 任务执行成功: ${taskId}`);
    } catch (error) {
      this.logger.error(`❌ [脚本1] 执行失败: ${error.message}`);
      this.gateway.emitScript1Log(currentTaskId, `❌ 执行失败: ${error.message}`);
      this.gateway.emitScript1Complete(currentTaskId, false, error.message);
      throw error; // 抛出错误让队列知道任务失败
    }
  }

  /**
   * 脚本1: 输入链接自动发布 (流式输出版本)
   */
  script1_LinkAutoPublishStream(
    url: string,
    userId: string,
    options: {
      isImmediate?: boolean;
      publishTime?: string;
      contentType?: string;
      selectedAccounts?: string[];
      selectedTags?: string[];
      useLocation?: boolean;
      comments?: string[];
      randomContent?: string;
    } = {},
  ): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    // 异步执行,通过Subject发送进度
    (async () => {
      try {
        subject.next({ data: { step: 0, message: '🚀 开始执行自动发布流程...', type: 'info' } } as MessageEvent);

        // 步骤1: 采集文章
        subject.next({ data: { step: 1, message: '📥 正在采集文章内容...', type: 'info' } } as MessageEvent);
        const articleData = await this.collectionService.extractArticle(url);
        subject.next({
          data: {
            step: 1,
            message: `✅ 采集成功: ${articleData.title}`,
            type: 'success',
            data: { title: articleData.title, imageCount: articleData.images?.length || 0 }
          }
        } as MessageEvent);

        // 步骤2: AI转写
        subject.next({ data: { step: 2, message: '🤖 正在调用Coze AI转写文案...', type: 'info' } } as MessageEvent);
        const rewriteResult = await this.cozeService.rewriteContent(articleData.content, userId);
        subject.next({
          data: {
            step: 2,
            message: '✅ 转写成功',
            type: 'success',
            data: { content: rewriteResult.substring(0, 100) + '...' }
          }
        } as MessageEvent);

        // 步骤3: 创建任务
        subject.next({ data: { step: 3, message: '📋 正在创建发布任务...', type: 'info' } } as MessageEvent);
        const isImmediate = options.isImmediate ?? true;
        const publishTime = options.publishTime || new Date().toISOString();

        const publishTask = await this.publishService.createTask({
          userId,
          content: rewriteResult,
          images: articleData.images || [],
          publishTime: new Date(publishTime),
          isImmediate,
          selectedTags: options.selectedTags || [],
          useLocation: options.useLocation || false,
          comments: options.comments || [],
          randomContent: options.randomContent || '',
        });

        subject.next({
          data: {
            step: 3,
            message: `✅ 发布任务创建成功`,
            type: 'success',
            data: { taskId: publishTask.id }
          }
        } as MessageEvent);

        // 步骤4: 发布时间
        subject.next({
          data: {
            step: 4,
            message: `⏰ 发布时间: ${isImmediate ? '立即发布' : publishTime}`,
            type: 'info'
          }
        } as MessageEvent);

        // 步骤5: 执行发布
        if (isImmediate) {
          subject.next({ data: { step: 5, message: '🚀 正在执行发布...', type: 'info' } } as MessageEvent);
          subject.next({
            data: {
              step: 5,
              message: '✅ 发布任务已提交,正在后台执行',
              type: 'success'
            }
          } as MessageEvent);
        }

        // 完成
        subject.next({
          data: {
            step: 6,
            message: '🎉 自动发布流程执行成功!',
            type: 'complete',
            data: {
              articleTitle: articleData.title,
              selectedVersion: rewriteResult.substring(0, 100) + '...',
              publishTaskId: publishTask.id,
              publishTime: isImmediate ? '立即发布' : publishTime,
            }
          }
        } as MessageEvent);

        subject.complete();
      } catch (error) {
        subject.next({
          data: {
            step: -1,
            message: `❌ 执行失败: ${error.message}`,
            type: 'error'
          }
        } as MessageEvent);
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  /**
   * 脚本3: 定时监控自动发布
   * @param userId 用户ID
   * @param options 监控选项
   */
  async script3_MonitorAutoPublish(
    userId: string,
    options: {
      accountIds?: string[]; // 监控的公众号ID列表
      autoRewrite?: boolean; // 是否自动转写
      autoPublish?: boolean; // 是否自动发布
      publishDelay?: number; // 发布延迟(分钟)
      contentType?: string; // 内容类型
      selectedAccounts?: string[]; // 选择的微小号
      selectedTags?: string[]; // 选择的标签
      useLocation?: boolean; // 是否显示定位
      comments?: string[]; // 追评论
      randomContent?: string; // 随机补充内容
    } = {},
  ) {
    try {
      this.logger.log(`🚀 [脚本3] 开始执行: 定时监控自动发布`);

      // 步骤1: 获取最新文章(最近1小时内的新文章)
      this.logger.log(`📥 [步骤1/5] 正在检查新文章...`);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const newArticles = await this.articlesService.getRecentArticles(
        oneHourAgo.toISOString(),
        options.accountIds,
      );

      if (newArticles.length === 0) {
        this.logger.log(`ℹ️ 没有检测到新文章`);
        return {
          success: true,
          message: '没有检测到新文章',
          data: {
            newArticlesCount: 0,
            publishedCount: 0,
          },
        };
      }

      this.logger.log(`✅ [步骤1/5] 检测到 ${newArticles.length} 篇新文章`);

      let publishedCount = 0;

      // 步骤2-5: 对每篇新文章执行自动发布流程
      for (const article of newArticles) {
        try {
          this.logger.log(`📝 处理文章: ${article.title}`);

          // 步骤2: 自动转写(如果启用)
          let content = article.content;
          if (options.autoRewrite) {
            this.logger.log(`🤖 [步骤2/5] 正在转写文案...`);
            const rewriteResult = await this.cozeService.rewriteContent(
              article.content,
              userId,
            );

            content = rewriteResult; // Coze返回的是字符串
            this.logger.log(`✅ [步骤2/5] 转写成功`);
          }

          // 步骤3: 自动创建发布任务(如果启用)
          if (options.autoPublish) {
            this.logger.log(`📋 [步骤3/5] 正在创建发布任务...`);

            // 计算发布时间(延迟发布)
            const publishDelay = options.publishDelay || 0;
            const publishTime = new Date(
              Date.now() + publishDelay * 60 * 1000,
            );

            const publishTask = await this.publishService.createTask({
              userId,
              content,
              images: article.images || [],
              publishTime,
              isImmediate: publishDelay === 0,
              selectedTags: options.selectedTags || [],
              useLocation: options.useLocation || false,
              comments: options.comments || [],
              randomContent: options.randomContent || '',
            });

            this.logger.log(`✅ [步骤3/5] 发布任务创建成功: ${publishTask.id}`);
            publishedCount++;
          }
        } catch (error) {
          this.logger.error(`❌ 处理文章失败: ${article.title}, ${error.message}`);
        }
      }

      this.logger.log(
        `✅ [脚本3] 执行完成: 检测到 ${newArticles.length} 篇新文章, 成功创建 ${publishedCount} 个发布任务`,
      );

      return {
        success: true,
        message: '定时监控自动发布执行成功',
        data: {
          newArticlesCount: newArticles.length,
          publishedCount,
          articles: newArticles.map((a) => ({
            id: a.id,
            title: a.title,
            accountName: a.account_name,
            publishTime: a.publish_time,
          })),
        },
      };
    } catch (error) {
      this.logger.error(`❌ [脚本3] 执行失败: ${error.message}`);
      return {
        success: false,
        message: error.message,
        data: null,
      };
    }
  }

  /**
   * 脚本4: 跟圈自动化
   * @param content 朋友圈内容
   * @param images 图片数组 (Base64或URL)
   * @param followCount 跟圈次数
   * @param intervalHours 时间间隔 (小时)
   * @param userId 用户ID (UUID)
   */
  async script4_FollowCircleAutoPublish(
    content: string,
    images: string[],
    followCount: number,
    intervalHours: number,
    userId: string,  // 添加userId参数
  ): Promise<Observable<string>> {
    const subject = new Subject<string>();

    (async () => {
      try {
        subject.next('🚀 [脚本4] 开始执行: 跟圈自动化');
        subject.next(`📝 跟圈次数: ${followCount}次, 时间间隔: ${intervalHours}小时`);

        // 生成唯一的任务组ID
        const taskGroupId = `跟圈_${Date.now()}`;
        subject.next(`🔖 任务组ID: ${taskGroupId}`);

        // 准备第1条朋友圈数据
        const firstCircleTitle = `${taskGroupId}_第1条`;
        const firstCircleData = {
          title: firstCircleTitle,
          content: content,
          images: images,
        };

        // 准备跟圈任务数据
        const followCircles = [];
        for (let i = 0; i < followCount; i++) {
          const circleIndex = i + 2; // 第2条、第3条、第4条...
          const publishTime = new Date(Date.now() + (i + 1) * intervalHours * 60 * 1000); // 改为分钟
          const circleTitle = `${taskGroupId}_第${circleIndex}条`;

          followCircles.push({
            title: circleTitle,
            content: content,
            images: images,
            publishTime: publishTime,
          });
        }

        // 步骤1: 使用Puppeteer在同一个浏览器中完成所有操作
        subject.next('📤 [步骤1/2] 发布第1条朋友圈并创建跟圈任务...');
        await this.puppeteerService.publishFollowCircles(firstCircleData, followCircles, userId);
        subject.next(`✅ [步骤1/2] 所有跟圈任务创建完成`);

        // 步骤2: 创建删除任务
        subject.next(`🗑️ [步骤2/2] 创建${followCount}个删除任务...`);

        for (let i = 0; i < followCount; i++) {
          const circleIndex = i + 1; // 要删除第1条、第2条、第3条...
          const deleteTime = new Date(Date.now() + (i + 1) * intervalHours * 60 * 1000); // 改为分钟
          const deleteTitle = `${taskGroupId}_第${circleIndex}条`;

          subject.next(`📝 创建删除任务${i + 1}/${followCount}: ${deleteTitle}`);
          subject.next(`⏰ 删除时间: ${this.formatDateTime(deleteTime)}`);

          // 在数据库中记录删除任务 (使用Supabase客户端)
          const { error } = await this.supabaseService.getClient()
            .from('delete_circle_tasks')
            .insert({
              task_group_id: taskGroupId,
              circle_index: circleIndex,
              delete_title: deleteTitle,
              delete_content: content,
              delete_time: deleteTime.toISOString(),
              status: 'pending',
            });

          if (error) {
            this.logger.error(`创建删除任务失败: ${error.message}`);
            throw new Error(`创建删除任务失败: ${error.message}`);
          }

          subject.next(`✅ 删除任务${i + 1}创建成功`);
        }

        subject.next(`✅ [步骤2/2] 所有删除任务创建完成`);
        subject.next('');
        subject.next('🎉 脚本4执行完成!');
        subject.next(`📊 总结:`);
        subject.next(`  - 第1条朋友圈: 已发布 (${firstCircleTitle})`);
        subject.next(`  - 跟圈任务: ${followCount}个已创建`);
        subject.next(`  - 删除任务: ${followCount}个已创建`);
        subject.next(`  - 最后一条朋友圈将保留不删除`);
        subject.next('');
        subject.next('💡 提示: 系统将在指定时间自动删除旧朋友圈');

        subject.complete();

      } catch (error) {
        this.logger.error(`❌ [脚本4] 执行失败: ${error.message}`, error.stack);
        subject.error(`❌ 脚本4执行失败: ${error.message}`);
      }
    })();

    return subject.asObservable();
  }

  /**
   * 格式化日期时间
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }
}

