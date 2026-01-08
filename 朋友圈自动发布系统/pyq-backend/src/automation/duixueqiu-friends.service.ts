import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { AutomationGateway } from './automation.gateway';
import * as puppeteer from 'puppeteer';

/**
 * 堆雪球好友管理Service
 */
@Injectable()
export class DuixueqiuFriendsService {
  private readonly logger = new Logger(DuixueqiuFriendsService.name);
  private stopSyncFlag: Map<string, boolean> = new Map(); // 用于标记是否停止同步

  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly supabaseService: SupabaseService,
    private readonly automationGateway: AutomationGateway,
  ) {}

  /**
   * 停止同步
   */
  async stopSync(userId: string): Promise<{ success: boolean; message: string }> {
    this.logger.log(`停止同步好友列表: ${userId}`);
    this.stopSyncFlag.set(userId, true);

    // 发送同步完成事件(标记为用户手动停止)
    this.automationGateway.emitFriendsSyncComplete({
      userId,
      success: false,
      message: '用户手动停止同步'
    });

    return {
      success: true,
      message: '已停止同步'
    };
  }

  /**
   * 同步好友列表(按微信号分别同步)
   * @param userId - 用户ID
   * @param wechatAccountNames - 可选，要同步的微信号名称数组，不传则同步所有
   */
  async syncFriends(userId: string, wechatAccountNames?: string[]): Promise<{ success: boolean; message: string; count?: number; details?: any }> {
    let browser: puppeteer.Browser = null;
    let page: puppeteer.Page = null;

    try {
      // 重置停止标记
      this.stopSyncFlag.set(userId, false);

      this.logger.log(`开始同步好友列表: ${userId}, 微信号: ${wechatAccountNames ? wechatAccountNames.join(',') : '全部'}`);

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

        this.logger.log('🖥️  有头模式: 浏览器窗口应该会显示在屏幕上');
      }

      this.logger.log(`Puppeteer launch options: ${JSON.stringify(launchOptions)}`);
      browser = await puppeteer.launch(launchOptions);
      this.logger.log('✅ Puppeteer浏览器已启动');

      page = await browser.newPage();
      this.logger.log('✅ 新页面已创建');

      // 设置默认超时时间为5分钟,避免页面加载慢导致超时
      page.setDefaultNavigationTimeout(300000); // 5分钟
      page.setDefaultTimeout(300000); // 5分钟
      this.logger.log('✅ 已设置默认超时时间为300秒(5分钟)');

      await page.setViewport({ width: 1920, height: 1080 });
      this.logger.log('✅ 视口已设置');

      // 登录堆雪球
      await this.loginDuixueqiu(page, account.username, account.password);

      // 获取所有微信号列表
      const allWechatAccounts = await this.getWechatAccountsList(page);
      this.logger.log(`找到 ${allWechatAccounts.length} 个微信号`);
      this.logger.log(`📋 所有微信号列表: ${JSON.stringify(allWechatAccounts.map(a => ({ name: a.name, index: a.index })))}`);

      // 根据参数筛选要同步的微信号(使用名称匹配而不是索引)
      this.logger.log(`📥 收到的微信号名称参数: ${JSON.stringify(wechatAccountNames)}`);

      // 智能匹配函数:支持完整名称(如"沪港纪老板(8号机)")和简短名称(如"8号机")
      const matchAccountName = (accountName: string, searchName: string): boolean => {
        // 直接匹配
        if (accountName === searchName) {
          return true;
        }

        // 提取括号中的内容进行匹配
        // 例如: "沪港纪老板(8号机)" 中提取 "8号机"
        const bracketMatch = searchName.match(/[（(]([^）)]+)[）)]/);
        if (bracketMatch) {
          const extractedName = bracketMatch[1];
          if (accountName === extractedName) {
            this.logger.log(`✅ 智能匹配成功: "${searchName}" -> "${accountName}"`);
            return true;
          }
        }

        return false;
      };

      const wechatAccounts = wechatAccountNames && wechatAccountNames.length > 0
        ? allWechatAccounts.filter(account =>
            wechatAccountNames.some(name => matchAccountName(account.name, name))
          )
        : allWechatAccounts;

      this.logger.log(`✅ 筛选后的微信号列表: ${JSON.stringify(wechatAccounts.map(a => ({ name: a.name, index: a.index })))}`);
      this.logger.log(`本次将同步 ${wechatAccounts.length} 个微信号`);

      if (wechatAccountNames && wechatAccountNames.length > 0 && wechatAccounts.length === 0) {
        this.logger.warn(`⚠️ 警告: 指定的微信号名称 ${JSON.stringify(wechatAccountNames)} 在系统中未找到!`);
        this.logger.warn(`⚠️ 可用的微信号名称: ${JSON.stringify(allWechatAccounts.map(a => a.name))}`);
      }

      if (wechatAccounts.length === 0) {
        return { success: false, message: '未找到要同步的微信号' };
      }

      // 删除要同步的微信号的旧数据(使用微信号名称而不是索引)
      if (wechatAccounts.length > 0) {
        // 使用筛选后的微信号列表(已经过智能匹配)来删除旧数据
        // 这样可以确保删除的是正确的微信号数据(如"8号机"而不是"沪港纪老板(8号机)")
        const accountNamesToDelete = wechatAccounts.map(a => a.name);
        this.logger.log(`🗑️  准备删除以下微信号的旧数据: ${JSON.stringify(accountNamesToDelete)}`);

        await this.supabaseService.getClient()
          .from('duixueqiu_friends')
          .delete()
          .eq('user_id', userId)
          .in('wechat_account_name', accountNamesToDelete);
      } else {
        // 删除所有好友
        await this.supabaseService.getClient()
          .from('duixueqiu_friends')
          .delete()
          .eq('user_id', userId);
      }

      let totalFriends = 0;
      const accountDetails = [];

      // 先从数据库获取每个微信号的历史好友数(用于验证点击是否正确)
      const historicalFriendsCounts = new Map<string, number>();
      for (const account of wechatAccounts) {
        const { count } = await this.supabaseService.getClient()
          .from('duixueqiu_friends')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('wechat_account', account.name);

        if (count && count > 0) {
          historicalFriendsCounts.set(account.name, count);
          this.logger.log(`📊 ${account.name} 历史好友数: ${count}`);
        }
      }

      // 遍历每个微信号,分别同步好友
      for (let i = 0; i < wechatAccounts.length; i++) {
        const wechatAccount = wechatAccounts[i];
        this.logger.log(`[${i + 1}/${wechatAccounts.length}] 开始同步微信号: ${wechatAccount.name}`);

        try {
          // 点击该微信号(传入期望的好友数用于验证)
          const expectedCount = historicalFriendsCounts.get(wechatAccount.name);
          await this.clickWechatAccount(page, wechatAccount.name, expectedCount);

          // 不要点击"好友列表"标签!直接在"默认好友"页面操作
          // 因为点击"好友列表"标签可能会导致页面重新加载并切换到其他微信号

          this.logger.log(`🔍 开始获取总好友数...`);

          // 获取总好友数(从"未分组(xxx个)"中提取)
          const totalFriendsCount = await page.evaluate(() => {
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

          this.logger.log(`✅ 微信号 ${wechatAccount.name} 总好友数: ${totalFriendsCount}`);

          // 点击"未分组"展开好友列表
          await this.clickUnfoldGroup(page);

          // 获取该微信号的好友列表(传入进度推送所需参数)
          const friends = await this.getFriendsList(
            page,
            userId,
            wechatAccount.name,
            i + 1,
            wechatAccounts.length,
            totalFriendsCount
          );
          this.logger.log(`微信号 ${wechatAccount.name} 获取到 ${friends.length} 个好友`);

          // 保存到数据库
          if (friends.length > 0) {
            const friendsData = friends.map(friend => ({
              user_id: userId,
              friend_name: friend.name,
              friend_remark: friend.remark || null,
              avatar_url: friend.avatarUrl || null,
              wechat_account_index: wechatAccount.index,
              wechat_account_name: wechatAccount.name,
              is_selected: false,
            }));

            // 分批插入(每次1000条)
            const batchSize = 1000;
            for (let j = 0; j < friendsData.length; j += batchSize) {
              const batch = friendsData.slice(j, j + batchSize);
              const { error } = await this.supabaseService.getClient()
                .from('duixueqiu_friends')
                .insert(batch);

              if (error) {
                this.logger.error(`批量插入好友失败: ${error.message}`);
                throw error;
              }
            }
          }

          totalFriends += friends.length;
          accountDetails.push({
            index: wechatAccount.index,
            name: wechatAccount.name,
            friendCount: friends.length,
          });

          // 更新微信号表的好友数量
          await this.updateWechatAccountFriendCount(userId, wechatAccount.index, friends.length);

        } catch (error) {
          this.logger.error(`同步微信号 ${wechatAccount.name} 失败: ${error.message}`);
          accountDetails.push({
            index: wechatAccount.index,
            name: wechatAccount.name,
            friendCount: 0,
            error: error.message,
          });
        }
      }

      this.logger.log(`好友列表同步完成: 共 ${totalFriends} 个好友`);

      // 发送同步完成事件
      this.automationGateway.emitFriendsSyncComplete({
        userId,
        success: true,
        message: `好友列表同步成功,共同步 ${wechatAccounts.length} 个微信号的 ${totalFriends} 个好友`
      });

      return {
        success: true,
        message: `好友列表同步成功,共同步 ${wechatAccounts.length} 个微信号的 ${totalFriends} 个好友`,
        count: totalFriends,
        details: accountDetails,
      };
    } catch (error) {
      this.logger.error(`同步好友列表失败: ${error.message}`);

      // 发送同步失败事件
      this.automationGateway.emitFriendsSyncComplete({
        userId,
        success: false,
        message: `同步失败: ${error.message}`
      });

      return {
        success: false,
        message: `同步失败: ${error.message}`,
      };
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
    }
  }

  /**
   * 获取所有微信号列表
   */
  private async getWechatAccountsList(page: puppeteer.Page): Promise<Array<{ index: number; name: string }>> {
    this.logger.log('🔍 开始获取微信号列表...');

    try {
      // 等待微信号列表容器出现
      this.logger.log('⏳ 等待微信号列表容器出现 (最多300秒)...');
      await page.waitForSelector('.wechat-account-list', { timeout: 300000 });
      this.logger.log('✅ 微信号列表容器已出现');

      // 等待微信号列表加载出来
      const maxWaitTime = 300000; // 300秒(5分钟)
      const startTime = Date.now();
      let listRendered = false;

      this.logger.log('⏳ 开始等待微信号列表加载...');

      while (!listRendered && (Date.now() - startTime) < maxWaitTime) {
        const itemCount = await page.evaluate(() => {
          const items = document.querySelectorAll('.wechat-account-list > .item');
          return items.length;
        });

        // 检查是否有微信号列表项
        if (itemCount > 0) {
          listRendered = true;
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          this.logger.log(`✅ 微信号列表加载完成! 找到 ${itemCount} 个微信号 (耗时${elapsed}秒)`);
        } else {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          // 每10秒打印一次日志,避免日志过多
          if (Math.floor(Date.now() - startTime) % 10000 < 2000) {
            this.logger.log(`⏳ 微信号列表仍在加载... (已等待${elapsed}秒)`);
          }
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (!listRendered) {
        this.logger.error('❌ 微信号列表加载超时(300秒),页面可能加载失败!');
        throw new Error('微信号列表加载超时');
      }

      // 获取所有微信号
      const accounts = await page.evaluate(() => {
        const items = document.querySelectorAll('.wechat-account-list > .item');
        const result: Array<{ index: number; name: string }> = [];

        items.forEach((item, index) => {
          const nameDiv = item.querySelector('.name');
          if (nameDiv) {
            const name = nameDiv.textContent?.trim() || '';
            if (name) {
              result.push({ index, name });
            }
          }
        });

        return result;
      });

      this.logger.log(`✅ 获取到 ${accounts.length} 个微信号`);
      return accounts;
    } catch (error) {
      this.logger.error(`获取微信号列表失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 点击指定的微信号
   */
  private async clickWechatAccount(page: puppeteer.Page, accountName: string, expectedFriendsCount?: number): Promise<void> {
    this.logger.log(`点击微信号: ${accountName}${expectedFriendsCount ? `, 期望好友数: ${expectedFriendsCount}` : ''}`);

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
      this.logger.log(`📊 点击前的未分组好友数: ${beforeClickCount}`);

      // 最多重试3次
      let retryCount = 0;
      const maxRetries = 3;
      let clickSuccess = false;

      while (!clickSuccess && retryCount < maxRetries) {
        if (retryCount > 0) {
          this.logger.warn(`🔄 第 ${retryCount + 1} 次尝试点击微信号: ${accountName}`);
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
        this.logger.log(`🔍 找到 ${allAccounts.length} 个微信号:`);
        allAccounts.forEach(acc => {
          this.logger.log(`  [${acc.index}] name="${acc.name}", title="${acc.title}", selected=${acc.selected}`);
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

        this.logger.log(`✅ 已使用JavaScript点击微信号: ${accountName} (title: ${clickResult.title})`);

        // 点击后等待3秒让页面响应
        this.logger.log(`⏳ 等待3秒让页面响应点击事件...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        const afterClickAccounts = await page.evaluate(() => {
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
        this.logger.log(`🔍 点击后的微信号状态:`);
        afterClickAccounts.forEach(acc => {
          if (acc.selected) {
            this.logger.log(`  [${acc.index}] ✅ SELECTED: name="${acc.name}", title="${acc.title}"`);
          }
        });

        // 🔧 关键修复:点击微信号后,强制切换到好友管理界面
        this.logger.log(`🔧 点击微信号后,强制切换到好友管理界面...`);

        // 🚀 在点击好友列表按钮之前,先启动网络拦截
        this.logger.log(`🚀 启动网络拦截,准备捕获API请求...`);

        // 存储拦截到的好友数据
        let interceptedFriendsData: any = null;

        // 启用请求拦截
        await page.setRequestInterception(true);

        // 监听网络请求
        const requestHandler = (request: puppeteer.HTTPRequest) => {
          request.continue();
        };

        // 监听网络响应
        const responseHandler = async (response: puppeteer.HTTPResponse) => {
          const url = response.url();

          // 打印所有API请求,帮助调试
          if (url.includes('/api/') || url.includes('/friend') || url.includes('/contact')) {
            this.logger.log(`📡 检测到API请求: ${url}`);
          }

          // 检查是否是好友列表API
          if (
            url.includes('/friend') ||
            url.includes('/contact') ||
            url.includes('/user/list') ||
            url.includes('getFriendList')
          ) {
            try {
              const contentType = response.headers()['content-type'] || '';
              if (contentType.includes('application/json')) {
                const data = await response.json();
                this.logger.log(`📡 拦截到好友相关API: ${url}`);
                this.logger.log(`📊 响应数据键: ${JSON.stringify(Object.keys(data)).substring(0, 200)}`);

                // 尝试从响应中提取好友列表
                const possiblePaths = [
                  data?.data?.list,
                  data?.data?.friends,
                  data?.data,
                  data?.list,
                  data?.friends,
                  data
                ];

                for (const possibleData of possiblePaths) {
                  if (Array.isArray(possibleData) && possibleData.length > 0) {
                    this.logger.log(`✅ 找到好友列表数据! 数量: ${possibleData.length}`);
                    interceptedFriendsData = possibleData;
                    break;
                  }
                }
              }
            } catch (error) {
              // 忽略JSON解析错误
            }
          }
        };

        page.on('request', requestHandler);
        page.on('response', responseHandler);

        // 点击好友列表按钮
        const switchResult = await page.evaluate(() => {
          // 方法1: 精确查找 .friend[title="好友列表"]
          const friendBtn = document.querySelector('.friend[title="好友列表"]');
          if (friendBtn) {
            (friendBtn as HTMLElement).click();
            return { success: true, method: 'friend-button-exact' };
          }

          // 方法2: 查找所有带title的div
          const allDivs = document.querySelectorAll('div[title]');
          for (const div of allDivs) {
            const title = div.getAttribute('title') || '';
            if (title === '好友列表') {
              (div as HTMLElement).click();
              return { success: true, method: 'title-exact-match' };
            }
          }

          return { success: false, method: 'none' };
        });

        if (switchResult.success) {
          this.logger.log(`✅ 已点击好友管理按钮 (方法: ${switchResult.method})`);
        } else {
          this.logger.warn(`⚠️ 未找到好友管理按钮!`);
        }

        // 等待切换完成,同时等待API响应
        this.logger.log(`⏳ 等待切换到好友管理界面并拦截API (10秒)...`);
        const interceptStartTime = Date.now();
        while (!interceptedFriendsData && (Date.now() - interceptStartTime) < 10000) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 移除监听器并关闭拦截
        page.off('request', requestHandler);
        page.off('response', responseHandler);
        await page.setRequestInterception(false);

        // 如果拦截到数据,保存到实例变量供后续使用
        if (interceptedFriendsData && interceptedFriendsData.length > 0) {
          this.logger.log(`🎉 成功拦截到好友数据! 数量: ${interceptedFriendsData.length}`);
          // 保存到实例变量
          (this as any).interceptedFriendsData = interceptedFriendsData;
        } else {
          this.logger.log(`⚠️ 未拦截到好友数据,将使用滚动方案`);
          (this as any).interceptedFriendsData = null;
        }

        // 等待"未分组"数字发生变化,并验证选中的微信号是否正确
        this.logger.log(`⏳ 等待好友数据更新并验证微信号...`);
        const maxWaitTime = 30000; // 增加到30秒,因为堆雪球好友列表加载很慢
        const startTime = Date.now();
        let dataUpdated = false;

        let checkCount = 0;
        while (!dataUpdated && (Date.now() - startTime) < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 500));
          checkCount++;

          // 同时获取好友数和当前选中的微信号
          const result = await page.evaluate((targetName) => {
            // 获取未分组好友数
            let friendCount = 0;
            const allSpans = document.querySelectorAll('span');
            for (const span of allSpans) {
              const text = span.textContent?.trim() || '';
              const match = text.match(/^未分组[（(](\d+)个[）)]$/);
              if (match) {
                friendCount = parseInt(match[1], 10);
                break;
              }
            }

            // 获取当前选中的微信号
            let selectedAccount = '';
            const items = document.querySelectorAll('.wechat-account-list > .item');
            for (const item of items) {
              if (item.classList.contains('selected')) {
                const nameDiv = item.querySelector('.name');
                selectedAccount = nameDiv?.textContent?.trim() || '';
                break;
              }
            }

            return { friendCount, selectedAccount };
          }, accountName);

          // 🔍 每5次检查打印一次调试信息
          if (checkCount % 5 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.logger.log(`🔍 [检查${checkCount}次] 好友数: ${result.friendCount}, 选中微信号: "${result.selectedAccount}", 期望: "${accountName}" (已等待${elapsed}秒)`);
          }

          // 验证:好友数>0 且 选中的微信号正确
          if (result.friendCount > 0 && result.selectedAccount === accountName) {
            dataUpdated = true;
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            this.logger.log(`✅ 好友数据已更新! 好友数: ${result.friendCount}, 选中微信号: ${result.selectedAccount} (耗时${elapsed}秒)`);
            clickSuccess = true;
          } else if (result.friendCount > 0 && result.selectedAccount !== accountName) {
            // 好友数有了,但选中的微信号不对!
            this.logger.warn(`⚠️ 微信号不匹配! 当前选中: ${result.selectedAccount}, 期望: ${accountName}, 好友数: ${result.friendCount}`);
            this.logger.warn(`⚠️ 点击失败,需要重试!`);
            retryCount++;
            await new Promise(resolve => setTimeout(resolve, 1000));
            break; // 跳出循环,进行重试
          }
        }

        if (!dataUpdated) {
          this.logger.warn(`⚠️ 点击后数据未更新! 点击可能未生效!`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒后重试
        }
      }

      if (!clickSuccess) {
        throw new Error(`点击微信号失败,已重试${maxRetries}次`);
      }

      // 验证是否切换成功
      const currentSelectedAccount = await page.evaluate(() => {
        const selectedItem = document.querySelector('.item.selected');
        if (selectedItem) {
          const title = selectedItem.getAttribute('title');
          return title || '';
        }
        return '';
      });

      this.logger.log(`🔍 当前选中的微信号: ${currentSelectedAccount}`);
      this.logger.log(`✅ 微信号切换完成: ${accountName}`);
    } catch (error) {
      this.logger.error(`点击微信号失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 点击"好友列表"标签
   */
  private async clickFriendListTab(page: puppeteer.Page, expectedAccountName?: string): Promise<void> {
    try {
      this.logger.log('点击"好友列表"标签...');

      const clicked = await page.evaluate(() => {
        // 查找所有div元素
        const divs = document.querySelectorAll('div');
        for (const div of divs) {
          // 检查textContent是否为"好友列表"
          if (div.textContent?.trim() === '好友列表' && div.getAttribute('title') === '好友列表') {
            (div as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        this.logger.warn('⚠️ 未找到"好友列表"标签,可能已经在好友列表页面');
      }

      // 等待页面更新
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 如果提供了期望的账号名,验证是否还是选中状态
      if (expectedAccountName) {
        const currentSelectedAccount = await page.evaluate(() => {
          const selectedItem = document.querySelector('.item.selected');
          if (selectedItem) {
            const title = selectedItem.getAttribute('title');
            return title || '';
          }
          return '';
        });

        const expectedTitle = `沪港纪老板(${expectedAccountName})`;
        this.logger.log(`🔍 点击"好友列表"后,当前选中的微信号: ${currentSelectedAccount}`);

        if (currentSelectedAccount !== expectedTitle) {
          this.logger.warn(`⚠️ 点击"好友列表"后微信号切换失效! 期望: ${expectedTitle}, 实际: ${currentSelectedAccount}`);
          this.logger.log(`🔄 重新点击微信号: ${expectedAccountName}`);

          // 重新点击微信号
          await page.evaluate((name) => {
            const items = document.querySelectorAll('.item');
            for (const item of items) {
              const title = item.getAttribute('title');
              if (title && title.includes(`(${name})`)) {
                (item as HTMLElement).click();
                return true;
              }
            }
          }, expectedAccountName);

          await new Promise(resolve => setTimeout(resolve, 3000));

          // 再次验证
          const retrySelectedAccount = await page.evaluate(() => {
            const selectedItem = document.querySelector('.item.selected');
            return selectedItem?.getAttribute('title') || '';
          });
          this.logger.log(`🔍 重新点击后选中的微信号: ${retrySelectedAccount}`);
        }
      }

      this.logger.log('✅ 已点击"好友列表"标签');
    } catch (error) {
      this.logger.error(`点击"好友列表"标签失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 登录堆雪球
   */
  private async loginDuixueqiu(page: puppeteer.Page, username: string, password: string): Promise<void> {
    this.logger.log('🔐 开始登录堆雪球客服端...');

    // 访问客服端登录页面 (设置5分钟超时,服务器网络可能较慢)
    await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', {
      waitUntil: 'networkidle2',
      timeout: 300000 // 5分钟超时
    });

    // 等待输入框加载
    await new Promise(resolve => setTimeout(resolve, 1000));

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

    // 等待登录完成
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    // 检查是否登录成功
    const currentUrl = page.url();
    if (currentUrl.includes('/user/login/')) {
      throw new Error('登录失败,仍在登录页面');
    }

    this.logger.log('✅ 登录成功');

    // 登录后多等待一会儿,确保页面完全加载
    this.logger.log('⏳ 等待页面完全加载 (10秒)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    this.logger.log('✅ 页面加载等待完成');
  }

  /**
   * 点击"未分组"展开好友列表
   */
  private async clickUnfoldGroup(page: puppeteer.Page): Promise<void> {
    this.logger.log('点击未分组展开好友列表...');

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 点击"未分组"
    const unfoldClicked = await page.evaluate(() => {
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
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

    this.logger.log('已点击未分组');

    // 等待好友列表加载
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * 🚀 方案B: 通过拦截网络请求获取好友数据
   */
  private async tryGetFriendsFromNetwork(page: puppeteer.Page): Promise<Array<{ name: string; remark: string; avatarUrl: string }> | null> {
    this.logger.log('🚀 检查是否已拦截到好友数据...');

    try {
      // 检查是否在clickWechatAccount中已经拦截到数据
      const friendsData = (this as any).interceptedFriendsData;

      if (friendsData && friendsData.length > 0) {
        this.logger.log(`✅ 使用已拦截的好友数据! 数量: ${friendsData.length}`);

        // 标准化数据格式
        const friends = friendsData.map((item: any) => ({
          name: item.name || item.nickname || item.userName || item.nick_name || '',
          remark: item.remark || item.remarkName || item.remark_name || '',
          avatarUrl: item.avatar || item.avatarUrl || item.headImgUrl || item.avatar_url || ''
        }));

        // 清空拦截数据
        (this as any).interceptedFriendsData = null;

        return friends;
      } else {
        this.logger.log('⚠️ 未找到已拦截的好友数据');
        return null;
      }
    } catch (error) {
      this.logger.warn(`⚠️ 获取拦截数据失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取好友列表
   */
  private async getFriendsList(
    page: puppeteer.Page,
    userId?: string,
    currentAccount?: string,
    currentIndex?: number,
    totalAccounts?: number,
    totalFriends?: number
  ): Promise<Array<{ name: string; remark: string; avatarUrl: string }>> {
    this.logger.log('开始获取好友列表...');

    // 🚀 方案B: 先尝试通过拦截网络请求获取数据
    const networkData = await this.tryGetFriendsFromNetwork(page);
    if (networkData && networkData.length > 0) {
      this.logger.log(`🎉 使用网络拦截方案成功! 获取到 ${networkData.length} 个好友,耗时: 0秒`);

      // 发送进度更新
      if (userId && currentAccount) {
        this.automationGateway.emitFriendsSyncProgress({
          userId,
          currentAccount,
          currentIndex: currentIndex || 0,
          totalAccounts: totalAccounts || 1,
          collectedFriends: networkData.length,
          totalFriends: totalFriends || networkData.length,
          scrollCount: 0,
          elapsedTime: 0
        });
      }

      return networkData;
    }

    // 如果网络拦截方案失败,回退到滚动方案
    this.logger.log('⚠️ 网络拦截方案失败,回退到滚动方案...');

    // 🔧 关键修复:使用数组代替Map,保留所有重名好友
    const allFriends: Array<{ name: string; remark: string; avatarUrl: string }> = [];
    const seenFriendsGlobal = new Set<string>(); // 用于在单次滚动中去重,避免重复添加同一个好友
    let scrollAttempts = 0;
    const maxScrollAttempts = 10000; // 增加到10000次,确保能获取所有好友
    let previousCount = 0;
    let stableCount = 0;
    const startTime = Date.now();

    // 先滚动到底部,确保所有好友都加载
    this.logger.log('📜 开始滚动加载所有好友...');
    this.logger.log(`📊 目标好友数: ${totalFriends || '未知'}`);

    while (scrollAttempts < maxScrollAttempts && stableCount < 200) { // 连续200次(100秒)不变就停止
      // 检查是否需要停止同步
      if (userId && this.stopSyncFlag.get(userId)) {
        this.logger.log('⚠️ 检测到停止同步标记,中断同步');
        break;
      }

      // 🔧 关键修复:先滚动,再等待,最后查询DOM
      // 这样可以确保虚拟滚动有足够时间渲染新元素

      // 1️⃣ 先滚动 - 测试更大步长
      const scrollResult = await page.evaluate(() => {
        const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
        if (scrollableElements.length > 0) {
          scrollableElements[0].scrollBy(0, 700); // 每次滚动700px(测试更大步长)
          return {
            success: true,
            count: scrollableElements.length,
            scrollTop: scrollableElements[0].scrollTop,
            scrollHeight: scrollableElements[0].scrollHeight,
            clientHeight: scrollableElements[0].clientHeight
          };
        }
        return { success: false, count: 0, scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
      });

      // 🔍 调试:第一次滚动时打印滚动元素数量
      if (scrollAttempts === 0) {
        this.logger.log(`🔍 找到 ${scrollResult.count} 个可滚动元素,滚动${scrollResult.success ? '成功' : '失败'}`);
        this.logger.log(`🔍 滚动容器信息: scrollTop=${scrollResult.scrollTop}, scrollHeight=${scrollResult.scrollHeight}, clientHeight=${scrollResult.clientHeight}`);
      }

      // 2️⃣ 等待足够长的时间,让虚拟滚动渲染新元素
      await new Promise(resolve => setTimeout(resolve, 500)); // 等待500ms让页面完全渲染
      scrollAttempts++;

      // 3️⃣ 查询DOM,收集当前可见的好友
      const visibleFriends = await page.evaluate(() => {
        // 只选择好友列表中的好友元素,不包括左侧微信号列表
        const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');
        const friends: Array<{ name: string; remark: string; avatarUrl: string }> = [];
        const seenFriends = new Set<string>();

        for (const el of friendElements) {
          const text = el.textContent?.trim() || '';

          // 获取头像URL
          const imgElement = el.querySelector('img');
          const avatarUrl = imgElement?.getAttribute('src') || '';

          // 过滤掉分组名称和其他非好友元素
          if (text.length > 0 && text.length < 30 &&
              !text.includes('分组') && !text.includes('新的好友') &&
              !seenFriends.has(text)) {
            friends.push({
              name: text,
              remark: '',
              avatarUrl: avatarUrl
            });
            seenFriends.add(text);
          }
        }

        return { friends, totalElements: friendElements.length };
      });

      // 🔍 调试:第一次滚动时打印元素数量
      if (scrollAttempts === 1) {
        this.logger.log(`🔍 找到 ${visibleFriends.totalElements} 个好友元素,过滤后 ${visibleFriends.friends.length} 个有效好友`);
      }

      // 添加到总列表(不去重,保留所有好友包括重名的)
      visibleFriends.friends.forEach(friend => {
        // 使用组合key检查是否已添加(name + avatarUrl),避免同一个好友在单次滚动中重复添加
        const uniqueKey = `${friend.name}_${friend.avatarUrl}`;
        if (!seenFriendsGlobal.has(uniqueKey)) {
          allFriends.push(friend);
          seenFriendsGlobal.add(uniqueKey);
        }
      });

      // 检查是否稳定
      if (allFriends.length === previousCount) {
        stableCount++;
      } else {
        stableCount = 0;
        previousCount = allFriends.length;
      }

      if (scrollAttempts % 50 === 0) {
        this.logger.log(`📊 已收集 ${allFriends.length} 个好友... (滚动次数: ${scrollAttempts})`);

        // 🔍 调试:在5792位置打印详细信息并截图
        if (allFriends.length === 5792 && scrollAttempts === 1100) {
          this.logger.warn(`🔍🔍🔍 到达5792个好友的位置! 开始详细调试...`);

          // 获取滚动容器的详细信息
          const scrollInfo = await page.evaluate(() => {
            const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
            if (scrollableElements.length > 0) {
              const el = scrollableElements[0];
              return {
                scrollHeight: el.scrollHeight,
                scrollTop: el.scrollTop,
                clientHeight: el.clientHeight,
                isAtBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 10,
                friendElementsCount: document.querySelectorAll('.recent-and-friend-panel-concat-item__friend').length
              };
            }
            return null;
          });

          this.logger.warn(`🔍 滚动容器信息: ${JSON.stringify(scrollInfo)}`);

          // 截图保存
          try {
            await page.screenshot({ path: '/tmp/debug-5792.png', fullPage: false });
            this.logger.warn(`🔍 已截图保存到 /tmp/debug-5792.png`);
          } catch (err) {
            this.logger.error(`截图失败: ${err.message}`);
          }
        }

        // 推送进度到前端
        this.logger.log(`🔍 检查推送条件: userId=${userId}, currentAccount=${currentAccount}`);
        if (userId && currentAccount) {
          const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
          this.logger.log(`✅ 准备推送进度: ${currentAccount} - ${allFriends.length}/${totalFriends || 0}`);
          this.automationGateway.emitFriendsSyncProgress({
            userId,
            currentAccount,
            currentIndex: currentIndex || 1,
            totalAccounts: totalAccounts || 1,
            collectedFriends: allFriends.length,
            totalFriends: totalFriends || 0,
            scrollCount: scrollAttempts,
            elapsedTime
          });
        } else {
          this.logger.warn(`⚠️ 推送条件不满足,跳过推送`);
        }
      }
    }

    this.logger.log(`✅ 第一轮滚动完成,共滚动 ${scrollAttempts} 次,稳定次数 ${stableCount}`);
    this.logger.log(`✅ 第一轮收集到 ${allFriends.length} 个好友`);

    // 检查是否需要停止同步(在开始第二轮之前)
    if (userId && this.stopSyncFlag.get(userId)) {
      this.logger.log('⚠️ 准备开始第二轮滚动时检测到停止同步标记,跳过第二轮');
    } else {
      // 🔧 关键优化:向上滚动一次,再向下滚动,确保没有遗漏
      this.logger.log(`🔄 开始第二轮验证滚动,向上滚动到顶部...`);

      // 滚动到顶部
      await page.evaluate(() => {
        const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
        if (scrollableElements.length > 0) {
          scrollableElements[0].scrollTo(0, 0);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒让页面稳定

      // 再次向下滚动,收集可能遗漏的好友
    this.logger.log(`🔄 开始第二轮向下滚动...`);
    let secondRoundScrolls = 0;
    let secondRoundStable = 0;
    const maxSecondRoundScrolls = 5000;

    while (secondRoundScrolls < maxSecondRoundScrolls && secondRoundStable < 100) {
      // 检查是否需要停止同步
      if (userId && this.stopSyncFlag.get(userId)) {
        this.logger.log('⚠️ 第二轮滚动中检测到停止同步标记,中断同步');
        break;
      }

      // 滚动
      await page.evaluate(() => {
        const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
        if (scrollableElements.length > 0) {
          scrollableElements[0].scrollBy(0, 100);
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      secondRoundScrolls++;

      // 查询DOM
      const visibleFriends = await page.evaluate(() => {
        const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');
        const friends: Array<{ name: string; remark: string; avatarUrl: string }> = [];
        const seenFriends = new Set<string>();

        for (const el of friendElements) {
          const text = el.textContent?.trim() || '';
          const imgElement = el.querySelector('img');
          const avatarUrl = imgElement?.getAttribute('src') || '';

          if (text.length > 0 && text.length < 30 &&
              !text.includes('分组') && !text.includes('新的好友') &&
              !seenFriends.has(text)) {
            friends.push({ name: text, remark: '', avatarUrl: avatarUrl });
            seenFriends.add(text);
          }
        }
        return { friends };
      });

      const beforeSize = allFriends.length;
      visibleFriends.friends.forEach(friend => {
        // 使用组合key检查是否已添加
        const uniqueKey = `${friend.name}_${friend.avatarUrl}`;
        if (!seenFriendsGlobal.has(uniqueKey)) {
          allFriends.push(friend);
          seenFriendsGlobal.add(uniqueKey);
        }
      });

      if (allFriends.length === beforeSize) {
        secondRoundStable++;
      } else {
        secondRoundStable = 0;
        this.logger.log(`🔄 第二轮发现新好友! 总数: ${allFriends.length}`);
      }
    }

      this.logger.log(`✅ 第二轮滚动完成,共滚动 ${secondRoundScrolls} 次`);
    }

    this.logger.log(`✅ 最终获取到 ${allFriends.length} 个好友`);

    // 对比堆雪球显示的总数
    if (totalFriends && allFriends.length < totalFriends) {
      const missing = totalFriends - allFriends.length;
      const percentage = ((allFriends.length / totalFriends) * 100).toFixed(2);
      this.logger.warn(`⚠️ 同步不完整! 堆雪球显示 ${totalFriends} 个好友,实际同步到 ${allFriends.length} 个,缺少 ${missing} 个 (完成度: ${percentage}%)`);
      this.logger.warn(`⚠️ 可能原因: 1) 虚拟滚动渲染延迟 2) 网络加载慢`);
    } else if (totalFriends && allFriends.length === totalFriends) {
      this.logger.log(`🎉 同步完整! 堆雪球显示 ${totalFriends} 个好友,实际同步到 ${allFriends.length} 个,完全匹配!`);
    } else if (totalFriends && allFriends.length > totalFriends) {
      const extra = allFriends.length - totalFriends;
      this.logger.log(`✅ 同步完成! 堆雪球显示 ${totalFriends} 个好友,实际同步到 ${allFriends.length} 个,多出 ${extra} 个 (可能是重名好友)`);
    }

    return allFriends;
  }

  /**
   * 获取好友列表(分页)
   */
  async getFriendsPaginated(
    userId: string,
    page: number = 1,
    pageSize: number = 1000,
  ): Promise<{ data: any[]; total: number }> {
    try {
      // 先获取总数
      const { count, error: countError } = await this.supabaseService.getClient()
        .from('duixueqiu_friends')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (countError) {
        this.logger.error(`获取好友总数失败: ${countError.message}`);
        throw countError;
      }

      const total = count || 0;

      // 获取分页数据
      const start = (page - 1) * pageSize;
      const end = start + pageSize - 1;

      const { data, error } = await this.supabaseService.getClient()
        .from('duixueqiu_friends')
        .select('*')
        .eq('user_id', userId)
        .order('friend_name', { ascending: true })
        .range(start, end);

      if (error) {
        this.logger.error(`获取好友列表失败: ${error.message}`);
        throw error;
      }

      this.logger.log(`获取好友列表成功: 第${page}页, 本页${data?.length || 0}个, 总共${total}个`);

      return {
        data: data || [],
        total,
      };
    } catch (error) {
      this.logger.error(`获取好友列表失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取好友列表(从数据库)
   * 使用分页查询避免Supabase默认1000条限制和查询超时
   * 优化策略: 使用小批次(500)避免超时,牺牲速度换取稳定性
   */
  async getFriends(userId: string): Promise<any[]> {
    let allData = [];
    let start = 0;
    const limit = 500; // 🔧 减小批次避免超时(从5000降到500)

    this.logger.log(`开始获取好友列表: userId=${userId}`);

    while (true) {
      this.logger.log(`查询第 ${Math.floor(start / limit) + 1} 批,范围: ${start} - ${start + limit - 1}`);

      try {
        // 🔧 只查询必要字段,减少数据传输量
        const { data, error } = await this.supabaseService.getClient()
          .from('duixueqiu_friends')
          .select('id, friend_name, friend_remark, avatar_url, wechat_account_name, wechat_account_index, is_selected')
          .eq('user_id', userId)
          .order('friend_name', { ascending: true })
          .range(start, start + limit - 1);

        if (error) {
          this.logger.error(`获取好友列表失败(第${Math.floor(start / limit) + 1}批): ${error.message}`);

          // 🔧 如果是超时错误,返回已获取的数据
          if (error.message.includes('statement timeout')) {
            this.logger.warn(`⚠️ 查询超时,已获取 ${allData.length} 个好友,返回部分数据`);
            this.logger.warn(`💡 建议: 请在Supabase中执行数据库优化脚本(见 数据库脚本/fix_statement_timeout.sql)`);
            break;
          }

          throw error;
        }

        if (!data || data.length === 0) break;

        allData = allData.concat(data);
        this.logger.log(`第 ${Math.floor(start / limit) + 1} 批查询完成,获取 ${data.length} 个好友,累计 ${allData.length} 个`);

        // 如果返回的数据少于limit,说明已经是最后一页
        if (data.length < limit) break;

        start += limit;
      } catch (error) {
        this.logger.error(`查询第 ${Math.floor(start / limit) + 1} 批时发生错误: ${error.message}`);

        // 如果已经获取了部分数据,返回已获取的数据而不是抛出错误
        if (allData.length > 0) {
          this.logger.warn(`⚠️ 查询中断,但已获取 ${allData.length} 个好友,返回部分数据`);
          break;
        }

        throw error;
      }
    }

    this.logger.log(`获取好友列表成功: 共 ${allData.length} 个好友`);
    return allData;
  }

  /**
   * 更新好友选中状态
   */
  async updateFriendSelection(userId: string, friendId: number, isSelected: boolean): Promise<void> {
    const { error } = await this.supabaseService.getClient()
      .from('duixueqiu_friends')
      .update({ is_selected: isSelected })
      .eq('id', friendId)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`更新好友选中状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 批量更新好友选中状态
   */
  async batchUpdateFriendSelection(userId: string, friendIds: number[], isSelected: boolean): Promise<void> {
    const { error } = await this.supabaseService.getClient()
      .from('duixueqiu_friends')
      .update({ is_selected: isSelected })
      .in('id', friendIds)
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`批量更新好友选中状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 全选/取消全选
   */
  async selectAllFriends(userId: string, isSelected: boolean): Promise<void> {
    const { error } = await this.supabaseService.getClient()
      .from('duixueqiu_friends')
      .update({ is_selected: isSelected })
      .eq('user_id', userId);

    if (error) {
      this.logger.error(`全选/取消全选失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取选中的好友列表
   * 使用分页查询避免Supabase默认1000条限制
   */
  async getSelectedFriends(userId: string): Promise<any[]> {
    let allData = [];
    let start = 0;
    const limit = 1000;

    while (true) {
      const { data, error } = await this.supabaseService.getClient()
        .from('duixueqiu_friends')
        .select('*')
        .eq('user_id', userId)
        .eq('is_selected', true)
        .order('friend_name', { ascending: true })
        .range(start, start + limit - 1);

      if (error) {
        this.logger.error(`获取选中好友列表失败: ${error.message}`);
        throw error;
      }

      if (!data || data.length === 0) break;

      allData = allData.concat(data);

      // 如果返回的数据少于limit,说明已经是最后一页
      if (data.length < limit) break;

      start += limit;
    }

    this.logger.log(`获取选中好友列表成功: 共 ${allData.length} 个好友`);
    return allData;
  }

  /**
   * 更新微信号的好友数量
   */
  private async updateWechatAccountFriendCount(userId: string, accountIndex: number, friendCount: number): Promise<void> {
    try {
      const { error } = await this.supabaseService.getClient()
        .from('duixueqiu_wechat_accounts')
        .update({
          friend_count: friendCount,
          last_sync_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('account_index', accountIndex);

      if (error) {
        this.logger.error(`更新微信号好友数量失败: ${error.message}`);
      } else {
        this.logger.log(`✅ 更新微信号 ${accountIndex} 的好友数量: ${friendCount}`);
      }
    } catch (error) {
      this.logger.error(`更新微信号好友数量失败: ${error.message}`);
    }
  }
}

