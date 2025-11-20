/**
 * 测试脚本: 同步堆雪球好友列表
 * 用途: 测试按微信号分别同步好友的逻辑
 * 运行: node test-sync-friends.js
 */

const puppeteer = require('puppeteer');

// 堆雪球账号配置
const DUIXUEQIU_USERNAME = 'lifangde001';
const DUIXUEQIU_PASSWORD = 'Lfd666888#';

// 测试前3个微信号
const MAX_WECHAT_ACCOUNTS = 3;

/**
 * 登录堆雪球
 */
async function loginDuixueqiu(page, username, password) {
  console.log('🔐 开始登录堆雪球客服端...');

  // 访问客服端登录页面
  await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', { waitUntil: 'networkidle2' });

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
        button.click();
        break;
      }
    }
  });

  // 等待登录完成
  await page.waitForNavigation({ waitUntil: 'networkidle2' });

  // 检查是否登录成功
  const currentUrl = page.url();
  console.log(`当前页面URL: ${currentUrl}`);

  if (currentUrl.includes('/user/login/')) {
    throw new Error('登录失败,仍在登录页面');
  }

  console.log('✅ 登录成功');

  // 登录后多等待一会儿,确保页面完全加载
  console.log('等待页面完全加载...');
  await new Promise(resolve => setTimeout(resolve, 5000));
}

/**
 * 获取所有微信号列表
 */
async function getWechatAccountsList(page) {
  console.log('获取微信号列表...');

  try {
    // 检查当前页面URL
    const currentUrl = page.url();
    console.log(`当前页面URL: ${currentUrl}`);

    if (currentUrl.includes('/user/login/')) {
      throw new Error('页面跳转到登录页面,可能是登录超时');
    }

    // 等待微信号列表容器出现
    await page.waitForSelector('.wechat-account-list', { timeout: 15000 });

    // 智能等待Vue渲染完成 - 等待"客服没有分配粉丝"文本消失
    const maxWaitForVue = 60000;
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
        console.log(`✅ Vue已渲染完成! (耗时${elapsed}秒)`);
      } else {
        const elapsed = ((Date.now() - startTimeVue) / 1000).toFixed(1);
        console.log(`⏳ Vue仍在渲染... (已等待${elapsed}秒)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!vueRendered) {
      console.warn('⚠️ Vue渲染超时,但继续执行...');
    }

    // 获取所有微信号
    const accounts = await page.evaluate(() => {
      const items = document.querySelectorAll('.wechat-account-list > .item');
      const result = [];

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

    console.log(`✅ 获取到 ${accounts.length} 个微信号`);
    return accounts;
  } catch (error) {
    console.error(`获取微信号列表失败: ${error.message}`);
    throw error;
  }
}

/**
 * 点击指定的微信号
 */
async function clickWechatAccount(page, accountName) {
  console.log(`点击微信号: ${accountName}`);

  try {
    const clicked = await page.evaluate((name) => {
      const items = document.querySelectorAll('.wechat-account-list > .item');
      for (const item of items) {
        const nameDiv = item.querySelector('.name');
        if (nameDiv && nameDiv.textContent?.trim() === name) {
          item.click();
          return true;
        }
      }
      return false;
    }, accountName);

    if (!clicked) {
      throw new Error(`未找到微信号: ${accountName}`);
    }

    console.log(`✅ 已点击微信号: ${accountName}`);
  } catch (error) {
    console.error(`点击微信号失败: ${error.message}`);
    throw error;
  }
}

/**
 * 点击"好友列表"标签
 */
async function clickFriendListTab(page) {
  try {
    console.log('点击"好友列表"标签...');

    const clicked = await page.evaluate(() => {
      // 查找所有div元素
      const divs = document.querySelectorAll('div');
      for (const div of divs) {
        // 检查textContent是否为"好友列表"
        if (div.textContent?.trim() === '好友列表' && div.getAttribute('title') === '好友列表') {
          div.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      console.warn('⚠️ 未找到"好友列表"标签,可能已经在好友列表页面');
    }

    // 等待页面更新
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('✅ 已点击"好友列表"标签');
  } catch (error) {
    console.error(`点击"好友列表"标签失败: ${error.message}`);
    throw error;
  }
}

/**
 * 点击"未分组"展开好友列表
 */
async function clickUnfoldGroup(page) {
  console.log('点击未分组展开好友列表...');

  // 等待页面加载
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 点击"未分组"
  const unfoldClicked = await page.evaluate(() => {
    const allSpans = document.querySelectorAll('span');
    for (const span of allSpans) {
      const text = span.textContent?.trim() || '';
      if (text.match(/^未分组[（(]\d+个[）)]$/)) {
        span.click();
        return true;
      }
    }
    return false;
  });

  if (!unfoldClicked) {
    throw new Error('未找到"未分组"');
  }

  console.log('✅ 已点击未分组');

  // 等待好友列表加载
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * 获取好友列表(测试版,滚动20次)
 */
async function getFriendsList(page) {
  console.log('开始获取好友列表...');

  const allFriendsMap = new Map();
  let scrollAttempts = 0;
  const maxScrollAttempts = 20; // 测试用,只滚动20次
  let previousCount = 0;
  let stableCount = 0;

  console.log('📜 开始滚动加载好友...');

  while (scrollAttempts < maxScrollAttempts && stableCount < 10) {
    // 收集当前可见的好友 - 使用精确的选择器
    const visibleFriends = await page.evaluate(() => {
      // 只选择好友列表中的好友元素,不包括左侧微信号列表
      const friendElements = document.querySelectorAll('.recent-and-friend-panel-concat-item__friend');
      const friends = [];
      const seenFriends = new Set();

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

      return friends;
    });

    // 添加到总列表(使用Map去重,保留最新的头像URL)
    visibleFriends.forEach(friend => {
      allFriendsMap.set(friend.name, friend);
    });

    // 检查是否稳定
    if (allFriendsMap.size === previousCount) {
      stableCount++;
    } else {
      stableCount = 0;
      previousCount = allFriendsMap.size;
    }

    console.log(`  滚动 ${scrollAttempts + 1}/${maxScrollAttempts}: 当前收集到 ${allFriendsMap.size} 个好友`);

    // 滚动
    await page.evaluate(() => {
      const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
      if (scrollableElements.length > 0) {
        scrollableElements[0].scrollBy(0, 300);
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    scrollAttempts++;
  }

  console.log(`✅ 滚动完成,共滚动 ${scrollAttempts} 次,稳定次数 ${stableCount}`);

  const friendsList = Array.from(allFriendsMap.values());
  console.log(`✅ 获取到 ${friendsList.length} 个好友`);

  return friendsList;
}

/**
 * 主函数
 */
async function main() {
  let browser = null;
  let page = null;

  try {
    console.log('🚀 开始测试同步好友列表...\n');

    // 启动浏览器(非headless模式,可以看到操作过程)
    browser = await puppeteer.launch({
      headless: false, // 显示浏览器窗口
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 登录堆雪球
    await loginDuixueqiu(page, DUIXUEQIU_USERNAME, DUIXUEQIU_PASSWORD);

    // 获取所有微信号列表
    const wechatAccounts = await getWechatAccountsList(page);
    console.log(`\n找到 ${wechatAccounts.length} 个微信号\n`);

    // 只测试前3个微信号
    const testAccounts = wechatAccounts.slice(0, MAX_WECHAT_ACCOUNTS);
    console.log(`📋 将测试前 ${testAccounts.length} 个微信号\n`);

    let totalFriends = 0;
    const accountDetails = [];

    // 遍历每个微信号,分别同步好友
    for (let i = 0; i < testAccounts.length; i++) {
      const wechatAccount = testAccounts[i];
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[${i + 1}/${testAccounts.length}] 开始同步微信号: ${wechatAccount.name}`);
      console.log(`${'='.repeat(60)}\n`);

      try {
        // 检查是否还在主页面
        const currentUrl = page.url();
        console.log(`当前页面URL: ${currentUrl}`);

        if (currentUrl.includes('/user/login/')) {
          throw new Error('页面跳转到登录页面,可能是登录超时');
        }

        // 点击该微信号
        await clickWechatAccount(page, wechatAccount.name);

        // 等待页面加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 点击"好友列表"标签
        await clickFriendListTab(page);

        // 点击"未分组"展开好友列表
        await clickUnfoldGroup(page);

        // 获取该微信号的好友列表
        const friends = await getFriendsList(page);
        console.log(`\n✅ 微信号 ${wechatAccount.name} 获取到 ${friends.length} 个好友`);

        totalFriends += friends.length;
        accountDetails.push({
          index: wechatAccount.index,
          name: wechatAccount.name,
          friendCount: friends.length,
        });

        // 显示前10个好友(包含头像URL)
        if (friends.length > 0) {
          console.log('\n前10个好友:');
          friends.slice(0, 10).forEach((friend, idx) => {
            console.log(`  ${idx + 1}. ${friend.name}`);
            console.log(`     头像: ${friend.avatarUrl || '无'}`);
          });
        }

      } catch (error) {
        console.error(`\n❌ 同步微信号 ${wechatAccount.name} 失败: ${error.message}`);
        accountDetails.push({
          index: wechatAccount.index,
          name: wechatAccount.name,
          friendCount: 0,
          error: error.message,
        });
      }
    }

    // 输出总结
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 同步完成! 总结:');
    console.log(`${'='.repeat(60)}\n`);
    console.log(`总计同步 ${testAccounts.length} 个微信号, ${totalFriends} 个好友\n`);
    console.log('详细信息:');
    accountDetails.forEach((detail, idx) => {
      console.log(`  ${idx + 1}. ${detail.name}: ${detail.friendCount} 个好友 ${detail.error ? `(错误: ${detail.error})` : ''}`);
    });

    console.log('\n✅ 测试完成!');

  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}`);
    console.error(error.stack);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

// 运行主函数
main();

