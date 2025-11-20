const { chromium } = require('playwright');

(async () => {
  console.log('🚀 启动浏览器...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null
  });

  const page = await context.newPage();

  try {
    console.log('📱 正在打开Supabase Table Editor...');

    // 打开publish_tasks表
    await page.goto('https://supabase.com/dashboard/project/upcsdbcpmzpywvykiqtu/editor/29603', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    console.log('⏳ 等待页面加载完成...');
    await page.waitForTimeout(5000);

    // 尝试获取页面标题
    const title = await page.title();
    console.log('📄 页面标题:', title);

    // 检查是否需要登录
    const url = page.url();
    console.log('🔗 当前URL:', url);

    if (url.includes('login') || url.includes('sign-in')) {
      console.log('⚠️  需要登录,请在浏览器中手动登录');
    } else {
      console.log('✅ 已登录,正在检查表结构...');

      // 等待表格加载
      await page.waitForTimeout(3000);

      // 尝试读取页面内容
      const bodyText = await page.evaluate(() => {
        return document.body.innerText;
      });

      console.log('\n📊 页面内容预览:');
      console.log(bodyText.substring(0, 500));

      // 检查是否有RLS相关信息
      if (bodyText.includes('RLS')) {
        console.log('\n✅ 发现RLS相关信息');
      }

      // 检查是否有表结构信息
      if (bodyText.includes('user_id') || bodyText.includes('publish_time')) {
        console.log('✅ 发现表字段信息');
      }
    }

    console.log('\n⏳ 浏览器将保持打开,我会继续分析页面...');
    console.log('💡 按Ctrl+C退出\n');

    // 持续监控页面变化
    await page.waitForTimeout(300000);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.log('\n💡 浏览器已打开,请手动检查');
    await page.waitForTimeout(300000);
  } finally {
    console.log('🔚 关闭浏览器...');
    await browser.close();
  }
})();

