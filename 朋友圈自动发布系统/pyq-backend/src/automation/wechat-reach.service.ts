import { Injectable, Logger } from '@nestjs/common';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { SupabaseService } from '../common/supabase.service';
import { AutomationGateway } from './automation.gateway';
import { DuixueqiuFriendsService } from './duixueqiu-friends.service';
import * as puppeteer from 'puppeteer';

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

    // 访问客服端登录页面
    await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', { waitUntil: 'networkidle2' });

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

    // 等待导航完成
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

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
   * 通过搜索框查找并点击指定好友(新方法 - 更快更准确)
   */
  private async searchAndClickFriend(page: puppeteer.Page, friendName: string): Promise<boolean> {
    this.emitLog(`🔍 搜索好友: ${friendName}...`);

    try {
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

      // 2. 输入好友昵称
      const searchInput = await page.$('input[placeholder="昵称/备注/标签"]');
      if (!searchInput) {
        this.emitLog(`❌ 未找到搜索框`);
        return false;
      }

      await searchInput.click();
      await new Promise(resolve => setTimeout(resolve, 200));
      await searchInput.type(friendName);
      this.emitLog(`⌨️ 已输入搜索关键词: ${friendName}`);

      // 3. 等待搜索结果
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. 点击搜索结果中的好友
      const clicked = await page.evaluate((name) => {
        // 查找所有好友元素
        const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');

        for (const el of friendElements) {
          const text = el.textContent?.trim() || '';

          // 精确匹配好友昵称
          if (text === name || text.includes(name)) {
            (el as HTMLElement).click();
            return { success: true, clickedText: text };
          }
        }

        return { success: false, clickedText: '' };
      }, friendName);

      if (clicked.success) {
        this.emitLog(`✅ 找到并点击好友: ${clicked.clickedText}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      } else {
        this.emitLog(`❌ 未找到好友: ${friendName}`);
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
      const finalMessage = message.replace(/\{昵称\}/g, friendName);

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

      await new Promise(resolve => setTimeout(resolve, 1000));

      // 点击发送按钮
      await page.click('.send-btn');
      await new Promise(resolve => setTimeout(resolve, 500));

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

          // 检查是否暂停
          while (this.isPaused && this.isRunning) {
            await new Promise(resolve => setTimeout(resolve, 1000));
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
   * 暂停任务
   */
  pauseTask(): void {
    this.isPaused = true;
    this.emitLog('⏸️ 任务已暂停');
  }

  /**
   * 恢复任务
   */
  resumeTask(): void {
    this.isPaused = false;
    this.emitLog('▶️ 任务已恢复');
  }

  /**
   * 停止任务
   */
  stopTask(): void {
    this.isRunning = false;
    this.isPaused = false;
    this.emitLog('⏹️ 任务已停止');
  }

  /**
   * 获取任务状态
   */
  getTaskStatus(): { isRunning: boolean; isPaused: boolean } {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused
    };
  }

  /**
   * 发送视频号素材给好友
   */
  private async sendVideoMaterialToFriend(
    page: puppeteer.Page,
    friendName: string,
    materialId: number,
    additionalMessage?: string
  ): Promise<boolean> {
    try {
      this.emitLog(`📹 开始发送视频号给: ${friendName}`);

      // 1. 搜索并点击好友打开聊天窗口(使用搜索方式,更快)
      const friendFound = await this.searchAndClickFriend(page, friendName);
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
      const { data: material } = await this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.author_name} - ${material.content_desc?.substring(0, 30)}...`);
      this.emitLog(`📍 素材位置: 第${material.page_number}页, 索引${material.material_index}`);

      // 6. 如果素材不在第1页，需要翻页
      if (material.page_number > 1) {
        for (let i = 1; i < material.page_number; i++) {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页')) {
                (button as HTMLElement).click();
                break;
              }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 7. 点击第N个素材的对号图标(confirm-icon)
      this.emitLog(`📌 点击第 ${material.material_index + 1} 个素材的对号图标...`);

      // 7.1 先检查页面上有多少个对号图标
      const debugInfo = await page.evaluate(() => {
        return {
          confirmIconCount: document.querySelectorAll('.confirm-icon').length,
          materialsLinkWrapCount: document.querySelectorAll('.materials-link-wrap').length,
          allMaterialClasses: Array.from(document.querySelectorAll('[class*="material"]'))
            .slice(0, 5)
            .map(el => el.className),
        };
      });

      this.emitLog(`🔍 调试信息: confirm-icon=${debugInfo.confirmIconCount}, materials-link-wrap=${debugInfo.materialsLinkWrapCount}`);
      this.emitLog(`� 素材相关class: ${JSON.stringify(debugInfo.allMaterialClasses)}`);

      const clicked = await page.evaluate((index) => {
        // 查找所有对号图标
        const confirmIcons = document.querySelectorAll('.confirm-icon');
        console.log(`找到 ${confirmIcons.length} 个对号图标`);

        if (confirmIcons[index]) {
          console.log(`点击第 ${index + 1} 个对号图标`);
          (confirmIcons[index] as HTMLElement).click();
          return { success: true, count: confirmIcons.length };
        }

        return { success: false, count: confirmIcons.length };
      }, material.material_index);

      if (!clicked.success) {
        throw new Error(`未找到第 ${material.material_index + 1} 个对号图标 (页面上共有 ${clicked.count} 个)`);
      }

      this.emitLog(`✅ 已点击对号图标 (页面上共 ${clicked.count} 个)`);
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
      await new Promise(resolve => setTimeout(resolve, 500));

      // 2. 点击"视频号素材" - 使用鼠标模拟点击
      this.emitLog('📹 点击"视频号素材"选项...');

      // 等待素材菜单完全展开
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

      // 移动鼠标到元素位置并点击
      await page.mouse.move(videoMaterialPosition.x, videoMaterialPosition.y);
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.mouse.click(videoMaterialPosition.x, videoMaterialPosition.y);

      this.emitLog('✅ 已点击"视频号素材"选项');

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
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (!material) {
        throw new Error('素材不存在');
      }

      this.emitLog(`📋 素材信息: ${material.author_name} - ${material.content_desc?.substring(0, 30)}...`);
      this.emitLog(`📍 素材位置: 第${material.page_number}页, 索引${material.material_index}`);

      // 6. 如果素材不在第1页，需要翻页
      if (material.page_number > 1) {
        for (let i = 1; i < material.page_number; i++) {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页')) {
                (button as HTMLElement).click();
                break;
              }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 7. 点击第N个素材的对号图标
      this.emitLog(`📌 点击第 ${material.material_index + 1} 个素材的对号图标...`);

      const clicked = await page.evaluate((index) => {
        const confirmIcons = document.querySelectorAll('.confirm-icon');
        if (confirmIcons[index]) {
          (confirmIcons[index] as HTMLElement).click();
          return { success: true, count: confirmIcons.length };
        }
        return { success: false, count: confirmIcons.length };
      }, material.material_index);

      if (!clicked.success) {
        throw new Error(`未找到第 ${material.material_index + 1} 个对号图标`);
      }

      this.emitLog(`✅ 已点击对号图标`);
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
    additionalMessage?: string
  ): Promise<boolean> {
    try {
      this.emitLog(`🔗 开始发送链接给: ${friendName}`);

      // 1. 搜索并点击好友打开聊天窗口(使用搜索方式,更快)
      const friendFound = await this.searchAndClickFriend(page, friendName);
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
      this.emitLog(`📍 素材位置: 第${material.page_number}页, 索引${material.material_index}`);

      // 6. 如果素材不在第1页，需要翻页
      if (material.page_number > 1) {
        for (let i = 1; i < material.page_number; i++) {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页')) {
                (button as HTMLElement).click();
                break;
              }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 7. 点击第N个素材的对号图标(confirm-icon)
      this.emitLog(`📌 点击第 ${material.material_index + 1} 个素材的对号图标...`);

      // 7.1 先检查页面上有多少个对号图标
      const debugInfo = await page.evaluate(() => {
        return {
          confirmIconCount: document.querySelectorAll('.confirm-icon').length,
          materialsLinkWrapCount: document.querySelectorAll('.materials-link-wrap').length,
          allMaterialClasses: Array.from(document.querySelectorAll('[class*="material"]'))
            .slice(0, 5)
            .map(el => el.className),
        };
      });

      this.emitLog(`🔍 调试信息: confirm-icon=${debugInfo.confirmIconCount}, materials-link-wrap=${debugInfo.materialsLinkWrapCount}`);
      this.emitLog(`📦 素材相关class: ${JSON.stringify(debugInfo.allMaterialClasses)}`);

      const clicked = await page.evaluate((index) => {
        // 查找所有对号图标
        const confirmIcons = document.querySelectorAll('.confirm-icon');
        console.log(`找到 ${confirmIcons.length} 个对号图标`);

        if (confirmIcons[index]) {
          console.log(`点击第 ${index + 1} 个对号图标`);
          (confirmIcons[index] as HTMLElement).click();
          return { success: true, count: confirmIcons.length };
        }

        return { success: false, count: confirmIcons.length };
      }, material.material_index);

      if (!clicked.success) {
        throw new Error(`未找到第 ${material.material_index + 1} 个对号图标 (页面上共有 ${clicked.count} 个)`);
      }

      this.emitLog(`✅ 已点击对号图标 (页面上共 ${clicked.count} 个)`);
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
      this.emitLog(`📍 素材位置: 第${material.page_number}页, 索引${material.material_index}`);

      // 6. 如果素材不在第1页，需要翻页
      if (material.page_number > 1) {
        for (let i = 1; i < material.page_number; i++) {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页')) {
                (button as HTMLElement).click();
                break;
              }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 7. 点击第N个素材的对号图标
      this.emitLog(`📌 点击第 ${material.material_index + 1} 个素材的对号图标...`);

      const clicked = await page.evaluate((index) => {
        const confirmIcons = document.querySelectorAll('.confirm-icon');
        if (confirmIcons[index]) {
          (confirmIcons[index] as HTMLElement).click();
          return { success: true, count: confirmIcons.length };
        }
        return { success: false, count: confirmIcons.length };
      }, material.material_index);

      if (!clicked.success) {
        throw new Error(`未找到第 ${material.material_index + 1} 个对号图标`);
      }

      this.emitLog(`✅ 已点击对号图标`);
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
    imageBase64Array: string[]
  ): Promise<boolean> {
    const fs = require('fs');
    const path = require('path');
    const localImagePaths: string[] = [];

    try {
      this.emitLog(`🖼️ 开始发送图片给: ${friendName} (共${imageBase64Array.length}张)`);

      // 1. 滚动查找并点击好友打开聊天窗口
      const friendFound = await this.findAndClickFriend(page, friendName);
      if (!friendFound) {
        throw new Error(`未找到好友: ${friendName}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. 转换Base64为本地临时文件
      this.emitLog(`📥 处理图片数据...`);
      for (let i = 0; i < imageBase64Array.length; i++) {
        const imageBase64 = imageBase64Array[i];
        const matches = imageBase64.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
        if (matches) {
          const ext = matches[1] === 'jpg' ? 'jpg' : matches[1];
          const base64Data = matches[2];
          const buffer = Buffer.from(base64Data, 'base64');
          const localPath = path.join(process.cwd(), `temp_chat_image_${Date.now()}_${i}.${ext}`);
          fs.writeFileSync(localPath, buffer);
          localImagePaths.push(localPath);
          this.emitLog(`✅ 图片 ${i + 1} 已保存到本地`);
        } else {
          this.emitLog(`⚠️ 图片 ${i + 1} 格式不正确,跳过`);
        }
      }

      if (localImagePaths.length === 0) {
        throw new Error('没有有效的图片可以发送');
      }

      // 4. 点击"文件"按钮
      this.emitLog('📁 点击"文件"按钮...');
      const fileButtonClicked = await page.evaluate(() => {
        // 查找title="文件"的元素
        const allElements = document.querySelectorAll('[title="文件"]');
        for (const el of allElements) {
          (el as HTMLElement).click();
          console.log('✅ 已点击"文件"按钮');
          return true;
        }
        return false;
      });

      if (!fileButtonClicked) {
        throw new Error('未找到"文件"按钮');
      }

      // 等待文件上传对话框出现
      this.emitLog('⏳ 等待文件上传对话框出现...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 5. 等待并查找文件上传输入框
      this.emitLog(`📤 开始上传 ${localImagePaths.length} 张图片...`);
      try {
        await page.waitForSelector('input[type="file"]', { timeout: 5000 });
        this.emitLog('✅ 找到文件上传输入框');
      } catch (error) {
        this.emitLog('⚠️ 等待文件上传输入框超时,尝试直接查找...');
      }

      const fileInput = await page.$('input[type="file"]');
      if (!fileInput) {
        throw new Error('未找到文件上传输入框');
      }

      // 6. 上传图片文件
      this.emitLog(`📁 选择 ${localImagePaths.length} 张图片文件...`);
      await fileInput.uploadFile(...localImagePaths);
      this.emitLog('✅ 文件已选择');

      // 7. 智能等待图片上传完成
      this.emitLog('⏳ 等待图片上传完成...');
      try {
        // 方法1: 检查文件input的files属性
        await page.waitForFunction(
          (expectedCount) => {
            const fileInputs = document.querySelectorAll('input[type="file"]');
            for (const input of fileInputs) {
              const files = (input as HTMLInputElement).files;
              if (files && files.length >= expectedCount) {
                return true;
              }
            }
            return false;
          },
          { timeout: 10000 },
          localImagePaths.length
        );
        this.emitLog('✅ 图片文件已选择(动态检测)');
      } catch (error) {
        this.emitLog('⚠️ 动态检测超时,使用固定等待...');
      }

      // 额外等待图片处理完成
      const estimatedTime = Math.max(3000, localImagePaths.length * 2000); // 每张图片至少2秒
      this.emitLog(`⏳ 等待图片处理完成 (预计${estimatedTime / 1000}秒)...`);
      await new Promise(resolve => setTimeout(resolve, estimatedTime));

      // 8. 点击"确定"按钮发送
      // 完全按照本地测试脚本test-video-material-dialog.js的实现
      this.emitLog('🔘 点击确定按钮发送...');
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
  private async sendCombinedContents(
    page: puppeteer.Page,
    friendName: string,
    contents: Array<{
      type: 'text' | 'video' | 'link' | 'image';
      message?: string;
      materialId?: number;
      imageUrls?: string[];
    }>
  ): Promise<boolean> {
    try {
      this.emitLog(`🎯 开始组合发送给: ${friendName}`);

      // 1. 先搜索并打开聊天窗口(只打开一次)
      this.emitLog(`👤 搜索并打开聊天窗口: ${friendName}`);
      const friendFound = await this.searchAndClickFriend(page, friendName);
      if (!friendFound) {
        throw new Error(`未找到好友: ${friendName}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. 按照优先级排序: 文字优先,其他的无所谓
      const sortedContents = [...contents].sort((a, b) => {
        if (a.type === 'text') return -1;
        if (b.type === 'text') return 1;
        return 0;
      });

      // 3. 逐个发送(不再重新打开聊天窗口)
      for (let i = 0; i < sortedContents.length; i++) {
        const content = sortedContents[i];

        switch (content.type) {
          case 'text':
            this.emitLog(`💬 发送文字消息...`);
            this.emitLog(`📝 文字消息内容长度: ${content.message?.length || 0}字符`);
            this.emitLog(`📝 文字消息前100字符: ${content.message?.substring(0, 100) || '(空)'}`);
            const textSuccess = await this.sendMessageToFriendDirect(page, friendName, content.message);
            if (!textSuccess) {
              this.emitLog(`⚠️ 文字消息发送失败,继续发送其他内容`);
            }
            break;

          case 'video':
            this.emitLog(`📹 发送视频号素材...`);
            const videoSuccess = await this.sendVideoMaterialDirect(page, content.materialId);
            if (!videoSuccess) {
              this.emitLog(`⚠️ 视频号素材发送失败,继续发送其他内容`);
            }
            break;

          case 'link':
            this.emitLog(`🔗 发送链接素材...`);
            const linkSuccess = await this.sendLinkMaterialDirect(page, content.materialId);
            if (!linkSuccess) {
              this.emitLog(`⚠️ 链接素材发送失败,继续发送其他内容`);
            }
            break;

          case 'image':
            this.emitLog(`🖼️ 发送图片...`);
            const imageSuccess = await this.sendImageToFriend(page, friendName, content.imageUrls);
            if (!imageSuccess) {
              this.emitLog(`⚠️ 图片发送失败,继续发送其他内容`);
            }
            break;
        }

        // 每种类型之间间隔2秒
        if (i < sortedContents.length - 1) {
          this.emitLog(`⏳ 等待2秒后发送下一个内容...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      this.emitLog(`✅ 组合发送完成: ${friendName}`);
      return true;

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
    materialId: number
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
      const { data: material } = await this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('id', materialId)
        .single();

      if (!material) {
        throw new Error('素材不存在');
      }

      // 4.5 如果素材不在第1页，需要翻页
      if (material.page_number > 1) {
        for (let i = 1; i < material.page_number; i++) {
          await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
              if (button.textContent?.includes('下一页')) {
                (button as HTMLElement).click();
                break;
              }
            }
          });
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // 4.6 点击第N个素材的对号图标(confirm-icon)
      this.emitLog(`📌 点击第 ${material.material_index + 1} 个素材的对号图标...`);

      // 4.6.1 先检查页面上有多少个对号图标
      const debugInfo2 = await page.evaluate(() => {
        return {
          confirmIconCount: document.querySelectorAll('.confirm-icon').length,
          materialsLinkWrapCount: document.querySelectorAll('.materials-link-wrap').length,
          allMaterialClasses: Array.from(document.querySelectorAll('[class*="material"]'))
            .slice(0, 5)
            .map(el => el.className),
        };
      });

      this.emitLog(`🔍 调试信息: confirm-icon=${debugInfo2.confirmIconCount}, materials-link-wrap=${debugInfo2.materialsLinkWrapCount}`);
      this.emitLog(`� 素材相关class: ${JSON.stringify(debugInfo2.allMaterialClasses)}`);

      const clicked = await page.evaluate((index) => {
        // 查找所有对号图标
        const confirmIcons = document.querySelectorAll('.confirm-icon');
        console.log(`找到 ${confirmIcons.length} 个对号图标`);

        if (confirmIcons[index]) {
          console.log(`点击第 ${index + 1} 个对号图标`);
          (confirmIcons[index] as HTMLElement).click();
          return { success: true, count: confirmIcons.length };
        }

        return { success: false, count: confirmIcons.length };
      }, material.material_index);

      if (!clicked.success) {
        throw new Error(`未找到第 ${material.material_index + 1} 个对号图标 (页面上共有 ${clicked.count} 个)`);
      }

      this.emitLog(`✅ 已点击对号图标 (页面上共 ${clicked.count} 个)`);
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
      this.emitLog('🚀 开始视频号批量发送任务');
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

      for (let i = 0; i < friends.length; i++) {
        // 检查是否停止
        if (!this.isRunning) {
          this.emitLog('⏹️ 任务已停止');
          break;
        }

        // 检查是否暂停
        while (this.isPaused) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 检查是否在禁发时间段内
        if (this.isInForbiddenTime(forbiddenTimeRanges || [])) {
          await this.waitForNextSendingTime(forbiddenTimeRanges || []);
        }

        const friend = friends[i];
        this.emitLog(`[${i + 1}/${friends.length}] 发送给: ${friend.name}`);

        // 根据是否有附加文案选择发送方式
        let success = false;
        if (additionalMessage && additionalMessage.trim() !== '') {
          // 有附加文案: 先发文字,再发视频号
          success = await this.sendCombinedMessageToFriend(
            page,
            friend.name,
            additionalMessage,
            materialId
          );
        } else {
          // 无附加文案: 只发视频号
          success = await this.sendVideoMaterialToFriend(
            page,
            friend.name,
            materialId,
            ''
          );
        }

        if (success) {
          successCount++;
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

      this.emitLog('🎉 任务完成!');
      this.emitLog(`✅ 成功: ${successCount}人`);
      this.emitLog(`❌ 失败: ${failCount}人`);

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
    selectedFriendIds?: string[] // 新增: 选中的好友ID列表
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
      this.emitLog('🚀 开始组合发送任务');
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

        const { data, error } = await this.supabaseService.getClient()
          .from('duixueqiu_friends')
          .select('*')
          .eq('user_id', userId)
          .in('id', selectedFriendIds);

        if (error) {
          throw new Error(`获取好友信息失败: ${error.message}`);
        }

        selectedFriends = data || [];
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

          // 检查是否暂停
          while (this.isPaused) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // 检查是否在禁发时间段内
          if (this.isInForbiddenTime(forbiddenTimeRanges || [])) {
            await this.waitForNextSendingTime(forbiddenTimeRanges || []);
          }

          processedCount++;
          const friendName = friend.friend_remark || friend.friend_name;
          this.emitLog(`[${processedCount}/${totalFriends}] 发送给: ${friendName}`);

          // 组合发送
          const success = await this.sendCombinedContents(page, friendName, contents);

          if (success) {
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

          // 等待间隔 - 只等待3秒,避免被检测为异常
          if (processedCount < totalFriends) {
            this.emitLog(`⏳ 等待3秒后发送下一个好友...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }
      }

      this.emitLog('🎉 任务完成!');
      this.emitLog(`✅ 成功: ${successCount}人`);
      this.emitLog(`❌ 失败: ${failCount}人`);

    } catch (error) {
      this.logger.error('组合发送任务失败:', error);
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

      // 3. 启动浏览器
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

      // 4. 登录堆雪球
      this.emitLog('🔐 登录堆雪球...');
      await this.loginDuixueqiu(page, account.username, account.password);
      await new Promise(resolve => setTimeout(resolve, 3000));

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

          totalProcessed++;
          this.emitLog(`👤 [${totalProcessed}/${friends.length}] 准备发送给: ${friend.friend_name}`);

          // 10. 发送消息
          let success = false;
          try {
            const personalizedContent = messageContent.replace(/{昵称}/g, friend.friend_name);

            if (messageType === 'text') {
              // 发送文字消息 - 使用搜索方式
              // 10.1 搜索并点击好友
              const found = await this.searchAndClickFriend(page, friend.friend_name);

              if (!found) {
                throw new Error('未找到好友');
              }

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
            } else if (messageType === 'video' && materialId) {
              // 发送视频号消息 - sendVideoMaterialToFriend内部会查找好友
              success = await this.sendVideoMaterialToFriend(page, friend.friend_name, parseInt(materialId));
            } else if (messageType === 'link' && materialId) {
              // 发送链接消息 - sendLinkMaterialToFriend内部会查找好友
              success = await this.sendLinkMaterialToFriend(page, friend.friend_name, parseInt(materialId));
            }

            if (success) {
              this.emitLog(`✅ 已发送给: ${friend.friend_name}`);
              successCount++;
            } else {
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
      this.emitLog(`❌ 失败: ${failCount}人`);

    } catch (error) {
      this.logger.error('发送私聊消息失败:', error);
      this.emitLog(`❌ 任务失败: ${error.message}`);
      throw error;
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
      this.isRunning = false;
      this.isPaused = false;
    }
  }

}

