/**
 * 本地测试脚本 - 视频号素材同步
 * 用于调试Puppeteer执行过程
 */

const puppeteer = require('puppeteer');

// 堆雪球账号配置
const DUIXUEQIU_CONFIG = {
  username: '18516722381',
  password: 'Aa112211',
  loginUrl: 'https://dxqscrm.duixueqiu.cn/admin/login',
  homeUrl: 'https://dxqscrm.duixueqiu.cn/admin/home',
};

async function testVideoMaterialSync() {
  console.log('🚀 启动本地测试...');
  
  // 启动浏览器（非无头模式，可以看到执行过程）
  const browser = await puppeteer.launch({
    headless: false, // 显示浏览器窗口
    slowMo: 100, // 每个操作延迟100ms，方便观察
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', // 使用系统Chrome
    defaultViewport: {
      width: 1400,
      height: 900,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();

  try {
    // 1. 直接访问堆雪球首页（假设已登录）
    console.log('🌐 访问堆雪球首页...');
    console.log('💡 提示：如果未登录，请先手动登录，然后按回车继续');

    await page.goto(DUIXUEQIU_CONFIG.homeUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('✅ 页面已加载！');

    // 等待用户确认（如果需要手动登录）
    console.log('⏸️  请检查浏览器窗口，如果需要登录请手动登录');
    console.log('登录完成后，在控制台按回车继续...');

    // 等待10秒，给用户时间检查
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 2. 点击好友"二进制刀仔"
    console.log('👤 查找好友"二进制刀仔"...');
    
    // 等待好友列表加载
    await page.waitForSelector('.vue-recycle-scroller', { timeout: 10000 });
    
    // 查找并点击好友
    const friendClicked = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        if (div.textContent && div.textContent.includes('二进制刀仔')) {
          const friendItem = div.closest('.recent-and-friend-panel-concat-item__friend');
          if (friendItem) {
            friendItem.click();
            return true;
          }
        }
      }
      return false;
    });

    if (!friendClicked) {
      throw new Error('未找到好友"二进制刀仔"');
    }

    console.log('✅ 已点击好友"二进制刀仔"');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. 点击"素材"按钮（立方体图标）
    console.log('🎬 点击"素材"按钮...');
    await page.waitForSelector('[title="素材"]', { timeout: 10000 });
    await page.click('[title="素材"]');
    
    console.log('⏳ 等待素材菜单展开...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 截图1：素材菜单
    await page.screenshot({ path: './screenshot-1-material-menu.png', fullPage: true });
    console.log('📸 截图1已保存: ./screenshot-1-material-menu.png');

    // 4. 点击"视频号素材"
    console.log('📋 点击"视频号素材"选项...');
    
    const clickResult = await page.evaluate(() => {
      // 查找包含"视频号素材"的span元素
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        if (span.textContent && span.textContent.trim() === '视频号素材') {
          console.log('找到"视频号素材" span元素');
          
          // 获取span的父元素（通常是可点击的div）
          let clickableElement = span.parentElement;
          
          if (clickableElement) {
            console.log(`父元素: ${clickableElement.tagName}, class: ${clickableElement.className}`);
            
            // 触发父元素的点击事件
            clickableElement.click();
            
            return { 
              found: true, 
              tag: span.tagName,
              parentTag: clickableElement.tagName,
              parentClass: clickableElement.className
            };
          }
          
          return { found: true, tag: span.tagName, parentTag: '', parentClass: '' };
        }
      }
      return { found: false, tag: '', parentTag: '', parentClass: '' };
    });

    if (!clickResult.found) {
      throw new Error('未找到"视频号素材"菜单项');
    }

    console.log('✅ 已点击"视频号素材"选项');
    console.log(`   - Span标签: ${clickResult.tag}`);
    console.log(`   - 父元素标签: ${clickResult.parentTag}`);
    console.log(`   - 父元素class: ${clickResult.parentClass}`);
    
    // 等待素材库对话框打开
    console.log('⏳ 等待素材库对话框打开...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 截图2：点击"视频号素材"后
    await page.screenshot({ path: './screenshot-2-after-click-video.png', fullPage: true });
    console.log('📸 截图2已保存: ./screenshot-2-after-click-video.png');

    // 5. 检查是否打开了素材库对话框
    const dialogOpened = await page.evaluate(() => {
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

    console.log('📊 对话框检测结果:', dialogOpened);

    if (!dialogOpened.opened) {
      console.error('❌ 素材库对话框未打开！');
      console.log('⏸️  浏览器将保持打开状态，请手动检查...');
      console.log('按 Ctrl+C 退出');
      
      // 保持浏览器打开，等待手动检查
      await new Promise(() => {});
    }

    console.log('✅ 素材库对话框已打开');

    // 6. 点击"公共素材分组"
    console.log('📁 点击"公共素材分组"展开素材列表...');
    const clickGroupResult = await page.evaluate(() => {
      const treeLabels = document.querySelectorAll('.el-tree-node__label');
      console.log(`找到 ${treeLabels.length} 个树节点标签`);

      for (const label of treeLabels) {
        const text = label.textContent?.trim() || '';
        console.log(`树节点标签文本: "${text}"`);

        if (text === '公共素材分组') {
          console.log('找到"公共素材分组"标签，准备点击');
          label.click();
          return { success: true, text };
        }
      }

      return { success: false, text: '' };
    });

    console.log('点击结果:', clickGroupResult);

    // 等待素材列表加载
    console.log('⏳ 等待素材列表加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 截图3：素材列表
    await page.screenshot({ path: './screenshot-3-material-list.png', fullPage: true });
    console.log('📸 截图3已保存: ./screenshot-3-material-list.png');

    // 7. 获取素材列表
    const materials = await page.evaluate(() => {
      const results = [];
      const materialCards = document.querySelectorAll('.materials-link-wrap');
      console.log(`找到 ${materialCards.length} 个素材卡片`);

      materialCards.forEach((card, index) => {
        const titleElement = card.querySelector('[class*="text-title"]');
        const authorName = titleElement?.getAttribute('title') || '';

        const descElement = card.querySelector('[class*="text-desc"]');
        const contentDesc = descElement?.textContent?.trim() || '';

        const imgElement = card.querySelector('[class*="img-wrap"] img');
        const thumbnailUrl = imgElement?.getAttribute('src') || '';

        console.log(`素材 ${index + 1}: 作者="${authorName}", 内容="${contentDesc?.substring(0, 30)}..."`);

        if (authorName && contentDesc) {
          results.push({
            authorName,
            contentDesc,
            thumbnailUrl,
            materialIndex: index,
          });
        }
      });

      return results;
    });

    console.log(`📊 共获取到 ${materials.length} 个视频号素材`);
    console.log('素材列表:', JSON.stringify(materials, null, 2));

    console.log('✅ 测试完成！');
    console.log('⏸️  浏览器将保持打开状态，请手动检查...');
    console.log('按 Ctrl+C 退出');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    
    // 截图错误状态
    await page.screenshot({ path: './screenshot-error.png', fullPage: true });
    console.log('📸 错误截图已保存: ./screenshot-error.png');
    
    console.log('⏸️  浏览器将保持打开状态，请手动检查...');
    console.log('按 Ctrl+C 退出');
    
    // 保持浏览器打开
    await new Promise(() => {});
  }
}

// 运行测试
testVideoMaterialSync();

