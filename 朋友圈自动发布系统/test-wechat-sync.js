/**
 * 本地测试脚本 - 同步微信号列表
 * 用于调试Puppeteer操作过程
 * 
 * 运行方式: node test-wechat-sync.js
 */

const puppeteer = require('puppeteer');

// 堆雪球账号信息
const DUIXUEQIU_USERNAME = 'lifangde001';
const DUIXUEQIU_PASSWORD = 'Lfd666888#';
const DUIXUEQIU_URL = 'https://dxqscrm.duixueqiu.cn/';

/**
 * 登录堆雪球系统
 */
async function loginDuixueqiu(page, username, password) {
  console.log('🔐 开始登录堆雪球系统...');
  
  await page.goto(DUIXUEQIU_URL, { waitUntil: 'networkidle2' });
  
  // 等待登录表单加载
  await page.waitForSelector('input[placeholder="请输入账号"]', { timeout: 10000 });
  
  // 输入账号密码
  await page.type('input[placeholder="请输入账号"]', username);
  await page.type('input[placeholder="请输入密码"]', password);
  
  console.log('✅ 已输入账号密码');
  
  // 点击登录按钮
  await page.click('button.el-button--primary');
  
  console.log('🔄 等待登录完成...');
  
  // 等待登录成功后的页面元素
  await page.waitForSelector('.el-menu', { timeout: 15000 });
  
  console.log('✅ 登录成功!');
}

/**
 * 获取微信号列表
 */
async function getWechatAccounts(page) {
  console.log('\n📱 开始获取微信号列表...');

  try {
    // 等待页面完全加载
    await page.waitForTimeout(2000);

    // 查找账号管理按钮
    console.log('🔍 查找账号管理按钮...');

    // 尝试多种选择器
    const selectors = [
      '.el-dropdown-link',
      '[class*="dropdown"]',
      '.user-info',
      '.account-selector',
      'span.el-dropdown-link'
    ];

    let accountButton = null;
    for (const selector of selectors) {
      try {
        accountButton = await page.$(selector);
        if (accountButton) {
          console.log(`✅ 找到账号按钮: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`❌ 选择器失败: ${selector}`);
      }
    }

    if (!accountButton) {
      console.log('⚠️ 未找到账号管理按钮，尝试直接查找微信号列表...');

      // 直接查找微信号列表（可能已经展开）
      const wechatAccounts = await page.evaluate(() => {
        const elements = document.querySelectorAll('[title*="号机"], [title*="助理"]');
        const accounts = [];
        elements.forEach((el, index) => {
          const name = el.getAttribute('title');
          if (name) {
            accounts.push({ name: name, index: index });
          }
        });
        return accounts;
      });

      if (wechatAccounts.length > 0) {
        console.log(`✅ 直接找到 ${wechatAccounts.length} 个微信号:`);
        wechatAccounts.forEach((account, index) => {
          console.log(`  ${index + 1}. ${account.name}`);
        });
        return wechatAccounts;
      }

      // 获取页面HTML用于调试
      console.log('⚠️ 未找到微信号列表，保存页面信息用于调试...');
      const html = await page.content();
      console.log('\n📄 页面HTML片段:');
      console.log(html.substring(0, 2000));

      // 截图保存
      await page.screenshot({ path: 'debug-page.png', fullPage: true });
      console.log('📸 已保存截图到 debug-page.png');

      return [];
    }

    // 点击账号管理按钮
    console.log('🖱️ 点击账号管理按钮...');
    await accountButton.click();
    await page.waitForTimeout(1000);

    // 获取微信号列表
    console.log('🔍 查找微信号列表...');

    const wechatAccounts = await page.evaluate(() => {
      // 查找所有包含"号机"或"助理"的元素
      const elements = document.querySelectorAll('[title*="号机"], [title*="助理"]');
      console.log('找到元素数量:', elements.length);

      const accounts = [];
      elements.forEach((el, index) => {
        const name = el.getAttribute('title');
        if (name) {
          accounts.push({
            name: name,
            index: index
          });
          console.log(`微信号 ${index + 1}: ${name}`);
        }
      });

      return accounts;
    });

    console.log(`\n✅ 成功获取 ${wechatAccounts.length} 个微信号:`);
    wechatAccounts.forEach((account, index) => {
      console.log(`  ${index + 1}. ${account.name}`);
    });

    return wechatAccounts;

  } catch (error) {
    console.error('❌ 获取微信号列表失败:', error.message);
    console.error('错误堆栈:', error.stack);

    // 截图保存错误状态
    await page.screenshot({ path: 'error-page.png', fullPage: true });
    console.log('📸 已保存错误截图到 error-page.png');

    return [];
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始测试微信号同步功能\n');
  
  let browser = null;
  
  try {
    // 启动浏览器 (非无头模式,可以看到操作过程)
    console.log('🌐 启动浏览器...');
    browser = await puppeteer.launch({
      headless: false,  // 设置为false可以看到浏览器
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1920,1080'
      ],
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });
    
    const page = await browser.newPage();
    
    // 设置控制台日志输出
    page.on('console', msg => {
      console.log('🖥️ 浏览器控制台:', msg.text());
    });
    
    // 登录堆雪球
    await loginDuixueqiu(page, DUIXUEQIU_USERNAME, DUIXUEQIU_PASSWORD);
    
    // 获取微信号列表
    const wechatAccounts = await getWechatAccounts(page);
    
    console.log('\n📊 测试结果:');
    console.log(`  - 微信号数量: ${wechatAccounts.length}`);
    console.log(`  - 微信号列表: ${JSON.stringify(wechatAccounts, null, 2)}`);
    
    // 等待用户查看
    console.log('\n⏸️ 浏览器将保持打开状态30秒,请查看页面...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error('错误堆栈:', error.stack);
  } finally {
    if (browser) {
      console.log('\n🔚 关闭浏览器...');
      await browser.close();
    }
  }
  
  console.log('\n✅ 测试完成!');
}

// 运行主函数
main().catch(console.error);

