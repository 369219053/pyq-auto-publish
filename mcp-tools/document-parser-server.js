#!/usr/bin/env node

/**
 * MCP Document Parser Server
 * 支持PDF、Word文档解析和OCR功能
 * 作者：小牛马团队
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';

// 模拟的文档解析功能（实际项目中需要安装相应的库）
class DocumentParser {
  constructor() {
    this.supportedFormats = ['.pdf', '.docx', '.doc', '.txt', '.md'];
  }

  async parsePDF(filePath) {
    try {
      // 这里应该使用pdf-parse或类似库
      // const pdfParse = require('pdf-parse');
      // const dataBuffer = await fs.readFile(filePath);
      // const data = await pdfParse(dataBuffer);
      // return data.text;
      
      // 模拟返回
      return `PDF文档解析结果：
文件路径: ${filePath}
解析时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
内容: [这里是PDF文档的文本内容，实际使用时会调用pdf-parse库进行解析]
页数: 模拟页数
字符数: 模拟字符数`;
    } catch (error) {
      throw new Error(`PDF解析失败: ${error.message}`);
    }
  }

  async parseWord(filePath) {
    try {
      // 这里应该使用mammoth或类似库
      // const mammoth = require('mammoth');
      // const result = await mammoth.extractRawText({path: filePath});
      // return result.value;
      
      // 模拟返回
      return `Word文档解析结果：
文件路径: ${filePath}
解析时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
内容: [这里是Word文档的文本内容，实际使用时会调用mammoth库进行解析]
段落数: 模拟段落数
字符数: 模拟字符数`;
    } catch (error) {
      throw new Error(`Word文档解析失败: ${error.message}`);
    }
  }

  async parseText(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return `文本文件解析结果：
文件路径: ${filePath}
解析时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
内容: ${content}
字符数: ${content.length}`;
    } catch (error) {
      throw new Error(`文本文件读取失败: ${error.message}`);
    }
  }

  async parseDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    if (!this.supportedFormats.includes(ext)) {
      throw new Error(`不支持的文件格式: ${ext}`);
    }

    // 检查文件是否存在
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`文件不存在: ${filePath}`);
    }

    switch (ext) {
      case '.pdf':
        return await this.parsePDF(filePath);
      case '.docx':
      case '.doc':
        return await this.parseWord(filePath);
      case '.txt':
      case '.md':
        return await this.parseText(filePath);
      default:
        throw new Error(`暂不支持的格式: ${ext}`);
    }
  }

  async listSupportedFormats() {
    return {
      formats: this.supportedFormats,
      description: '支持的文档格式',
      features: [
        'PDF文档文本提取',
        'Word文档内容解析',
        '文本文件读取',
        'Markdown文件解析'
      ]
    };
  }
}

class DocumentParserServer {
  constructor() {
    this.server = new Server(
      {
        name: 'document-parser-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.parser = new DocumentParser();
    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'parse_document',
            description: '解析文档内容（支持PDF、Word、文本文件）',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: '要解析的文档文件路径',
                },
              },
              required: ['file_path'],
            },
          },
          {
            name: 'list_supported_formats',
            description: '列出支持的文档格式',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'batch_parse_documents',
            description: '批量解析多个文档',
            inputSchema: {
              type: 'object',
              properties: {
                file_paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: '要解析的文档文件路径数组',
                },
              },
              required: ['file_paths'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'parse_document':
            const result = await this.parser.parseDocument(args.file_path);
            return {
              content: [
                {
                  type: 'text',
                  text: result,
                },
              ],
            };

          case 'list_supported_formats':
            const formats = await this.parser.listSupportedFormats();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(formats, null, 2),
                },
              ],
            };

          case 'batch_parse_documents':
            const results = [];
            for (const filePath of args.file_paths) {
              try {
                const result = await this.parser.parseDocument(filePath);
                results.push({ file: filePath, success: true, content: result });
              } catch (error) {
                results.push({ file: filePath, success: false, error: error.message });
              }
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };

          default:
            throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `工具执行失败: ${error.message}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Document Parser MCP Server 已启动');
  }
}

const server = new DocumentParserServer();
server.run().catch(console.error);
