#!/usr/bin/env node

/**
 * PDF阅读工具 - 尝试多种方法读取PDF
 * 作者：小牛马团队
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class PDFReader {
  constructor() {
    this.methods = [
      'pdftotext',  // poppler-utils
      'pdf2txt',    // pdfminer
      'pdfplumber', // Python pdfplumber
      'strings'     // 基本字符串提取
    ];
  }

  async getFileInfo(filePath) {
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
        size_mb: (stats.size / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async tryPdfToText(filePath) {
    try {
      const { stdout } = await execAsync(`pdftotext "${filePath}" -`);
      return {
        method: 'pdftotext',
        success: true,
        content: stdout,
        content_length: stdout.length
      };
    } catch (error) {
      return {
        method: 'pdftotext',
        success: false,
        error: error.message
      };
    }
  }

  async tryStringsExtraction(filePath) {
    try {
      const { stdout } = await execAsync(`strings "${filePath}" | head -100`);
      return {
        method: 'strings',
        success: true,
        content: stdout,
        content_length: stdout.length,
        note: '使用strings命令提取的文本片段（前100行）'
      };
    } catch (error) {
      return {
        method: 'strings',
        success: false,
        error: error.message
      };
    }
  }

  async tryPythonPdfPlumber(filePath) {
    const pythonScript = `
import sys
try:
    import pdfplumber
    with pdfplumber.open("${filePath}") as pdf:
        text = ""
        for page in pdf.pages[:5]:  # 只读前5页
            text += page.extract_text() or ""
        print(text)
except ImportError:
    print("ERROR: pdfplumber not installed")
except Exception as e:
    print(f"ERROR: {e}")
`;

    try {
      const { stdout } = await execAsync(`python3 -c '${pythonScript}'`);
      if (stdout.startsWith('ERROR:')) {
        return {
          method: 'pdfplumber',
          success: false,
          error: stdout.trim()
        };
      }
      return {
        method: 'pdfplumber',
        success: true,
        content: stdout,
        content_length: stdout.length,
        note: '使用Python pdfplumber提取（前5页）'
      };
    } catch (error) {
      return {
        method: 'pdfplumber',
        success: false,
        error: error.message
      };
    }
  }

  async readPDF(filePath) {
    // 首先获取文件基本信息
    const fileInfo = await this.getFileInfo(filePath);
    if (!fileInfo.success) {
      return fileInfo;
    }

    console.log('📄 PDF文件信息:', JSON.stringify(fileInfo, null, 2));
    console.log('\n🔍 尝试提取PDF内容...\n');

    const results = [];

    // 方法1: 尝试pdftotext
    console.log('尝试方法1: pdftotext...');
    const pdftotext = await this.tryPdfToText(filePath);
    results.push(pdftotext);
    if (pdftotext.success && pdftotext.content.length > 100) {
      console.log('✅ pdftotext成功提取内容');
      return {
        ...fileInfo,
        extraction_results: results,
        best_result: pdftotext,
        content: pdftotext.content
      };
    }

    // 方法2: 尝试Python pdfplumber
    console.log('尝试方法2: Python pdfplumber...');
    const pdfplumber = await this.tryPythonPdfPlumber(filePath);
    results.push(pdfplumber);
    if (pdfplumber.success && pdfplumber.content.length > 100) {
      console.log('✅ pdfplumber成功提取内容');
      return {
        ...fileInfo,
        extraction_results: results,
        best_result: pdfplumber,
        content: pdfplumber.content
      };
    }

    // 方法3: 尝试strings命令
    console.log('尝试方法3: strings命令...');
    const strings = await this.tryStringsExtraction(filePath);
    results.push(strings);
    if (strings.success) {
      console.log('✅ strings命令提取了部分内容');
      return {
        ...fileInfo,
        extraction_results: results,
        best_result: strings,
        content: strings.content,
        note: 'strings命令只能提取部分可读文本'
      };
    }

    // 所有方法都失败
    return {
      ...fileInfo,
      extraction_results: results,
      success: false,
      error: '所有PDF内容提取方法都失败了',
      suggestions: [
        '安装poppler-utils: brew install poppler',
        '安装Python pdfplumber: pip install pdfplumber',
        '或者手动复制PDF内容'
      ]
    };
  }
}

// 命令行处理
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('📄 PDF阅读工具');
  console.log('');
  console.log('使用方法:');
  console.log('  node pdf-reader.js <PDF文件路径>');
  console.log('');
  console.log('示例:');
  console.log('  node pdf-reader.js ./document.pdf');
  process.exit(0);
}

const pdfPath = args[0];
const reader = new PDFReader();

reader.readPDF(pdfPath).then(result => {
  console.log('\n📋 最终结果:');
  console.log(JSON.stringify(result, null, 2));
}).catch(error => {
  console.error('❌ 读取失败:', error.message);
});
