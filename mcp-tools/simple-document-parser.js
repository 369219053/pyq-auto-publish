#!/usr/bin/env node

/**
 * 简化版文档解析器 - 无需额外依赖
 * 支持基本的文本文件读取和简单的文档信息提取
 * 作者：小牛马团队
 */

import fs from 'fs/promises';
import path from 'path';

class SimpleDocumentParser {
  constructor() {
    this.supportedFormats = ['.txt', '.md', '.json', '.csv', '.log'];
  }

  async parseTextFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const stats = await fs.stat(filePath);
      
      return {
        success: true,
        file_path: filePath,
        file_name: path.basename(filePath),
        file_size: stats.size,
        file_extension: path.extname(filePath),
        created_time: stats.birthtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        modified_time: stats.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        content: content,
        content_length: content.length,
        line_count: content.split('\n').length,
        word_count: content.split(/\s+/).filter(word => word.length > 0).length,
        parse_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    } catch (error) {
      return {
        success: false,
        file_path: filePath,
        error: error.message,
        parse_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    }
  }

  async analyzePDFInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        success: true,
        file_path: filePath,
        file_name: path.basename(filePath),
        file_size: stats.size,
        file_extension: '.pdf',
        created_time: stats.birthtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        modified_time: stats.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        note: 'PDF文件信息（需要安装pdf-parse库进行内容解析）',
        suggestion: '运行: npm install pdf-parse 来启用PDF内容解析功能',
        parse_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    } catch (error) {
      return {
        success: false,
        file_path: filePath,
        error: error.message
      };
    }
  }

  async analyzeWordInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        success: true,
        file_path: filePath,
        file_name: path.basename(filePath),
        file_size: stats.size,
        file_extension: path.extname(filePath),
        created_time: stats.birthtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        modified_time: stats.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        note: 'Word文件信息（需要安装mammoth库进行内容解析）',
        suggestion: '运行: npm install mammoth 来启用Word内容解析功能',
        parse_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
      };
    } catch (error) {
      return {
        success: false,
        file_path: filePath,
        error: error.message
      };
    }
  }

  async parseDocument(filePath) {
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
      case '.pdf':
        return await this.analyzePDFInfo(filePath);
      case '.docx':
      case '.doc':
        return await this.analyzeWordInfo(filePath);
      case '.txt':
      case '.md':
      case '.json':
      case '.csv':
      case '.log':
        return await this.parseTextFile(filePath);
      default:
        return {
          success: false,
          file_path: filePath,
          error: `不支持的文件格式: ${ext}`,
          supported_formats: this.supportedFormats
        };
    }
  }

  async batchParseDocuments(filePaths) {
    const results = [];
    for (const filePath of filePaths) {
      const result = await this.parseDocument(filePath);
      results.push(result);
    }
    return {
      batch_results: results,
      total_files: filePaths.length,
      successful_parses: results.filter(r => r.success).length,
      failed_parses: results.filter(r => !r.success).length,
      batch_time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    };
  }

  getSupportedFormats() {
    return {
      supported_formats: this.supportedFormats,
      full_support: ['.txt', '.md', '.json', '.csv', '.log'],
      info_only: ['.pdf', '.docx', '.doc'],
      note: '完全支持的格式可以提取内容，仅信息格式只能获取文件基本信息',
      upgrade_suggestion: '安装pdf-parse和mammoth库可启用PDF和Word内容解析'
    };
  }
}

// 命令行接口
async function main() {
  const parser = new SimpleDocumentParser();
  
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('📄 简化版文档解析器');
    console.log('');
    console.log('使用方法:');
    console.log('  node simple-document-parser.js <文件路径>');
    console.log('  node simple-document-parser.js --formats  # 查看支持的格式');
    console.log('  node simple-document-parser.js --batch <文件1> <文件2> ...  # 批量解析');
    console.log('');
    console.log('示例:');
    console.log('  node simple-document-parser.js ./test.txt');
    console.log('  node simple-document-parser.js ./document.pdf');
    console.log('  node simple-document-parser.js --batch ./file1.txt ./file2.md');
    return;
  }

  if (args[0] === '--formats') {
    const formats = parser.getSupportedFormats();
    console.log(JSON.stringify(formats, null, 2));
    return;
  }

  if (args[0] === '--batch') {
    const filePaths = args.slice(1);
    if (filePaths.length === 0) {
      console.log('错误: 批量解析需要提供文件路径');
      return;
    }
    const result = await parser.batchParseDocuments(filePaths);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // 单文件解析
  const filePath = args[0];
  const result = await parser.parseDocument(filePath);
  console.log(JSON.stringify(result, null, 2));
}

// 如果直接运行此文件
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default SimpleDocumentParser;
