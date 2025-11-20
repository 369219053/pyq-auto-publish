/**
 * 堆雪球点击测试脚本
 * 用于测试点击微信号的逻辑
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// 堆雪球账号信息
const DUIXUEQIU_USERNAME = 'lifangde001';
const DUIXUEQIU_PASSWORD = 'Lfd666888#';
const TARGET_ACCOUNT = '1号机'; // 要点击的微信号
const EXPECTED_FRIENDS_COUNT = 6396; // 期望的好友数

// 创建截图目录
const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir);
}

let screenshotIndex = 0;
async function takeScreenshot(page, name) {
  screenshotIndex++;
  const filename = path.join(screenshotDir, `${screenshotIndex}_${name}.png`);
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`📸 截图保存: ${filename}`);
}

async function main() {
  console.log('🚀 启动Puppeteer测试...');
  
  const browser = await puppeteer.launch({
    headless: false, // 显示浏览器窗口
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  try {
    // 1. 登录堆雪球
    console.log('\n📝 步骤1: 登录堆雪球');
    await page.goto('https://dxqscrm.duixueqiu.cn/user/login/', { waitUntil: 'networkidle2' });
    await takeScreenshot(page, '登录页面');

    await page.waitForTimeout(1000);
    await page.type('input[placeholder="账号"]', DUIXUEQIU_USERNAME);
    await page.waitForTimeout(500);
    await page.type('input[type="password"]', DUIXUEQIU_PASSWORD);
    await takeScreenshot(page, '填写账号密码');

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
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
    console.log('✅ 登录成功');
    await takeScreenshot(page, '登录成功');

    // 2. 等待页面加载
    console.log('\n📝 步骤2: 等待页面加载');
    await page.waitForTimeout(5000);
    await takeScreenshot(page, '页面加载完成');

    // 3. 等待微信号列表渲染
    console.log('\n📝 步骤3: 等待微信号列表渲染');
    await page.waitForSelector('.wechat-account-list', { timeout: 15000 });
    
    let vueRendered = false;
    let waitTime = 0;
    while (!vueRendered && waitTime < 60000) {
      const itemCount = await page.evaluate(() => {
        const items = document.querySelectorAll('.wechat-account-list > .item');
        return items.length;
      });
      
      if (itemCount > 0) {
        vueRendered = true;
        console.log(`✅ Vue已渲染完成! 找到 ${itemCount} 个微信号`);
      } else {
        console.log(`⏳ Vue仍在渲染... (已等待${waitTime/1000}秒)`);
        await page.waitForTimeout(2000);
        waitTime += 2000;
      }
    }
    await takeScreenshot(page, '微信号列表渲染完成');

    // 4. 获取所有微信号
    console.log('\n📝 步骤4: 获取所有微信号');
    const accounts = await page.evaluate(() => {
      const items = document.querySelectorAll('.wechat-account-list > .item');
      const result = [];
      items.forEach((item, index) => {
        const nameDiv = item.querySelector('.name');
        const title = item.getAttribute('title');
        const hasSelected = item.classList.contains('selected');
        if (nameDiv) {
          result.push({
            index,
            name: nameDiv.textContent?.trim() || '',
            title: title || '',
            selected: hasSelected
          });
        }
      });
      return result;
    });
    
    console.log('📋 微信号列表:');
    accounts.forEach(acc => {
      console.log(`  ${acc.index}: ${acc.name} | title=${acc.title} | selected=${acc.selected}`);
    });

    // 5. 读取点击前的未分组数字
    console.log('\n📝 步骤5: 读取点击前的未分组数字');
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
    console.log(`📊 点击前的未分组好友数: ${beforeClickCount}`);
    await takeScreenshot(page, `点击前_未分组${beforeClickCount}`);

    // 6. 点击目标微信号
    console.log(`\n📝 步骤6: 点击微信号 "${TARGET_ACCOUNT}"`);
    
    const elementHandle = await page.evaluateHandle((name) => {
      const items = document.querySelectorAll('.wechat-account-list > .item');
      for (const item of items) {
        const nameDiv = item.querySelector('.name');
        if (nameDiv && nameDiv.textContent?.trim() === name) {
          return item;
        }
      }
      return null;
    }, TARGET_ACCOUNT);

    if (!elementHandle || !elementHandle.asElement()) {
      throw new Error(`未找到微信号: ${TARGET_ACCOUNT}`);
    }

    await elementHandle.click();
    console.log(`✅ 已点击微信号: ${TARGET_ACCOUNT}`);
    await takeScreenshot(page, `点击后_立即截图`);

    // 7. 等待数据更新
    console.log('\n📝 步骤7: 等待好友数据更新');
    let dataUpdated = false;
    let checkCount = 0;
    const maxChecks = 25; // 最多检查5秒(每次200ms)

    while (!dataUpdated && checkCount < maxChecks) {
      await page.waitForTimeout(200);
      checkCount++;
      
      const currentCount = await page.evaluate(() => {
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

      console.log(`  检查 ${checkCount}: 当前未分组数 = ${currentCount}`);

      if (currentCount !== beforeClickCount && currentCount > 0) {
        dataUpdated = true;
        console.log(`✅ 好友数据已更新! 从 ${beforeClickCount} 变为 ${currentCount} (耗时${checkCount * 0.2}秒)`);
        await takeScreenshot(page, `数据更新后_未分组${currentCount}`);
        
        // 验证是否匹配期望值
        if (currentCount === EXPECTED_FRIENDS_COUNT) {
          console.log(`✅ 好友数匹配! 当前: ${currentCount}, 期望: ${EXPECTED_FRIENDS_COUNT}`);
        } else {
          console.log(`⚠️ 好友数不匹配! 当前: ${currentCount}, 期望: ${EXPECTED_FRIENDS_COUNT}`);
          console.log(`⚠️ 可能点击了错误的微信号!`);
        }
      }
    }

    if (!dataUpdated) {
      console.log(`⚠️ 数据未更新! 点击可能未生效!`);
      await takeScreenshot(page, `数据未更新`);
    }

    // 8. 验证当前选中的微信号
    console.log('\n📝 步骤8: 验证当前选中的微信号');
    const selectedAccount = await page.evaluate(() => {
      const selectedItem = document.querySelector('.item.selected');
      if (selectedItem) {
        const title = selectedItem.getAttribute('title');
        const nameDiv = selectedItem.querySelector('.name');
        return {
          title: title || '',
          name: nameDiv?.textContent?.trim() || ''
        };
      }
      return null;
    });
    
    if (selectedAccount) {
      console.log(`🔍 当前选中的微信号: ${selectedAccount.name} (${selectedAccount.title})`);
    } else {
      console.log(`⚠️ 未找到选中的微信号!`);
    }
    await takeScreenshot(page, '最终状态');

    console.log('\n✅ 测试完成! 请查看screenshots目录中的截图');
    console.log(`📁 截图目录: ${screenshotDir}`);

    // 保持浏览器打开,方便查看
    console.log('\n⏸️  浏览器将保持打开状态,按Ctrl+C退出...');
    await new Promise(() => {}); // 永久等待

  } catch (error) {
    console.error('❌ 测试失败:', error);
    await takeScreenshot(page, '错误截图');
    await browser.close();
    process.exit(1);
  }
}

main();

