/**
 * 测试脚本 - 调试获取微信号列表
 * 用于排查为什么有时能获取到17个微信号,有时获取到0个
 */

const puppeteer = require('puppeteer');

// 堆雪球账号信息(从环境变量或直接填写)
const DUIXUEQIU_USERNAME = process.env.DUIXUEQIU_USERNAME || '18616221361';
const DUIXUEQIU_PASSWORD = process.env.DUIXUEQIU_PASSWORD || 'Aa112211';

async function testGetWechatAccounts() {
  console.log('🚀 开始测试获取微信号列表...\n');
  
  let browser = null;
  let page = null;

  try {
    // 启动浏览器
    console.log('📱 启动浏览器...');
    browser = await puppeteer.launch({
      headless: false, // 设置为false可以看到浏览器界面
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // 登录堆雪球
    console.log('🔐 开始登录堆雪球...');
    await page.goto('https://dxqscrm.duixueqiu.cn/admin/login', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // 截图看看登录页面
    await page.screenshot({ path: 'login-page.png' });
    console.log('📸 登录页面截图已保存: login-page.png');

    // 等待页面加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 尝试多种可能的选择器
    const phoneInputSelectors = [
      'input[placeholder="请输入手机号"]',
      'input[type="text"]',
      'input[name="username"]',
      'input[name="phone"]',
      '.el-input__inner',
    ];

    let phoneInput = null;
    for (const selector of phoneInputSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        phoneInput = selector;
        console.log(`✅ 找到手机号输入框: ${selector}`);
        break;
      } catch (e) {
        console.log(`❌ 未找到选择器: ${selector}`);
      }
    }

    if (!phoneInput) {
      console.log('❌ 无法找到手机号输入框,请检查截图 login-page.png');
      return;
    }

    await page.type(phoneInput, DUIXUEQIU_USERNAME);

    // 查找密码输入框
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.type(DUIXUEQIU_PASSWORD);
    } else {
      console.log('❌ 未找到密码输入框');
      return;
    }

    // 查找提交按钮
    const submitButton = await page.$('button[type="submit"]');
    if (submitButton) {
      await Promise.all([
        submitButton.click(),
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      ]);
    } else {
      console.log('❌ 未找到提交按钮');
      return;
    }

    console.log('✅ 登录成功\n');

    // 等待页面完全加载
    console.log('⏳ 等待页面完全加载...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 测试1: 检查 .wechat-account-list 容器
    console.log('📋 测试1: 检查 .wechat-account-list 容器');
    const hasContainer = await page.evaluate(() => {
      const container = document.querySelector('.wechat-account-list');
      return !!container;
    });
    console.log(`   容器存在: ${hasContainer ? '✅ 是' : '❌ 否'}\n`);

    if (!hasContainer) {
      console.log('❌ 未找到 .wechat-account-list 容器,尝试查找其他可能的选择器...\n');
      
      // 打印页面HTML结构
      const bodyHTML = await page.evaluate(() => {
        return document.body.innerHTML.substring(0, 2000);
      });
      console.log('📄 页面HTML前2000字符:');
      console.log(bodyHTML);
      console.log('\n');
      
      return;
    }

    // 测试2: 检查容器内容
    console.log('📋 测试2: 检查容器内容');
    const containerInfo = await page.evaluate(() => {
      const container = document.querySelector('.wechat-account-list');
      if (!container) return null;
      
      return {
        innerHTML: container.innerHTML.substring(0, 500),
        textContent: container.textContent?.substring(0, 200),
        childrenCount: container.children.length,
      };
    });
    
    console.log('   容器信息:');
    console.log(`   - 子元素数量: ${containerInfo.childrenCount}`);
    console.log(`   - 文本内容前200字符: ${containerInfo.textContent}`);
    console.log(`   - HTML内容前500字符: ${containerInfo.innerHTML}\n`);

    // 测试3: 等待Vue渲染(检查是否有.item元素)
    console.log('📋 测试3: 等待Vue渲染完成');
    const maxWaitForVue = 120000;
    const startTimeVue = Date.now();
    let vueRendered = false;
    let lastItemCount = 0;

    while (!vueRendered && (Date.now() - startTimeVue) < maxWaitForVue) {
      const itemCount = await page.evaluate(() => {
        const items = document.querySelectorAll('.wechat-account-list > .item');
        return items.length;
      });

      if (itemCount > 0) {
        vueRendered = true;
        const elapsed = ((Date.now() - startTimeVue) / 1000).toFixed(1);
        console.log(`   ✅ Vue已渲染完成! 找到 ${itemCount} 个微信号 (耗时${elapsed}秒)\n`);
      } else {
        const elapsed = ((Date.now() - startTimeVue) / 1000).toFixed(1);
        console.log(`   ⏳ Vue仍在渲染... (已等待${elapsed}秒)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      lastItemCount = itemCount;
    }

    if (!vueRendered) {
      console.log('   ⚠️ Vue渲染超时!\n');
      
      // 打印容器当前内容
      const currentHTML = await page.evaluate(() => {
        const container = document.querySelector('.wechat-account-list');
        return container ? container.innerHTML : '容器不存在';
      });
      console.log('   当前容器HTML:');
      console.log(currentHTML.substring(0, 1000));
      console.log('\n');
    }

    // 测试4: 尝试获取微信号列表
    console.log('📋 测试4: 获取微信号列表');
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

    console.log(`   ✅ 获取到 ${accounts.length} 个微信号:`);
    accounts.forEach(account => {
      console.log(`      [${account.index}] ${account.name}`);
    });
    console.log('\n');

    // 测试5: 尝试其他可能的选择器
    if (accounts.length === 0) {
      console.log('📋 测试5: 尝试其他可能的选择器');
      
      const alternativeSelectors = [
        '.wechat-account-list .item',
        '.wechat-list > .item',
        '.account-list > .item',
        '[class*="wechat"] [class*="item"]',
        '[class*="account"] [class*="item"]',
      ];

      for (const selector of alternativeSelectors) {
        const count = await page.evaluate((sel) => {
          return document.querySelectorAll(sel).length;
        }, selector);
        
        console.log(`   选择器 "${selector}": ${count} 个元素`);
      }
      console.log('\n');
    }

    // 保持浏览器打开30秒,方便手动检查
    console.log('⏸️  浏览器将保持打开30秒,您可以手动检查页面...');
    await new Promise(resolve => setTimeout(resolve, 30000));

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔚 浏览器已关闭');
    }
  }
}

// 运行测试
testGetWechatAccounts().catch(console.error);

