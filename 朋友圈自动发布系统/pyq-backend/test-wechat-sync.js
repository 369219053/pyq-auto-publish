/**
 * 测试脚本 - 同步微信号列表
 * 用于调试Puppeteer操作过程
 */

const puppeteer = require('puppeteer');

// 堆雪球账号信息
const DUIXUEQIU_USERNAME = 'lifangde001';
const DUIXUEQIU_PASSWORD = 'Lfd666888#';

async function testSyncWechatAccounts() {
  let browser = null;
  let page = null;

  try {
    console.log('🚀 启动浏览器...');
    
    // 启动浏览器 - 非headless模式,可以看到操作过程
    browser = await puppeteer.launch({
      headless: false, // 设置为false,显示浏览器窗口
      devtools: true,  // 打开开发者工具
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
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

    console.log('🔐 开始登录堆雪球系统...');
    
    // 1. 访问登录页面
    await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('✅ 登录页面加载完成');
    
    // 2. 输入账号密码
    await page.type('input[placeholder="账号"]', DUIXUEQIU_USERNAME);
    await page.type('input[placeholder="密码"]', DUIXUEQIU_PASSWORD);
    
    console.log('✅ 已输入账号密码');
    
    // 3. 点击登录按钮
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const loginButton = buttons.find(btn => btn.textContent.includes('登录'));
      if (loginButton) {
        loginButton.click();
      }
    });

    console.log('⏳ 等待登录跳转...');
    
    // 4. 等待跳转到客服端页面
    await page.waitForNavigation({ 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    console.log('✅ 登录成功,已跳转到客服端页面');
    console.log('📍 当前页面URL:', page.url());
    
    // 5. 智能等待客服端页面加载完成
    console.log('⏳ 等待客服端页面加载...');

    // 先等待容器出现
    await page.waitForSelector('.wechat-account-list', { timeout: 15000 });
    console.log('✅ 找到.wechat-account-list容器');

    // 等待.item元素出现(微信号列表项)
    console.log('⏳ 等待微信号列表项出现...');

    try {
      await page.waitForSelector('.wechat-account-list .item', { timeout: 30000 });
      console.log('✅ 微信号列表项已出现!');
    } catch (error) {
      console.log('⚠️ 等待超时,未检测到.item元素,可能没有微信号');
    }

    console.log('✅ 客服端页面加载完成');

    // 6. 智能等待Vue渲染完成 - 检测HTML内容变化
    console.log('\n⏳ 等待Vue渲染完成...\n');

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
        console.log('✅ Vue已渲染完成!');
        console.log(`📄 当前HTML(前100字符): ${html}`);
      } else {
        const elapsed = ((Date.now() - startTimeVue) / 1000).toFixed(1);
        console.log(`⏳ Vue仍在渲染... (已等待${elapsed}秒)`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    if (!vueRendered) {
      console.log('⚠️ Vue渲染超时,但继续执行...');
    }

    // 7. 再次智能等待微信号列表稳定
    console.log('\n🔍 开始检测微信号数量...\n');

    let previousCount = 0;
    let stableCount = 0;
    const maxAttempts = 20;

    for (let i = 0; i < maxAttempts; i++) {
      const { count, html } = await page.evaluate(() => {
        const container = document.querySelector('.wechat-account-list');
        if (!container) return { count: 0, html: '容器不存在' };
        const items = container.querySelectorAll('.item');
        return {
          count: items.length,
          html: container.innerHTML.substring(0, 500)
        };
      });

      console.log(`📊 第${i + 1}次检测,当前微信号数量: ${count}`);

      if (i === 0) {
        console.log(`📄 容器HTML内容(前500字符):\n${html}\n`);
      }

      if (count === previousCount && count > 0) {
        stableCount++;
        console.log(`✅ 数量稳定 (${stableCount}/3)`);
        if (stableCount >= 3) {
          console.log(`✅ 微信号列表加载完成,共 ${count} 个`);
          break;
        }
      } else {
        stableCount = 0;
        if (count !== previousCount) {
          console.log(`🔄 数量变化: ${previousCount} → ${count}`);
        }
      }

      previousCount = count;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 8. 获取微信号列表
    console.log('\n📱 获取微信号列表...\n');
    
    const wechatAccounts = await page.evaluate(() => {
      const container = document.querySelector('.wechat-account-list');
      
      if (!container) {
        console.log('未找到.wechat-account-list容器');
        return [];
      }
      
      const accountItems = container.querySelectorAll('.item');
      
      console.log(`找到 ${accountItems.length} 个微信号`);
      
      const accounts = Array.from(accountItems).map((item, index) => {
        const name = item.getAttribute('title') || '';
        console.log(`微信号 ${index}: ${name}`);
        return {
          name: name,
          index: index
        };
      });
      
      return accounts.filter(item => item.name && item.name.length > 0);
    });
    
    console.log(`\n✅ 成功获取 ${wechatAccounts.length} 个微信号:`);
    wechatAccounts.forEach((account, index) => {
      console.log(`  ${index + 1}. ${account.name}`);
    });
    
    console.log('\n✅ 测试完成!浏览器将保持打开状态,按Ctrl+C退出');
    
    // 保持浏览器打开,方便查看
    await new Promise(() => {});
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误堆栈:', error.stack);
    
    if (page) {
      // 截图保存错误现场
      const screenshotPath = `error-screenshot-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`📸 已保存错误截图: ${screenshotPath}`);
    }
    
  } finally {
    // 不要自动关闭浏览器,方便查看
    // if (browser) {
    //   await browser.close();
    // }
  }
}

// 运行测试
testSyncWechatAccounts();

