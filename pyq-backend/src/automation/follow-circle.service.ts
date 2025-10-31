import { Injectable, Logger, MessageEvent, Inject, forwardRef } from '@nestjs/common';
import * as schedule from 'node-schedule';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { SupabaseService } from '../common/supabase.service';
import { Observable, Subject } from 'rxjs';
import { AutomationGateway } from './automation.gateway';

/**
 * 跟圈任务服务
 * 负责管理和执行跟圈任务的定时发布和删除
 */
@Injectable()
export class FollowCircleService {
  private readonly logger = new Logger(FollowCircleService.name);
  private scheduledJobs: Map<string, schedule.Job> = new Map();

  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => AutomationGateway))
    private readonly gateway: AutomationGateway,
  ) {}

  /**
   * 创建跟圈任务 (带日志版本 + WebSocket实时推送)
   */
  async createFollowCircleTasksWithLogs(
    content: string,
    images: any[],
    followCount: number,
    intervalMinutes: number,
    randomDelayMinutes: number = 0,
    contentType: string = 'text',
    logs: string[],
    userId: number = 1,
  ): Promise<string> {
    // 生成唯一的组ID
    const groupNumber = Date.now().toString().slice(-4);
    const groupId = `A${groupNumber}`;
    const taskGroupId = `跟圈_${Date.now()}`;

    const emitLog = (log: string) => {
      logs.push(log);
      this.gateway.emitLog(taskGroupId, log);
    };

    emitLog(`📋 任务组ID: ${taskGroupId}`);
    emitLog(`🔢 跟圈次数: ${followCount}次, 间隔: ${intervalMinutes}分钟`);

    const now = new Date();
    const tasks = [];

    // 创建所有跟圈任务
    for (let i = 1; i <= followCount + 1; i++) {
      let publishTime = new Date(now.getTime() + (i - 1) * intervalMinutes * 60 * 1000);

      if (i > 1 && randomDelayMinutes > 0) {
        // 生成随机延迟,排除0: [-N, ..., -1, +1, ..., +N]
        // 总共有 randomDelayMinutes * 2 个选项
        let randomDelay = Math.floor(Math.random() * (randomDelayMinutes * 2)) + 1; // [1, 2N]
        if (randomDelay > randomDelayMinutes) {
          randomDelay = randomDelay - randomDelayMinutes; // [N+1, 2N] -> [1, N]
        } else {
          randomDelay = randomDelay - randomDelayMinutes - 1; // [1, N] -> [-N, -1]
        }
        publishTime = new Date(publishTime.getTime() + randomDelay * 60 * 1000);
        emitLog(`🎲 任务${i}添加随机延迟: ${randomDelay > 0 ? '+' : ''}${randomDelay}分钟`);
      }

      const localTimeString = publishTime.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(/\//g, '-');

      const task = {
        task_group_id: taskGroupId,
        group_id: groupId,
        circle_index: i,
        content: content,
        images: images ? JSON.stringify(images) : null,
        content_type: contentType,
        publish_time: localTimeString,
        delete_previous: i > 1,
        previous_title: i > 1 ? `自动跟圈${groupId}-${i - 1}` : null,
        status: 'pending',
        user_id: userId,
      };

      tasks.push(task);
    }

    // 逐条插入数据库
    emitLog(`📝 开始插入${tasks.length}个任务到数据库...`);
    let successCount = 0;

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const { error } = await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .insert(task);

      if (!error) {
        successCount++;
        emitLog(`✅ 任务${i + 1}/${tasks.length}插入成功`);
      } else {
        emitLog(`❌ 任务${i + 1}/${tasks.length}插入失败: ${error.message}`);
        this.logger.error(`插入任务失败:`, error);
      }
    }

    emitLog(`✅ 成功创建${successCount}个跟圈任务`);

    // 立即发布第一条
    emitLog('📤 开始发布第一条朋友圈...');
    await this.publishFirstCircle(taskGroupId);
    emitLog('✅ 第一条朋友圈发布成功!');

    // 为后续任务创建定时器
    emitLog('⏰ 创建后续任务定时器...');
    await this.scheduleFollowCircleTasks(taskGroupId, intervalMinutes, true);
    emitLog(`✅ 所有定时任务已创建,将在指定时间自动执行`);

    // ⚠️ 不在这里发送完成通知,等所有朋友圈发布完成后再发送

    return taskGroupId;
  }

  /**
   * 创建跟圈任务
   * @param content 朋友圈内容
   * @param images 图片列表
   * @param followCount 跟圈次数
   * @param intervalMinutes 时间间隔(分钟)
   */
  async createFollowCircleTasks(
    content: string,
    images: any[],
    followCount: number,
    intervalMinutes: number,
    randomDelayMinutes: number = 0, // 随机延迟范围(±分钟)
    contentType: string = 'text', // 内容类型: text/image
    userId: number = 1, // 用户ID
  ): Promise<string> {
    try {
      // 生成唯一的组ID (格式: A001, A002, A003...)
      const groupNumber = Date.now().toString().slice(-4); // 取时间戳后4位
      const groupId = `A${groupNumber}`;
      const taskGroupId = `跟圈_${Date.now()}`;

      this.logger.log(`创建跟圈任务组: ${groupId}, 跟圈${followCount}次, 间隔${intervalMinutes}分钟`);

      const now = new Date();
      const tasks = [];

      // 创建所有跟圈任务 (followCount是跟圈次数,不包括第一条,所以总共是followCount+1条)
      for (let i = 1; i <= followCount + 1; i++) {
        // 计算基础发布时间
        let publishTime = new Date(now.getTime() + (i - 1) * intervalMinutes * 60 * 1000);

        // 添加随机延迟 (第一条不添加随机延迟)
        if (i > 1 && randomDelayMinutes > 0) {
          // 生成随机延迟,排除0: [-N, ..., -1, +1, ..., +N]
          // 总共有 randomDelayMinutes * 2 个选项
          let randomDelay = Math.floor(Math.random() * (randomDelayMinutes * 2)) + 1; // [1, 2N]
          if (randomDelay > randomDelayMinutes) {
            randomDelay = randomDelay - randomDelayMinutes; // [N+1, 2N] -> [1, N]
          } else {
            randomDelay = randomDelay - randomDelayMinutes - 1; // [1, N] -> [-N, -1]
          }
          publishTime = new Date(publishTime.getTime() + randomDelay * 60 * 1000);
          this.logger.log(`任务${i}添加随机延迟: ${randomDelay > 0 ? '+' : ''}${randomDelay}分钟`);
        }

        // 格式化为本地时间字符串 (YYYY-MM-DD HH:mm:ss)
        const year = publishTime.getFullYear();
        const month = String(publishTime.getMonth() + 1).padStart(2, '0');
        const day = String(publishTime.getDate()).padStart(2, '0');
        const hours = String(publishTime.getHours()).padStart(2, '0');
        const minutes = String(publishTime.getMinutes()).padStart(2, '0');
        const seconds = String(publishTime.getSeconds()).padStart(2, '0');
        const localTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

        const task = {
          task_group_id: taskGroupId,
          group_id: groupId, // 添加组ID
          circle_index: i,
          content: content,
          images: images ? JSON.stringify(images) : null,
          content_type: contentType, // 内容类型
          publish_time: localTimeString, // 使用本地时间字符串
          delete_previous: i > 1, // 第一条不需要删除上一条
          previous_title: i > 1 ? `自动跟圈${groupId}-${i - 1}` : null, // 修改标题格式
          status: 'pending',
          user_id: userId, // 添加用户ID
        };

        tasks.push(task);
      }

      // 逐条插入数据库,避免超时
      this.logger.log(`开始逐条插入${tasks.length}个任务到数据库...`);
      let successCount = 0;

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        let retries = 3;
        let lastError = null;

        while (retries > 0) {
          try {
            const { error } = await this.supabaseService.getClient()
              .from('follow_circle_tasks')
              .insert(task);

            if (!error) {
              successCount++;
              this.logger.log(`✅ 任务${i + 1}/${tasks.length}插入成功`);
              break; // 成功则跳出重试循环
            }

            lastError = error;

            if (retries === 1) {
              // 最后一次重试失败
              throw new Error(`插入任务${i + 1}失败: ${error.message}`);
            }

            this.logger.warn(`⚠️ 任务${i + 1}插入失败,剩余重试次数: ${retries - 1}, 错误: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
            retries--;
          } catch (err) {
            if (retries === 1) {
              this.logger.error(`❌ 任务${i + 1}插入失败,已用尽所有重试次数`);
              throw err;
            }
            retries--;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      this.logger.log(`✅ 成功创建${successCount}个跟圈任务`);

      // 立即发布第一条
      await this.publishFirstCircle(taskGroupId);

      // 为后续任务创建定时器 (从当前时间开始计算,而不是从创建任务时间)
      await this.scheduleFollowCircleTasks(taskGroupId, intervalMinutes, true);

      return taskGroupId;
    } catch (error) {
      this.logger.error(`创建跟圈任务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 停止跟圈任务
   * @param taskGroupId 任务组ID
   */
  async stopFollowCircleTasks(taskGroupId: string): Promise<void> {
    try {
      this.logger.log(`停止跟圈任务: ${taskGroupId}`);

      // 取消所有定时任务
      const jobsToCancel: string[] = [];
      this.scheduledJobs.forEach((job, key) => {
        if (key.startsWith(taskGroupId)) {
          job.cancel();
          jobsToCancel.push(key);
        }
      });

      jobsToCancel.forEach(key => {
        this.scheduledJobs.delete(key);
      });

      this.logger.log(`✅ 已取消${jobsToCancel.length}个定时任务`);

      // 删除数据库中所有未执行的任务
      const { error } = await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .delete()
        .eq('task_group_id', taskGroupId)
        .eq('status', 'pending');

      if (error) {
        throw new Error(`删除数据库任务失败: ${error.message}`);
      }

      this.logger.log(`✅ 跟圈任务已停止: ${taskGroupId}`);
    } catch (error) {
      this.logger.error(`停止跟圈任务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 立即发布第一条朋友圈
   */
  private async publishFirstCircle(taskGroupId: string): Promise<void> {
    try {
      this.logger.log(`开始发布第一条朋友圈: ${taskGroupId}`);

      // 获取第一条任务
      const { data: tasks, error } = await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .select('*')
        .eq('task_group_id', taskGroupId)
        .eq('circle_index', 1)
        .single();

      if (error || !tasks) {
        throw new Error('未找到第一条跟圈任务');
      }

      // 发布朋友圈
      await this.publishCircle(tasks);

      this.logger.log(`✅ 第一条朋友圈发布成功`);
    } catch (error) {
      this.logger.error(`发布第一条朋友圈失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 为后续任务创建定时器
   */
  private async scheduleFollowCircleTasks(taskGroupId: string, intervalMinutes: number, recalculateTime: boolean = false): Promise<void> {
    try {
      // 获取所有待执行的任务(除了第一条)
      const { data: tasks, error } = await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .select('*')
        .eq('task_group_id', taskGroupId)
        .gt('circle_index', 1)
        .eq('status', 'pending')
        .order('circle_index', { ascending: true });

      if (error) {
        throw new Error(`获取跟圈任务失败: ${error.message}`);
      }

      if (!tasks || tasks.length === 0) {
        this.logger.log('没有需要定时执行的任务');
        return;
      }

      this.logger.log(`为${tasks.length}个任务创建定时器`);

      // 如果需要重新计算时间(第一条发布完成后),从当前时间开始计算
      const now = new Date();

      // 为每个任务创建定时器
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        let publishTime: Date;

        if (recalculateTime) {
          // 从当前时间开始计算,第i个任务在(i+1)*间隔分钟后执行
          publishTime = new Date(now.getTime() + (i + 1) * intervalMinutes * 60 * 1000);

          // 更新数据库中的发布时间
          const year = publishTime.getFullYear();
          const month = String(publishTime.getMonth() + 1).padStart(2, '0');
          const day = String(publishTime.getDate()).padStart(2, '0');
          const hours = String(publishTime.getHours()).padStart(2, '0');
          const minutes = String(publishTime.getMinutes()).padStart(2, '0');
          const seconds = String(publishTime.getSeconds()).padStart(2, '0');
          const localTimeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

          await this.supabaseService.getClient()
            .from('follow_circle_tasks')
            .update({ publish_time: localTimeString })
            .eq('id', task.id);
        } else {
          // 使用数据库中的时间
          publishTime = new Date(task.publish_time);
        }

        const jobName = `${taskGroupId}_${task.circle_index}`;

        // 打印本地时间和UTC时间用于调试
        this.logger.log(`创建定时任务: ${jobName}`);
        this.logger.log(`  - 计划时间: ${publishTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
        this.logger.log(`  - 当前时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

        const job = schedule.scheduleJob(publishTime, async () => {
          try {
            this.logger.log(`⏰ 定时任务触发: ${jobName}`);
            this.gateway.emitLog(taskGroupId, `⏰ 定时任务触发,准备发布第${task.circle_index}条朋友圈...`);

            // 发布新的朋友圈(内部会先删除上一条,再发布新的)
            await this.publishCircle(task);

            // 3. 清理定时任务
            this.scheduledJobs.delete(jobName);

            this.logger.log(`✅ 定时任务执行成功: ${jobName}`);

            // 🎉 检查是否是最后一条任务
            const { data: allTasks } = await this.supabaseService.getClient()
              .from('follow_circle_tasks')
              .select('*')
              .eq('task_group_id', taskGroupId)
              .order('circle_index', { ascending: true });

            if (allTasks) {
              const completedCount = allTasks.filter(t => t.status === 'completed').length;
              const totalCount = allTasks.length;

              this.logger.log(`📊 任务进度: ${completedCount}/${totalCount}`);

              // 如果所有任务都完成了,发送完成通知
              if (completedCount === totalCount) {
                this.logger.log(`🎉 所有跟圈任务已完成!`);
                this.gateway.emitLog(taskGroupId, `🎉 所有跟圈任务已完成!`);
                this.gateway.emitTaskComplete(taskGroupId, true, '所有跟圈任务已完成');
              }
            }
          } catch (error) {
            this.logger.error(`定时任务执行失败: ${jobName}, 错误: ${error.message}`);
            this.gateway.emitLog(taskGroupId, `❌ 定时任务执行失败: ${error.message}`);

            // 更新任务状态为失败
            await this.supabaseService.getClient()
              .from('follow_circle_tasks')
              .update({
                status: 'failed',
                error_message: error.message,
                updated_at: new Date().toISOString(),
              })
              .eq('id', task.id);
          }
        });

        this.scheduledJobs.set(jobName, job);
      }

      this.logger.log(`✅ 所有定时任务已创建`);
    } catch (error) {
      this.logger.error(`创建定时任务失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 发布朋友圈(带重试机制)
   */
  private async publishCircle(task: any): Promise<void> {
    const maxRetries = 3; // 最多重试3次
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(`📤 第${attempt}次尝试发布朋友圈: 自动跟圈${task.circle_index}`);
        if (attempt > 1) {
          this.gateway.emitLog(task.task_group_id, `🔄 第${attempt}次重试发布第${task.circle_index}条朋友圈...`);
        }

        await this.publishCircleInternal(task);

        // 成功则返回
        return;
      } catch (error) {
        lastError = error;
        this.logger.error(`第${attempt}次发布失败: ${error.message}`);

        if (attempt < maxRetries) {
          const waitTime = attempt * 2; // 递增等待时间: 2秒, 4秒, 6秒
          this.logger.log(`⏳ 等待${waitTime}秒后重试...`);
          this.gateway.emitLog(task.task_group_id, `⏳ 等待${waitTime}秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        }
      }
    }

    // 所有重试都失败
    this.logger.error(`❌ 发布朋友圈失败,已重试${maxRetries}次: ${lastError?.message}`);
    this.gateway.emitLog(task.task_group_id, `❌ 第${task.circle_index}条朋友圈发布失败,已重试${maxRetries}次`);
    throw lastError;
  }

  /**
   * 发布朋友圈(内部实现)
   */
  private async publishCircleInternal(task: any): Promise<void> {
    let browser: any = null;
    let localImagePaths: string[] = [];
    const taskGroupId = task.task_group_id;
    const circleIndex = task.circle_index;

    try {
      this.logger.log(`发布朋友圈: 自动跟圈${circleIndex}`);
      this.gateway.emitLog(taskGroupId, `📤 开始发布第${circleIndex}条朋友圈...`);

      // 获取用户的堆雪球账号
      const userId = task.user_id || 1;
      const { DuixueqiuAccountsService } = require('../duixueqiu-accounts/duixueqiu-accounts.service');
      const duixueqiuAccountsService = new DuixueqiuAccountsService(this.supabaseService);
      const account = await duixueqiuAccountsService.getDefaultAccount(userId);

      if (!account) {
        throw new Error('未找到堆雪球账号,请先在"堆雪球账号设置"中添加账号');
      }

      this.logger.log(`使用堆雪球账号: ${account.username}`);

      // 解析图片
      const images = task.images ? JSON.parse(task.images) : [];

      // 1. 下载图片到本地(如果有图片)
      if (images && images.length > 0) {
        this.logger.log(`开始下载 ${images.length} 张图片...`);
        // 这里需要调用PublishService的downloadImages方法
        // 但为了避免循环依赖,我们暂时跳过图片下载
        // TODO: 实现图片下载功能
        this.logger.warn('跟圈功能暂不支持图片,请先使用纯文字测试');
      }

      // 2. 登录堆雪球并发布
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // 登录
      this.logger.log('登录堆雪球...');
      await page.goto('https://dxqscrm.duixueqiu.cn/admin/#/login', { waitUntil: 'networkidle2' });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 填写账号(可能已经自动填充)
      this.logger.log(`📝 填写账号: ${account.username}`);
      const accountInput = await page.$('input[placeholder="账号"]');
      if (accountInput) {
        await accountInput.click({ clickCount: 3 }); // 全选
        await accountInput.type(account.username);
      } else {
        this.logger.error('❌ 未找到账号输入框');
        throw new Error('未找到账号输入框');
      }

      // 填写密码
      this.logger.log('📝 填写密码...');
      const passwordInput = await page.$('input[placeholder="密码"]');
      if (passwordInput) {
        await passwordInput.type(account.password);
      } else {
        this.logger.error('❌ 未找到密码输入框');
        throw new Error('未找到密码输入框');
      }

      // 点击登录按钮
      this.logger.log('🔘 点击登录按钮...');
      const loginClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginButton = buttons.find(btn => btn.textContent?.includes('登录'));
        if (loginButton) {
          (loginButton as HTMLElement).click();
          return true;
        }
        return false;
      });

      if (!loginClicked) {
        this.logger.error('❌ 未找到登录按钮');
        throw new Error('未找到登录按钮');
      }

      // 等待登录完成 - 检查是否跳转到主页面
      this.logger.log('⏳ 等待登录完成...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 验证登录是否成功 - 检查当前URL
      const currentUrl = page.url();
      this.logger.log(`📍 当前URL: ${currentUrl}`);

      if (currentUrl.includes('/login')) {
        // 还在登录页面,说明登录失败
        this.logger.error('❌ 登录失败,仍在登录页面');

        // 截图保存
        await page.screenshot({ path: 'debug_login_failed.png', fullPage: true });
        this.logger.log('📸 已保存登录失败截图: debug_login_failed.png');

        throw new Error('登录失败,请检查账号密码是否正确');
      }

      this.logger.log('✅ 登录成功');

      // 导航到发朋友圈页面
      this.logger.log('导航到定时发朋友圈页面...');
      await page.evaluate(() => {
        const xpath = '//*[contains(text(), "辅助营销")]';
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const menu = result.singleNodeValue as HTMLElement;
        if (menu) menu.click();
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      await page.evaluate(() => {
        const xpath = '//*[contains(text(), "定时发朋友圈")]';
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const menu = result.singleNodeValue as HTMLElement;
        if (menu) menu.click();
      });
      await new Promise(resolve => setTimeout(resolve, 3000)); // 增加到3秒

      // 智能等待页面加载完成 - 等待"发朋友圈"按钮出现
      this.logger.log('等待页面加载完成...');
      try {
        await page.waitForFunction(
          () => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('发朋友圈')) {
                return true;
              }
            }
            return false;
          },
          { timeout: 10000 }
        );
        this.logger.log('✅ 页面加载完成,找到"发朋友圈"按钮');
      } catch (error) {
        this.logger.warn('⚠️ 等待"发朋友圈"按钮超时,尝试继续...');

        // 调试: 输出页面上所有按钮的文本
        const buttonTexts = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          return Array.from(buttons).map(btn => btn.textContent?.trim()).filter(text => text);
        });
        this.logger.log(`📋 页面上的所有按钮: ${JSON.stringify(buttonTexts)}`);
      }

      // 如果需要删除上一条朋友圈,先删除
      if (task.delete_previous && task.previous_title) {
        this.logger.log(`🗑️ 删除上一条朋友圈: ${task.previous_title}`);
        this.gateway.emitLog(taskGroupId, `🗑️ 正在删除上一条朋友圈...`);

        // 🔍 调试: 列出页面上所有任务标题
        const allTitles = await page.evaluate(() => {
          const rows = document.querySelectorAll('tr');
          const titles: string[] = [];
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length > 0) {
              const firstCell = cells[0];
              const text = firstCell.textContent?.trim();
              if (text && text.length > 0 && !text.includes('序号')) {
                titles.push(text);
              }
            }
          }
          return titles;
        });
        this.logger.log(`📋 页面上的所有任务标题: ${JSON.stringify(allTitles)}`);

        // 🔍 智能识别按钮类型: "停止" 或 "删除"
        const buttonResult = await page.evaluate((titleToDelete: string) => {
          const rows = document.querySelectorAll('tr');
          for (const row of rows) {
            const titleCell = row.querySelector('td');
            if (titleCell && titleCell.textContent?.includes(titleToDelete)) {
              const buttons = row.querySelectorAll('button');
              for (const btn of buttons) {
                const text = btn.textContent?.trim();

                // 优先查找"停止"按钮
                if (text && text.includes('停止')) {
                  console.log('⚠️  检测到"停止"按钮,先点击停止');
                  (btn as HTMLElement).click();
                  return { clicked: true, buttonType: 'stop' };
                }

                // 如果没有停止按钮,查找"删除"按钮
                if (text && text.includes('删除')) {
                  console.log('✅ 检测到"删除"按钮,直接点击删除');
                  (btn as HTMLElement).click();
                  return { clicked: true, buttonType: 'delete' };
                }
              }
            }
          }
          return { clicked: false, buttonType: null };
        }, task.previous_title);

        if (!buttonResult.clicked) {
          this.logger.warn(`未找到标题为"${task.previous_title}"的朋友圈或按钮,跳过删除`);
        } else {
          // 🔄 如果点击的是"停止"按钮,需要确认弹窗后再点击"删除"
          if (buttonResult.buttonType === 'stop') {
            this.logger.log('⚠️  已点击"停止"按钮,等待确认弹窗...');

            try {
              // 等待并点击确认弹窗的"确定"按钮
              await new Promise(resolve => setTimeout(resolve, 1000));

              const stopConfirmClicked = await page.evaluate(() => {
                const dialogs = document.querySelectorAll('.el-dialog__wrapper');
                for (const dialog of dialogs) {
                  const footer = dialog.querySelector('.el-dialog__footer');
                  if (footer) {
                    const buttons = footer.querySelectorAll('button');
                    for (const button of buttons) {
                      if (button.textContent?.includes('确定')) {
                        (button as HTMLElement).click();
                        return true;
                      }
                    }
                  }
                }
                return false;
              });

              if (stopConfirmClicked) {
                this.logger.log('✅ 已确认停止,等待按钮变成"删除"...');
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 重新查找并点击"删除"按钮
                this.logger.log('🔄 重新查找"删除"按钮...');
                const deleteClicked = await page.evaluate((titleToDelete: string) => {
                  const rows = document.querySelectorAll('tr');
                  for (const row of rows) {
                    const titleCell = row.querySelector('td');
                    if (titleCell && titleCell.textContent?.includes(titleToDelete)) {
                      const buttons = row.querySelectorAll('button');
                      for (const btn of buttons) {
                        if (btn.textContent?.includes('删除')) {
                          (btn as HTMLElement).click();
                          return true;
                        }
                      }
                    }
                  }
                  return false;
                }, task.previous_title);

                if (!deleteClicked) {
                  this.logger.error('停止后未找到"删除"按钮');
                  this.gateway.emitLog(taskGroupId, `⚠️ 停止后未找到"删除"按钮`);
                } else {
                  this.logger.log('✅ "删除"按钮已点击');
                }
              } else {
                this.logger.warn('未找到停止确认弹窗的"确定"按钮');
              }
            } catch (error) {
              this.logger.warn('处理停止确认弹窗时出错:', error.message);
            }
          } else {
            this.logger.log('✅ "删除"按钮已点击');
          }

          // 等待删除确认对话框
          this.logger.log('等待删除确认对话框...');
          await new Promise(resolve => setTimeout(resolve, 1500));

          // 点击确认删除按钮 (堆雪球的删除确认按钮文字是"是")
          const confirmClicked = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              const text = button.textContent?.trim();
              if (text && (text === '是' || text === '确定' || text === '确认')) {
                (button as HTMLElement).click();
                return true;
              }
            }
            return false;
          });

          if (confirmClicked) {
            this.logger.log('✅ 点击了确认删除按钮');
          } else {
            this.logger.warn('⚠️ 未找到确认删除按钮');
          }

          await new Promise(resolve => setTimeout(resolve, 2000));
          this.logger.log('✅ 删除完成');
          this.gateway.emitLog(taskGroupId, `✅ 上一条朋友圈删除成功`);
        }
      }

      // 点击"发朋友圈"按钮 (添加重试机制)
      this.logger.log('打开发朋友圈对话框...');

      let buttonClicked = false;
      let retries = 3;

      while (retries > 0 && !buttonClicked) {
        await page.waitForSelector('button', { timeout: 5000 });

        buttonClicked = await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const button of buttons) {
            const text = button.textContent?.trim();
            if (text && text.includes('发朋友圈')) {
              (button as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!buttonClicked) {
          this.logger.warn(`⚠️ 未找到"发朋友圈"按钮,剩余重试次数: ${retries - 1}`);
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒后重试
          }
        }
      }

      if (!buttonClicked) {
        throw new Error('未找到"发朋友圈"按钮');
      }

      this.logger.log('等待对话框打开...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 等待对话框出现
      await page.waitForSelector('input[placeholder="输入任务标题"]', { timeout: 10000 });

      // 填写任务标题 (格式: 自动跟圈A001-1)
      const taskTitle = `自动跟圈${task.group_id}-${task.circle_index}`;
      this.logger.log(`填写任务标题: ${taskTitle}`);
      await page.evaluate((title: string) => {
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const placeholder = input.getAttribute('placeholder');
          if (placeholder && placeholder.includes('输入任务标题')) {
            (input as HTMLInputElement).value = title;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, taskTitle);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 选择微小号 (必须步骤)
      this.logger.log('点击选择微小号按钮...');
      const selectButtonClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const button of buttons) {
          const text = button.textContent?.trim();
          if (text && text.includes('选择微小号')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!selectButtonClicked) {
        throw new Error('未找到"选择微小号"按钮');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 点击"全选"按钮
      this.logger.log('点击全选按钮...');
      const selectAllClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button, span, a');
        for (const element of buttons) {
          const text = element.textContent?.trim();
          if (text && (text === '全选' || text.includes('全选'))) {
            (element as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!selectAllClicked) {
        this.logger.warn('未找到"全选"按钮,尝试选择第一个微小号...');
        await page.evaluate(() => {
          const checkboxes = document.querySelectorAll('input[type="checkbox"], input[type="radio"]');
          if (checkboxes.length > 0) {
            (checkboxes[0] as HTMLInputElement).click();
          }
        });
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击确定按钮关闭微小号选择对话框
      this.logger.log('确认选择微小号...');
      const confirmClicked = await page.evaluate(() => {
        const dialogs = document.querySelectorAll('.el-dialog__wrapper');
        for (const dialog of dialogs) {
          const title = dialog.querySelector('.el-dialog__title');
          if (title && title.textContent?.includes('请选择微')) {
            const footer = dialog.querySelector('.el-dialog__footer');
            if (footer) {
              const buttons = footer.querySelectorAll('button');
              for (const button of buttons) {
                const text = button.textContent?.trim();
                if (text === '确 定') {
                  (button as HTMLElement).click();
                  return true;
                }
              }
            }
          }
        }
        return false;
      });

      if (!confirmClicked) {
        throw new Error('点击微小号选择对话框的确定按钮失败');
      }

      this.logger.log('微小号选择成功');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 如果是图文类型,先选择类型为"图片"
      if (task.content_type === 'image' && task.images) {
        this.logger.log(`📸 检测到图文类型,准备上传图片...`);
        this.logger.log(`content_type: ${task.content_type}, images: ${task.images ? '有' : '无'}`);

        this.logger.log('选择类型为"图片"...');
        // 点击类型下拉框
        const dropdownClicked = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input');
          for (const input of inputs) {
            const placeholder = input.getAttribute('placeholder');
            if (placeholder && placeholder.includes('请选择') && (input as HTMLInputElement).value === '文本') {
              (input as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!dropdownClicked) {
          this.logger.warn('未找到类型下拉框,可能已经是图片类型');
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        // 点击"图片"选项
        this.logger.log('点击"图片"选项...');
        const imageOptionClicked = await page.evaluate(() => {
          const items = document.querySelectorAll('li');
          for (const item of items) {
            if (item.textContent?.trim() === '图片') {
              (item as HTMLElement).click();
              return true;
            }
          }
          return false;
        });

        if (!imageOptionClicked) {
          throw new Error('未找到"图片"选项');
        }

        this.logger.log('✅ 已选择"图片"类型');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 上传图片
        this.logger.log('开始解析图片数据...');
        const images = JSON.parse(task.images);
        this.logger.log(`解析成功,共 ${images.length} 张图片`);

        if (images && images.length > 0) {
          this.logger.log(`准备上传 ${images.length} 张图片...`);

          // 下载图片到本地
          const fs = require('fs');
          const path = require('path');

          for (let i = 0; i < images.length; i++) {
            this.logger.log(`处理第 ${i + 1} 张图片...`);
            const imageBase64 = images[i];
            const matches = imageBase64.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
            if (matches) {
              const ext = matches[1] === 'jpg' ? 'jpg' : matches[1];
              const base64Data = matches[2];
              const buffer = Buffer.from(base64Data, 'base64');
              const localPath = path.join(process.cwd(), `temp_image_${Date.now()}_${i}.${ext}`);
              fs.writeFileSync(localPath, buffer);
              localImagePaths.push(localPath);
              this.logger.log(`✅ 图片 ${i + 1} 已保存到: ${localPath}`);
            } else {
              this.logger.warn(`图片 ${i + 1} 格式不正确,跳过`);
            }
          }

          // 上传图片
          this.logger.log(`开始上传 ${localImagePaths.length} 张图片到堆雪球...`);
          const fileInput = await page.$('input[type="file"]');
          if (!fileInput) {
            this.logger.error('未找到文件上传输入框!');
            throw new Error('未找到文件上传输入框');
          }

          this.logger.log('找到文件上传输入框,开始上传...');
          await fileInput.uploadFile(...localImagePaths);
          this.logger.log('文件已选择,等待上传完成...');
          await new Promise(resolve => setTimeout(resolve, 15000)); // 等待上传完成
          this.logger.log('✅ 图片上传完成');
        }
      } else {
        this.logger.log('📝 纯文字类型,跳过图片上传');
      }

      // 填写朋友圈内容
      this.logger.log('填写朋友圈内容...');
      await page.evaluate((content: string) => {
        const textareas = document.querySelectorAll('textarea');
        for (const textarea of textareas) {
          const placeholder = textarea.getAttribute('placeholder');
          if (placeholder && placeholder.includes('请填写朋友圈内容')) {
            (textarea as HTMLTextAreaElement).value = content;
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
            break;
          }
        }
      }, task.content);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 设置为立刻发送
      this.logger.log('设置为立刻发送...');
      await page.evaluate(() => {
        const labels = document.querySelectorAll('label, span');
        for (const label of labels) {
          if (label.textContent?.includes('立刻发送')) {
            const checkbox = label.querySelector('input[type="checkbox"]') ||
                           label.previousElementSibling?.querySelector('input[type="checkbox"]') ||
                           label.nextElementSibling?.querySelector('input[type="checkbox"]');
            if (checkbox) {
              (checkbox as HTMLInputElement).click();
              break;
            }
          }
        }
      });
      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击确定按钮提交
      this.logger.log('点击确定按钮提交...');
      const submitClicked = await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const button of buttons) {
          const text = button.textContent?.trim();
          if (text && text.includes('确定')) {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!submitClicked) {
        throw new Error('未找到确定按钮');
      }

      // 等待对话框关闭
      this.logger.log('等待对话框关闭...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 🔍 验证任务是否真正创建成功
      this.logger.log(`🔍 验证任务"${taskTitle}"是否创建成功...`);
      let taskCreated = false;
      let verifyRetries = 5; // 最多重试5次,每次等待2秒

      while (verifyRetries > 0 && !taskCreated) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        taskCreated = await page.evaluate((title: string) => {
          const rows = document.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length > 0) {
              const firstCell = cells[0];
              if (firstCell.textContent?.includes(title)) {
                return true;
              }
            }
          }
          return false;
        }, taskTitle);

        if (taskCreated) {
          this.logger.log(`✅ 任务"${taskTitle}"已成功创建`);
          break;
        } else {
          verifyRetries--;
          this.logger.log(`⏳ 任务尚未出现在列表中,剩余重试次数: ${verifyRetries}`);
        }
      }

      if (!taskCreated) {
        this.logger.error(`❌ 任务"${taskTitle}"创建失败,任务列表中未找到`);
        this.gateway.emitLog(taskGroupId, `❌ 任务"${taskTitle}"创建失败,准备重试...`);
        await page.screenshot({ path: `debug_task_not_created_${Date.now()}.png`, fullPage: true });

        // 关闭浏览器,准备重试
        await browser.close();
        browser = null;

        // 抛出错误,触发外层重试机制
        throw new Error(`任务"${taskTitle}"创建失败,任务列表中未找到`);
      }

      // 关闭浏览器
      await browser.close();
      browser = null;

      // 更新任务状态
      await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      this.logger.log(`✅ 朋友圈发布成功: 自动跟圈${circleIndex}`);
      this.gateway.emitLog(taskGroupId, `✅ 第${circleIndex}条朋友圈发布成功!`);
    } catch (error) {
      this.logger.error(`发布朋友圈失败: ${error.message}`);
      this.logger.error(`错误堆栈: ${error.stack}`);
      this.gateway.emitLog(taskGroupId, `❌ 第${circleIndex}条朋友圈发布失败: ${error.message}`);

      // 关闭浏览器
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          // 忽略关闭错误
        }
      }

      // 更新任务状态为失败
      await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .update({
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      throw error;
    } finally {
      // 清理临时图片文件
      if (localImagePaths.length > 0) {
        this.logger.log('清理临时图片文件...');
        const fs = require('fs');
        for (const imagePath of localImagePaths) {
          try {
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
              this.logger.log(`已删除临时文件: ${imagePath}`);
            }
          } catch (e) {
            this.logger.warn(`删除临时文件失败: ${imagePath}, ${e.message}`);
          }
        }
      }
    }
  }

  /**
   * 取消跟圈任务组
   */
  async cancelFollowCircleTasks(taskGroupId: string): Promise<void> {
    try {
      this.logger.log(`取消跟圈任务组: ${taskGroupId}`);

      // 取消所有定时任务
      for (const [jobName, job] of this.scheduledJobs.entries()) {
        if (jobName.startsWith(taskGroupId)) {
          job.cancel();
          this.scheduledJobs.delete(jobName);
          this.logger.log(`取消定时任务: ${jobName}`);
        }
      }

      // 更新数据库中的任务状态
      await this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('task_group_id', taskGroupId)
        .eq('status', 'pending');

      this.logger.log(`✅ 跟圈任务组已取消: ${taskGroupId}`);
    } catch (error) {
      this.logger.error(`取消跟圈任务组失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取跟圈任务列表
   */
  async getFollowCircleTasks(taskGroupId?: string): Promise<any[]> {
    try {
      let query = this.supabaseService.getClient()
        .from('follow_circle_tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (taskGroupId) {
        query = query.eq('task_group_id', taskGroupId);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`获取跟圈任务失败: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      this.logger.error(`获取跟圈任务失败: ${error.message}`);
      throw error;
    }
  }
}

