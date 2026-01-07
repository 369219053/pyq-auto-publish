/**
 * 测试脚本2图片消息发送功能
 * 
 * 测试步骤:
 * 1. 准备测试图片(Base64格式)
 * 2. 调用组合发送接口
 * 3. 查看日志输出
 */

const fs = require('fs');
const path = require('path');

// 测试配置
const TEST_CONFIG = {
  userId: '2e748b58-8f94-48ba-8a43-a1b0c93ed3a0', // 替换为实际的用户ID
  apiUrl: 'http://localhost:3000/api/automation/script2/combined-reach',
  testImagePath: path.join(__dirname, 'test-image.jpg'), // 测试图片路径
};

/**
 * 将本地图片转换为Base64
 */
function imageToBase64(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).substring(1);
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('❌ 读取图片失败:', error.message);
    return null;
  }
}

/**
 * 创建测试图片(如果不存在)
 */
function createTestImage() {
  if (fs.existsSync(TEST_CONFIG.testImagePath)) {
    console.log('✅ 测试图片已存在:', TEST_CONFIG.testImagePath);
    return true;
  }

  console.log('📝 创建测试图片...');
  // 创建一个简单的1x1像素的PNG图片(Base64)
  const simpleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const buffer = Buffer.from(simpleImageBase64, 'base64');
  fs.writeFileSync(TEST_CONFIG.testImagePath, buffer);
  console.log('✅ 测试图片创建成功');
  return true;
}

/**
 * 测试图片发送功能
 */
async function testImageSend() {
  console.log('🚀 开始测试脚本2图片消息发送功能...\n');

  // 1. 创建/检查测试图片
  if (!createTestImage()) {
    console.error('❌ 无法创建测试图片');
    return;
  }

  // 2. 转换为Base64
  console.log('📥 转换图片为Base64...');
  const imageBase64 = imageToBase64(TEST_CONFIG.testImagePath);
  if (!imageBase64) {
    console.error('❌ 图片转换失败');
    return;
  }
  console.log('✅ 图片转换成功,Base64长度:', imageBase64.length);
  console.log('   前50个字符:', imageBase64.substring(0, 50) + '...\n');

  // 3. 准备请求数据
  const requestData = {
    userId: TEST_CONFIG.userId,
    contents: [
      {
        type: 'image',
        imageUrls: [imageBase64], // 发送1张图片
      }
    ],
    targetDays: 1, // 1天内完成
    taskId: `test_image_${Date.now()}`,
    selectedWechatAccountIndexes: [0], // 使用第一个微信号
    selectedFriendIds: [], // 空数组表示发送给所有好友
  };

  console.log('📤 准备发送请求...');
  console.log('   API地址:', TEST_CONFIG.apiUrl);
  console.log('   用户ID:', requestData.userId);
  console.log('   图片数量:', requestData.contents[0].imageUrls.length);
  console.log('   任务ID:', requestData.taskId);
  console.log('');

  // 4. 发送请求
  try {
    const response = await fetch(TEST_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ 请求发送成功!');
      console.log('   响应:', JSON.stringify(result, null, 2));
    } else {
      console.error('❌ 请求失败!');
      console.error('   状态码:', response.status);
      console.error('   响应:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ 发送请求时出错:', error.message);
  }

  console.log('\n📝 提示:');
  console.log('   1. 请查看后端日志,确认Puppeteer是否正常执行');
  console.log('   2. 如果设置了PUPPETEER_HEADLESS=false,可以看到浏览器操作过程');
  console.log('   3. 检查临时文件是否正确生成(temp_chat_image_*.jpg)');
}

// 执行测试
testImageSend().catch(console.error);

