// 简单测试脚本
console.log('🚀 测试开始...');

// 测试北京时间
const now = new Date();
const beijingTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
console.log('📅 北京时间:', beijingTime);

// 测试文件信息
import fs from 'fs/promises';
import path from 'path';

async function testFileInfo() {
  try {
    const currentFile = './test-simple.js';
    const stats = await fs.stat(currentFile);
    console.log('📄 文件信息:', {
      name: path.basename(currentFile),
      size: stats.size,
      created: stats.birthtime.toLocaleString('zh-CN'),
      modified: stats.mtime.toLocaleString('zh-CN')
    });
  } catch (error) {
    console.log('❌ 文件测试失败:', error.message);
  }
}

testFileInfo();

console.log('✅ 测试完成！');
