#!/usr/bin/env node

/**
 * 文档解析工具
 * 作者：小牛马团队
 */

import fs from 'fs/promises';
import path from 'path';

async function parseTextFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const stats = await fs.stat(filePath);
    
    return {
      success: true,
      file_path: filePath,
      file_name: path.basename(filePath),
      file_size: stats.size,
      file_extension: path.extname(filePath),
      created_time: stats.birthtime.toLocaleString('zh-CN'),
      modified_time: stats.mtime.toLocaleString('zh-CN'),
      content: content,
      content_length: content.length,
      line_count: content.split('\n').length,
      word_count: content.split(/\s+/).filter(word => word.length > 0).length,
      parse_time: new Date().toLocaleString('zh-CN')
    };
  } catch (error) {
    return {
      success: false,
      file_path: filePath,
      error: error.message
    };
  }
}

async function getFileInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      success: true,
      file_path: filePath,
      file_name: path.basename(filePath),
      file_size: stats.size,
      file_extension: path.extname(filePath),
      created_time: stats.birthtime.toLocaleString('zh-CN'),
      modified_time: stats.mtime.toLocaleString('zh-CN'),
      note: '文件基本信息（内容解析需要安装相应的库）',
      parse_time: new Date().toLocaleString('zh-CN')
    };
  } catch (error) {
    return {
      success: false,
      file_path: filePath,
      error: error.message
    };
  }
}

async function parseDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  // 检查文件是否存在
  try {
    await fs.access(filePath);
  } catch {
    return {
      success: false,
      file_path: filePath,
      error: `文件不存在: ${filePath}`
    };
  }

  switch (ext) {
    case '.txt':
    case '.md':
    case '.json':
    case '.csv':
    case '.log':
      return await parseTextFile(filePath);
    case '.pdf':
    case '.docx':
    case '.doc':
      return await getFileInfo(filePath);
    default:
      return {
        success: false,
        file_path: filePath,
        error: `不支持的文件格式: ${ext}`,
        supported_formats: ['.txt', '.md', '.json', '.csv', '.log', '.pdf', '.docx', '.doc']
      };
  }
}

function getSupportedFormats() {
  return {
    supported_formats: ['.txt', '.md', '.json', '.csv', '.log', '.pdf', '.docx', '.doc'],
    full_support: ['.txt', '.md', '.json', '.csv', '.log'],
    info_only: ['.pdf', '.docx', '.doc'],
    note: '完全支持的格式可以提取内容，仅信息格式只能获取文件基本信息'
  };
}

// 命令行处理
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('📄 文档解析工具');
  console.log('');
  console.log('使用方法:');
  console.log('  node doc-parser.js <文件路径>');
  console.log('  node doc-parser.js --formats');
  console.log('');
  console.log('示例:');
  console.log('  node doc-parser.js ./test.txt');
  console.log('  node doc-parser.js ./document.pdf');
  process.exit(0);
}

if (args[0] === '--formats') {
  console.log(JSON.stringify(getSupportedFormats(), null, 2));
  process.exit(0);
}

// 解析文档
const filePath = args[0];
parseDocument(filePath).then(result => {
  console.log(JSON.stringify(result, null, 2));
}).catch(error => {
  console.error('解析失败:', error.message);
});
