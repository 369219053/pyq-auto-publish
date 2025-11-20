/**
 * 本地测试脚本 - 视频号素材选择对话框调试
 *
 * 用途: 测试堆雪球系统中视频号素材选择的完整流程
 * 运行方式:
 *   cd pyq-backend
 *   node ../test-video-material-dialog.js
 */

const puppeteer = require('./pyq-backend/node_modules/puppeteer');

// 堆雪球账号配置 (从数据库duixueqiu_accounts表读取)
const DUIXUEQIU_CONFIG = {
  username: 'lifangde002',
  password: 'Lfd666888#',
  loginUrl: 'https://dxqscrm.duixueqiu.cn/user/login/',
};

// 测试好友名称
const TEST_FRIEND_NAME = '二进制刀仔';

// 测试素材配置 (模拟从数据库读取的素材信息)
const TEST_MATERIAL = {
  id: 8,
  author_name: '大树AI创业圈',
  content_desc: '从流量视角看AI 选赛道',
  material_index: 7,  // 第8个素材 (索引从0开始)
  page_number: 1,     // 第1页
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 启动Puppeteer浏览器...');
  
  const browser = await puppeteer.launch({
    headless: false,  // 显示浏览器窗口
    slowMo: 300,      // 每个操作延迟300ms,便于观察
    devtools: true,   // 自动打开开发者工具
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // ========== 步骤1: 登录堆雪球系统 ==========
    console.log('\n📝 步骤1: 登录堆雪球系统...');
    await page.goto(DUIXUEQIU_CONFIG.loginUrl, { waitUntil: 'networkidle2' });
    await sleep(3000);

    // 查找并输入用户名
    console.log('🔍 查找用户名输入框...');
    const usernameInput = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const placeholder = input.getAttribute('placeholder') || '';
        if (placeholder.includes('手机号') || placeholder.includes('用户名') || placeholder.includes('账号')) {
          return true;
        }
      }
      return false;
    });

    if (usernameInput) {
      await page.evaluate((username) => {
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const placeholder = input.getAttribute('placeholder') || '';
          if (placeholder.includes('手机号') || placeholder.includes('用户名') || placeholder.includes('账号')) {
            input.value = username;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('✅ 已输入用户名');
            break;
          }
        }
      }, DUIXUEQIU_CONFIG.username);
    } else {
      console.log('⚠️ 未找到用户名输入框,尝试手动输入...');
    }

    await sleep(1000);

    // 查找并输入密码
    console.log('🔍 查找密码输入框...');
    await page.evaluate((password) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        const type = input.getAttribute('type') || '';
        const placeholder = input.getAttribute('placeholder') || '';
        if (type === 'password' || placeholder.includes('密码')) {
          input.value = password;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('✅ 已输入密码');
          break;
        }
      }
    }, DUIXUEQIU_CONFIG.password);

    await sleep(1000);

    // 点击登录按钮
    console.log('🔍 查找登录按钮...');
    const loginClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const button of buttons) {
        const text = button.textContent?.trim() || '';
        if (text.includes('登录') || text.includes('登 录')) {
          console.log('✅ 找到登录按钮,准备点击');
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!loginClicked) {
      console.log('⚠️ 未找到登录按钮,请手动点击登录');
    } else {
      console.log('✅ 已点击登录按钮,等待登录成功...');
    }

    await sleep(5000);
    console.log('✅ 登录成功!');

    // ========== 步骤2: 等待客服端页面加载 ==========
    console.log('\n📝 步骤2: 等待客服端页面加载...');
    console.log('⏳ 等待好友列表加载完成(可能需要较长时间,因为好友很多)...');

    // 等待页面加载完成的标志
    await sleep(3000);

    // 等待好友列表容器出现
    try {
      await page.waitForSelector('.vue-recycle-scroller', { timeout: 30000 });
      console.log('✅ 好友列表容器已加载');
    } catch (error) {
      console.log('⚠️ 未找到好友列表容器,继续执行...');
    }

    // 额外等待,确保好友数据加载完成
    console.log('⏳ 额外等待10秒,确保好友数据完全加载...');
    await sleep(10000);
    console.log('✅ 页面加载完成!');

    // ========== 步骤3: 点击"未分组"展开好友列表 ==========
    // (与wechat-reach.service.ts中的clickUnfoldGroup方法完全一致)
    console.log('\n📝 步骤3: 点击"未分组"展开好友列表...');

    // 先获取所有SPAN文本用于调试
    const allSpanTexts = await page.evaluate(() => {
      const allSpans = document.querySelectorAll('span');
      const texts = [];
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        if (text.includes('分组') || text.includes('好友')) {
          texts.push(text);
        }
      }
      return texts;
    });
    console.log(`🔍 找到的分组相关文本: ${JSON.stringify(allSpanTexts)}`);

    // 点击"未分组" - 使用正则表达式匹配,支持中英文括号
    const unfoldClicked = await page.evaluate(() => {
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim() || '';
        // 支持中文括号（）和英文括号()
        if (text.match(/^未分组[（(]\d+个[）)]$/)) {
          console.log(`找到"未分组"标签: ${text}`);
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

    // 等待好友列表展开并加载完成
    console.log('⏳ 等待好友列表加载...');
    await sleep(2000);

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

    console.log(`📊 好友列表是否展开: ${friendListExpanded}`);

    if (!friendListExpanded) {
      throw new Error('好友列表未展开');
    }

    // ========== 步骤4: 查找并点击测试好友 ==========
    console.log(`\n📝 步骤4: 查找并点击好友"${TEST_FRIEND_NAME}"...`);
    console.log('📱 使用与生产环境完全相同的查找逻辑...');

    // 滚动查找好友 (与wechat-reach.service.ts中的findAndClickFriend方法完全一致)
    let friendFound = false;
    let scrollAttempts = 0;
    const maxScrollAttempts = 200; // 与生产环境一致

    while (!friendFound && scrollAttempts < maxScrollAttempts) {
      // 查找当前可见区域的好友 (与生产环境完全一致的逻辑)
      const searchResult = await page.evaluate((targetFriendName) => {
        const allDivs = document.querySelectorAll('div');
        const visibleFriends = [];
        const seenFriends = new Set();

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
            let targetElement = div;
            let maxDepth = 10;

            while (targetElement && maxDepth > 0) {
              if (targetElement.className &&
                  targetElement.className.includes('recent-and-friend-panel-concat-item__friend')) {
                targetElement.click();
                console.log(`✅ 找到并点击好友(通过父元素): ${text}`);
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
            let itemViewElement = div;
            while (itemViewElement) {
              if (itemViewElement.className &&
                  itemViewElement.className.includes('vue-recycle-scroller__item-view')) {
                const friendElement = itemViewElement.querySelector('.recent-and-friend-panel-concat-item__friend');
                if (friendElement) {
                  friendElement.click();
                  console.log(`✅ 找到并点击好友(通过item-view): ${text}`);
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
            div.click();
            console.log(`✅ 找到并点击好友(直接点击): ${text}`);
            return {
              found: true,
              clickedText: text,
              visibleFriends: []
            };
          }
        }

        return { found: false, clickedText: '', visibleFriends: visibleFriends.slice(0, 5) };
      }, TEST_FRIEND_NAME);

      friendFound = searchResult.found;

      // 每10次滚动输出一次可见好友
      if (searchResult.visibleFriends.length > 0 && scrollAttempts % 10 === 0) {
        console.log(`👥 当前可见好友(第${scrollAttempts}次滚动): ${JSON.stringify(searchResult.visibleFriends)}`);
      }

      if (friendFound) {
        console.log(`✅ 找到并点击好友: ${TEST_FRIEND_NAME}`);
        await sleep(1000);
        break;
      }

      // 滚动到下一页 - 与生产环境一致,滚动300px
      await page.evaluate(() => {
        const scrollableElements = document.querySelectorAll('[class*="vue-recycle-scroller"]');
        if (scrollableElements.length > 0) {
          scrollableElements[0].scrollBy(0, 300);
        }
      });

      await sleep(500); // 与生产环境一致,等待500ms
      scrollAttempts++;
    }

    if (!friendFound) {
      console.log(`❌ 未找到好友: ${TEST_FRIEND_NAME}`);
      console.log(`📊 总共滚动了 ${scrollAttempts} 次`);
      throw new Error(`未找到好友: ${TEST_FRIEND_NAME}`);
    }

    console.log(`✅ 成功点击好友: ${TEST_FRIEND_NAME}`);

    // 等待聊天窗口完全加载
    console.log('⏳ 等待聊天窗口加载...');
    await sleep(5000);

    // ========== 步骤5: 点击"素材"按钮打开素材对话框 ==========
    // (与生产环境完全一致: 点击[title="素材"]按钮)
    console.log('\n📝 步骤5: 点击"素材"按钮...');
    try {
      await page.click('[title="素材"]');
      console.log('✅ 已点击"素材"按钮');
    } catch (error) {
      throw new Error('未找到"素材"按钮');
    }
    await sleep(500);

    // ========== 步骤6: 点击"视频号素材"选项 ==========
    // (与video-material.service.ts同步素材库的逻辑完全一致: 使用鼠标模拟点击)
    console.log('\n📝 步骤6: 点击"视频号素材"选项...');

    // 等待素材菜单完全展开
    console.log('⏳ 等待素材菜单展开...');
    await sleep(2000);

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

    console.log(`✅ 找到"视频号素材"元素，位置: (${videoMaterialPosition.x}, ${videoMaterialPosition.y})`);

    // 移动鼠标到元素位置
    await page.mouse.move(videoMaterialPosition.x, videoMaterialPosition.y);
    await sleep(500);

    // 点击
    await page.mouse.click(videoMaterialPosition.x, videoMaterialPosition.y);

    console.log('✅ 已点击"视频号素材"选项（模拟鼠标点击）');

    // 等待素材库对话框打开
    console.log('⏳ 等待素材库对话框打开...');
    await sleep(3000);

    // ========== 步骤7: 点击"公共素材分组"树节点 ==========
    // (与生产环境完全一致)
    console.log('\n📝 步骤7: 点击"公共素材分组"展开素材列表...');
    const clickResult = await page.evaluate(() => {
      // 查找所有树节点标签
      const treeLabels = document.querySelectorAll('.el-tree-node__label');
      console.log(`🔍 找到 ${treeLabels.length} 个树节点标签`);

      for (const label of treeLabels) {
        const text = label.textContent?.trim() || '';
        console.log(`树节点标签文本: "${text}"`);

        if (text === '公共素材分组') {
          console.log('✅ 找到"公共素材分组"标签，准备点击');
          label.click();
          return { success: true, text };
        }
      }

      return { success: false, text: '' };
    });

    if (!clickResult.success) {
      throw new Error('未找到"公共素材分组"树节点');
    }

    console.log(`✅ 已点击"公共素材分组"`);

    // 等待素材列表加载完成
    console.log('⏳ 等待素材列表加载...');
    await sleep(3000); // 与生产环境一致: 3000ms

    // ========== 步骤8: 截图并检查页面状态 ==========
    // (与生产环境完全一致)
    console.log('\n📝 步骤8: 截图并检查页面状态...');
    console.log('📸 截图保存当前页面状态...');
    await page.screenshot({
      path: './material-dialog-after-click.png',
      fullPage: true
    });
    console.log('✅ 截图已保存到: ./material-dialog-after-click.png');

    // 检查页面上所有元素
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

    console.log(`🔍 页面调试信息:`);
    console.log(`   总div数: ${pageDebug.totalDivs}`);
    console.log(`   素材相关div数: ${pageDebug.materialRelatedCount}`);
    console.log(`   confirm-icon数: ${pageDebug.confirmIconCount}`);
    console.log(`   materials-link-wrap数: ${pageDebug.materialsLinkWrapCount}`);
    console.log(`   前10个素材相关元素: ${JSON.stringify(pageDebug.materialRelatedClasses, null, 2)}`);

    // ========== 步骤9: 翻页到指定页码 ==========
    // (与生产环境完全一致)
    console.log(`\n📝 步骤9: 翻页到第 ${TEST_MATERIAL.page_number} 页...`);
    if (TEST_MATERIAL.page_number > 1) {
      for (let i = 1; i < TEST_MATERIAL.page_number; i++) {
        console.log(`📄 点击"下一页"按钮 (第${i}次)...`);
        await page.evaluate(() => {
          const buttons = document.querySelectorAll('button');
          for (const button of buttons) {
            if (button.textContent?.includes('下一页')) {
              button.click();
              console.log('✅ 已点击"下一页"按钮');
              break;
            }
          }
        });
        await sleep(1500); // 与生产环境一致: 1500ms
      }
      console.log(`✅ 已翻页到第 ${TEST_MATERIAL.page_number} 页`);
    } else {
      console.log('✅ 素材在第1页,无需翻页');
    }

    // ========== 步骤10: 点击第N个素材的对号图标 ==========
    // (与生产环境完全一致)
    console.log(`\n📝 步骤10: 点击第 ${TEST_MATERIAL.material_index + 1} 个素材的对号图标...`);

    // 先检查页面上有多少个对号图标
    const debugInfo2 = await page.evaluate(() => {
      return {
        confirmIconCount: document.querySelectorAll('.confirm-icon').length,
        materialsLinkWrapCount: document.querySelectorAll('.materials-link-wrap').length,
        allMaterialClasses: Array.from(document.querySelectorAll('[class*="material"]'))
          .slice(0, 5)
          .map(el => el.className),
      };
    });

    console.log(`🔍 调试信息: confirm-icon=${debugInfo2.confirmIconCount}, materials-link-wrap=${debugInfo2.materialsLinkWrapCount}`);
    console.log(`🔍 素材相关class: ${JSON.stringify(debugInfo2.allMaterialClasses)}`);

    const clicked = await page.evaluate((index) => {
      // 查找所有对号图标
      const confirmIcons = document.querySelectorAll('.confirm-icon');
      console.log(`找到 ${confirmIcons.length} 个对号图标`);

      if (confirmIcons[index]) {
        console.log(`点击第 ${index + 1} 个对号图标`);
        confirmIcons[index].click();
        return { success: true, count: confirmIcons.length };
      }

      return { success: false, count: confirmIcons.length };
    }, TEST_MATERIAL.material_index);

    if (!clicked.success) {
      throw new Error(`未找到第 ${TEST_MATERIAL.material_index + 1} 个对号图标 (页面上共有 ${clicked.count} 个)`);
    }

    console.log(`✅ 已点击对号图标 (页面上共 ${clicked.count} 个)`);
    await sleep(500); // 与生产环境一致: 500ms

    // ========== 步骤11: 点击确定按钮 ==========
    console.log(`\n📝 步骤11: 点击确定按钮...`);

    // 优先查找Element UI的成功按钮 (el-button--success)
    const confirmClicked = await page.evaluate(() => {
      // 1. 优先查找Element UI的成功按钮
      const successButtons = document.querySelectorAll('button.el-button--success');
      for (const button of successButtons) {
        const text = button.textContent?.trim();
        if (text === '确定' || text === '确 定') {
          console.log(`✅ 找到确定按钮(el-button--success): "${text}"`);
          button.click();
          return true;
        }
      }

      // 2. 查找所有button元素
      const allButtons = document.querySelectorAll('button');
      for (const button of allButtons) {
        const text = button.textContent?.trim();
        if (text === '确定' || text === '确 定') {
          console.log(`✅ 找到确定按钮(button): "${text}"`);
          button.click();
          return true;
        }
      }

      // 3. 查找span元素
      const allSpans = document.querySelectorAll('span');
      for (const span of allSpans) {
        const text = span.textContent?.trim();
        if (text === '确定' || text === '确 定') {
          console.log(`✅ 找到确定按钮(span): "${text}"`);
          span.click();
          return true;
        }
      }

      return false;
    });

    if (!confirmClicked) {
      console.log(`⚠️ 未找到确定按钮,但继续执行`);
    } else {
      console.log('✅ 已点击确定按钮');
    }

    await sleep(1500);

    console.log(`✅ 视频号卡片已发送`);
    console.log(`🎉 测试完成: ${TEST_FRIEND_NAME}`);

    // ========== 完成 ==========
    console.log('\n✅ 所有步骤执行完成!');
    console.log('\n💡 提示:');
    console.log('   1. 浏览器窗口将保持打开,请手动检查页面状态');
    console.log('   2. 打开开发者工具(F12)查看控制台日志');
    console.log('   3. 检查好友是否收到视频号卡片');
    console.log('   4. 按Ctrl+C退出测试');

    // 保持浏览器打开,等待手动检查
    await new Promise(() => {});

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    
    // 截图保存错误状态
    try {
      await page.screenshot({ 
        path: './error-screenshot.png', 
        fullPage: true 
      });
      console.log('✅ 错误截图已保存到: ./error-screenshot.png');
    } catch (e) {
      console.error('截图失败:', e.message);
    }

    // 保持浏览器打开,等待手动检查
    console.log('\n💡 浏览器窗口将保持打开,请手动检查错误状态');
    console.log('   按Ctrl+C退出测试');
    await new Promise(() => {});
  }
}

// 运行测试
main().catch(console.error);

