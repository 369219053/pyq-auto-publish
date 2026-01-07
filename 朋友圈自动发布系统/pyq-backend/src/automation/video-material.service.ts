import { Injectable, Logger } from '@nestjs/common';
import { PuppeteerService } from '../puppeteer/puppeteer.service';
import { SupabaseService } from '../common/supabase.service';
import * as puppeteer from 'puppeteer';

/**
 * 视频号素材库服务
 * 负责同步和管理堆雪球的视频号素材库
 */
@Injectable()
export class VideoMaterialService {
  private readonly logger = new Logger(VideoMaterialService.name);
  private isSyncing = false;

  constructor(
    private readonly puppeteerService: PuppeteerService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * 登录堆雪球客服端
   */
  private async loginDuixueqiu(page: puppeteer.Page, username: string, password: string): Promise<void> {
    this.logger.log('🔐 开始登录堆雪球客服端...');

    // 访问客服端登录页面
    await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', {
      waitUntil: 'networkidle2',
      timeout: 300000 // 5分钟超时
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

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    this.logger.log('✅ 登录成功，等待Vue应用加载...');

    // 等待Vue应用完全加载（等待微信号列表出现）
    // 这个过程可能需要1-2分钟，取决于网络和数据量
    this.logger.log('⏳ 等待Vue应用初始化（可能需要1-2分钟）...');
    try {
      await page.waitForFunction(
        () => {
          // 等待微信号列表加载完成
          const items = document.querySelectorAll('.wechat-account-list > .item');
          return items.length > 0;
        },
        { timeout: 120000 }  // 最多等待2分钟
      );
      this.logger.log('✅ Vue应用加载完成，微信号列表已出现');
    } catch (error) {
      this.logger.error('❌ Vue应用加载超时，未找到微信号列表');
      throw new Error('Vue应用加载超时，请检查网络');
    }

    this.logger.log('✅ 登录客服端成功，页面已就绪');
  }

  /**
   * 打开素材库对话框
   */
  private async openMaterialDialog(page: puppeteer.Page): Promise<void> {
    this.logger.log('📂 打开素材库对话框...');

    // 步骤1: 随便选一个微信号（选第一个）
    this.logger.log('📱 选择第一个微信号...');
    const firstAccountClicked = await page.evaluate(() => {
      const items = document.querySelectorAll('.wechat-account-list > .item');
      if (items.length > 0) {
        const firstItem = items[0] as HTMLElement;
        const nameDiv = firstItem.querySelector('.name');
        const accountName = nameDiv?.textContent?.trim() || '未知';

        // 模拟真实的鼠标点击事件
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        firstItem.dispatchEvent(clickEvent);

        return { success: true, accountName };
      }
      return { success: false, accountName: '' };
    });

    if (!firstAccountClicked.success) {
      throw new Error('未找到任何微信号');
    }

    this.logger.log(`✅ 已选择微信号: ${firstAccountClicked.accountName}`);

    // 等待3秒让页面响应
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 步骤2: 判断是否在好友列表页面，如果不在则点击"好友列表"
    this.logger.log('🔍 检查是否在好友列表页面...');
    const clickedFriendList = await page.evaluate(() => {
      const divs = document.querySelectorAll('div');
      for (const div of divs) {
        if (div.textContent?.trim() === '好友列表' && div.getAttribute('title') === '好友列表') {
          (div as HTMLElement).click();
          return true;
        }
      }
      return false;
    });

    if (clickedFriendList) {
      this.logger.log('✅ 已点击"好友列表"标签');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      this.logger.log('✅ 已经在好友列表页面');
    }

    // 步骤3: 点击"未分组"展开好友列表
    this.logger.log('📋 点击未分组展开好友列表...');
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

    this.logger.log('✅ 已点击未分组');

    // 步骤4: 等待第一批好友元素出现（不需要等待所有好友加载完）
    this.logger.log('⏳ 等待好友元素出现...');

    try {
      await page.waitForFunction(
        () => {
          // 只要有好友元素出现就可以了，不需要等待"数据加载中"消失
          const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');
          return friendElements.length > 0;
        },
        { timeout: 30000 }  // 最多等待30秒
      );
      this.logger.log('✅ 好友元素已出现');
    } catch (error) {
      this.logger.error('❌ 等待好友元素超时');
      throw new Error('未找到好友元素，请检查页面状态');
    }

    // 等待2秒确保DOM稳定
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 点击第一个可见好友（不需要查找特定好友）
    this.logger.log('🔍 点击第一个可见好友...');

    // 再等待2秒确保DOM完全渲染
    await new Promise(resolve => setTimeout(resolve, 2000));

    const firstFriendClickResult = await page.evaluate(() => {
      // 查找所有好友元素
      const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');

      console.log(`🔍 找到 ${friendElements.length} 个好友元素`);

      if (friendElements.length > 0) {
        // 点击第一个好友
        const firstFriend = friendElements[0] as HTMLElement;

        // 获取好友名称（用于日志）
        const nameElement = firstFriend.querySelector('div');
        const friendName = nameElement?.textContent?.trim() || '未知好友';

        console.log(`🖱️ 准备点击好友: ${friendName}`);

        firstFriend.click();

        return {
          success: true,
          friendName: friendName,
          totalFriends: friendElements.length
        };
      }

      // 如果没找到,尝试查找其他可能的选择器
      console.log('⚠️ 未找到 .recent-and-friend-panel-concat-item__friend 元素');
      console.log('🔍 尝试查找所有包含"friend"的class...');

      const allElements = document.querySelectorAll('[class*="friend"]');
      console.log(`找到 ${allElements.length} 个包含"friend"的元素`);

      if (allElements.length > 0) {
        for (let i = 0; i < Math.min(5, allElements.length); i++) {
          console.log(`元素${i}: ${allElements[i].className}`);
        }
      }

      return {
        success: false,
        friendName: '',
        totalFriends: 0
      };
    });

    if (!firstFriendClickResult.success) {
      throw new Error('未找到任何好友，无法打开素材库');
    }

    this.logger.log(`✅ 已点击好友: ${firstFriendClickResult.friendName} (共找到 ${firstFriendClickResult.totalFriends} 个好友)`);

    // 等待聊天窗口完全加载
    this.logger.log('⏳ 等待聊天窗口加载...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 检查页面上所有title属性
    const allTitlesAfterClick = await page.evaluate(() => {
      const elements = document.querySelectorAll('[title]');
      const titles: string[] = [];
      elements.forEach(el => {
        const title = el.getAttribute('title');
        if (title) {
          titles.push(title);
        }
      });
      return titles;
    });

    this.logger.log(`📊 点击好友后页面上的title属性: ${JSON.stringify(allTitlesAfterClick)}`);

    // 等待聊天窗口工具栏加载
    this.logger.log('⏳ 等待聊天窗口工具栏加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 点击"素材"按钮
    this.logger.log('🎬 点击"素材"按钮...');
    await page.waitForSelector('[title="素材"]', { timeout: 10000 });
    await page.click('[title="素材"]');

    // 等待素材菜单完全展开
    this.logger.log('⏳ 等待素材菜单展开...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 截图3：点击素材按钮后，弹出菜单
    await page.screenshot({ path: '/tmp/screenshot-3-material-menu.png', fullPage: true });
    this.logger.log('📸 截图3已保存: /tmp/screenshot-3-material-menu.png');

    // 点击弹出菜单中的"视频号素材"选项 - 使用鼠标模拟点击
    this.logger.log('📋 点击"视频号素材"选项...');

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

    this.logger.log(`✅ 找到"视频号素材"元素，位置: (${videoMaterialPosition.x}, ${videoMaterialPosition.y})`);

    // 移动鼠标到元素位置
    await page.mouse.move(videoMaterialPosition.x, videoMaterialPosition.y);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 点击
    await page.mouse.click(videoMaterialPosition.x, videoMaterialPosition.y);

    this.logger.log('✅ 已点击"视频号素材"选项（模拟鼠标点击）');

    // 等待素材库对话框打开
    this.logger.log('⏳ 等待素材库对话框打开...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 截图4：点击"视频号素材"后
    await page.screenshot({ path: '/tmp/screenshot-4-after-click-video.png', fullPage: true });
    this.logger.log('📸 截图4已保存: /tmp/screenshot-4-after-click-video.png');

    // 检查是否打开了素材库对话框 - 通过检测特征元素
    const dialogOpened = await page.evaluate(() => {
      // 查找包含"公共素材"和"部门素材"的元素
      const allElements = document.querySelectorAll('*');
      let hasPublicMaterial = false;
      let hasDepartmentMaterial = false;
      let hasPublicGroup = false;

      for (const el of allElements) {
        const text = el.textContent?.trim() || '';
        if (text === '公共素材') hasPublicMaterial = true;
        if (text === '部门素材') hasDepartmentMaterial = true;
        if (text === '公共素材分组') hasPublicGroup = true;
      }

      return {
        opened: hasPublicMaterial && hasDepartmentMaterial && hasPublicGroup,
        hasPublicMaterial,
        hasDepartmentMaterial,
        hasPublicGroup,
      };
    });

    this.logger.log(`📊 对话框检测结果: ${JSON.stringify(dialogOpened)}`);

    if (!dialogOpened.opened) {
      throw new Error('素材库对话框未打开');
    }

    this.logger.log('✅ 素材库对话框已打开');

    // 点击"公共素材分组"展开右侧素材列表
    this.logger.log('📁 点击"公共素材分组"展开素材列表...');
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

    this.logger.log(`点击结果: ${JSON.stringify(clickResult)}`);

    // 等待素材列表加载完成
    this.logger.log('⏳ 等待素材列表加载...');
    try {
      await page.waitForSelector('.materials-link-wrap', { timeout: 10000 });
      this.logger.log('✅ 素材列表已加载');
    } catch (error) {
      this.logger.warn('⚠️ 未找到素材列表，可能没有素材');

      // 调试：查看页面上有什么元素
      const debugInfo = await page.evaluate(() => {
        const allDivs = document.querySelectorAll('div[class*="material"]');
        return {
          materialsCount: allDivs.length,
          classes: Array.from(allDivs).slice(0, 5).map(div => div.className),
        };
      });
      this.logger.log(`调试信息: ${JSON.stringify(debugInfo)}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * 获取当前页的素材列表
   */
  private async getMaterialsFromCurrentPage(page: puppeteer.Page, pageNumber: number): Promise<any[]> {
    this.logger.log(`📄 获取第 ${pageNumber} 页素材...`);

    // 等待素材列表加载
    await new Promise(resolve => setTimeout(resolve, 2000));

    const materials = await page.evaluate((pageNum) => {
      const results = [];

      // 调试：查找所有可能的素材容器
      const allDivs = document.querySelectorAll('div[class*="materials"]');
      console.log(`🔍 找到 ${allDivs.length} 个包含"materials"的div`);

      // 查找所有素材卡片容器
      // 每个素材卡片的class是 materials-link-wrap
      const materialCards = document.querySelectorAll('.materials-link-wrap');
      console.log(`🔍 找到 ${materialCards.length} 个 .materials-link-wrap 元素`);

      // 如果没有找到，尝试使用属性选择器
      if (materialCards.length === 0) {
        const materialCardsAlt = document.querySelectorAll('div[class*="materials-link-wrap"]');
        console.log(`🔍 使用属性选择器找到 ${materialCardsAlt.length} 个素材卡片`);

        materialCardsAlt.forEach((card, index) => {
          try {
            // 获取作者名（在 .text-title 的 title 属性中）
            const titleElement = card.querySelector('[class*="text-title"]');
            const authorName = titleElement?.getAttribute('title') || '';

            // 获取内容描述（在 .text-desc 中）
            const descElement = card.querySelector('[class*="text-desc"]');
            const contentDesc = descElement?.textContent?.trim() || '';

            // 获取缩略图URL（在 .img-wrap img 的 src 属性中）
            const imgElement = card.querySelector('[class*="img-wrap"] img');
            const thumbnailUrl = imgElement?.getAttribute('src') || '';

            console.log(`素材 ${index + 1}: 作者="${authorName}", 内容="${contentDesc?.substring(0, 30) || '(无描述)'}..."`);

            // 只添加有效的素材（只要有作者名就保留，contentDesc可以为空）
            if (authorName) {
              results.push({
                authorName,
                contentDesc: contentDesc || '(无描述)',
                thumbnailUrl,
                materialIndex: index,
                pageNumber: pageNum,
              });
            }
          } catch (error) {
            console.error('解析素材卡片失败:', error);
          }
        });
      } else {
        materialCards.forEach((card, index) => {
          try {
            // 获取作者名（在 .text-title 的 title 属性中）
            const titleElement = card.querySelector('.text-title');
            const authorName = titleElement?.getAttribute('title') || '';

            // 获取内容描述（在 .text-desc 中）
            const descElement = card.querySelector('.text-desc');
            const contentDesc = descElement?.textContent?.trim() || '';

            // 获取缩略图URL（在 .img-wrap img 的 src 属性中）
            const imgElement = card.querySelector('.img-wrap img');
            const thumbnailUrl = imgElement?.getAttribute('src') || '';

            // 只添加有效的素材（只要有作者名就保留，contentDesc可以为空）
            if (authorName) {
              results.push({
                authorName,
                contentDesc: contentDesc || '(无描述)',
                thumbnailUrl,
                materialIndex: index,
                pageNumber: pageNum,
              });
            }
          } catch (error) {
            console.error('解析素材卡片失败:', error);
          }
        });
      }

      return results;
    }, pageNumber);

    // 详细记录爬取到的数据
    this.logger.log(`✅ 第 ${pageNumber} 页获取到 ${materials.length} 个素材`);
    materials.forEach((m, index) => {
      this.logger.log(`   素材 ${index + 1}: 作者="${m.authorName}", 内容="${m.contentDesc.substring(0, 50)}..."`);
    });

    return materials;
  }

  /**
   * 检查是否有下一页
   */
  private async hasNextPage(page: puppeteer.Page): Promise<boolean> {
    const hasNext = await page.evaluate(() => {
      // 查找所有包含右箭头图标的按钮
      const rightArrowButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const icon = btn.querySelector('.el-icon-arrow-right');
        return icon !== null;
      });

      // 检查是否有未禁用的下一页按钮
      for (const button of rightArrowButtons) {
        const isDisabled = button.classList.contains('is-disabled') || button.disabled;
        if (!isDisabled) {
          return true;
        }
      }

      return false;
    });
    return hasNext;
  }

  /**
   * 点击下一页
   */
  private async goToNextPage(page: puppeteer.Page): Promise<void> {
    await page.evaluate(() => {
      // 查找所有包含右箭头图标的按钮
      const rightArrowButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
        const icon = btn.querySelector('.el-icon-arrow-right');
        return icon !== null;
      });

      // 点击第一个未禁用的下一页按钮
      for (const button of rightArrowButtons) {
        const isDisabled = button.classList.contains('is-disabled') || button.disabled;
        if (!isDisabled) {
          (button as HTMLElement).click();
          return;
        }
      }
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  /**
   * 同步视频号素材库
   */
  async syncMaterialLibrary(userId: string): Promise<{ success: boolean; count: number; error?: string }> {
    if (this.isSyncing) {
      return { success: false, count: 0, error: '素材库正在同步中，请稍后再试' };
    }

    this.isSyncing = true;
    let browser: puppeteer.Browser = null;
    let page: puppeteer.Page = null;

    try {
      this.logger.log(`🚀 开始同步用户 ${userId} 的视频号素材库...`);

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

      // 通过环境变量PUPPETEER_HEADLESS控制是否显示浏览器
      // 默认为true(无头模式),设置为'false'时显示浏览器
      const headless = process.env.PUPPETEER_HEADLESS !== 'false';
      this.logger.log(`🌐 浏览器模式: ${headless ? '无头模式(不可见)' : '有头模式(可见)'}`);

      browser = await puppeteer.launch({
        headless: headless,
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

      // 截图1：登录后的页面
      await page.screenshot({ path: '/tmp/screenshot-1-after-login.png', fullPage: true });
      this.logger.log('📸 截图1已保存: /tmp/screenshot-1-after-login.png');

      // 打开素材库对话框
      await this.openMaterialDialog(page);

      // 截图2：打开素材库对话框后
      await page.screenshot({ path: '/tmp/screenshot-2-after-open-dialog.png', fullPage: true });
      this.logger.log('📸 截图2已保存: /tmp/screenshot-2-after-open-dialog.png');

      // 爬取所有页的素材
      const allMaterials = [];
      let currentPage = 1;
      let hasMore = true;

      while (hasMore) {
        // 获取当前页素材
        const materials = await this.getMaterialsFromCurrentPage(page, currentPage);
        allMaterials.push(...materials);

        // 检查是否有下一页
        hasMore = await this.hasNextPage(page);
        
        if (hasMore) {
          await this.goToNextPage(page);
          currentPage++;
        }
      }

      this.logger.log(`📊 共获取到 ${allMaterials.length} 个视频号素材`);

      // 清空旧数据
      await this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .delete()
        .eq('user_id', userId);

      // 批量插入新数据（使用upsert避免重复）
      if (allMaterials.length > 0) {
        const materialsToInsert = allMaterials.map(m => ({
          user_id: userId,
          author_name: m.authorName,
          content_desc: m.contentDesc,
          thumbnail_url: m.thumbnailUrl,
          material_index: m.materialIndex,
          page_number: m.pageNumber,
          group_name: '公共素材分组',
        }));

        // 去重：使用Map保留每个唯一组合的最后一条记录
        // 使用 page_number + material_index 作为唯一标识，确保每个位置的素材都被保留
        const uniqueMaterials = new Map<string, any>();
        materialsToInsert.forEach(material => {
          const key = `${material.user_id}_${material.page_number}_${material.material_index}`;
          uniqueMaterials.set(key, material);
        });

        const deduplicatedMaterials = Array.from(uniqueMaterials.values());
        this.logger.log(`📊 去重前: ${materialsToInsert.length} 条，去重后: ${deduplicatedMaterials.length} 条`);

        // 先删除该用户的所有素材，再插入新素材（避免unique constraint冲突）
        const { error: deleteError } = await this.supabaseService.getClient()
          .from('duixueqiu_video_materials')
          .delete()
          .eq('user_id', userId);

        if (deleteError) {
          this.logger.warn(`⚠️ 删除旧素材失败: ${deleteError.message}`);
        }

        // 插入新素材
        const { error: insertError } = await this.supabaseService.getClient()
          .from('duixueqiu_video_materials')
          .insert(deduplicatedMaterials);

        if (insertError) {
          throw new Error(`保存素材到数据库失败: ${insertError.message}`);
        }
      }

      this.logger.log('✅ 素材库同步完成');

      return {
        success: true,
        count: allMaterials.length,
      };

    } catch (error) {
      this.logger.error('❌ 同步素材库失败:', error);
      return {
        success: false,
        count: 0,
        error: error.message,
      };
    } finally {
      if (page) await page.close();
      if (browser) await browser.close();
      this.isSyncing = false;
    }
  }

  /**
   * 获取素材库列表
   */
  async getMaterialList(userId: string, search?: string): Promise<any[]> {
    try {
      let query = this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*')
        .eq('user_id', userId)
        .order('sync_time', { ascending: false });

      // 如果有搜索关键词
      if (search) {
        query = query.or(`author_name.ilike.%${search}%,content_desc.ilike.%${search}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`获取素材列表失败: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      this.logger.error('❌ 获取素材列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取素材库统计信息
   */
  async getMaterialStats(userId: string): Promise<{ total: number; lastSyncTime: string }> {
    try {
      const { data, error } = await this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('sync_time')
        .eq('user_id', userId)
        .order('sync_time', { ascending: false })
        .limit(1);

      if (error) {
        throw new Error(`获取素材统计失败: ${error.message}`);
      }

      const { count } = await this.supabaseService.getClient()
        .from('duixueqiu_video_materials')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      return {
        total: count || 0,
        lastSyncTime: data && data.length > 0 ? data[0].sync_time : null,
      };
    } catch (error) {
      this.logger.error('❌ 获取素材统计失败:', error);
      throw error;
    }
  }
}

