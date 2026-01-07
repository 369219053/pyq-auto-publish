/**
 * 测试图片上传对话框结构
 * 用于查看"发送文件"对话框的确定按钮位置
 */

const puppeteer = require('puppeteer');
const path = require('path');

async function testImageUploadDialog() {
  console.log('🚀 启动浏览器...');
  
  const browser = await puppeteer.launch({
    headless: false, // 显示浏览器,方便观察
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  try {
    // 1. 登录堆雪球
    console.log('📝 登录堆雪球...');
    await page.goto('https://dxqscrm.duixueqiu.cn/admin/#/login', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 清空并填写账号
    const accountInput = await page.$('input[placeholder="账号"]');
    await accountInput.click({ clickCount: 3 }); // 全选
    await accountInput.type('lifangde003');
    console.log('✅ 账号已填写');

    // 填写密码
    await page.type('input[placeholder="密码"]', 'Lfd666888#');
    console.log('✅ 密码已填写');

    await new Promise(resolve => setTimeout(resolve, 500));

    // 点击登录
    const loginClicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent?.includes('登录')) {
          console.log('✅ 找到登录按钮,点击...');
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!loginClicked) {
      console.log('❌ 未找到登录按钮');
      return;
    }

    console.log('⏳ 等待登录完成...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 检查是否登录成功
    const currentUrl = page.url();
    console.log('当前URL:', currentUrl);

    if (currentUrl.includes('/login')) {
      console.log('❌ 登录失败,仍在登录页');
      return;
    }

    console.log('✅ 登录成功');

    // 2. 切换到客服端
    console.log('🔄 切换到客服端...');
    await page.goto('https://dxqscrm.duixueqiu.cn/user/main/index.html', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('当前URL:', page.url());

    // 3. 等待页面加载完成
    console.log('⏳ 等待页面加载...');
    await page.waitForSelector('input[type="file"]', { timeout: 10000 }).catch(() => {
      console.log('⚠️ 等待input超时,继续...');
    });

    // 4. 查找并上传图片
    console.log('📤 查找文件上传输入框...');
    let fileInput = await page.$('input[type="file"]');

    if (!fileInput) {
      console.log('⚠️ 未找到文件上传输入框,尝试点击好友...');

      // 点击第一个好友
      await page.evaluate(() => {
        // 查找好友列表中的第一个好友
        const friendDivs = document.querySelectorAll('div');
        for (const div of friendDivs) {
          if (div.textContent && div.textContent.includes('纪老板')) {
            div.click();
            console.log('✅ 点击了好友');
            break;
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // 再次查找
      fileInput = await page.$('input[type="file"]');
    }

    if (!fileInput) {
      console.log('❌ 仍未找到文件上传输入框');

      // 输出页面上所有input元素
      const inputs = await page.evaluate(() => {
        const allInputs = document.querySelectorAll('input');
        return Array.from(allInputs).map(input => ({
          type: input.type,
          placeholder: input.placeholder,
          name: input.name
        }));
      });
      console.log('页面上的input元素:', inputs);
      return;
    }

    console.log('✅ 找到文件上传输入框');
    
    // 上传测试图片
    const imagePath1 = path.join(process.cwd(), 'temp_test_1.png');
    const imagePath2 = path.join(process.cwd(), 'temp_test_2.png');
    
    console.log('📁 上传图片:', imagePath1, imagePath2);
    await fileInput.uploadFile(imagePath1, imagePath2);
    
    console.log('⏳ 等待对话框出现...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. 分析对话框结构
    console.log('\n📋 分析对话框结构:');
    const dialogInfo = await page.evaluate(() => {
      const results = [];
      const dialogWrappers = document.querySelectorAll('.el-dialog__wrapper');
      
      for (const dialog of dialogWrappers) {
        const style = window.getComputedStyle(dialog);
        
        // 只查看可见的对话框
        if (style.display !== 'none') {
          const title = dialog.querySelector('.el-dialog__title');
          const titleText = title ? title.textContent?.trim() : '无标题';
          
          console.log(`\n✅ 找到可见对话框: "${titleText}"`);
          
          // 查找footer
          const footer = dialog.querySelector('.el-dialog__footer');
          if (footer) {
            console.log('  📦 Footer存在');
            
            const buttons = footer.querySelectorAll('button');
            console.log(`  🔘 Footer中有 ${buttons.length} 个按钮:`);
            
            buttons.forEach((btn, index) => {
              const text = btn.textContent?.trim();
              const classList = Array.from(btn.classList).join(' ');
              const disabled = btn.disabled;
              
              console.log(`    按钮${index + 1}: "${text}"`);
              console.log(`      - class: ${classList}`);
              console.log(`      - disabled: ${disabled}`);
            });
            
            results.push({
              title: titleText,
              buttonCount: buttons.length,
              buttons: Array.from(buttons).map(btn => ({
                text: btn.textContent?.trim(),
                class: Array.from(btn.classList).join(' '),
                disabled: btn.disabled
              }))
            });
          } else {
            console.log('  ⚠️ 未找到Footer');
          }
        }
      }
      
      return results;
    });

    console.log('\n📊 对话框信息汇总:');
    console.log(JSON.stringify(dialogInfo, null, 2));

    // 6. 尝试点击确定按钮
    console.log('\n🔘 尝试点击确定按钮...');
    const clicked = await page.evaluate(() => {
      const dialogWrappers = document.querySelectorAll('.el-dialog__wrapper');
      
      for (const dialog of dialogWrappers) {
        const style = window.getComputedStyle(dialog);
        if (style.display !== 'none') {
          const title = dialog.querySelector('.el-dialog__title');
          if (title && title.textContent?.includes('发送文件')) {
            const footer = dialog.querySelector('.el-dialog__footer');
            if (footer) {
              const buttons = footer.querySelectorAll('button');
              for (const btn of buttons) {
                const text = btn.textContent?.trim();
                if (text === '确定' || text === '确 定') {
                  console.log(`✅ 找到确定按钮: "${text}"`);
                  btn.click();
                  return true;
                }
              }
            }
          }
        }
      }
      return false;
    });

    if (clicked) {
      console.log('✅ 成功点击确定按钮!');
    } else {
      console.log('❌ 未找到或未点击确定按钮');
    }

    // 等待观察结果
    console.log('\n⏳ 等待10秒观察结果...');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    console.log('\n🔚 测试完成,关闭浏览器');
    await browser.close();
  }
}

testImageUploadDialog();

