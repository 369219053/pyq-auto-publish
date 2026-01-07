import { Injectable, Logger } from '@nestjs/common';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { SupabaseService } from '../common/supabase.service';
import { AutomationGateway } from './automation.gateway';
import { DuixueqiuFriendsService } from './duixueqiu-friends.service';
import * as puppeteer from 'puppeteer';
import * as crypto from 'crypto';

/**
 * 脚本2: 微信好友触达服务
 * 负责通过堆雪球系统向选中的微信好友发送消息
 */
@Injectable()
export class WechatReachService {
  private readonly logger = new Logger(WechatReachService.name);
  private isRunning = false;
  private isPaused = false;
  private currentTaskId: string = null;

  // 新增: 保存当前任务的浏览器和页面实例
  private currentBrowser: any = null;
  private currentPage: any = null;

  // 新增: 保存当前任务参数,用于继续任务
  private currentTaskParams: any = null;

  // 🆕 表情库:100个常用表情,涵盖6大类
  private readonly EMOJI_POOL = [
    // 笑脸类 (20个)
    '😀', '😃', '😄', '😁', '😆', '😊', '😇', '🙂', '😉', '😌',
    '😍', '🥰', '😘', '😗', '😙', '😚', '🤗', '🤩', '🥳', '😏',
    // 手势类 (15个)
    '👍', '👏', '🙌', '👌', '✌️', '🤝', '🙏', '💪', '👊', '✊',
    '🤞', '🤟', '🤘', '👋', '🤚',
    // 爱心类 (10个)
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💕',
    // 庆祝类 (15个)
    '🎉', '🎊', '🎈', '🎁', '🎀', '🎂', '🍰', '🎆', '✨', '🌟',
    '⭐', '💫', '🔥', '💥', '🎯',
    // 自然类 (15个)
    '🌸', '🌺', '🌻', '🌼', '🌷', '🌹', '🌿', '🍀', '🌈', '☀️',
    '🌤️', '⛅', '🌥️', '☁️', '🌙',
    // 其他常用 (25个)
    '💰', '💎', '🏆', '🎯', '📱', '💻', '📚', '✅', '🔔', '🚀',
    '⚡', '💡', '🎵', '🎶', '🎤', '🎧', '📷', '🎬', '🎨', '🖼️',
    '🌍', '🌎', '🌏', '🗺️', '🧭'
  ];

  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly supabaseService: SupabaseService,
    private readonly gateway: AutomationGateway,
    private readonly duixueqiuFriendsService: DuixueqiuFriendsService,
  ) {}

  /**
   * 检查当前时间是否在禁发时间段内
   * @param forbiddenTimeRanges 禁发时间段数组,格式: [{startTime: "23:00", endTime: "08:00"}]
   */
  private isInForbiddenTime(forbiddenTimeRanges: Array<{startTime: string, endTime: string}>): boolean {
    // 如果没有设置禁发时间段,则全天可发送
    if (!forbiddenTimeRanges || forbiddenTimeRanges.length === 0) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    for (const range of forbiddenTimeRanges) {
      const [startHour, startMinute] = range.startTime.split(':').map(Number);
      const [endHour, endMinute] = range.endTime.split(':').map(Number);

      const startTimeInMinutes = startHour * 60 + startMinute;
      const endTimeInMinutes = endHour * 60 + endMinute;

      // 处理跨天情况 (例如 23:00-08:00)
      if (startTimeInMinutes > endTimeInMinutes) {
        // 跨天:当前时间在开始时间之后,或在结束时间之前
        if (currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes) {
          return true;
        }
      } else {
        // 不跨天:当前时间在开始和结束时间之间
        if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 等待到下一个允许发送的时间
   * @param forbiddenTimeRanges 禁发时间段数组
   */
  private async waitForNextSendingTime(forbiddenTimeRanges: Array<{startTime: string, endTime: string}>): Promise<void> {
    // 如果没有禁发时间段,直接返回
    if (!forbiddenTimeRanges || forbiddenTimeRanges.length === 0) {
      return;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeInMinutes = currentHour * 60 + currentMinute;

    // 找到当前所在的禁发时间段
    let currentForbiddenRange: {startTime: string, endTime: string} | null = null;
    for (const range of forbiddenTimeRanges) {
      const [startHour, startMinute] = range.startTime.split(':').map(Number);
      const [endHour, endMinute] = range.endTime.split(':').map(Number);

      const startTimeInMinutes = startHour * 60 + startMinute;
      const endTimeInMinutes = endHour * 60 + endMinute;

      // 处理跨天情况
      if (startTimeInMinutes > endTimeInMinutes) {
        if (currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes) {
          currentForbiddenRange = range;
          break;
        }
      } else {
        if (currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes) {
          currentForbiddenRange = range;
          break;
        }
      }
    }

    if (!currentForbiddenRange) {
      return;
    }

    // 计算到禁发时间段结束的等待时间
    const [endHour, endMinute] = currentForbiddenRange.endTime.split(':').map(Number);
    const endTime = new Date(now);
    endTime.setHours(endHour, endMinute, 0, 0);

    // 如果结束时间小于当前时间,说明是跨天的,需要加一天
    const [startHour] = currentForbiddenRange.startTime.split(':').map(Number);
    if (endHour < startHour && currentHour >= startHour) {
      endTime.setDate(endTime.getDate() + 1);
    }

    const waitMs = endTime.getTime() - now.getTime();
    const waitHours = Math.floor(waitMs / (1000 * 60 * 60));
    const waitMinutes = Math.floor((waitMs % (1000 * 60 * 60)) / (1000 * 60));

    this.emitLog(`⏰ 当前时间 ${currentHour}:${currentMinute.toString().padStart(2, '0')} 在禁发时间段内(${currentForbiddenRange.startTime}-${currentForbiddenRange.endTime})`);
    this.emitLog(`💤 等待 ${waitHours}小时${waitMinutes}分钟后继续发送...`);

    await new Promise(resolve => setTimeout(resolve, waitMs));
  }

  /**
   * 登录堆雪球系统
   */
  private async loginDuixueqiu(page: puppeteer.Page, username: string, password: string): Promise<void> {
    this.emitLog('🔐 开始登录堆雪球系统...');

    // 访问客服端登录页面 (使用domcontentloaded,避免networkidle2在服务器环境下永远等不到)
    await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', {
      waitUntil: 'domcontentloaded', // 改为domcontentloaded,更快更稳定
      timeout: 60000 // 60秒超时
    });

    // 等待登录表单加载
    await page.waitForSelector('input[placeholder="账号"]', { timeout: 10000 });

    // 输入账号密码
    await page.type('input[placeholder="账号"]', username);
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.type('input[type="password"]', password);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 点击登录按钮
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        if (button.textContent?.includes('登录')) {
          (button as HTMLElement).click();
          break;
        }
      }
    });

    // 等待导航完成 (使用domcontentloaded,避免networkidle2超时)
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });

    this.emitLog('✅ 登录成功');

    // 等待客服端页面加载完成
    this.emitLog('⏳ 等待客服端页面加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  /**
   * 智能等待微信号列表加载完成
   */
  private async waitForWechatAccountsLoaded(page: puppeteer.Page): Promise<void> {
    this.logger.log('⏳ 等待微信号列表加载...');

    try {
      // 先输出当前页面URL,确认页面正确
      const currentUrl = page.url();
      this.logger.log(`📍 当前页面URL: ${currentUrl}`);

      // 1. 等待容器出现
      this.logger.log('🔍 等待.wechat-account-list容器出现...');
      await page.waitForSelector('.wechat-account-list', { timeout: 15000 });
      this.logger.log('✅ 找到微信号列表容器');

      // 2. 智能等待Vue渲染完成 - 等待"客服没有分配粉丝"文本消失
      this.logger.log('⏳ 等待Vue渲染完成...');
      const maxWaitForVue = 60000; // 最多等待60秒
      const startTimeVue = Date.now();
      let vueRendered = false;

      while (!vueRendered && (Date.now() - startTimeVue) < maxWaitForVue) {
        const html = await page.evaluate(() => {
          const container = document.querySelector('.wechat-account-list');
          if (!container) return '';
          return container.innerHTML.substring(0, 100);
        });

        // 检查是否还是"客服没有分配粉丝"
        if (!html.includes('客服没有分配粉丝')) {
          vueRendered = true;
          const elapsed = ((Date.now() - startTimeVue) / 1000).toFixed(1);
          this.logger.log(`✅ Vue已渲染完成! (耗时${elapsed}秒)`);
        } else {
          const elapsed = ((Date.now() - startTimeVue) / 1000).toFixed(1);
          this.logger.log(`⏳ Vue仍在渲染... (已等待${elapsed}秒)`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!vueRendered) {
        this.logger.warn('⚠️ Vue渲染超时,但继续执行...');
      }

      // 3. 再次智能等待:检测列表元素数量是否稳定
      let previousCount = 0;
      let stableCount = 0;
      const maxAttempts = 20; // 增加到20次,最多等待10秒

      for (let i = 0; i < maxAttempts; i++) {
        // 获取当前微信号数量和容器HTML
        const { count, html } = await page.evaluate(() => {
          const container = document.querySelector('.wechat-account-list');
          if (!container) return { count: 0, html: '' };
          const items = container.querySelectorAll('.item');
          return {
            count: items.length,
            html: container.innerHTML.substring(0, 300) // 只取前300字符
          };
        });

        this.logger.log(`📊 第${i + 1}次检测,当前微信号数量: ${count}`);

        // 第一次检测时输出HTML内容
        if (i === 0) {
          this.logger.log(`📄 容器HTML内容(前300字符): ${html}`);
        }

        // 如果数量和上次一样,说明可能已经加载完成
        if (count === previousCount && count > 0) {
          stableCount++;
          this.logger.log(`✅ 数量稳定 (${stableCount}/3)`);
          // 连续3次数量不变,认为加载完成
          if (stableCount >= 3) {
            this.logger.log(`✅ 微信号列表加载完成,共 ${count} 个`);
            return;
          }
        } else {
          stableCount = 0; // 重置稳定计数
          if (count !== previousCount) {
            this.logger.log(`🔄 数量变化: ${previousCount} → ${count}`);
          }
        }

        previousCount = count;

        // 等待500ms后再次检测
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      this.logger.log(`✅ 微信号列表加载完成(达到最大检测次数),最终数量: ${previousCount}`);

    } catch (error) {
      this.logger.error(`❌ 等待微信号列表加载失败: ${error.message}`);
      // 输出页面信息帮助调试
      const currentUrl = page.url();
      const pageTitle = await page.title();
      this.logger.error(`📍 失败时页面URL: ${currentUrl}`);
      this.logger.error(`📄 失败时页面标题: ${pageTitle}`);
      throw error;
    }
  }

  /**
   * 等待好友列表加载完成
   */
  private async waitForFriendsLoaded(page: puppeteer.Page): Promise<void> {
    this.emitLog('⏳ 等待好友列表加载...');

    try {
      // 等待"数据加载中..."消失
      await new Promise(resolve => setTimeout(resolve, 3000));
      this.emitLog('✅ 好友列表加载完成');
    } catch (error) {
      this.logger.warn('等待加载超时，继续执行');
    }
  }

  /**
   * 获取所有微信号列表
   * 从左侧的.wechat-account-list容器中获取所有.item元素
   */
  private async getWechatAccounts(page: puppeteer.Page): Promise<Array<{ name: string; index: number }>> {
    this.emitLog('📱 获取左侧微信号列表...');

    try {
      // 等待微信号列表容器加载 - 使用5分钟超时
      this.emitLog('⏳ 等待微信号列表容器出现 (最多300秒)...');
      await page.waitForSelector('.wechat-account-list', { timeout: 300000 });
      this.emitLog('✅ 微信号列表容器已出现');

      // 等待微信号列表加载出来 - 使用循环等待机制
      const maxWaitTime = 300000; // 300秒(5分钟)
      const startTime = Date.now();
      let listRendered = false;

      this.emitLog('⏳ 开始等待微信号列表加载...');

      while (!listRendered && (Date.now() - startTime) < maxWaitTime) {
        const itemCount = await page.evaluate(() => {
          const items = document.querySelectorAll('.wechat-account-list > .item');
          return items.length;
        });

        // 检查是否有微信号列表项
        if (itemCount > 0) {
          listRendered = true;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          this.emitLog(`✅ 微信号列表加载完成! 找到 ${itemCount} 个微信号 (耗时${elapsed}秒)`);
        } else {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          // 每10秒打印一次日志,避免日志过多
          if (Math.floor(Date.now() - startTime) % 10000 < 2000) {
            this.emitLog(`⏳ 微信号列表仍在加载... (已等待${elapsed}秒)`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!listRendered) {
        this.emitLog('❌ 微信号列表加载超时(300秒),页面可能加载失败!');
        throw new Error('微信号列表加载超时');
      }

      // 额外等待5秒,确保页面完全加载,loading遮罩消失
      this.emitLog('⏳ 额外等待5秒,确保页面完全加载...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      this.emitLog('✅ 页面加载等待完成');

      // 从左侧列表中获取所有微信号
      this.emitLog('🔍 提取微信号列表...');

      const accounts = await page.evaluate(() => {
        const items = document.querySelectorAll('.wechat-account-list > .item');
        const result: Array<{ name: string; index: number }> = [];

        items.forEach((item, index) => {
          const nameDiv = item.querySelector('.name');
          if (nameDiv) {
            const name = nameDiv.textContent?.trim() || '';
            if (name) {
              result.push({ name, index });
            }
          }
        });

        return result;
      });

      this.emitLog(`✅ 找到 ${accounts.length} 个微信号`);

      // 输出所有微信号用于验证
      if (accounts.length > 0) {
        accounts.forEach((account, index) => {
          this.emitLog(`  ${index + 1}. ${account.name}`);
        });
      } else {
        this.emitLog('⚠️ 未找到任何微信号');
      }

      return accounts;

    } catch (error) {
      this.logger.error(`获取微信号列表失败: ${error.message}`);
      this.emitLog(`❌ 获取微信号列表失败: ${error.message}`);
      throw error; // 抛出错误而不是返回空数组
    }
  }

  /**
   * 同步微信号列表（公共方法，供Controller调用）
   * 同步后保存到数据库
   */
  async syncWechatAccounts(userId: string): Promise<{ success: boolean; data?: Array<{ name: string; index: number; friend_count?: number }>; message?: string }> {
    const puppeteer = require('puppeteer');
    let browser = null;
    let page = null;

    try {
      this.logger.log(`开始同步微信号列表: ${userId}`);

      // 获取堆雪球账号
      const { data: accounts, error: accountError } = await this.supabaseService.getClient()
        .from('duixueqiu_accounts')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (accountError || !accounts || accounts.length === 0) {
        return { success: false, message: '未找到堆雪球账号配置，请先在"系统设置 → 堆雪球账号"中添加账号' };
      }

      const account = accounts[0];

      // 启动浏览器 - 通过环境变量PUPPETEER_HEADLESS控制是否显示浏览器
      // 默认为true(无头模式),设置为'false'时显示浏览器
      this.logger.log(`环境变量 PUPPETEER_HEADLESS = ${process.env.PUPPETEER_HEADLESS}`);
      const headless = process.env.PUPPETEER_HEADLESS !== 'false';
      this.logger.log(`计算后的 headless = ${headless}`);

      browser = await puppeteer.launch({
        headless: headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled', // 隐藏自动化特征
        ],
      });
      page = await browser.newPage();

      // 🆕 设置默认超时时间为5分钟,避免服务器网络慢导致超时
      page.setDefaultNavigationTimeout(300000); // 5分钟
      page.setDefaultTimeout(300000); // 5分钟
      this.logger.log('✅ 已设置默认超时时间为300秒(5分钟)');

      // 设置真实的User-Agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      // 隐藏webdriver特征
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });

      await page.setViewport({ width: 1920, height: 1080 });

      // 登录堆雪球
      await this.loginDuixueqiu(page, account.username, account.password);

      // 智能等待微信号列表加载完成
      await this.waitForWechatAccountsLoaded(page);

      // 获取微信号列表
      const wechatAccounts = await this.getWechatAccounts(page);

      this.logger.log(`✅ 成功获取 ${wechatAccounts.length} 个微信号`);

      // 保存微信号列表到数据库
      await this.saveWechatAccountsToDatabase(userId, wechatAccounts);

      // 从数据库读取(包含好友数量)
      const savedAccounts = await this.getWechatAccountsFromDatabase(userId);

      return {
        success: true,
        data: savedAccounts,
        message: `成功同步 ${wechatAccounts.length} 个微信号`
      };

    } catch (error) {
      this.logger.error(`同步微信号列表失败: ${error.message}`, error.stack);
      return {
        success: false,
        message: error.message || '同步失败'
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * 保存微信号列表到数据库
   */
  private async saveWechatAccountsToDatabase(userId: string, accounts: Array<{ name: string; index: number }>): Promise<void> {
    try {
      this.logger.log(`保存 ${accounts.length} 个微信号到数据库...`);

      for (const account of accounts) {
        // 使用upsert (insert or update)
        const { error } = await this.supabaseService.getClient()
          .from('duixueqiu_wechat_accounts')
          .upsert({
            user_id: userId,
            account_index: account.index,
            account_name: account.name,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,account_index'
          });

        if (error) {
          this.logger.error(`保存微信号失败: ${account.name}`, error);
        }
      }

      this.logger.log(`✅ 微信号列表已保存到数据库`);
    } catch (error) {
      this.logger.error(`保存微信号到数据库失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从数据库获取微信号列表
   */
  async getWechatAccountsFromDatabase(userId: string): Promise<Array<{ name: string; index: number; friend_count: number }>> {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('duixueqiu_wechat_accounts')
        .select('account_index, account_name, friend_count')
        .eq('user_id', userId)
        .order('account_index', { ascending: true });

      if (error) {
        this.logger.error(`从数据库获取微信号列表失败: ${error.message}`);
        return [];
      }

      return (data || []).map(item => ({
        index: item.account_index,
        name: item.account_name,
        friend_count: item.friend_count || 0,
      }));
    } catch (error) {
      this.logger.error(`从数据库获取微信号列表失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 切换到指定微信号(使用完整验证机制,确保切换成功)
   */
  private async switchWechatAccount(page: puppeteer.Page, accountName: string): Promise<void> {
    this.emitLog(`🔄 切换到微信号: ${accountName}`);

    try {
      // 先记录点击前的"未分组"数字
      const beforeClickCount = await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent?.trim() || '';
          const match = text.match(/^未分组[（(](\d+)个[）)]$/);
          if (match) {
            return parseInt(match[1], 10);
          }
        }
        return 0;
      });
      this.emitLog(`📊 点击前的未分组好友数: ${beforeClickCount}`);

      // 最多重试3次
      let retryCount = 0;
      const maxRetries = 3;
      let clickSuccess = false;

      while (!clickSuccess && retryCount < maxRetries) {
        if (retryCount > 0) {
          this.emitLog(`🔄 第 ${retryCount + 1} 次尝试点击微信号: ${accountName}`);
        }

        // 🔍 调试:打印所有微信号列表
        const allAccounts = await page.evaluate(() => {
          const items = document.querySelectorAll('.wechat-account-list > .item');
          return Array.from(items).map((item, index) => {
            const nameDiv = item.querySelector('.name');
            const title = item.getAttribute('title');
            const hasSelected = item.classList.contains('selected');
            return {
              index,
              name: nameDiv?.textContent?.trim() || '',
              title: title || '',
              selected: hasSelected
            };
          });
        });
        this.emitLog(`🔍 找到 ${allAccounts.length} 个微信号:`);
        allAccounts.forEach(acc => {
          this.emitLog(`  [${acc.index}] name="${acc.name}", title="${acc.title}", selected=${acc.selected}`);
        });

        // 使用dispatchEvent模拟真实的鼠标点击事件
        const clickResult = await page.evaluate((name) => {
          const items = document.querySelectorAll('.wechat-account-list > .item');
          for (const item of items) {
            const nameDiv = item.querySelector('.name');
            if (nameDiv && nameDiv.textContent?.trim() === name) {
              // 模拟真实的鼠标点击事件
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
              });
              item.dispatchEvent(clickEvent);
              return {
                success: true,
                clickedElement: 'item',
                title: item.getAttribute('title') || ''
              };
            }
          }
          return { success: false, clickedElement: '', title: '' };
        }, accountName);

        if (!clickResult.success) {
          throw new Error(`未找到微信号: ${accountName}`);
        }

        this.emitLog(`✅ 已使用JavaScript点击微信号: ${accountName} (title: ${clickResult.title})`);

        // 点击后等待3秒让页面响应
        this.emitLog(`⏳ 等待3秒让页面响应点击事件...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 验证是否切换成功 - 检查好友数和选中状态
        const afterClickCount = await page.evaluate(() => {
          const allSpans = document.querySelectorAll('span');
          for (const span of allSpans) {
            const text = span.textContent?.trim() || '';
            const match = text.match(/^未分组[（(](\d+)个[）)]$/);
            if (match) {
              return parseInt(match[1], 10);
            }
          }
          return 0;
        });

        // 检查选中的微信号名称
        const selectedAccountName = await page.evaluate(() => {
          const selectedItem = document.querySelector('.wechat-account-list > .item.selected');
          if (selectedItem) {
            const nameDiv = selectedItem.querySelector('.name');
            return nameDiv?.textContent?.trim() || '';
          }
          return '';
        });

        this.emitLog(`📊 点击后的未分组好友数: ${afterClickCount}`);
        this.emitLog(`📊 当前选中的微信号: ${selectedAccountName}`);

        // 验证切换是否成功
        if (selectedAccountName === accountName && afterClickCount !== beforeClickCount) {
          this.emitLog(`✅ 微信号切换成功: ${accountName}`);
          clickSuccess = true;
        } else {
          this.emitLog(`⚠️ 微信号切换可能失败,重试...`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (!clickSuccess) {
        throw new Error(`切换微信号失败: ${accountName}`);
      }

    } catch (error) {
      this.logger.error(`切换微信号失败: ${error.message}`);
      this.emitLog(`❌ 切换微信号失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 点击"未分组"展开好友列表
   */
  private async clickUnfoldGroup(page: puppeteer.Page): Promise<void> {
    this.emitLog('📋 点击未分组展开好友列表...');

    // 先获取所有SPAN文本用于调试
    const allSpanTexts = await page.evaluate(() => {
      const allSpans = document.querySelectorAll('span');
      const texts: string[] = [];
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        if (text.includes('分组') || text.includes('好友')) {
          texts.push(text);
        }
      }
      return texts;
    });
    this.emitLog(`🔍 找到的分组相关文本: ${JSON.stringify(allSpanTexts)}`);

    // 点击"未分组" - 点击SPAN元素（cursor: pointer）
    // 支持中英文括号
    const unfoldClicked = await page.evaluate(() => {
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        // 支持中文括号（）和英文括号()
        if (text.match(/^未分组[（(]\d+个[）)]$/)) {
          (span as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (!unfoldClicked) {
      throw new Error('未找到"未分组"');
    }

    this.emitLog('✅ 已点击未分组');

    // 等待好友列表展开并加载完成
    this.emitLog('⏳ 等待好友列表加载...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 检查好友列表是否展开
    const friendListExpanded = await page.evaluate(() => {
      const allElements = document.querySelectorAll('[title]');
      let hasFriends = false;
      allElements.forEach(el => {
        const title = el.getAttribute('title');
        // 排除标签和按钮，看是否有好友名称
        if (title &&
            title !== '通知' &&
            title !== '账号管理' &&
            title !== '全部好友' &&
            title !== '更多功能' &&
            title !== '最近聊天' &&
            title !== '好友列表' &&
            title !== '新的好友' &&
            title !== '快捷回复' &&
            !title.includes('分组')) {
          hasFriends = true;
        }
      });
      return hasFriends;
    });

    this.emitLog(`📊 好友列表是否展开: ${friendListExpanded}`);

    if (!friendListExpanded) {
      throw new Error('好友列表未展开');
    }
  }

  /**
   * 🆕 为文字添加随机表情
   * @param text 原始文字
   * @returns 添加表情后的文字
   */
  private addRandomEmojis(text: string): string {
    if (!text) return text;

    // 随机选择开头表情(1-2个)
    const startEmojiCount = Math.random() > 0.5 ? 1 : 2;
    const startEmojis = [];
    for (let i = 0; i < startEmojiCount; i++) {
      const randomIndex = Math.floor(Math.random() * this.EMOJI_POOL.length);
      startEmojis.push(this.EMOJI_POOL[randomIndex]);
    }

    // 随机选择结尾表情(1-2个)
    const endEmojiCount = Math.random() > 0.5 ? 1 : 2;
    const endEmojis = [];
    for (let i = 0; i < endEmojiCount; i++) {
      const randomIndex = Math.floor(Math.random() * this.EMOJI_POOL.length);
      endEmojis.push(this.EMOJI_POOL[randomIndex]);
    }

    return `${startEmojis.join('')} ${text} ${endEmojis.join('')}`;
  }

  /**
   * 🆕 提取核心文案(去除首尾的表情符号)
   * 用于防重复检测时,只比对核心内容,忽略表情差异
   * @param text 带表情的文字
   * @returns 去除表情后的核心文案
   */
  private extractCoreText(text: string): string {
    if (!text) return '';

    let coreText = text.trim();

    // 去除开头的表情符号和空白
    // Unicode表情范围:U+1F600-U+1F64F, U+1F300-U+1F5FF, U+1F680-U+1F6FF, U+2600-U+26FF等
    coreText = coreText.replace(/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}\s]+/gu, '');

    // 去除结尾的表情符号和空白
    coreText = coreText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}\s]+$/gu, '');

    return coreText.trim();
  }

  /**
   * 计算消息内容的哈希值
   * 用于快速比对是否已发送过相同消息
   * 🆕 对于文字消息,只对核心文案(去除表情)计算哈希值
   */
  private calculateMessageHash(messageType: string, messageContent: any): string {
    let contentString = '';

    switch (messageType) {
      case 'text':
        // 🆕 提取核心文案,去除首尾表情后再计算哈希值
        const originalText = messageContent.text || '';
        const coreText = this.extractCoreText(originalText);
        contentString = coreText;
        this.logger.debug(`原文案: ${originalText}`);
        this.logger.debug(`核心文案: ${coreText}`);
        break;
      case 'video':
        contentString = `video_${messageContent.materialId}_${messageContent.additionalMessage || ''}`;
        break;
      case 'link':
        contentString = `link_${messageContent.materialId}_${messageContent.additionalMessage || ''}`;
        break;
      case 'image':
        // 🆕 图片类型:对imageUrls数组排序后再计算hash,确保顺序一致
        const imageUrls = messageContent.imageUrls || [];
        contentString = `image_${imageUrls.sort().join(',')}`;
        break;
      case 'combined':
        contentString = JSON.stringify(messageContent.contents || []);
        break;
      default:
        contentString = JSON.stringify(messageContent);
    }

    return crypto.createHash('sha256').update(contentString).digest('hex');
  }

  /**
   * 检查是否已经给该好友发送过相同的消息
   * @returns true表示已发送过,false表示未发送过
   */
  private async checkMessageSent(
    userId: string,
    friendId: number | string,
    messageType: string,
    messageContent: any
  ): Promise<boolean> {
    try {
      const contentHash = this.calculateMessageHash(messageType, messageContent);

      // 确保friendId是数字类型(数据库中是BIGINT)
      const friendIdNum = typeof friendId === 'string' ? parseInt(friendId) : friendId;

      const { data, error } = await this.supabaseService.getClient()
        .from('message_send_history')
        .select('id')
        .eq('user_id', userId)
        .eq('friend_id', friendIdNum)
        .eq('message_content_hash', contentHash)
        .limit(1);

      if (error) {
        this.logger.error(`检查消息发送历史失败: ${error.message}`);
        return false; // 出错时默认未发送,继续发送
      }

      const result = data && data.length > 0;
      if (result) {
        this.logger.log(`✅ 检测到重复消息: friendId=${friendIdNum}, hash=${contentHash}`);
      }
      return result;
    } catch (error) {
      this.logger.error(`检查消息发送历史异常: ${error.message}`);
      return false;
    }
  }

  /**
   * 记录消息发送历史
   */
  private async recordMessageSent(
    userId: string,
    friendId: number | string,
    friendName: string,
    messageType: string,
    messageContent: any,
    taskId?: string
  ): Promise<void> {
    try {
      const contentHash = this.calculateMessageHash(messageType, messageContent);

      // 确保friendId是数字类型(数据库中是BIGINT)
      const friendIdNum = typeof friendId === 'string' ? parseInt(friendId) : friendId;

      const { error } = await this.supabaseService.getClient()
        .from('message_send_history')
        .insert({
          user_id: userId,
          friend_id: friendIdNum,
          friend_name: friendName,
          message_type: messageType,
          message_content_hash: contentHash,
          message_content: messageContent,
          task_id: taskId,
          sent_at: new Date().toISOString()
        });

      if (error) {
        this.logger.error(`记录消息发送历史失败: ${error.message}`);
      } else {
        this.logger.log(`✅ 记录发送历史成功: friendId=${friendIdNum}, hash=${contentHash}`);
      }
    } catch (error) {
      this.logger.error(`记录消息发送历史异常: ${error.message}`);
    }
  }

  /**
   * 通过搜索框查找并点击指定好友(新方法 - 更快更准确)
   * 同时匹配好友名称和头像URL,确保100%准确
   */
  private async searchAndClickFriend(
    page: puppeteer.Page,
    friendName: string,
    userId?: string
  ): Promise<boolean> {
    this.emitLog(`🔍 搜索好友: ${friendName}...`);

    try {
      // 0. 从数据库获取好友的头像URL
      let avatarUrl: string | null = null;
      if (userId) {
        const { data: friendData } = await this.supabaseService.getClient()
          .from('duixueqiu_friends')
          .select('avatar_url')
          .eq('user_id', userId)
          .eq('friend_name', friendName)
          .limit(1)
          .single();

        if (friendData && friendData.avatar_url) {
          avatarUrl = friendData.avatar_url;
          this.emitLog(`🖼️ 获取到好友头像URL: ${avatarUrl.substring(0, 50)}...`);
        }
      }
      // 0. 先点击"好友列表"标签,确保在正确的列表中搜索
      this.emitLog(`📋 点击"好友列表"标签...`);
      const friendListClicked = await page.evaluate(() => {
        const friendListTab = document.querySelector('div[title="好友列表"].friend') as HTMLElement;
        if (friendListTab) {
          friendListTab.click();
          return true;
        }
        return false;
      });

      if (friendListClicked) {
        this.emitLog(`✅ 已点击"好友列表"标签`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        this.emitLog(`⚠️ 未找到"好友列表"标签,继续搜索...`);
      }

      // 1. 清空搜索框
      await page.evaluate(() => {
        const searchInput = document.querySelector('input[placeholder="昵称/备注/标签"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.value = '';
          // 触发input事件,清空搜索结果
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      await new Promise(resolve => setTimeout(resolve, 300));

      // 2. 输入好友昵称(智能提取搜索关键词)
      const searchInput = await page.$('input[placeholder="昵称/备注/标签"]');
      if (!searchInput) {
        this.emitLog(`❌ 未找到搜索框`);
        return false;
      }

      // 智能提取搜索关键词:
      // 堆雪球搜索规则: 只支持单个连续的中文/数字关键词,不支持多个关键词组合
      // 策略:
      // 1. 如果有括号,优先使用括号外的内容(括号内通常是备注)
      // 2. 否则按标点符号分割,提取第一个片段(通常是主要名称)
      // 示例: "小灵(沪港纪老板)" → ["小灵", "沪港纪老板"] → 选择"小灵"(括号外)
      // 示例: "微博-杨女士-购房" → ["微博", "杨女士", "购房"] → 选择"微博"(第一个)

      // 按所有非中文、非数字字符分割
      const segments = friendName.split(/[^\u4e00-\u9fa50-9]+/).filter(s => s.length > 0);

      // 选择搜索关键词
      let searchKeyword = '';
      if (segments.length > 0) {
        // 优先使用第一个片段(通常是主要名称,括号外的内容)
        searchKeyword = segments[0];
      } else {
        // 如果没有片段,使用原始名称
        searchKeyword = friendName;
      }

      this.emitLog(`🔧 原始名称: ${friendName}`);
      this.emitLog(`🔧 分割片段: [${segments.join(', ')}]`);
      this.emitLog(`🔧 搜索关键词(第一个片段): ${searchKeyword}`);

      await searchInput.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      await searchInput.type(searchKeyword);
      this.emitLog(`⌨️ 已输入搜索关键词: ${searchKeyword}`);

      // 3. 等待搜索结果
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. 等待搜索结果加载
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 5. 点击搜索结果中的好友(同时匹配名称和头像URL,排除群聊)
      const clicked = await page.evaluate((name, expectedAvatarUrl) => {
        // 🆕 找到"好友"分隔符
        const friendHeader = document.querySelector('.recent-and-friend-panel-concat-item__search-title');

        // 获取所有搜索结果元素
        const allElements = Array.from(document.querySelectorAll('.recent-and-friend-panel-concat-item__friend'));

        // 🐛 调试: 打印所有元素的文本内容
        const allElementsTexts = allElements.map(el => el.textContent?.trim() || '');
        console.log('🐛 所有搜索结果元素:', allElementsTexts);
        console.log('🐛 "好友"分隔符是否存在:', !!friendHeader);
        console.log('🐛 "好友"分隔符文本:', friendHeader?.textContent?.trim());

        // 🆕 过滤出好友元素(只保留"好友"分隔符之后的元素,排除之前的群聊)
        const allFriendElements = allElements.filter(el => {
          if (!friendHeader) {
            // 如果没有找到"好友"分隔符,说明没有群聊,所有元素都是好友
            console.log('🐛 没有找到"好友"分隔符,所有元素都视为好友');
            return true;
          }

          // 比较元素在DOM中的位置
          const position = el.compareDocumentPosition(friendHeader);
          const isPreceding = (position & Node.DOCUMENT_POSITION_PRECEDING) !== 0;

          // 🐛 调试每个元素的位置关系
          const elText = el.textContent?.trim() || '';
          console.log(`🐛 元素"${elText}": position=${position}, isPreceding=${isPreceding}`);

          // DOCUMENT_POSITION_PRECEDING = 2 表示friendHeader在el之前
          // 如果friendHeader在el之前,说明el在"好友"分隔符之后,是好友
          return isPreceding;
        });

        const allTexts = allFriendElements.map(el => el.textContent?.trim() || '');
        console.log('🐛 过滤后的好友元素:', allTexts);

        const debugInfo = {
          totalElements: allElements.length,
          friendElements: allFriendElements.length,
          groupElements: allElements.length - allFriendElements.length,
          hasFriendHeader: !!friendHeader
        };

        // 如果有头像URL,优先使用头像URL匹配
        if (expectedAvatarUrl) {
          for (const el of allFriendElements) {
            const text = el.textContent?.trim() || '';
            const imgElement = el.querySelector('img');
            const actualAvatarUrl = imgElement?.getAttribute('src') || '';

            // 同时匹配名称和头像URL
            if (text === name && actualAvatarUrl === expectedAvatarUrl) {
              (el as HTMLElement).click();
              return {
                success: true,
                clickedText: text,
                matchType: 'exact-with-avatar',
                debug: `精确匹配成功(名称+头像),总元素${debugInfo.totalElements}个(好友${debugInfo.friendElements}个,群聊${debugInfo.groupElements}个)`
              };
            }
          }
        }

        // 如果没有头像URL或头像匹配失败,尝试精确匹配名称
        for (const el of allFriendElements) {
          const text = el.textContent?.trim() || '';

          // 精确匹配好友昵称
          if (text === name) {
            (el as HTMLElement).click();
            return {
              success: true,
              clickedText: text,
              matchType: 'exact-name-only',
              debug: `精确匹配成功(仅名称),总元素${debugInfo.totalElements}个(好友${debugInfo.friendElements}个,群聊${debugInfo.groupElements}个),好友列表: [${allTexts.join(', ')}]`
            };
          }
        }

        // 如果精确匹配失败,再尝试模糊匹配
        for (const el of allFriendElements) {
          const text = el.textContent?.trim() || '';

          // 模糊匹配
          if (text.includes(name)) {
            (el as HTMLElement).click();
            return {
              success: true,
              clickedText: text,
              matchType: 'fuzzy',
              debug: `模糊匹配成功,总元素${debugInfo.totalElements}个(好友${debugInfo.friendElements}个,群聊${debugInfo.groupElements}个),好友列表: [${allTexts.join(', ')}]`
            };
          }
        }

        return {
          success: false,
          clickedText: '',
          matchType: 'not-found',
          debug: `未找到匹配的好友,总元素${debugInfo.totalElements}个(好友${debugInfo.friendElements}个,群聊${debugInfo.groupElements}个),好友列表: [${allTexts.join(', ')}]`
        };
      }, friendName, avatarUrl);

      if (clicked.success) {
        this.emitLog(`✅ 找到并点击好友: ${clicked.clickedText}`);
        this.emitLog(`🐛 调试信息: ${clicked.debug}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      } else {
        this.emitLog(`❌ 未找到好友: ${friendName}`);
        this.emitLog(`🐛 调试信息: ${clicked.debug}`);
        this.emitLog(`🐛 匹配类型: ${clicked.matchType}`);
        return false;
      }
    } catch (error) {
      this.emitLog(`❌ 搜索好友失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 通过滚动查找并点击指定好友(旧方法 - 保留作为备用)
   */
  private async findAndClickFriend(page: puppeteer.Page, friendName: string): Promise<boolean> {
    this.emitLog(`📱 滚动查找好友: ${friendName}...`);

    // 滚动查找好友
    let friendFound = false;
    let scrollAttempts = 0;
    const maxScrollAttempts = 200; // 增加最大滚动次数到200次

    while (!friendFound && scrollAttempts < maxScrollAttempts) {
      // 查找当前可见区域的好友
      const searchResult = await page.evaluate((targetFriendName) => {
        const allDivs = document.querySelectorAll('div');
        const visibleFriends: string[] = [];
        const seenFriends = new Set<string>();

        for (const div of allDivs) {
          const text = div.textContent?.trim() || '';

          // 收集可能是好友的元素 - 过滤掉"加载中"等无效文本
          const hasImg = !!div.querySelector('img');
          if (hasImg && text.length > 0 && text.length < 30 &&
              !text.includes('分组') && !text.includes('新的好友') &&
              !text.includes('加载中') && !text.includes('暂无相关数据') &&
              !text.includes('确定') && !text.includes('取消') &&
              !seenFriends.has(text)) {
            visibleFriends.push(text);
            seenFriends.add(text);
          }

          // 查找目标好友
          if (text === targetFriendName) {
            // 向上查找包含class "recent-and-friend-panel-concat-item__friend" 的元素
            let targetElement: HTMLElement | null = div as HTMLElement;
            let maxDepth = 10;

            while (targetElement && maxDepth > 0) {
              if (targetElement.className &&
                  targetElement.className.includes('recent-and-friend-panel-concat-item__friend')) {
                targetElement.click();
                return {
                  found: true,
                  clickedText: text,
                  visibleFriends: []
                };
              }
              targetElement = targetElement.parentElement;
              maxDepth--;
            }

            // 如果向上没找到，尝试查找vue-recycle-scroller__item-view
            let itemViewElement: HTMLElement | null = div as HTMLElement;
            while (itemViewElement) {
              if (itemViewElement.className &&
                  itemViewElement.className.includes('vue-recycle-scroller__item-view')) {
                const friendElement = itemViewElement.querySelector('.recent-and-friend-panel-concat-item__friend');
                if (friendElement) {
                  (friendElement as HTMLElement).click();
                  return {
                    found: true,
                    clickedText: text,
                    visibleFriends: []
                  };
                }
                break;
              }
              itemViewElement = itemViewElement.parentElement;
            }

            // 如果还是没找到，直接点击当前元素
            (div as HTMLElement).click();
            return {
              found: true,
              clickedText: text,
              visibleFriends: []
            };
          }
        }

        return { found: false, clickedText: '', visibleFriends: visibleFriends.slice(0, 5) };
      }, friendName);

      friendFound = searchResult.found;

      if (searchResult.visibleFriends.length > 0 && scrollAttempts % 10 === 0) {
        this.emitLog(`👥 当前可见好友: ${JSON.stringify(searchResult.visibleFriends)}`);
      }

      if (friendFound) {
        this.emitLog(`✅ 找到并点击好友: ${friendName}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      }

      // 滚动到下一页 - 增加滚动距离到300px
      await page.evaluate(() => {
        const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
        if (scrollableElements.length > 0) {
          scrollableElements[0].scrollBy(0, 300);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500)); // 增加等待时间到500ms
      scrollAttempts++;
    }

    if (!friendFound) {
      this.emitLog(`❌ 未找到好友: ${friendName}`);
      return false;
    }

    return true;
  }

  /**
   * 获取当前显示的好友列表(通过滚动收集所有好友名称)
   */
  private async getFriendsList(page: puppeteer.Page): Promise<Array<{ name: string; remark: string }>> {
    this.emitLog('📋 获取好友列表...');

    const allFriends = new Set<string>();
    let scrollAttempts = 0;
    const maxScrollAttempts = 100;
    let previousCount = 0;
    let stableCount = 0;

    while (scrollAttempts < maxScrollAttempts && stableCount < 5) {
      // 收集当前可见的好友
      const visibleFriends = await page.evaluate(() => {
        const allDivs = document.querySelectorAll('div');
        const friends: string[] = [];
        const seenFriends = new Set<string>();

        for (const div of allDivs) {
          const text = div.textContent?.trim() || '';
          const hasImg = !!div.querySelector('img');

          if (hasImg && text.length > 0 && text.length < 30 &&
              !text.includes('分组') && !text.includes('新的好友') &&
              !seenFriends.has(text)) {
            friends.push(text);
            seenFriends.add(text);
          }
        }

        return friends;
      });

      // 添加到总列表
      visibleFriends.forEach(name => allFriends.add(name));

      // 检查是否稳定
      if (allFriends.size === previousCount) {
        stableCount++;
      } else {
        stableCount = 0;
        previousCount = allFriends.size;
      }

      // 滚动
      await page.evaluate(() => {
        const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
        if (scrollableElements.length > 0) {
          scrollableElements[0].scrollBy(0, 100);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 200));
      scrollAttempts++;

      if (scrollAttempts % 20 === 0) {
        this.emitLog(`📊 已收集 ${allFriends.size} 个好友...`);
      }
    }

    const friends = Array.from(allFriends).map(name => ({ name, remark: '' }));
    this.emitLog(`✅ 获取到 ${friends.length} 个好友`);
    return friends;
  }

  /**
   * 滚动加载所有好友(已废弃,使用getFriendsList代替)
   */
  private async scrollToLoadAllFriends(page: puppeteer.Page): Promise<void> {
    // 此方法已废弃,不再使用
  }

  /**
   * 发送消息给指定好友
   */
  private async sendMessageToFriend(
    page: puppeteer.Page,
    friendName: string,
    message: string
  ): Promise<boolean> {
    try {
      // 滚动查找并点击好友打开聊天窗口
      const friendFound = await this.findAndClickFriend(page, friendName);
      if (!friendFound) {
        throw new Error(`未找到好友: ${friendName}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 替换{昵称}变量
      const finalMessage = message.replace(/\{昵称\}/g, friendName);

      // 输入消息
      await page.type('#editArea', finalMessage);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击发送按钮
      await page.click('.send-btn');
      await new Promise(resolve => setTimeout(resolve, 500));

      return true;
    } catch (error) {
      this.logger.error(`发送消息给 ${friendName} 失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 直接发送消息(不打开聊天窗口,假设已经打开)
   */
  private async sendMessageToFriendDirect(
    page: puppeteer.Page,
    friendName: string,
    message: string
  ): Promise<boolean> {
    try {
      // 替换{昵称}变量
      let finalMessage = message.replace(/\{昵称\}/g, friendName);

      // 🆕 为文字消息添加随机表情
      finalMessage = this.addRandomEmojis(finalMessage);
      this.logger.debug(`添加表情后的消息: ${finalMessage}`);

      // 等待输入框出现
      await page.waitForSelector('#editArea', { timeout: 10000 });

      // #editArea是一个textarea元素,需要使用value属性
      // 直接设置value并触发input事件,不会触发keydown/keypress事件
      await page.evaluate((text) => {
        const editArea = document.querySelector('#editArea') as HTMLTextAreaElement;
        if (editArea) {
          // 直接设置value属性
          editArea.value = text;

          // 触发input事件,让Vue知道内容已改变
          const inputEvent = new Event('input', { bubbles: true });
          editArea.dispatchEvent(inputEvent);

          // 触发change事件
          const changeEvent = new Event('change', { bubbles: true });
          editArea.dispatchEvent(changeEvent);
        }
      }, finalMessage);

      // ✅ 智能等待: 等待发送按钮可点击(最多2秒)
      await page.waitForSelector('.send-btn:not([disabled])', { timeout: 2000 }).catch(() => {
        this.emitLog(`⚠️ 发送按钮未在2秒内可点击,继续执行`);
      });

      // 点击发送按钮
      await page.click('.send-btn');

      // ✅ 智能等待: 等待消息出现在聊天记录中(检测输入框是否已清空)
      await page.waitForFunction(() => {
        const editArea = document.querySelector('#editArea') as HTMLTextAreaElement;
        return !editArea || editArea.value === '';
      }, { timeout: 2000 }).catch(() => {
        this.emitLog(`⚠️ 消息未在2秒内发送成功,继续执行`);
      });

      this.emitLog(`✅ 文字消息已发送`);
      return true;
    } catch (error) {
      this.logger.error(`直接发送消息失败: ${error.message}`);
      this.emitLog(`❌ 文字消息发送失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 计算发送间隔
   */
  private calculateInterval(totalFriends: number, wechatCount: number, targetDays: number): {
    baseInterval: number;
    actualInterval: number;
    dailySend: number;
  } {
    const dailySeconds = 14 * 3600; // 每天14小时(8:00-22:00)
    const totalSeconds = targetDays * dailySeconds;
    const baseInterval = Math.max(totalSeconds / totalFriends, 3); // 最小3秒
    const actualInterval = baseInterval * wechatCount; // 每个微信号的实际间隔
    const dailySend = Math.floor(dailySeconds / baseInterval);
    
    return { baseInterval, actualInterval, dailySend };
  }

  /**
   * 发送日志到前端
   */
  private emitLog(message: string): void {
    this.logger.log(message);
    if (this.currentTaskId) {
      this.gateway.emitScript2Log(this.currentTaskId, message);
    }
  }

  /**
   * 发送进度到前端
   */
  private emitProgress(data: any): void {
    if (this.currentTaskId) {
      this.gateway.emitProgress(this.currentTaskId, data);
    }
  }

  /**
   * 主执行函数：开始微信好友触达任务
   */
  async startWechatReachTask(
    message: string,
    targetDays: number,
    userId: string,
    taskId: string,
    forbiddenTimeRanges?: Array<{startTime: string, endTime: string}>
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('已有任务正在运行中');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.currentTaskId = taskId;

    let browser: puppeteer.Browser = null;
    let page: puppeteer.Page = null;

    try {
      this.emitLog('🚀 开始微信好友触达任务');
      this.emitLog(`📝 消息内容: ${message}`);
      this.emitLog(`⏰ 目标完成时间: ${targetDays}天`);

      // 启动浏览器
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // 登录堆雪球
      // TODO: 从数据库获取堆雪球账号密码
      await this.loginDuixueqiu(page, 'lifangde001', 'Lfd666888#');

      // 等待好友列表加载
      await this.waitForFriendsLoaded(page);

      // 获取所有微信号
      const wechatAccounts = await this.getWechatAccounts(page);

      // 点击"未分组"展开好友列表
      await this.clickUnfoldGroup(page);

      // 获取所有好友列表
      const allFriends = await this.getFriendsList(page);
      const totalFriends = allFriends.length;

      // 计算发送策略
      const { baseInterval, actualInterval, dailySend } = this.calculateInterval(
        totalFriends,
        wechatAccounts.length,
        targetDays
      );

      this.emitLog(`📊 发送策略:`);
      this.emitLog(`- 总好友数: ${totalFriends}`);
      this.emitLog(`- 微信号数量: ${wechatAccounts.length}`);
      this.emitLog(`- 基础间隔: ${baseInterval.toFixed(2)}秒`);
      this.emitLog(`- 每个微信号实际间隔: ${actualInterval.toFixed(2)}秒`);
      this.emitLog(`- 每天发送: ${dailySend}人`);

      // 开始轮询发送
      let sentCount = 0;
      const maxFriendsPerAccount = Math.ceil(totalFriends / wechatAccounts.length);

      for (let round = 0; round < maxFriendsPerAccount && this.isRunning; round++) {
        for (const account of wechatAccounts) {
          if (!this.isRunning) break;

          // 🆕 检查是否暂停
          if (this.isPaused) {
            this.emitLog('⏸️ 任务已暂停,退出发送流程');
            return; // 直接退出方法,保留currentTaskParams
          }

          // 检查是否在禁发时间段内
          if (this.isInForbiddenTime(forbiddenTimeRanges || [])) {
            await this.waitForNextSendingTime(forbiddenTimeRanges || []);
          }

          const friendIndex = round * wechatAccounts.length + account.index;
          if (friendIndex >= totalFriends) continue;

          const friend = allFriends[friendIndex];

          // 切换微信号
          await this.switchWechatAccount(page, account.name);

          // 发送消息
          const success = await this.sendMessageToFriend(page, friend.name, message);
          
          if (success) {
            sentCount++;
            this.emitLog(`✅ [${account.name}] 已发送给 ${friend.name} (${sentCount}/${totalFriends})`);
            
            // 发送进度
            this.emitProgress({
              sentCount,
              totalFriends,
              currentFriend: friend.name,
              currentWechat: account.name,
              progress: Math.floor((sentCount / totalFriends) * 100)
            });
          } else {
            this.emitLog(`❌ [${account.name}] 发送给 ${friend.name} 失败`);
          }

          // 随机等待
          const delay = baseInterval * (0.8 + Math.random() * 0.4);
          this.emitLog(`⏳ 等待 ${delay.toFixed(2)} 秒...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }

      this.emitLog(`🎉 所有消息发送完成! 共发送 ${sentCount} 条消息`);

    } catch (error) {
      this.logger.error(`微信好友触达任务失败: ${error.message}`, error.stack);
      this.emitLog(`❌ 任务失败: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
      this.isRunning = false;
      this.currentTaskId = null;
    }
  }

  /**
   * 暂停任务 (升级版: 关闭浏览器释放账号)
   */
  async pauseTask(): Promise<void> {
    this.isPaused = true;
    this.emitLog('⏸️ 任务暂停中...');

    // 关闭浏览器,释放堆雪球账号
    try {
      if (this.currentPage) {
        await this.currentPage.close();
        this.currentPage = null;
        this.emitLog('✅ 已关闭页面');
      }
      if (this.currentBrowser) {
        await this.currentBrowser.close();
        this.currentBrowser = null;
        this.emitLog('✅ 已关闭浏览器,堆雪球账号已释放');
      }
    } catch (error) {
      this.emitLog(`⚠️ 关闭浏览器时出错: ${error.message}`);
    }

    this.emitLog('⏸️ 任务已暂停,您现在可以在其他地方登录堆雪球');
    this.emitLog('💡 点击"继续"按钮可重新登录并继续发送剩余好友');
  }

  /**
   * 恢复任务 (升级版: 重新调用发送方法,从断点继续)
   */
  async resumeTask(): Promise<void> {
    if (!this.isPaused) {
      this.emitLog('⚠️ 任务未暂停,无需恢复');
      return;
    }

    if (!this.currentTaskParams) {
      this.emitLog('❌ 无法恢复任务: 未找到任务参数');
      this.emitLog('💡 请重新发起发送任务,系统会自动跳过已发送的好友');
      return;
    }

    this.emitLog('▶️ 恢复任务中...');
    this.emitLog(`📋 任务类型: ${this.currentTaskParams.taskType || 'private'}`);

    // 🐛 调试:打印任务参数
    this.emitLog(`🐛 任务参数: ${JSON.stringify(this.currentTaskParams)}`);

    // 🆕 取消暂停状态,并重置isRunning标志(允许重新启动任务)
    this.isPaused = false;
    this.isRunning = false;

    this.emitLog('✅ 任务已恢复,正在重新登录堆雪球并继续发送...');

    // 🆕 根据任务类型调用不同的方法
    try {
      if (this.currentTaskParams.taskType === 'combined') {
        // 组合消息任务
        this.emitLog(`🐛 准备调用startCombinedReachTask`);
        const { contents, targetDays, userId, taskId, forbiddenTimeRanges, selectedWechatAccountIndexes, selectedFriendIds } = this.currentTaskParams;
        this.emitLog(`🐛 userId=${userId}`);
        this.startCombinedReachTask(
          contents,
          targetDays,
          userId,
          taskId,
          forbiddenTimeRanges,
          selectedWechatAccountIndexes,
          selectedFriendIds
        ).catch(error => {
          this.logger.error('恢复组合消息任务失败:', error);
          this.emitLog(`❌ 恢复任务失败: ${error.message}`);
        });
      } else {
        // 私聊消息任务
        this.sendPrivateMessages(this.currentTaskParams).catch(error => {
          this.logger.error('恢复私聊消息任务失败:', error);
          this.emitLog(`❌ 恢复任务失败: ${error.message}`);
        });
      }
    } catch (error) {
      this.logger.error('恢复任务失败:', error);
      this.emitLog(`❌ 恢复任务失败: ${error.message}`);
    }
  }

  /**
   * 停止任务
   */
  async stopTask(): Promise<void> {
    this.isRunning = false;
    this.isPaused = false;
    this.emitLog('⏹️ 任务停止中...');

    // 关闭浏览器
    try {
      if (this.currentPage) {
        await this.currentPage.close();
        this.currentPage = null;
      }
      if (this.currentBrowser) {
        await this.currentBrowser.close();
        this.currentBrowser = null;
      }
    } catch (error) {
      this.emitLog(`⚠️ 关闭浏览器时出错: ${error.message}`);
    }

    // 清空任务参数
    this.currentTaskParams = null;

    this.emitLog('⏹️ 任务已停止');
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(): { isRunning: boolean; isPaused: boolean; hasTaskParams: boolean } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      hasTaskParams: !!this.currentTaskParams
    };
  }

  /**
   * 发送视频号素材给好友
   */
  private async sendVideoMaterialToFriend(
    page: puppeteer.Page,
    friendName: string,
    materialId: number,
    userId?: string,
    additionalMessage?: string
  ): Promise<boolean> {
    try {
      this.emitLog(`📹 开始发送视频号给: ${friendName}`);

      // 1. 搜索并点击好友打开聊天窗口(使用搜索方式,更快)
      const friendFound = await this.searchAndClickFriend(page, friendName, userId);
      if (!friendFound) {
        throw new Error(`未找到好友: ${friendName}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. 点击"素材"按钮
      await page.click('[title="素材"]');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. 点击"视频号素材" - 使用鼠标模拟点击
      this.emitLog('📹 点击"视频号素材"选项...');

      // 等待素材菜单完全展开
      this.emitLog('⏳ 等待素材菜单展开...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取"视频号素材"元素的屏幕坐标
      const videoMaterialPosition = await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          if (span.textContent && span.textContent.trim() === '视频号素材') {
            const rect = span.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              text: span.textContent.trim(),
            };
          }
        }
        return { found: false, x: 0, y: 0, text: '' };
      });

      if (!videoMaterialPosition.found) {
        throw new Error('未找到"视频号素材"菜单项');
      }

      this.emitLog(`✅ 找到"视频号素材"元素，位置: (${videoMaterialPosition.x}, ${videoMaterialPosition.y})`);

      // 移动鼠标到元素位置
      await page.mouse.move(videoMaterialPosition.x, videoMaterialPosition.y);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击
      await page.mouse.click(videoMaterialPosition.x, videoMaterialPosition.y);

      this.emitLog('✅ 已点击"视频号素材"选项（模拟鼠标点击）');

      // 等待素材库对话框打开
      this.emitLog('⏳ 等待素材库对话框打开...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4. 点击"公共素材分组"展开
      this.emitLog('📁 点击"公共素材分组"展开素材列表...');
      const clickResult = await page.evaluate(() => {
        // 查找所有树节点标签
        const treeLabels = document.querySelectorAll('.el-tree-node__label');
        console.log(`🔍 找到 ${treeLabels.length} 个树节点标签`);

        for (const label of treeLabels) {
          const text = label.textContent?.trim() || '';
          console.log(`树节点标签文本: "${text}"`);

          if (text === '公共素材分组') {
            console.log('✅ 找到"公共素材分组"标签，准备点击');
            (label as HTMLElement).click();
            return { success: true, text };
          }
        }

        return { success: false, text: '' };
      });

      if (!clickResult.success) {
        throw new Error('未找到"公共素材分组"树节点');
      }

      this.emitLog(`✅ 已点击"公共素材分组"`);

      // 5. 等待素材列表加载完成
      // 完全按照本地测试脚本test-video-material-dialog.js的实现
      this.emitLog('⏳ 等待素材列表加载...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 5.1 获取素材信息（从数据库）
      let query = this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('id', materialId);

      // 如果提供了userId,则添加user_id条件
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: material } = await query.single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.author_name} - ${material.content_desc?.substring(0, 30)}...`);
      this.emitLog(`🖼️ 素材缩略图: ${material.thumbnail_url?.substring(0, 50)}...`);

      // 6. 遍历所有页,根据缩略图URL匹配素材
      this.emitLog(`🔍 开始搜索匹配的素材(通过缩略图URL)...`);

      let foundMaterial = false;
      let currentPage = 1;
      const maxPages = 10; // 最多翻10页

      while (!foundMaterial && currentPage <= maxPages) {
        this.emitLog(`📄 搜索第 ${currentPage} 页...`);

        // 等待素材加载
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 在当前页查找匹配的素材
        const matchResult = await page.evaluate((targetThumbnail) => {
          const materialCards = document.querySelectorAll('.materials-link-wrap');

          for (let i = 0; i < materialCards.length; i++) {
            const card = materialCards[i];

            // 获取缩略图URL
            const imgElement = card.querySelector('[class*="img-wrap"] img');
            const thumbnailUrl = imgElement?.getAttribute('src') || '';

            // 匹配缩略图URL
            if (thumbnailUrl === targetThumbnail) {
              // 找到匹配的素材,点击对号图标
              const confirmIcons = document.querySelectorAll('.confirm-icon');
              if (confirmIcons[i]) {
                (confirmIcons[i] as HTMLElement).click();

                // 获取作者名和描述用于日志
                const titleElement = card.querySelector('[class*="text-title"]');
                const authorName = titleElement?.getAttribute('title') || '';
                const descElement = card.querySelector('[class*="text-desc"]');
                const contentDesc = descElement?.textContent?.trim() || '';

                return {
                  found: true,
                  index: i,
                  author: authorName,
                  desc: contentDesc.substring(0, 30),
                  thumbnail: thumbnailUrl.substring(0, 50)
                };
              }
            }
          }

          return { found: false, totalCards: materialCards.length };
        }, material.thumbnail_url);

        if (matchResult.found) {
          this.emitLog(`✅ 找到匹配的素材: ${matchResult.author} - ${matchResult.desc}...`);
          this.emitLog(`📍 素材位置: 第${currentPage}页, 索引${matchResult.index}`);
          this.emitLog(`🖼️ 缩略图匹配: ${matchResult.thumbnail}...`);
          foundMaterial = true;
          break;
        } else {
          this.emitLog(`⚠️ 第${currentPage}页未找到匹配素材 (共${matchResult.totalCards}个素材)`);

          // 检查是否有下一页
          const hasNext = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页') && !button.hasAttribute('disabled')) {
                return true;
              }
            }
            return false;
          });

          if (hasNext) {
            // 点击下一页
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const button of buttons) {
                if (button.textContent?.includes('下一页')) {
                  (button as HTMLElement).click();
                  break;
                }
              }
            });
            currentPage++;
          } else {
            break;
          }
        }
      }

      if (!foundMaterial) {
        throw new Error(`未找到匹配的素材(缩略图URL): ${material.thumbnail_url?.substring(0, 50)}...`);
      }

      // 7. 素材已在上面的循环中点击,这里不需要再点击
      this.emitLog(`✅ 已点击匹配的素材对号图标`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 8. 点击底部的"确定"按钮(点击后自动发送视频号卡片)
      // 完全按照本地测试脚本test-video-material-dialog.js的实现
      this.emitLog(`🔘 点击确定按钮...`);
      const confirmClicked = await page.evaluate(() => {
        // 1. 优先查找Element UI的成功按钮
        const successButtons = document.querySelectorAll('button.el-button--success');
        for (const button of successButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(el-button--success): "${text}"`);
            (button as HTMLElement).click();
            return true;
          }
        }

        // 2. 查找所有button元素
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(button): "${text}"`);
            (button as HTMLElement).click();
            return true;
          }
        }

        // 3. 查找span元素
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(span): "${text}"`);
            (span as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (!confirmClicked) {
        this.emitLog(`⚠️ 未找到确定按钮,但继续执行`);
      } else {
        this.emitLog(`✅ 已点击确定按钮`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      this.emitLog(`✅ 成功发送视频号给: ${friendName}`);
      return true;

    } catch (error) {
      this.logger.error(`发送视频号给 ${friendName} 失败: ${error.message}`);
      this.emitLog(`❌ 发送失败: ${friendName} - ${error.message}`);
      return false;
    }
  }

  /**
   * 直接发送视频号素材(不打开聊天窗口,假设已经打开)
   */
  private async sendVideoMaterialDirect(
    page: puppeteer.Page,
    materialId: number
  ): Promise<boolean> {
    try {
      // 1. 点击"素材"按钮
      await page.click('[title="素材"]');

      // ✅ 智能等待: 等待素材菜单出现
      await page.waitForFunction(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          if (span.textContent && span.textContent.trim() === '视频号素材') {
            return true;
          }
        }
        return false;
      }, { timeout: 3000 }).catch(() => {
        this.emitLog(`⚠️ 视频号素材菜单未在3秒内出现`);
      });

      // 2. 点击"视频号素材" - 使用鼠标模拟点击
      this.emitLog('📹 点击"视频号素材"选项...');

      // 获取"视频号素材"元素的屏幕坐标
      const videoMaterialPosition = await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          if (span.textContent && span.textContent.trim() === '视频号素材') {
            const rect = span.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              text: span.textContent.trim(),
            };
          }
        }
        return { found: false, x: 0, y: 0, text: '' };
      });

      if (!videoMaterialPosition.found) {
        throw new Error('未找到"视频号素材"菜单项');
      }

      // 移动鼠标到元素位置并点击
      await page.mouse.move(videoMaterialPosition.x, videoMaterialPosition.y);
      await page.mouse.click(videoMaterialPosition.x, videoMaterialPosition.y);

      this.emitLog('✅ 已点击"视频号素材"选项');

      // ✅ 智能等待: 等待素材库对话框打开(等待树节点出现)
      await page.waitForFunction(() => {
        const treeLabels = document.querySelectorAll('.el-tree-node__label');
        for (const label of treeLabels) {
          if (label.textContent?.trim() === '公共素材分组') {
            return true;
          }
        }
        return false;
      }, { timeout: 5000 }).catch(() => {
        this.emitLog(`⚠️ 素材库对话框未在5秒内打开`);
      });

      // 3. 点击"公共素材分组"展开
      this.emitLog('📁 点击"公共素材分组"展开素材列表...');
      const clickResult = await page.evaluate(() => {
        const treeLabels = document.querySelectorAll('.el-tree-node__label');
        for (const label of treeLabels) {
          const text = label.textContent?.trim() || '';
          if (text === '公共素材分组') {
            (label as HTMLElement).click();
            return { success: true, text };
          }
        }
        return { success: false, text: '' };
      });

      if (!clickResult.success) {
        throw new Error('未找到"公共素材分组"树节点');
      }

      this.emitLog(`✅ 已点击"公共素材分组"`);

      // ✅ 智能等待: 等待素材列表加载完成(等待素材卡片出现)
      await page.waitForSelector('.materials-link-wrap', { timeout: 5000 }).catch(() => {
        this.emitLog(`⚠️ 素材列表未在5秒内加载`);
      });

      // 5. 获取素材信息（从数据库）
      const { data: material } = await this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.author_name} - ${material.content_desc?.substring(0, 30)}...`);
      this.emitLog(`🖼️ 素材缩略图: ${material.thumbnail_url?.substring(0, 50)}...`);

      // 6. 遍历所有页,根据缩略图URL或文字信息匹配素材
      this.emitLog(`🔍 开始搜索匹配的素材(优先缩略图URL,备用作者名+描述)...`);

      let foundMaterial = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!foundMaterial && currentPage <= maxPages) {
        this.emitLog(`📄 搜索第 ${currentPage} 页...`);

        // ✅ 智能等待: 等待当前页素材加载完成
        await page.waitForSelector('.materials-link-wrap', { timeout: 3000 }).catch(() => {
          this.emitLog(`⚠️ 第${currentPage}页素材未在3秒内加载`);
        });

        const matchResult = await page.evaluate((targetThumbnail, targetAuthor, targetDesc) => {
          const materialCards = document.querySelectorAll('.materials-link-wrap');

          for (let i = 0; i < materialCards.length; i++) {
            const card = materialCards[i];

            // 获取缩略图URL
            const imgElement = card.querySelector('[class*="img-wrap"] img');
            const thumbnailUrl = imgElement?.getAttribute('src') || '';

            // 获取作者名和描述
            const titleElement = card.querySelector('[class*="text-title"]');
            const authorName = titleElement?.getAttribute('title') || '';
            const descElement = card.querySelector('[class*="text-desc"]');
            const contentDesc = descElement?.textContent?.trim() || '';

            // 🆕 双重匹配: 优先缩略图URL,备用作者名+描述
            const thumbnailMatch = thumbnailUrl === targetThumbnail;
            const textMatch = authorName === targetAuthor && contentDesc.includes(targetDesc.substring(0, 20));

            if (thumbnailMatch || textMatch) {
              const confirmIcons = document.querySelectorAll('.confirm-icon');
              if (confirmIcons[i]) {
                (confirmIcons[i] as HTMLElement).click();

                return {
                  found: true,
                  index: i,
                  author: authorName,
                  desc: contentDesc.substring(0, 30),
                  thumbnail: thumbnailUrl.substring(0, 50),
                  matchType: thumbnailMatch ? 'thumbnail' : 'text'
                };
              }
            }
          }
          return { found: false, totalCards: materialCards.length };
        }, material.thumbnail_url, material.author_name, material.content_desc || '');

        if (matchResult.found) {
          this.emitLog(`✅ 找到匹配的素材: ${matchResult.author} - ${matchResult.desc}...`);
          this.emitLog(`🔍 匹配方式: ${matchResult.matchType === 'thumbnail' ? '缩略图URL' : '作者名+描述'}`);
          if (matchResult.matchType === 'thumbnail') {
            this.emitLog(`🖼️ 缩略图匹配: ${matchResult.thumbnail}...`);
          }
          foundMaterial = true;
          break;
        } else {
          this.emitLog(`⚠️ 第${currentPage}页未找到匹配素材 (共${matchResult.totalCards}个素材)`);

          const hasNext = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页') && !button.hasAttribute('disabled')) {
                return true;
              }
            }
            return false;
          });

          if (hasNext) {
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const button of buttons) {
                if (button.textContent?.includes('下一页')) {
                  (button as HTMLElement).click();
                  break;
                }
              }
            });
            currentPage++;
          } else {
            break;
          }
        }
      }

      if (!foundMaterial) {
        throw new Error(`未找到匹配的素材(已尝试缩略图URL和作者名+描述双重匹配): ${material.author_name} - ${material.content_desc?.substring(0, 30)}...`);
      }

      this.emitLog(`✅ 已点击匹配的素材对号图标`);

      // 8. 点击底部的"确定"按钮
      this.emitLog(`🔘 点击确定按钮...`);
      const confirmClicked = await page.evaluate(() => {
        const successButtons = document.querySelectorAll('button.el-button--success');
        for (const button of successButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!confirmClicked) {
        this.emitLog(`⚠️ 未找到确定按钮,但继续执行`);
      } else {
        this.emitLog(`✅ 已点击确定按钮`);
      }

      // ✅ 智能等待: 等待对话框消失(最多5秒)
      this.emitLog(`⏳ 等待素材对话框消失...`);
      await page.waitForFunction(() => {
        const dialogs = document.querySelectorAll('.el-dialog__wrapper');
        return dialogs.length === 0 || Array.from(dialogs).every(d =>
          (d as HTMLElement).style.display === 'none'
        );
      }, { timeout: 5000 }).catch(() => {
        this.emitLog(`⚠️ 对话框未在5秒内消失,继续执行`);
      });

      // ✅ 等待素材发送完成(额外等待2秒确保发送成功)
      this.emitLog(`⏳ 等待素材发送完成...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      this.emitLog(`✅ 视频号素材已发送`);
      return true;

    } catch (error) {
      this.logger.error(`直接发送视频号失败: ${error.message}`);
      this.emitLog(`❌ 视频号素材发送失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 发送链接素材给好友
   */
  private async sendLinkMaterialToFriend(
    page: puppeteer.Page,
    friendName: string,
    materialId: number,
    userId?: string,
    additionalMessage?: string
  ): Promise<boolean> {
    try {
      this.emitLog(`🔗 开始发送链接给: ${friendName}`);

      // 1. 搜索并点击好友打开聊天窗口(使用搜索方式,更快)
      const friendFound = await this.searchAndClickFriend(page, friendName, userId);
      if (!friendFound) {
        throw new Error(`未找到好友: ${friendName}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. 点击"素材"按钮
      await page.click('[title="素材"]');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. 点击"链接素材" - 使用鼠标模拟点击
      this.emitLog('🔗 点击"链接素材"选项...');

      // 等待素材菜单完全展开
      this.emitLog('⏳ 等待素材菜单展开...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取"链接素材"元素的屏幕坐标
      const linkMaterialPosition = await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          if (span.textContent && span.textContent.trim() === '链接素材') {
            const rect = span.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              text: span.textContent.trim(),
            };
          }
        }
        return { found: false, x: 0, y: 0, text: '' };
      });

      if (!linkMaterialPosition.found) {
        throw new Error('未找到"链接素材"菜单项');
      }

      this.emitLog(`✅ 找到"链接素材"元素，位置: (${linkMaterialPosition.x}, ${linkMaterialPosition.y})`);

      // 移动鼠标到元素位置
      await page.mouse.move(linkMaterialPosition.x, linkMaterialPosition.y);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击
      await page.mouse.click(linkMaterialPosition.x, linkMaterialPosition.y);

      this.emitLog('✅ 已点击"链接素材"选项（模拟鼠标点击）');

      // 等待素材库对话框打开
      this.emitLog('⏳ 等待素材库对话框打开...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4. 点击"公共素材分组"展开
      this.emitLog('📁 点击"公共素材分组"展开素材列表...');
      const clickResult = await page.evaluate(() => {
        // 查找所有树节点标签
        const treeLabels = document.querySelectorAll('.el-tree-node__label');
        console.log(`🔍 找到 ${treeLabels.length} 个树节点标签`);

        for (const label of treeLabels) {
          const text = label.textContent?.trim() || '';
          console.log(`树节点标签文本: "${text}"`);

          if (text === '公共素材分组') {
            console.log('✅ 找到"公共素材分组"标签，准备点击');
            (label as HTMLElement).click();
            return { success: true, text };
          }
        }

        return { success: false, text: '' };
      });

      if (!clickResult.success) {
        throw new Error('未找到"公共素材分组"树节点');
      }

      this.emitLog(`✅ 已点击"公共素材分组"`);

      // 5. 等待素材列表加载完成
      this.emitLog('⏳ 等待素材列表加载...');
      try {
        await page.waitForSelector('.materials-link-wrap', { timeout: 10000 });
        this.emitLog('✅ 素材列表已加载');
      } catch (error) {
        this.emitLog('⚠️ 未找到.materials-link-wrap，尝试继续...');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 5.1 获取素材信息（从数据库）
      const { data: material } = await this.supabaseService.getClient()
        .from('duixueqiu_link_materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.title?.substring(0, 50)}...`);

      // 6. 遍历所有页,根据标题和公众号名称匹配素材
      this.emitLog(`🔍 开始搜索匹配的链接素材...`);

      let foundMaterial = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!foundMaterial && currentPage <= maxPages) {
        this.emitLog(`📄 搜索第 ${currentPage} 页...`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const matchResult = await page.evaluate((targetTitle, targetAccount) => {
          const materialCards = document.querySelectorAll('.materials-link-wrap');

          for (let i = 0; i < materialCards.length; i++) {
            const card = materialCards[i];

            // 获取标题
            const titleElement = card.querySelector('[class*="text-title"]');
            const title = titleElement?.getAttribute('title') || titleElement?.textContent?.trim() || '';

            // 获取公众号名称
            const accountElement = card.querySelector('[class*="text-desc"]');
            const accountName = accountElement?.textContent?.trim() || '';

            // 匹配标题和公众号名称
            if (title === targetTitle && accountName === targetAccount) {
              const confirmIcons = document.querySelectorAll('.confirm-icon');
              if (confirmIcons[i]) {
                (confirmIcons[i] as HTMLElement).click();
                return { found: true, index: i, title: title.substring(0, 30), account: accountName };
              }
            }
          }
          return { found: false, totalCards: materialCards.length };
        }, material.title, material.account_name);

        if (matchResult.found) {
          this.emitLog(`✅ 找到匹配的链接素材: ${matchResult.title}... (${matchResult.account})`);
          foundMaterial = true;
          break;
        } else {
          this.emitLog(`⚠️ 第${currentPage}页未找到匹配素材 (共${matchResult.totalCards}个素材)`);

          const hasNext = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页') && !button.hasAttribute('disabled')) {
                return true;
              }
            }
            return false;
          });

          if (hasNext) {
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const button of buttons) {
                if (button.textContent?.includes('下一页')) {
                  (button as HTMLElement).click();
                  break;
                }
              }
            });
            currentPage++;
          } else {
            break;
          }
        }
      }

      if (!foundMaterial) {
        throw new Error(`未找到匹配的链接素材: ${material.title?.substring(0, 30)}... (${material.account_name})`);
      }

      this.emitLog(`✅ 已点击匹配的链接素材对号图标`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 8. 点击底部的"确定"按钮(点击后自动发送链接卡片)
      // 完全按照本地测试脚本test-video-material-dialog.js的实现
      this.emitLog(`🔘 点击确定按钮...`);
      const confirmClicked = await page.evaluate(() => {
        // 1. 优先查找Element UI的成功按钮
        const successButtons = document.querySelectorAll('button.el-button--success');
        for (const button of successButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(el-button--success): "${text}"`);
            (button as HTMLElement).click();
            return true;
          }
        }

        // 2. 查找所有button元素
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(button): "${text}"`);
            (button as HTMLElement).click();
            return true;
          }
        }

        // 3. 查找span元素
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(span): "${text}"`);
            (span as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (!confirmClicked) {
        this.emitLog(`⚠️ 未找到确定按钮,但继续执行`);
      } else {
        this.emitLog(`✅ 已点击确定按钮`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      this.emitLog(`✅ 成功发送链接给: ${friendName}`);
      return true;

    } catch (error) {
      this.logger.error(`发送链接给 ${friendName} 失败: ${error.message}`);
      this.emitLog(`❌ 发送失败: ${friendName} - ${error.message}`);
      return false;
    }
  }

  /**
   * 直接发送链接素材(不打开聊天窗口,假设已经打开)
   */
  private async sendLinkMaterialDirect(
    page: puppeteer.Page,
    materialId: number
  ): Promise<boolean> {
    try {
      // 1. 点击"素材"按钮
      await page.click('[title="素材"]');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. 点击"链接素材" - 使用鼠标模拟点击
      this.emitLog('🔗 点击"链接素材"选项...');

      // 等待素材菜单完全展开
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取"链接素材"元素的屏幕坐标
      const linkMaterialPosition = await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          if (span.textContent && span.textContent.trim() === '链接素材') {
            const rect = span.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              text: span.textContent.trim(),
            };
          }
        }
        return { found: false, x: 0, y: 0, text: '' };
      });

      if (!linkMaterialPosition.found) {
        throw new Error('未找到"链接素材"菜单项');
      }

      // 移动鼠标到元素位置并点击
      await page.mouse.move(linkMaterialPosition.x, linkMaterialPosition.y);
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.mouse.click(linkMaterialPosition.x, linkMaterialPosition.y);

      this.emitLog('✅ 已点击"链接素材"选项');

      // 等待素材库对话框打开
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. 点击"公共素材分组"展开
      this.emitLog('📁 点击"公共素材分组"展开素材列表...');
      const clickResult = await page.evaluate(() => {
        const treeLabels = document.querySelectorAll('.el-tree-node__label');
        for (const label of treeLabels) {
          const text = label.textContent?.trim() || '';
          if (text === '公共素材分组') {
            (label as HTMLElement).click();
            return { success: true, text };
          }
        }
        return { success: false, text: '' };
      });

      if (!clickResult.success) {
        throw new Error('未找到"公共素材分组"树节点');
      }

      this.emitLog(`✅ 已点击"公共素材分组"`);

      // 4. 等待素材列表加载完成
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 5. 获取素材信息（从数据库）
      const { data: material } = await this.supabaseService.getClient()
        .from('duixueqiu_link_materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.title?.substring(0, 50)}...`);

      // 6. 遍历所有页,根据标题和公众号名称匹配素材(支持模糊匹配)
      this.emitLog(`🔍 开始搜索匹配的链接素材(优先精确匹配,备用模糊匹配)...`);

      let foundMaterial = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!foundMaterial && currentPage <= maxPages) {
        this.emitLog(`📄 搜索第 ${currentPage} 页...`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const matchResult = await page.evaluate((targetTitle, targetAccount) => {
          const materialCards = document.querySelectorAll('.materials-link-wrap');

          for (let i = 0; i < materialCards.length; i++) {
            const card = materialCards[i];
            const titleElement = card.querySelector('[class*="text-title"]');
            const title = titleElement?.getAttribute('title') || titleElement?.textContent?.trim() || '';
            const accountElement = card.querySelector('[class*="text-desc"]');
            const accountName = accountElement?.textContent?.trim() || '';

            // 🆕 双重匹配: 优先精确匹配,备用模糊匹配(标题前30字符+公众号名称)
            const exactMatch = title === targetTitle && accountName === targetAccount;
            const fuzzyMatch = title.substring(0, 30) === targetTitle.substring(0, 30) && accountName === targetAccount;

            if (exactMatch || fuzzyMatch) {
              const confirmIcons = document.querySelectorAll('.confirm-icon');
              if (confirmIcons[i]) {
                (confirmIcons[i] as HTMLElement).click();
                return {
                  found: true,
                  index: i,
                  title: title.substring(0, 30),
                  account: accountName,
                  matchType: exactMatch ? 'exact' : 'fuzzy'
                };
              }
            }
          }
          return { found: false, totalCards: materialCards.length };
        }, material.title, material.account_name);

        if (matchResult.found) {
          this.emitLog(`✅ 找到匹配的链接素材: ${matchResult.title}... (${matchResult.account})`);
          this.emitLog(`🔍 匹配方式: ${matchResult.matchType === 'exact' ? '精确匹配' : '模糊匹配(前30字符)'}`);
          foundMaterial = true;
          break;
        } else {
          this.emitLog(`⚠️ 第${currentPage}页未找到匹配素材 (共${matchResult.totalCards}个素材)`);

          const hasNext = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页') && !button.hasAttribute('disabled')) {
                return true;
              }
            }
            return false;
          });

          if (hasNext) {
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const button of buttons) {
                if (button.textContent?.includes('下一页')) {
                  (button as HTMLElement).click();
                  break;
                }
              }
            });
            currentPage++;
          } else {
            break;
          }
        }
      }

      if (!foundMaterial) {
        throw new Error(`未找到匹配的链接素材: ${material.title?.substring(0, 30)}... (${material.account_name})`);
      }

      this.emitLog(`✅ 已点击匹配的链接素材对号图标`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 8. 点击底部的"确定"按钮
      this.emitLog(`🔘 点击确定按钮...`);
      const confirmClicked = await page.evaluate(() => {
        const successButtons = document.querySelectorAll('button.el-button--success');
        for (const button of successButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!confirmClicked) {
        this.emitLog(`⚠️ 未找到确定按钮,但继续执行`);
      } else {
        this.emitLog(`✅ 已点击确定按钮`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      this.emitLog(`✅ 链接素材已发送`);
      return true;

    } catch (error) {
      this.logger.error(`直接发送链接失败: ${error.message}`);
      this.emitLog(`❌ 链接素材发送失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 发送图片给好友
   */
  private async sendImageToFriend(
    page: puppeteer.Page,
    friendName: string,
    imageBase64Array: string[],
    skipOpenChat: boolean = false // 🆕 是否跳过打开聊天窗口(组合发送时使用)
  ): Promise<boolean> {
    const fs = require('fs');
    const path = require('path');
    const localImagePaths: string[] = [];

    try {
      this.emitLog(`🖼️ 开始发送图片给: ${friendName} (共${imageBase64Array.length}张)`);

      // 1. 滚动查找并点击好友打开聊天窗口 (组合发送时跳过)
      if (!skipOpenChat) {
        const friendFound = await this.findAndClickFriend(page, friendName);
        if (!friendFound) {
          throw new Error(`未找到好友: ${friendName}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        this.emitLog(`⏭️ 跳过打开聊天窗口(已在组合发送中打开)`);
      }

      // 2. 转换Base64为本地临时文件
      this.emitLog(`📥 处理图片数据...`);
      for (let i = 0; i < imageBase64Array.length; i++) {
        const imageBase64 = imageBase64Array[i];
        const matches = imageBase64.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
        if (matches) {
          // 统一转换扩展名: jpeg/jpg → jpg, png → png
          let ext = matches[1];
          if (ext === 'jpeg') ext = 'jpg';

          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');

          // 使用更安全的临时目录路径
          const tmpDir = require('os').tmpdir();
          const localPath = path.join(tmpDir, `temp_chat_image_${Date.now()}_${i}.${ext}`);

          fs.writeFileSync(localPath, buffer);
          localImagePaths.push(localPath);
          this.emitLog(`✅ 图片 ${i + 1} 已保存到本地: ${path.basename(localPath)}`);
        } else {
          this.emitLog(`⚠️ 图片 ${i + 1} 格式不正确,跳过`);
          this.emitLog(`   实际格式: ${imageBase64.substring(0, 50)}...`);
        }
      }

      if (localImagePaths.length === 0) {
        throw new Error('没有有效的图片可以发送');
      }

      // 4. 直接查找文件上传输入框(不点击任何按钮)
      this.emitLog(`📤 查找图片上传输入框...`);

      // 等待输入框出现
      try {
        await page.waitForSelector('input[type="file"]', { timeout: 3000 });
        this.emitLog('✅ 找到文件上传输入框');
      } catch (error) {
        this.emitLog('⚠️ 未找到文件上传输入框,尝试点击图片按钮...');

        // 如果没有找到,尝试点击图片按钮
        const imageButtonClicked = await page.evaluate(() => {
          const allElements = document.querySelectorAll('[title="图片"]');
          for (const el of allElements) {
            (el as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (imageButtonClicked) {
          this.emitLog('✅ 已点击图片按钮,等待输入框出现...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        throw new Error('未找到文件上传输入框');
      }

      // 5. 上传图片文件
      this.emitLog(`📁 上传 ${localImagePaths.length} 张图片文件...`);
      await fileInput.uploadFile(...localImagePaths);
      this.emitLog('✅ 文件已上传');

      // 6. 等待图片上传完成,确认框会自动弹出
      this.emitLog(`⏳ 等待图片上传完成,确认框会自动弹出...`);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 7. 先输出所有对话框信息用于调试
      this.emitLog('🔍 分析页面上的所有对话框和弹窗...');
      const dialogDebugInfo = await page.evaluate(() => {
        const result = {
          elDialogs: [],
          allDialogs: [],
          visibleElements: []
        };

        // 1. 查找Element UI对话框
        const elDialogWrappers = document.querySelectorAll('.el-dialog__wrapper');
        for (const dialog of elDialogWrappers) {
          const style = window.getComputedStyle(dialog);
          if (style.display !== 'none') {
            const title = dialog.querySelector('.el-dialog__title');
            const titleText = title ? title.textContent?.trim() : '无标题';
            const footer = dialog.querySelector('.el-dialog__footer');
            const buttons = footer ? footer.querySelectorAll('button') : [];
            const buttonTexts = Array.from(buttons).map(btn => btn.textContent?.trim());

            result.elDialogs.push({
              type: 'Element UI Dialog',
              title: titleText,
              buttonCount: buttons.length,
              buttons: buttonTexts,
              display: style.display,
              visibility: style.visibility
            });
          }
        }

        // 2. 查找所有包含"发送"或"确定"文字的可见元素
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent?.trim();
          if (text && (text.includes('发送图片') || text.includes('确定') || text.includes('取消'))) {
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              result.visibleElements.push({
                tag: el.tagName,
                text: text.substring(0, 50),
                className: el.className,
                display: style.display,
                visibility: style.visibility
              });
            }
          }
        }

        // 3. 查找所有dialog标签
        const dialogTags = document.querySelectorAll('dialog');
        for (const dialog of dialogTags) {
          const style = window.getComputedStyle(dialog);
          result.allDialogs.push({
            type: 'HTML Dialog',
            open: (dialog as HTMLDialogElement).open,
            display: style.display,
            visibility: style.visibility,
            innerHTML: dialog.innerHTML.substring(0, 200)
          });
        }

        return result;
      });

      this.emitLog(`📋 Element UI对话框: ${dialogDebugInfo.elDialogs.length} 个`);
      dialogDebugInfo.elDialogs.forEach((dialog, index) => {
        this.emitLog(`  [${index + 1}] ${dialog.type}: "${dialog.title}"`);
        this.emitLog(`      按钮: ${JSON.stringify(dialog.buttons)}`);
      });

      this.emitLog(`📋 HTML Dialog标签: ${dialogDebugInfo.allDialogs.length} 个`);
      dialogDebugInfo.allDialogs.forEach((dialog, index) => {
        this.emitLog(`  [${index + 1}] open=${dialog.open}, display=${dialog.display}`);
      });

      this.emitLog(`📋 包含关键词的可见元素: ${dialogDebugInfo.visibleElements.length} 个`);
      dialogDebugInfo.visibleElements.slice(0, 10).forEach((el, index) => {
        this.emitLog(`  [${index + 1}] <${el.tag}> class="${el.className}" text="${el.text}"`);
      });

      // 8. 点击确认框的确定按钮
      this.emitLog('🔘 点击确认框的确定按钮...');
      const confirmClicked = await page.evaluate(() => {
        // 策略1: 查找所有可见的按钮,找到文本为"确定"且最近出现的
        const allButtons = document.querySelectorAll('button');
        let confirmButton = null;
        let maxZIndex = -1;

        for (const button of allButtons) {
          const text = button.textContent?.trim();
          const style = window.getComputedStyle(button);
          const disabled = (button as HTMLButtonElement).disabled;

          // 检查按钮是否可见
          if (style.display === 'none' || style.visibility === 'hidden' || disabled) {
            continue;
          }

          // 检查按钮文本是否为"确定"
          if (text === '确定' || text === '确 定') {
            // 获取z-index,找到最上层的确定按钮
            const zIndex = parseInt(style.zIndex) || 0;

            // 检查按钮的父元素是否可见
            let parent = button.parentElement;
            let isVisible = true;
            while (parent && parent !== document.body) {
              const parentStyle = window.getComputedStyle(parent);
              if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
                isVisible = false;
                break;
              }
              parent = parent.parentElement;
            }

            if (isVisible && zIndex > maxZIndex) {
              maxZIndex = zIndex;
              confirmButton = button;
            }
          }
        }

        if (confirmButton) {
          console.log(`✅ 找到确定按钮,z-index=${maxZIndex}`);
          (confirmButton as HTMLElement).click();
          return true;
        }

        return false;
      });

      if (confirmClicked) {
        this.emitLog(`✅ 已点击确定按钮`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        this.emitLog(`⚠️ 未找到确定按钮,但继续执行`);
      }

      this.emitLog(`✅ 成功发送图片给: ${friendName}`);
      return true;

    } catch (error) {
      this.logger.error(`发送图片给 ${friendName} 失败: ${error.message}`);
      this.emitLog(`❌ 发送失败: ${friendName} - ${error.message}`);
      return false;
    } finally {
      // 清理临时图片文件
      if (localImagePaths.length > 0) {
        this.emitLog('🧹 清理临时图片文件...');
        for (const imagePath of localImagePaths) {
          try {
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
            }
          } catch (e) {
            this.logger.warn(`删除临时文件失败: ${imagePath}`);
          }
        }
      }
    }
  }

  /**
   * 组合发送多种内容类型
   * @param page Puppeteer页面对象
   * @param friendName 好友昵称
   * @param contents 内容配置数组
   */
  /**
   * 组合发送多种内容类型
   * @param page Puppeteer页面对象
   * @param friendName 好友昵称
   * @param friendId 好友ID(用于记录发送历史)
   * @param contents 内容配置数组
   * @param userId 用户ID
   */
  private async sendCombinedContents(
    page: puppeteer.Page,
    friendName: string,
    friendId: number,
    contents: Array<{
      type: 'text' | 'video' | 'link' | 'image';
      message?: string;
      materialId?: number;
      imageUrls?: string[];
    }>,
    userId: string,
    randomDelay?: { enabled: boolean; minDelay?: number; maxDelay?: number } // 🆕 添加随机延迟参数
  ): Promise<boolean> {
    try {
      // 🐛 调试日志:打印接收到的参数
      this.logger.log(`🐛 sendCombinedContents接收参数: friendName=${friendName}, friendId=${friendId}, userId=${userId}`);

      this.emitLog(`🎯 开始组合发送给: ${friendName}`);

      // 1. 先搜索并打开聊天窗口(只打开一次)
      this.emitLog(`👤 搜索并打开聊天窗口: ${friendName}`);
      const friendFound = await this.searchAndClickFriend(page, friendName, userId);
      if (!friendFound) {
        throw new Error(`未找到好友: ${friendName}`);
      }

      // ✅ 智能等待: 等待输入框出现(最多3秒)
      await page.waitForSelector('#editArea', { timeout: 3000 }).catch(() => {
        this.emitLog(`⚠️ 输入框未在3秒内出现,继续执行`);
      });

      // 2. 按照优先级排序: 文字优先,其他的无所谓
      const sortedContents = [...contents].sort((a, b) => {
        if (a.type === 'text') return -1;
        if (b.type === 'text') return 1;
        return 0;
      });

      // 3. 逐个发送(不再重新打开聊天窗口)
      let successCount = 0;
      for (let i = 0; i < sortedContents.length; i++) {
        const content = sortedContents[i];

        // 🆕 构造该类型的消息内容对象
        let messageContentObj: any;
        switch (content.type) {
          case 'text':
            messageContentObj = { text: content.message };
            break;
          case 'video':
            messageContentObj = { materialId: content.materialId };
            break;
          case 'link':
            messageContentObj = { materialId: content.materialId };
            break;
          case 'image':
            messageContentObj = { imageUrls: content.imageUrls };
            break;
        }

        // 🆕 检查该类型是否已发送过
        const alreadySent = await this.checkMessageSent(
          userId,
          friendId,
          content.type,
          messageContentObj
        );

        if (alreadySent) {
          this.emitLog(`⏭️ 跳过${content.type}消息 (已发送过)`);
          successCount++; // 已发送的也算成功
          continue;
        }

        // 🆕 随机延迟(在每条消息发送前)
        if (i > 0 && randomDelay?.enabled) {
          const minDelay = randomDelay.minDelay || 3;
          const maxDelay = randomDelay.maxDelay || 10;
          const delay = minDelay + Math.random() * (maxDelay - minDelay);
          this.emitLog(`⏳ 随机延迟: ${delay.toFixed(1)} 秒...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }

        // 发送该类型的消息
        let sendSuccess = false;
        switch (content.type) {
          case 'text':
            this.emitLog(`💬 发送文字消息...`);
            this.emitLog(`📝 文字消息内容长度: ${content.message?.length || 0}字符`);
            this.emitLog(`📝 文字消息前100字符: ${content.message?.substring(0, 100) || '(空)'}`);
            sendSuccess = await this.sendMessageToFriendDirect(page, friendName, content.message);
            if (!sendSuccess) {
              this.emitLog(`⚠️ 文字消息发送失败,继续发送其他内容`);
            }
            break;

          case 'video':
            this.emitLog(`📹 发送视频号素材...`);
            sendSuccess = await this.sendVideoMaterialDirect(page, content.materialId);
            if (!sendSuccess) {
              this.emitLog(`⚠️ 视频号素材发送失败,继续发送其他内容`);
            }
            break;

          case 'link':
            this.emitLog(`🔗 发送链接素材...`);
            sendSuccess = await this.sendLinkMaterialDirect(page, content.materialId);
            if (!sendSuccess) {
              this.emitLog(`⚠️ 链接素材发送失败,继续发送其他内容`);
            }
            break;

          case 'image':
            this.emitLog(`🖼️ 发送图片...`);
            sendSuccess = await this.sendImageToFriend(page, friendName, content.imageUrls, true); // 🆕 传入true跳过打开聊天窗口
            if (!sendSuccess) {
              this.emitLog(`⚠️ 图片发送失败,继续发送其他内容`);
            }
            break;
        }

        // 🆕 发送成功后,立即记录该类型的发送历史
        if (sendSuccess) {
          await this.recordMessageSent(
            userId,
            friendId,
            friendName,
            content.type,
            messageContentObj
          );
          this.emitLog(`✅ ${content.type}消息已发送并记录`);
          successCount++;
        }

        // ✅ 智能等待: 检测输入框是否准备好接收下一条消息
        if (i < sortedContents.length - 1) {
          this.emitLog(`⏳ 智能检测: 等待输入框准备好...`);
          await page.waitForFunction(() => {
            const editArea = document.querySelector('#editArea') as HTMLTextAreaElement;
            return editArea && editArea.value === '';
          }, { timeout: 2000 }).catch(() => {
            this.emitLog(`⚠️ 输入框未在2秒内准备好,继续执行`);
          });
        }
      }

      this.emitLog(`✅ 组合发送完成: ${friendName} (成功${successCount}/${sortedContents.length})`);
      return successCount > 0; // 只要有一个成功就算成功

    } catch (error) {
      this.logger.error(`组合发送给 ${friendName} 失败: ${error.message}`);
      this.emitLog(`❌ 组合发送失败: ${friendName} - ${error.message}`);
      return false;
    }
  }

  /**
   * 组合发送: 文字消息 + 视频号卡片
   */
  private async sendCombinedMessageToFriend(
    page: puppeteer.Page,
    friendName: string,
    textMessage: string,
    materialId: number,
    userId?: string
  ): Promise<boolean> {
    try {
      this.emitLog(`💬📹 开始组合发送给: ${friendName}`);

      // 1. 点击好友打开聊天窗口
      this.emitLog(`👤 点击好友: ${friendName}`);
      await this.findAndClickFriend(page, friendName);

      // 等待聊天窗口完全加载
      this.emitLog(`⏳ 等待聊天窗口加载...`);
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 2. 发送文字消息
      this.emitLog(`💬 发送文字消息...`);
      const finalMessage = textMessage.replace(/\{昵称\}/g, friendName);

      // 等待输入框出现
      await page.waitForSelector('#editArea', { timeout: 10000 });
      await page.type('#editArea', finalMessage);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击发送按钮
      await page.click('.send-btn');
      this.emitLog(`✅ 文字消息已发送`);

      // 3. 等待2秒间隔
      this.emitLog(`⏳ 等待2秒...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 4. 发送视频号卡片
      this.emitLog(`📹 开始发送视频号卡片...`);

      // 4.1 点击"素材"按钮
      await page.click('[title="素材"]');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4.2 点击"视频号素材" - 使用鼠标模拟点击
      this.emitLog('📹 点击"视频号素材"选项...');

      // 等待素材菜单完全展开
      this.emitLog('⏳ 等待素材菜单展开...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 获取"视频号素材"元素的屏幕坐标
      const videoMaterialPosition = await page.evaluate(() => {
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          if (span.textContent && span.textContent.trim() === '视频号素材') {
            const rect = span.getBoundingClientRect();
            return {
              found: true,
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              text: span.textContent.trim(),
            };
          }
        }
        return { found: false, x: 0, y: 0, text: '' };
      });

      if (!videoMaterialPosition.found) {
        throw new Error('未找到"视频号素材"菜单项');
      }

      this.emitLog(`✅ 找到"视频号素材"元素，位置: (${videoMaterialPosition.x}, ${videoMaterialPosition.y})`);

      // 移动鼠标到元素位置
      await page.mouse.move(videoMaterialPosition.x, videoMaterialPosition.y);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 点击
      await page.mouse.click(videoMaterialPosition.x, videoMaterialPosition.y);

      this.emitLog('✅ 已点击"视频号素材"选项（模拟鼠标点击）');

      // 等待素材库对话框打开
      this.emitLog('⏳ 等待素材库对话框打开...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4.3 点击"公共素材分组"展开
      this.emitLog('📁 点击"公共素材分组"展开素材列表...');
      const clickResult = await page.evaluate(() => {
        // 查找所有树节点标签
        const treeLabels = document.querySelectorAll('.el-tree-node__label');
        console.log(`🔍 找到 ${treeLabels.length} 个树节点标签`);

        for (const label of treeLabels) {
          const text = label.textContent?.trim() || '';
          console.log(`树节点标签文本: "${text}"`);

          if (text === '公共素材分组') {
            console.log('✅ 找到"公共素材分组"标签，准备点击');
            (label as HTMLElement).click();
            return { success: true, text };
          }
        }

        return { success: false, text: '' };
      });

      if (!clickResult.success) {
        throw new Error('未找到"公共素材分组"树节点');
      }

      this.emitLog(`✅ 已点击"公共素材分组"`);

      // 4.4 等待素材列表加载完成
      this.emitLog('⏳ 等待素材列表加载...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4.4.1 截图并检查页面状态
      this.emitLog('📸 截图保存当前页面状态...');
      await page.screenshot({ path: '/tmp/material-dialog-after-click.png', fullPage: true });

      // 4.4.2 检查页面上所有元素
      const pageDebug = await page.evaluate(() => {
        // 查找所有可能的素材相关元素
        const allDivs = Array.from(document.querySelectorAll('div'));
        const materialRelated = allDivs.filter(div => {
          const className = div.className || '';
          const text = div.textContent || '';
          return className.includes('material') ||
                 className.includes('video') ||
                 className.includes('confirm') ||
                 className.includes('item') ||
                 text.includes('大树AI');
        });

        return {
          totalDivs: allDivs.length,
          materialRelatedCount: materialRelated.length,
          materialRelatedClasses: materialRelated.slice(0, 10).map(div => ({
            className: div.className,
            text: (div.textContent || '').substring(0, 50),
          })),
          confirmIconCount: document.querySelectorAll('.confirm-icon').length,
          materialsLinkWrapCount: document.querySelectorAll('.materials-link-wrap').length,
        };
      });

      this.emitLog(`🔍 页面调试信息:`);
      this.emitLog(`   总div数: ${pageDebug.totalDivs}`);
      this.emitLog(`   素材相关div数: ${pageDebug.materialRelatedCount}`);
      this.emitLog(`   confirm-icon数: ${pageDebug.confirmIconCount}`);
      this.emitLog(`   materials-link-wrap数: ${pageDebug.materialsLinkWrapCount}`);
      this.emitLog(`   前10个素材相关元素: ${JSON.stringify(pageDebug.materialRelatedClasses, null, 2)}`);

      // 4.4.3 获取素材信息（从数据库）
      let query = this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('id', materialId);

      // 如果提供了userId,则添加user_id条件
      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: material } = await query.single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.author_name} - ${material.content_desc?.substring(0, 30)}...`);
      this.emitLog(`🖼️ 素材缩略图: ${material.thumbnail_url?.substring(0, 50)}...`);

      // 4.5 遍历所有页,根据缩略图URL匹配素材
      this.emitLog(`🔍 开始搜索匹配的视频号素材(通过缩略图URL)...`);

      let foundMaterial = false;
      let currentPage = 1;
      const maxPages = 10;

      while (!foundMaterial && currentPage <= maxPages) {
        this.emitLog(`📄 搜索第 ${currentPage} 页...`);
        await new Promise(resolve => setTimeout(resolve, 1500));

        const matchResult = await page.evaluate((targetThumbnail) => {
          const materialCards = document.querySelectorAll('.materials-link-wrap');

          for (let i = 0; i < materialCards.length; i++) {
            const card = materialCards[i];

            // 获取缩略图URL
            const imgElement = card.querySelector('[class*="img-wrap"] img');
            const thumbnailUrl = imgElement?.getAttribute('src') || '';

            // 匹配缩略图URL
            if (thumbnailUrl === targetThumbnail) {
              const confirmIcons = document.querySelectorAll('.confirm-icon');
              if (confirmIcons[i]) {
                (confirmIcons[i] as HTMLElement).click();

                // 获取作者名和描述用于日志
                const titleElement = card.querySelector('[class*="text-title"]');
                const authorName = titleElement?.getAttribute('title') || '';
                const descElement = card.querySelector('[class*="text-desc"]');
                const contentDesc = descElement?.textContent?.trim() || '';

                return { found: true, index: i, author: authorName, desc: contentDesc.substring(0, 30), thumbnail: thumbnailUrl.substring(0, 50) };
              }
            }
          }
          return { found: false, totalCards: materialCards.length };
        }, material.thumbnail_url);

        if (matchResult.found) {
          this.emitLog(`✅ 找到匹配的视频号素材: ${matchResult.author} - ${matchResult.desc}...`);
          this.emitLog(`🖼️ 缩略图匹配: ${matchResult.thumbnail}...`);
          foundMaterial = true;
          break;
        } else {
          this.emitLog(`⚠️ 第${currentPage}页未找到匹配素材 (共${matchResult.totalCards}个素材)`);

          const hasNext = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页') && !button.hasAttribute('disabled')) {
                return true;
              }
            }
            return false;
          });

          if (hasNext) {
            await page.evaluate(() => {
              const buttons = document.querySelectorAll('button');
              for (const button of buttons) {
                if (button.textContent?.includes('下一页')) {
                  (button as HTMLElement).click();
                  break;
                }
              }
            });
            currentPage++;
          } else {
            break;
          }
        }
      }

      if (!foundMaterial) {
        throw new Error(`未找到匹配的视频号素材(缩略图URL): ${material.thumbnail_url?.substring(0, 50)}...`);
      }

      this.emitLog(`✅ 已点击匹配的视频号素材对号图标`);
      await new Promise(resolve => setTimeout(resolve, 500));

      // 4.7 点击底部的"确定"按钮(点击后自动发送视频号卡片)
      // 完全按照本地测试脚本test-video-material-dialog.js的实现
      this.emitLog(`🔘 点击确定按钮...`);
      const confirmClicked = await page.evaluate(() => {
        // 1. 优先查找Element UI的成功按钮
        const successButtons = document.querySelectorAll('button.el-button--success');
        for (const button of successButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(el-button--success): "${text}"`);
            (button as HTMLElement).click();
            return true;
          }
        }

        // 2. 查找所有button元素
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
          const text = button.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(button): "${text}"`);
            (button as HTMLElement).click();
            return true;
          }
        }

        // 3. 查找span元素
        const allSpans = document.querySelectorAll('span');
        for (const span of allSpans) {
          const text = span.textContent?.trim();
          if (text === '确定' || text === '确 定') {
            console.log(`✅ 找到确定按钮(span): "${text}"`);
            (span as HTMLElement).click();
            return true;
          }
        }

        return false;
      });

      if (!confirmClicked) {
        this.emitLog(`⚠️ 未找到确定按钮,但继续执行`);
      } else {
        this.emitLog(`✅ 已点击确定按钮`);
      }

      await new Promise(resolve => setTimeout(resolve, 1500));

      this.emitLog(`✅ 视频号卡片已发送`);
      this.emitLog(`🎉 组合发送完成: ${friendName}`);
      return true;

    } catch (error) {
      this.logger.error(`组合发送给 ${friendName} 失败: ${error.message}`);
      this.emitLog(`❌ 组合发送失败: ${friendName} - ${error.message}`);
      return false;
    }
  }

  /**
   * 主执行函数：发送视频号给所有好友
   */
  async startVideoMaterialReachTask(
    materialId: number,
    additionalMessage: string,
    targetDays: number,
    userId: string,
    taskId: string,
    forbiddenTimeRanges?: Array<{startTime: string, endTime: string}>
  ): Promise<void> {
    if (this.isRunning) {
      throw new Error('已有任务正在运行中');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.currentTaskId = taskId;

    let browser: puppeteer.Browser = null;
    let page: puppeteer.Page = null;

    try {
      // 记录任务开始时间
      const startTime = new Date();
      this.emitLog('🚀 开始视频号批量发送任务');
      this.emitLog(`⏰ 任务开始时间: ${startTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      this.emitLog(`📹 素材ID: ${materialId}`);
      if (additionalMessage) {
        this.emitLog(`💬 附加文案: ${additionalMessage}`);
      }
      this.emitLog(`⏰ 目标完成时间: ${targetDays}天`);

      // 获取堆雪球账号信息
      const { data: accounts, error: accountError } = await this.supabaseService.getClient()
        .from('duixueqiu_accounts')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (accountError || !accounts || accounts.length === 0) {
        throw new Error('未找到堆雪球账号配置，请先添加账号');
      }

      const account = accounts[0];

      // 启动浏览器
      const puppeteer = require('puppeteer');
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // 登录堆雪球
      await this.loginDuixueqiu(page, account.username, account.password);

      // 等待页面加载完成
      this.emitLog('⏳ 等待页面加载...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 获取微信号列表
      const wechatAccounts = await this.getWechatAccounts(page);
      this.emitLog(`📱 找到 ${wechatAccounts.length} 个微信号`);

      // 切换到第一个微信号
      if (wechatAccounts.length > 0) {
        await this.switchWechatAccount(page, wechatAccounts[0].name);
      }

      // 点击"未分组"展开好友列表
      await this.clickUnfoldGroup(page);

      // 从数据库获取选中的好友列表
      const selectedFriends = await this.duixueqiuFriendsService.getSelectedFriends(userId);
      this.emitLog(`👥 已选中 ${selectedFriends.length} 个好友`);

      if (selectedFriends.length === 0) {
        throw new Error('未选中任何好友，请先同步并选择好友');
      }

      // 转换为friends格式
      const friends = selectedFriends.map(f => ({
        name: f.friend_name,
        remark: f.friend_remark || ''
      }));

      // 计算发送间隔
      const { baseInterval, actualInterval, dailySend } = this.calculateInterval(
        friends.length,
        wechatAccounts.length,
        targetDays
      );

      this.emitLog(`⏱️ 发送间隔: ${baseInterval.toFixed(1)}秒/人`);
      this.emitLog(`📊 预计每天发送: ${dailySend}人`);

      // 开始发送
      let successCount = 0;
      let failCount = 0;
      let skipCount = 0; // 跳过计数(重复消息)

      for (let i = 0; i < friends.length; i++) {
        // 检查是否停止
        if (!this.isRunning) {
          this.emitLog('⏹️ 任务已停止');
          break;
        }

        // 🆕 检查是否暂停
        if (this.isPaused) {
          this.emitLog('⏸️ 任务已暂停,退出发送流程');
          return; // 直接退出方法,保留currentTaskParams
        }

        // 检查是否在禁发时间段内
        if (this.isInForbiddenTime(forbiddenTimeRanges || [])) {
          await this.waitForNextSendingTime(forbiddenTimeRanges || []);
        }

        const friend = friends[i];
        const selectedFriend = selectedFriends[i]; // 获取完整的好友信息(包含friend_id)

        this.emitLog(`[${i + 1}/${friends.length}] 准备发送给: ${friend.name}`);

        // 检查是否已发送过相同消息
        const messageContent = additionalMessage && additionalMessage.trim() !== ''
          ? { materialId, additionalMessage } // 组合消息
          : { materialId }; // 纯视频号消息

        const messageType = additionalMessage && additionalMessage.trim() !== ''
          ? 'combined'
          : 'video';

        const alreadySent = await this.checkMessageSent(
          userId,
          selectedFriend.id, // 使用好友的UUID
          messageType,
          messageContent
        );

        if (alreadySent) {
          this.emitLog(`⏭️ 跳过好友: ${friend.name} (已发送过相同消息)`);
          skipCount++;
          continue; // 跳过这个好友
        }

        // 根据是否有附加文案选择发送方式
        let success = false;
        if (additionalMessage && additionalMessage.trim() !== '') {
          // 有附加文案: 先发文字,再发视频号
          success = await this.sendCombinedMessageToFriend(
            page,
            friend.name,
            additionalMessage,
            materialId,
            userId
          );
        } else {
          // 无附加文案: 只发视频号
          success = await this.sendVideoMaterialToFriend(
            page,
            friend.name,
            materialId,
            userId,
            ''
          );
        }

        if (success) {
          successCount++;
          // 记录发送历史
          await this.recordMessageSent(
            userId,
            selectedFriend.id,
            friend.name,
            messageType,
            messageContent,
            taskId
          );
        } else {
          failCount++;
        }

        // 发送进度
        this.emitProgress({
          current: i + 1,
          total: friends.length,
          successCount,
          failCount,
          progress: ((i + 1) / friends.length * 100).toFixed(1),
        });

        // 等待间隔
        if (i < friends.length - 1) {
          this.emitLog(`⏳ 等待 ${baseInterval.toFixed(1)} 秒...`);
          await new Promise(resolve => setTimeout(resolve, baseInterval * 1000));
        }
      }

      // 记录任务结束时间并计算耗时
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);
      const durationMinutes = Math.floor(durationSeconds / 60);
      const remainingSeconds = durationSeconds % 60;

      this.emitLog('');
      this.emitLog('🎉 任务完成!');
      this.emitLog(`⏰ 任务结束时间: ${endTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      this.emitLog(`⏱️ 总耗时: ${durationMinutes}分${remainingSeconds}秒 (${durationSeconds}秒)`);
      this.emitLog('');
      this.emitLog('📊 发送统计:');
      this.emitLog(`   ✅ 成功: ${successCount}人`);
      this.emitLog(`   ⏭️ 跳过(重复): ${skipCount}人`);
      this.emitLog(`   ❌ 失败: ${failCount}人`);
      this.emitLog(`   📝 总计: ${friends.length}人`);

    } catch (error) {
      this.logger.error('视频号发送任务失败:', error);
      this.emitLog(`❌ 任务失败: ${error.message}`);
      throw error;
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
      this.isRunning = false;
      this.isPaused = false;
      this.currentTaskId = null;
    }
  }

  /**
   * 主执行函数：组合发送任务
   */
  async startCombinedReachTask(
    contents: Array<{
      type: 'text' | 'video' | 'link' | 'image';
      message?: string;
      materialId?: number;
      imageUrls?: string[];
    }>,
    targetDays: number,
    userId: string,
    taskId: string,
    forbiddenTimeRanges?: Array<{startTime: string, endTime: string}>,
    selectedWechatAccountIndexes?: number[],
    selectedFriendIds?: string[], // 选中的好友ID列表
    randomDelay?: { enabled: boolean; minDelay?: number; maxDelay?: number } // 🆕 随机延迟配置
  ): Promise<void> {
    // 🐛 调试:通过WebSocket发送userId到前端
    this.emitLog(`🐛 DEBUG: userId=${userId}, 类型=${typeof userId}`);

    // 🆕 记录随机延迟配置
    if (randomDelay?.enabled) {
      this.emitLog(`⏱️ 随机延迟已启用: ${randomDelay.minDelay || 3}-${randomDelay.maxDelay || 10}秒`);
    }

    if (this.isRunning) {
      throw new Error('已有任务正在运行中');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.currentTaskId = taskId;

    // 🆕 保存任务参数,用于暂停后继续
    this.currentTaskParams = {
      taskType: 'combined',
      contents,
      targetDays,
      userId,
      taskId,
      forbiddenTimeRanges,
      selectedWechatAccountIndexes,
      selectedFriendIds
    };

    let browser: puppeteer.Browser = null;
    let page: puppeteer.Page = null;

    try {
      // 记录任务开始时间
      const startTime = new Date();
      this.emitLog('🚀 开始组合发送任务');
      this.emitLog(`⏰ 任务开始时间: ${startTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      this.emitLog(`📋 内容类型: ${contents.map(c => c.type).join(', ')}`);
      this.emitLog(`⏰ 目标完成时间: ${targetDays}天`);

      // 获取堆雪球账号信息
      const { data: accounts, error: accountError } = await this.supabaseService.getClient()
        .from('duixueqiu_accounts')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (accountError || !accounts || accounts.length === 0) {
        throw new Error('未找到堆雪球账号配置，请先添加账号');
      }

      const account = accounts[0];

      // 启动浏览器
      const puppeteer = require('puppeteer');

      // 从环境变量读取headless配置,默认为true(无头模式)
      // 设置PUPPETEER_HEADLESS=false可以显示浏览器窗口
      const headless = process.env.PUPPETEER_HEADLESS !== 'false';
      this.emitLog(`🖥️  浏览器模式: ${headless ? '无头模式(后台运行)' : '有头模式(显示窗口)'}`);

      const launchOptions: any = {
        headless: headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      };

      // 如果是有头模式,添加额外的配置确保窗口显示
      if (!headless) {
        launchOptions.args.push(
          '--start-maximized',  // 最大化窗口
          '--window-size=1920,1080',
        );
        launchOptions.dumpio = true; // 输出浏览器进程的stdout和stderr
        launchOptions.devtools = false; // 不自动打开开发者工具
        this.emitLog('🖥️  有头模式: 浏览器窗口应该会显示在屏幕上');
      }

      browser = await puppeteer.launch(launchOptions);
      this.emitLog('✅ Puppeteer浏览器已启动');

      page = await browser.newPage();
      this.emitLog('✅ 新页面已创建');

      // 设置默认超时时间为5分钟,避免页面加载慢导致超时
      page.setDefaultNavigationTimeout(300000); // 5分钟
      page.setDefaultTimeout(300000); // 5分钟
      this.emitLog('✅ 已设置默认超时时间为300秒(5分钟)');

      await page.setViewport({ width: 1920, height: 1080 });
      this.emitLog('✅ 视口已设置');

      // 登录堆雪球
      await this.loginDuixueqiu(page, account.username, account.password);

      // 等待页面加载完成
      this.emitLog('⏳ 等待页面加载...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 获取微信号列表
      const allWechatAccounts = await this.getWechatAccounts(page);
      this.emitLog(`📱 找到 ${allWechatAccounts.length} 个微信号`);

      // 根据选中的索引筛选微信号
      let wechatAccounts = allWechatAccounts;
      if (selectedWechatAccountIndexes && selectedWechatAccountIndexes.length > 0) {
        wechatAccounts = allWechatAccounts.filter(account =>
          selectedWechatAccountIndexes.includes(account.index)
        );
        this.emitLog(`📱 已选中 ${wechatAccounts.length} 个微信号: ${wechatAccounts.map(a => a.name).join(', ')}`);
      } else {
        this.emitLog(`📱 使用所有微信号 (${wechatAccounts.length}个)`);
      }

      if (wechatAccounts.length === 0) {
        throw new Error('没有可用的微信号，请检查选择');
      }

      // 点击"未分组"展开好友列表
      await this.clickUnfoldGroup(page);

      // 从数据库获取选中的好友列表
      let selectedFriends: any[];

      if (selectedFriendIds && selectedFriendIds.length > 0) {
        // 如果前端传递了好友ID列表,使用这个列表
        this.emitLog(`📋 使用前端传递的好友ID列表 (${selectedFriendIds.length}个)`);

        // Supabase的.in()方法有限制,通常不能超过1000个值
        // 所以需要分批查询
        const batchSize = 1000;
        const batches = [];
        for (let i = 0; i < selectedFriendIds.length; i += batchSize) {
          batches.push(selectedFriendIds.slice(i, i + batchSize));
        }

        this.emitLog(`📋 分成 ${batches.length} 批查询,每批最多 ${batchSize} 个好友`);

        selectedFriends = [];
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          this.emitLog(`📋 查询第 ${i + 1}/${batches.length} 批 (${batch.length}个好友)...`);

          const { data, error } = await this.supabaseService.getClient()
            .from('duixueqiu_friends')
            .select('*')
            .eq('user_id', userId)
            .in('id', batch);

          if (error) {
            throw new Error(`获取好友信息失败(第${i + 1}批): ${error.message}`);
          }

          selectedFriends.push(...(data || []));
        }

        this.emitLog(`✅ 查询完成,共获取 ${selectedFriends.length} 个好友信息`);
      } else {
        // 否则使用数据库中is_selected=true的好友
        this.emitLog(`📋 使用数据库中is_selected=true的好友`);
        selectedFriends = await this.duixueqiuFriendsService.getSelectedFriends(userId);
      }

      this.emitLog(`👥 已选中 ${selectedFriends.length} 个好友`);

      // 输出选中的好友名单
      this.emitLog(`📋 选中的好友名单:`);
      for (const friend of selectedFriends) {
        const friendName = friend.friend_remark || friend.friend_name;
        this.emitLog(`  - ${friendName} (${friend.wechat_account_name})`);
      }

      if (selectedFriends.length === 0) {
        throw new Error('未选中任何好友，请先同步并选择好友');
      }

      // 按微信号分组好友
      const friendsByAccount = new Map<string, any[]>();
      for (const friend of selectedFriends) {
        const accountName = friend.wechat_account_name;
        if (!friendsByAccount.has(accountName)) {
          friendsByAccount.set(accountName, []);
        }
        friendsByAccount.get(accountName)!.push(friend);
      }

      this.emitLog(`📱 好友分布在 ${friendsByAccount.size} 个微信号中`);
      for (const [accountName, accountFriends] of friendsByAccount.entries()) {
        this.emitLog(`  - ${accountName}: ${accountFriends.length}个好友`);
      }

      // 计算总好友数 - 只计算选中微信号下的好友
      let totalFriends = 0;
      for (const wechatAccount of wechatAccounts) {
        const accountFriends = friendsByAccount.get(wechatAccount.name);
        if (accountFriends && accountFriends.length > 0) {
          totalFriends += accountFriends.length;
        }
      }

      this.emitLog(`📊 本次任务将发送给 ${totalFriends} 个好友 (来自 ${wechatAccounts.length} 个微信号)`);

      // 计算发送间隔
      const { baseInterval, dailySend } = this.calculateInterval(
        totalFriends,
        wechatAccounts.length,
        targetDays
      );

      this.emitLog(`⏱️ 发送间隔: ${baseInterval.toFixed(1)}秒/人`);
      this.emitLog(`📊 预计每天发送: ${dailySend}人`);

      // 开始按微信号分组发送
      let successCount = 0;
      let failCount = 0;
      let skipCount = 0; // 跳过计数(重复消息)
      let processedCount = 0;

      // 遍历用户选择的微信号
      for (const wechatAccount of wechatAccounts) {
        // 检查是否停止
        if (!this.isRunning) {
          this.emitLog('⏹️ 任务已停止');
          break;
        }

        // 获取该微信号下的好友
        const accountFriends = friendsByAccount.get(wechatAccount.name);

        // 如果该微信号下没有选中的好友,跳过
        if (!accountFriends || accountFriends.length === 0) {
          this.emitLog(`⚠️ 微信号 ${wechatAccount.name} 下没有选中的好友,跳过`);
          continue;
        }

        this.emitLog(`📱 切换到微信号: ${wechatAccount.name} (${accountFriends.length}个好友)`);

        // 切换到当前微信号
        await this.switchWechatAccount(page, wechatAccount.name);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 遍历该微信号下的好友
        for (const friend of accountFriends) {
          // 检查是否停止
          if (!this.isRunning) {
            this.emitLog('⏹️ 任务已停止');
            break;
          }

          // 🆕 检查是否暂停
          if (this.isPaused) {
            this.emitLog('⏸️ 任务已暂停,退出发送流程');
            return; // 直接退出方法,保留currentTaskParams
          }

          // 检查是否在禁发时间段内
          if (this.isInForbiddenTime(forbiddenTimeRanges || [])) {
            await this.waitForNextSendingTime(forbiddenTimeRanges || []);
          }

          processedCount++;
          const friendName = friend.friend_remark || friend.friend_name;
          this.emitLog(`[${processedCount}/${totalFriends}] 准备发送给: ${friendName}`);

          // 🆕 检查所有类型是否都已发送过
          let allTypesSent = true;
          for (const content of contents) {
            let messageContentObj: any;
            switch (content.type) {
              case 'text':
                messageContentObj = { text: content.message };
                break;
              case 'video':
                messageContentObj = { materialId: content.materialId };
                break;
              case 'link':
                messageContentObj = { materialId: content.materialId };
                break;
              case 'image':
                messageContentObj = { imageUrls: content.imageUrls };
                break;
            }

            // 🐛 调试:打印检查参数
            this.emitLog(`🐛 检查重复: userId=${userId}, friendId=${friend.id}, type=${content.type}`);

            const typeSent = await this.checkMessageSent(
              userId,
              friend.id,
              content.type,
              messageContentObj
            );

            if (!typeSent) {
              allTypesSent = false;
              break; // 只要有一个类型未发送,就不跳过
            }
          }

          if (allTypesSent) {
            this.emitLog(`⏭️ 跳过好友: ${friendName} (所有类型都已发送过)`);
            skipCount++;
            continue; // 跳过这个好友
          }

          // 🐛 调试日志:打印调用sendCombinedContents的参数
          this.logger.log(`🐛 调用sendCombinedContents: friendName=${friendName}, friendId=${friend.id}, userId=${userId}`);

          // 🆕 组合发送(传递friendId参数和randomDelay参数)
          const success = await this.sendCombinedContents(page, friendName, friend.id, contents, userId, randomDelay);

          if (success) {
            // 🆕 不再记录combined类型的历史,因为每种类型已经在sendCombinedContents中记录了
            successCount++;
          } else {
            failCount++;
          }

          // 发送进度
          this.emitProgress({
            current: processedCount,
            total: totalFriends,
            successCount,
            failCount,
            progress: ((processedCount) / totalFriends * 100).toFixed(1),
          });

          // ✅ 智能等待: 检测上一个好友的操作是否完成(检测搜索框是否可用)
          if (processedCount < totalFriends) {
            this.emitLog(`⏳ 智能检测: 等待准备发送下一个好友...`);
            await page.waitForFunction(() => {
              const searchInput = document.querySelector('input[placeholder="搜索"]') as HTMLInputElement;
              return searchInput && !searchInput.disabled;
            }, { timeout: 2000 }).catch(() => {
              this.emitLog(`⚠️ 搜索框未在2秒内准备好,继续执行`);
            });
          }
        }
      }

      // 记录任务结束时间并计算耗时
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);
      const durationMinutes = Math.floor(durationSeconds / 60);
      const remainingSeconds = durationSeconds % 60;

      this.emitLog('');
      this.emitLog('🎉 任务完成!');
      this.emitLog(`⏰ 任务结束时间: ${endTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      this.emitLog(`⏱️ 总耗时: ${durationMinutes}分${remainingSeconds}秒 (${durationSeconds}秒)`);
      this.emitLog('');
      this.emitLog('📊 发送统计:');
      this.emitLog(`   ✅ 成功: ${successCount}人`);
      this.emitLog(`   ⏭️ 跳过(重复): ${skipCount}人`);
      this.emitLog(`   ❌ 失败: ${failCount}人`);
      this.emitLog(`   📝 总计: ${totalFriends}人`);

    } catch (error) {
      this.logger.error('组合发送任务失败:', error);
      this.emitLog(`❌ 任务失败: ${error.message}`);
      throw error;
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
      // 🆕 只有在非暂停状态下才重置isRunning和isPaused
      // 如果是暂停退出,保持isPaused=true,以便恢复功能正常工作
      if (!this.isPaused) {
        this.isRunning = false;
        this.currentTaskId = null;
      }
    }
  }

  /**
   * 发送私聊消息给多个好友(使用搜索框,更快更准确)
   */
  async sendPrivateMessages(params: {
    userId: string;
    friendIds: string[]; // 选中的好友ID列表
    messageType: 'text' | 'video' | 'link';
    messageContent: string; // 文字内容或附加文案
    materialId?: string; // 视频号或链接素材ID
  }): Promise<void> {
    const { userId, friendIds, messageType, messageContent, materialId } = params;

    let browser: any = null;
    let page: any = null;

    try {
      this.isRunning = true;
      this.isPaused = false;

      // 保存任务参数,用于暂停后继续
      this.currentTaskParams = { userId, friendIds, messageType, messageContent, materialId };

      this.emitLog('🚀 开始发送私聊消息...');

      // 1. 从数据库获取好友信息
      const { data: friends, error: friendsError } = await this.supabaseService
        .getClient()
        .from('duixueqiu_friends')
        .select('*')
        .in('id', friendIds)
        .eq('user_id', userId);

      if (friendsError || !friends || friends.length === 0) {
        throw new Error('未找到选中的好友');
      }

      this.emitLog(`📋 准备发送给 ${friends.length} 个好友`);

      // 2. 获取堆雪球账号配置
      const { data: accounts, error: accountError } = await this.supabaseService
        .getClient()
        .from('duixueqiu_accounts')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (accountError || !accounts || accounts.length === 0) {
        throw new Error('未找到堆雪球账号配置，请先添加账号');
      }

      const account = accounts[0];

      // 3. 启动浏览器并登录的函数(支持重新登录)
      const initBrowserAndLogin = async () => {
        const puppeteer = require('puppeteer');
        browser = await puppeteer.launch({
          headless: false, // 本地测试使用非无头模式
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        });
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // 保存到实例变量
        this.currentBrowser = browser;
        this.currentPage = page;

        // 登录堆雪球
        this.emitLog('🔐 登录堆雪球...');
        await this.loginDuixueqiu(page, account.username, account.password);
        await new Promise(resolve => setTimeout(resolve, 3000));

        return { browser, page };
      };

      // 首次启动浏览器并登录
      await initBrowserAndLogin();

      // 5. 点击"好友列表"标签
      this.emitLog('📋 切换到好友列表...');
      await page.evaluate(() => {
        const divs = document.querySelectorAll('div');
        for (const div of divs) {
          if (div.textContent?.trim() === '好友列表' && div.getAttribute('title') === '好友列表') {
            (div as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 6. 获取所有微信号
      const wechatAccounts = await this.getWechatAccounts(page);
      this.emitLog(`📱 找到 ${wechatAccounts.length} 个微信号`);

      // 7. 按微信号分组好友
      const friendsByAccount = new Map<string, any[]>();
      for (const friend of friends) {
        const accountName = friend.wechat_account_name;
        if (!friendsByAccount.has(accountName)) {
          friendsByAccount.set(accountName, []);
        }
        friendsByAccount.get(accountName)!.push(friend);
      }

      this.emitLog(`📊 好友分布在 ${friendsByAccount.size} 个微信号中`);

      // 8. 遍历每个微信号
      let successCount = 0;
      let failCount = 0;
      let skipCount = 0;
      let totalProcessed = 0;

      for (const [accountName, accountFriends] of friendsByAccount.entries()) {
        this.emitLog(`📱 切换到微信号: ${accountName}`);

        // 选择微信号
        await this.switchWechatAccount(page, accountName);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 9. 遍历该微信号下的好友
        for (const friend of accountFriends) {
          // 检查是否停止
          if (!this.isRunning) {
            this.emitLog('⏹️ 任务已停止');
            break;
          }

          // 🆕 检查是否暂停
          if (this.isPaused) {
            this.emitLog('⏸️ 任务已暂停,退出发送流程');
            return; // 直接退出方法,保留currentTaskParams
          }

          totalProcessed++;
          this.emitLog(`👤 [${totalProcessed}/${friends.length}] 准备发送给: ${friend.friend_name}`);

          // 9.1 构造消息内容对象(用于检查和记录)
          let messageContentObj: any;
          if (messageType === 'text') {
            messageContentObj = { text: messageContent };
          } else if (messageType === 'video') {
            messageContentObj = { materialId: parseInt(materialId || '0'), additionalMessage: '' };
          } else if (messageType === 'link') {
            messageContentObj = { materialId: parseInt(materialId || '0'), additionalMessage: '' };
          }

          // 9.2 检查是否已发送过相同消息
          const alreadySent = await this.checkMessageSent(
            userId,
            friend.id, // 使用好友的UUID
            messageType,
            messageContentObj
          );

          if (alreadySent) {
            this.emitLog(`⏭️ 跳过好友: ${friend.friend_name} (已发送过相同消息)`);
            skipCount++;
            continue; // 跳过这个好友
          }

          // 10. 发送消息
          let success = false;
          let skipped = false; // 标记是否跳过
          try {
            const personalizedContent = messageContent.replace(/{昵称}/g, friend.friend_name);

            if (messageType === 'text') {
              // 发送文字消息 - 使用搜索方式
              // 10.1 搜索并点击好友
              const found = await this.searchAndClickFriend(page, friend.friend_name, userId);

              if (!found) {
                // 未找到好友,跳过
                this.emitLog(`⏭️ 跳过好友: ${friend.friend_name} (未找到)`);
                skipCount++;
                skipped = true;
              } else {
                // 10.2 输入消息
                await page.type('#editArea', personalizedContent);
                await new Promise(resolve => setTimeout(resolve, 500));

                // 10.3 点击发送按钮
                await page.click('.send-btn');
                await new Promise(resolve => setTimeout(resolve, 500));

                // 10.4 返回好友列表
                await page.goBack();
                await new Promise(resolve => setTimeout(resolve, 1000));

                success = true;
              }
            } else if (messageType === 'video' && materialId) {
              // 发送视频号消息 - sendVideoMaterialToFriend内部会查找好友
              success = await this.sendVideoMaterialToFriend(page, friend.friend_name, parseInt(materialId), userId);
            } else if (messageType === 'link' && materialId) {
              // 发送链接消息 - sendLinkMaterialToFriend内部会查找好友
              success = await this.sendLinkMaterialToFriend(page, friend.friend_name, parseInt(materialId), userId);
            }

            if (success) {
              this.emitLog(`✅ 已发送给: ${friend.friend_name}`);
              successCount++;

              // 10.5 记录发送历史
              await this.recordMessageSent(
                userId,
                friend.id,
                friend.friend_name,
                messageType,
                messageContentObj
              );
            } else if (!skipped) {
              // 只有不是跳过的情况才计入失败
              this.emitLog(`❌ 发送失败: ${friend.friend_name}`);
              failCount++;
            }
          } catch (error) {
            this.emitLog(`❌ 发送失败: ${friend.friend_name} - ${error.message}`);
            failCount++;
          }

          // 发送进度
          this.emitProgress({
            current: totalProcessed,
            total: friends.length,
            successCount,
            failCount,
            skipCount,
            progress: (totalProcessed / friends.length * 100).toFixed(1),
          });

          // 13. 间隔控制(3秒)
          if (totalProcessed < friends.length) {
            this.emitLog(`⏳ 等待 3 秒...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        if (!this.isRunning) break;
      }

      this.emitLog('🎉 任务完成!');
      this.emitLog(`✅ 成功: ${successCount}人`);
      this.emitLog(`⏭️ 跳过: ${skipCount}人 (已发送过或未找到)`);
      this.emitLog(`❌ 失败: ${failCount}人`);

    } catch (error) {
      this.logger.error('发送私聊消息失败:', error);
      this.emitLog(`❌ 任务失败: ${error.message}`);
      throw error;
    } finally {
      // 清理资源
      try {
        if (page) await page.close();
        if (browser) await browser.close();
      } catch (error) {
        this.logger.error('关闭浏览器失败:', error);
      }

      // 清空实例变量
      this.currentBrowser = null;
      this.currentPage = null;

      // 只有在任务完全结束时才清空任务参数和运行状态
      // 如果是暂停状态,保留任务参数和运行状态以便继续
      if (!this.isPaused) {
        this.currentTaskParams = null;
        this.isRunning = false;
      } else {
        // 暂停状态下,保持isRunning=true,以便恢复时继续
        this.logger.log('⏸️ 暂停状态,保留任务参数和运行状态');
      }
    }
  }

}

