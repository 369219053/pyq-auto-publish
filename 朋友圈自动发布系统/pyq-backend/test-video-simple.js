/**
 * 简化版本地测试脚本 - 从已登录状态开始
 * 
 * 使用方法：
 * 1. 先在Chrome浏览器中手动打开堆雪球并登录
 * 2. 确保已经在聊天界面（能看到好友列表）
 * 3. 运行此脚本：node test-video-simple.js
 */

const puppeteer = require('puppeteer');

async function testFromLoggedIn() {
  console.log('🚀 启动本地测试（从已登录状态开始）...');
  console.log('');
  console.log('📋 使用说明：');
  console.log('1. 浏览器会自动打开');
  console.log('2. 请手动登录堆雪球系统');
  console.log('3. 登录后，导航到聊天界面（能看到好友列表）');
  console.log('4. 然后在控制台输入任意字符并按回车，脚本会继续执行');
  console.log('');

  // 启动浏览器
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 200, // 每个操作延迟200ms，方便观察
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: {
      width: 1400,
      height: 900,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();

  try {
    // 访问堆雪球首页
    console.log('🌐 打开堆雪球首页...');
    await page.goto('https://dxqscrm.duixueqiu.cn/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    console.log('⏳ 等待页面加载...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 点击"登录客服系统"
    console.log('🔐 点击"登录客服系统"...');
    const loginSystemClicked = await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.textContent && el.textContent.includes('登录客服系统')) {
          console.log('找到"登录客服系统"按钮');
          el.click();
          return true;
        }
      }
      return false;
    });

    if (!loginSystemClicked) {
      console.log('⚠️ 未找到"登录客服系统"按钮，可能已经在登录页面');
    } else {
      console.log('✅ 已点击"登录客服系统"');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('');
    console.log('⏸️  请在浏览器中手动输入账号密码登录');
    console.log('⏸️  账号: lifangde002');
    console.log('⏸️  密码: Lfd666888#');
    console.log('⏸️  登录完成并进入聊天界面后，在控制台按回车继续...');
    console.log('');

    // 等待用户按回车
    await new Promise((resolve) => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    console.log('✅ 继续执行测试...');
    console.log('');

    // 截图1：当前页面状态
    await page.screenshot({ path: './screenshot-1-current-page.png', fullPage: true });
    console.log('📸 截图1已保存: ./screenshot-1-current-page.png');

    // 1. 点击好友"二进制刀仔"
    console.log('👤 查找并点击好友"二进制刀仔"...');
    
    const friendClicked = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('div');
      for (const div of allDivs) {
        if (div.textContent && div.textContent.includes('二进制刀仔')) {
          console.log('找到好友"二进制刀仔"');
          
          // 尝试找到可点击的父元素
          let clickableParent = div.closest('.recent-and-friend-panel-concat-item__friend');
          if (!clickableParent) {
            clickableParent = div.closest('[class*="friend"]');
          }
          
          if (clickableParent) {
            console.log('点击好友元素');
            clickableParent.click();
            return { success: true, method: 'parent' };
          } else {
            console.log('直接点击div');
            div.click();
            return { success: true, method: 'direct' };
          }
        }
      }
      return { success: false, method: '' };
    });

    if (!friendClicked.success) {
      throw new Error('未找到好友"二进制刀仔"');
    }

    console.log(`✅ 已点击好友 (方法: ${friendClicked.method})`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 截图2：点击好友后
    await page.screenshot({ path: './screenshot-2-after-click-friend.png', fullPage: true });
    console.log('📸 截图2已保存: ./screenshot-2-after-click-friend.png');

    // 2. 点击"素材"按钮
    console.log('🎬 点击"素材"按钮...');
    
    const materialButtonClicked = await page.evaluate(() => {
      const materialBtn = document.querySelector('[title="素材"]');
      if (materialBtn) {
        console.log('找到素材按钮');
        materialBtn.click();
        return true;
      }
      return false;
    });

    if (!materialButtonClicked) {
      throw new Error('未找到"素材"按钮');
    }

    console.log('✅ 已点击"素材"按钮');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 截图3：素材菜单
    await page.screenshot({ path: './screenshot-3-material-menu.png', fullPage: true });
    console.log('📸 截图3已保存: ./screenshot-3-material-menu.png');

    // 3. 点击"视频号素材" - 使用鼠标移动+点击，模拟真实用户操作
    console.log('📋 点击"视频号素材"选项...');

    // 先找到元素的位置
    const videoMaterialElement = await page.evaluate(() => {
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
      return { found: false };
    });

    if (!videoMaterialElement.found) {
      throw new Error('未找到"视频号素材"菜单项');
    }

    console.log(`✅ 找到"视频号素材"元素，位置: (${videoMaterialElement.x}, ${videoMaterialElement.y})`);

    // 移动鼠标到元素位置
    await page.mouse.move(videoMaterialElement.x, videoMaterialElement.y);
    await new Promise(resolve => setTimeout(resolve, 500));

    // 点击
    await page.mouse.click(videoMaterialElement.x, videoMaterialElement.y);

    console.log('✅ 已点击"视频号素材"选项（模拟鼠标点击）');

    console.log('⏳ 等待素材库对话框打开...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 截图4：点击"视频号素材"后
    await page.screenshot({ path: './screenshot-4-after-click-video.png', fullPage: true });
    console.log('📸 截图4已保存: ./screenshot-4-after-click-video.png');

    // 4. 检查对话框是否打开
    const dialogCheck = await page.evaluate(() => {
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

    console.log('📊 对话框检测结果:', dialogCheck);

    if (!dialogCheck.opened) {
      console.error('❌ 素材库对话框未打开！');
      console.log('');
      console.log('⏸️  浏览器将保持打开状态，请手动检查');
      console.log('请查看截图4，看看点击"视频号素材"后发生了什么');
      console.log('按 Ctrl+C 退出');
      await new Promise(() => {});
    }

    console.log('✅ 素材库对话框已打开');

    // 5. 点击"公共素材分组"
    console.log('📁 点击"公共素材分组"...');
    
    const groupClicked = await page.evaluate(() => {
      const treeLabels = document.querySelectorAll('.el-tree-node__label');
      console.log(`找到 ${treeLabels.length} 个树节点标签`);

      for (const label of treeLabels) {
        const text = label.textContent?.trim() || '';
        if (text === '公共素材分组') {
          console.log('找到"公共素材分组"，点击');
          label.click();
          return { success: true };
        }
      }

      return { success: false };
    });

    if (!groupClicked.success) {
      throw new Error('未找到"公共素材分组"');
    }

    console.log('✅ 已点击"公共素材分组"');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 截图5：素材列表
    await page.screenshot({ path: './screenshot-5-material-list.png', fullPage: true });
    console.log('📸 截图5已保存: ./screenshot-5-material-list.png');

    // 6. 获取所有页的素材
    console.log('\n📋 开始获取所有页的素材...');
    const allMaterials = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore) {
      console.log(`\n📄 正在获取第 ${currentPage} 页...`);

      // 等待当前页加载
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 滚动素材列表容器到底部，触发懒加载
      console.log('📜 滚动素材列表到底部，触发懒加载...');
      await page.evaluate(() => {
        // 查找素材列表的滚动容器
        const scrollContainer = document.querySelector('.materials-link-list');
        if (scrollContainer) {
          // 多次滚动，确保所有素材都加载出来
          const scrollHeight = scrollContainer.scrollHeight;
          const scrollStep = 300; // 每次滚动300px
          let currentScroll = 0;

          const scrollInterval = setInterval(() => {
            currentScroll += scrollStep;
            scrollContainer.scrollTop = currentScroll;

            if (currentScroll >= scrollHeight) {
              clearInterval(scrollInterval);
            }
          }, 100); // 每100ms滚动一次

          // 最后滚动到底部
          setTimeout(() => {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }, 2000);
        }
      });

      // 等待懒加载完成
      console.log('⏳ 等待懒加载完成...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 获取当前页素材
      const materials = await page.evaluate((pageNum) => {
        const materialCards = document.querySelectorAll('.materials-link-wrap');
        console.log(`找到 ${materialCards.length} 个素材卡片`);

        const results = [];
        materialCards.forEach((card, index) => {
          const titleElement = card.querySelector('[class*="text-title"]');
          const authorName = titleElement?.getAttribute('title') || '';

          const descElement = card.querySelector('[class*="text-desc"]');
          const contentDesc = descElement?.textContent?.trim() || '';

          const imgElement = card.querySelector('[class*="img-wrap"] img');
          const thumbnailUrl = imgElement?.getAttribute('src') || '';

          // 只要有作者名就保留，contentDesc可以为空
          if (authorName) {
            results.push({
              page: pageNum,
              authorName,
              contentDesc: contentDesc ? contentDesc.substring(0, 50) + '...' : '(无描述)',
              thumbnailUrl,
            });
          }
        });

        return results;
      }, currentPage);

      console.log(`✅ 第 ${currentPage} 页获取到 ${materials.length} 个素材`);
      allMaterials.push(...materials);

      // 检查是否有下一页
      console.log('🔍 检查是否有下一页...');
      const paginationInfo = await page.evaluate(() => {
        // 查找 Element UI 的下一页按钮
        // 下一页按钮包含 <i class="el-icon el-icon-arrow-right"></i>
        const allButtons = document.querySelectorAll('button');
        console.log(`找到 ${allButtons.length} 个按钮`);

        let nextButton = null;
        let paginationButtons = [];

        // 查找所有可能的分页按钮
        for (let i = 0; i < allButtons.length; i++) {
          const button = allButtons[i];
          const isDisabled = button.disabled || button.classList.contains('is-disabled');
          const buttonText = button.textContent?.trim() || '';

          // 检查是否包含右箭头图标 (Element UI 下一页按钮)
          const hasRightArrow = button.querySelector('.el-icon-arrow-right') !== null;

          // 检查是否在分页器中
          let parent = button.parentElement;
          let inPagination = false;
          while (parent) {
            const className = parent.className || '';
            if (className.includes('pagination') || className.includes('pager') || className.includes('el-pagination')) {
              inPagination = true;
              break;
            }
            parent = parent.parentElement;
          }

          if (inPagination) {
            paginationButtons.push({
              index: i,
              hasRightArrow,
              isDisabled,
              text: buttonText,
              className: button.className,
            });

            // 查找下一页按钮（有右箭头图标且未禁用）
            if (hasRightArrow && !isDisabled) {
              nextButton = i;
            }
          }
        }

        return {
          hasNext: nextButton !== null,
          nextButtonIndex: nextButton,
          paginationButtons,
        };
      });

      console.log('分页信息:', JSON.stringify(paginationInfo, null, 2));

      if (paginationInfo.hasNext) {
        console.log('✅ 找到下一页按钮，准备翻页...');

        // 点击下一页
        await page.evaluate((buttonIndex) => {
          const allButtons = document.querySelectorAll('button');
          const button = allButtons[buttonIndex];
          if (button) {
            button.click();
            console.log('✅ 已点击下一页按钮');
          }
        }, paginationInfo.nextButtonIndex);

        await new Promise(resolve => setTimeout(resolve, 2000));
        currentPage++;
      } else {
        console.log('❌ 没有下一页了');
        hasMore = false;
      }
    }

    console.log('');
    console.log(`📊 总共获取到 ${allMaterials.length} 个视频号素材（共 ${currentPage} 页）`);
    if (allMaterials.length > 0) {
      console.log('前5个素材:');
      allMaterials.slice(0, 5).forEach((m, i) => {
        console.log(`  ${i + 1}. [第${m.page}页] ${m.authorName} - ${m.contentDesc}`);
      });
    }

    console.log('');
    console.log('✅ 测试完成！');
    console.log('⏸️  浏览器将保持打开状态，请手动检查');
    console.log('按 Ctrl+C 退出');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('');
    console.error('❌ 测试失败:', error.message);
    
    // 截图错误状态
    await page.screenshot({ path: './screenshot-error.png', fullPage: true });
    console.log('📸 错误截图已保存: ./screenshot-error.png');
    
    console.log('');
    console.log('⏸️  浏览器将保持打开状态，请手动检查');
    console.log('按 Ctrl+C 退出');
    
    // 保持浏览器打开
    await new Promise(() => {});
  }
}

// 运行测试
testFromLoggedIn();

