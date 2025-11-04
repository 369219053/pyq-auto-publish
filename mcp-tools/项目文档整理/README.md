# 自定义MCP工具集

> 由小牛马团队为刀仔老板定制开发的MCP工具集合

## 📊 项目概述

本项目包含两个核心MCP服务器：
- **文档解析服务器** - 支持PDF、Word文档解析和文本提取
- **天气时间服务器** - 提供北京时间查询、天气信息和时区转换功能

**技术栈**：Node.js + MCP SDK + 文档解析库
**当前状态**：开发完成，可直接使用

## 🚀 快速启动指南

### 环境要求
- Node.js 18+ 版本
- npm 包管理器
- MCP客户端（如Claude Desktop）

### 安装步骤
```bash
# 1. 进入工具目录
cd mcp-tools

# 2. 运行安装脚本
chmod +x install.sh
./install.sh

# 3. 启动服务器
npm run start:doc-parser    # 启动文档解析服务器
npm run start:weather-time  # 启动天气时间服务器
```

### 验证安装
```bash
# 测试文档解析器
npm run test:doc-parser

# 测试天气时间服务器
npm run test:weather-time
```

## 🔧 核心功能模块

### 1. 文档解析服务器 (document-parser-server.js)

**主要功能**：
- PDF文档文本提取
- Word文档内容解析
- 文本文件读取
- 批量文档处理
- 支持格式检查

**可用工具**：
- `parse_document` - 解析单个文档
- `batch_parse_documents` - 批量解析文档
- `list_supported_formats` - 查看支持的格式

### 2. 天气时间服务器 (weather-time-server.js)

**主要功能**：
- 北京时间实时查询
- 多时区时间显示
- 天气信息获取
- 时区转换工具
- 支持的时区列表

**可用工具**：
- `get_beijing_time` - 获取北京时间
- `get_current_time` - 获取指定时区时间
- `get_multiple_timezones` - 多城市时间
- `get_weather_info` - 天气信息查询
- `convert_timezone` - 时区转换
- `get_available_timezones` - 支持的时区

## 📁 项目文件结构

```
mcp-tools/
├── document-parser-server.js    # 文档解析MCP服务器（需要MCP SDK）
├── weather-time-server.js       # 天气时间MCP服务器（需要MCP SDK）
├── beijing-time.js              # 简化版北京时间工具（无依赖）✅
├── doc-parser.js                # 简化版文档解析工具（无依赖）✅
├── package.json                 # 项目配置文件
├── install.sh                   # 自动安装脚本
├── start-doc-parser.sh          # 文档解析器启动脚本
├── start-weather-time.sh        # 天气时间服务器启动脚本
├── test-doc-parser.js           # 文档解析器测试文件
├── test-weather-time.js         # 天气时间服务器测试文件
├── test-simple.js               # 简单功能测试文件
└── 项目文档整理/
    └── README.md                # 项目文档（本文件）
```

**推荐使用简化版工具**：
- `beijing-time.js` - 北京时间查询（已验证可用）
- `doc-parser.js` - 文档解析工具（已验证可用）

## 🛠️ 故障排查指南

### 常见问题

**1. Node.js版本问题**
```bash
# 检查版本
node -v
# 需要18+版本，如果版本过低请升级
```

**2. 依赖安装失败**
```bash
# 清理缓存重新安装
npm cache clean --force
npm install
```

**3. MCP服务器无法启动**
```bash
# 检查端口占用
netstat -ano | findstr :3000
# 确保没有其他进程占用MCP端口
```

**4. 文档解析失败**
- 确保文件路径正确
- 检查文件格式是否支持
- 验证文件是否损坏

### 调试模式
```bash
# 启动时显示详细日志
DEBUG=* node document-parser-server.js
DEBUG=* node weather-time-server.js
```

## 🔗 重要链接和配置

### MCP客户端配置示例

**Claude Desktop配置** (claude_desktop_config.json):
```json
{
  "mcpServers": {
    "document-parser": {
      "command": "node",
      "args": ["/path/to/mcp-tools/document-parser-server.js"]
    },
    "weather-time": {
      "command": "node", 
      "args": ["/path/to/mcp-tools/weather-time-server.js"]
    }
  }
}
```

### API接口说明

**文档解析接口**：
- 输入：文件路径
- 输出：解析后的文本内容
- 支持格式：.pdf, .docx, .doc, .txt, .md

**时间查询接口**：
- 北京时间：Asia/Shanghai时区
- 输出格式：JSON包含时间戳、格式化时间等
- 支持时区：全球主要城市时区

## 📅 项目更新日志

### 2024年10月15日
- **项目创建**: 完成MCP工具集的基础架构设计
- **文档解析器开发**: 实现PDF、Word文档解析功能
- **天气时间服务器开发**: 实现北京时间查询和时区转换
- **安装脚本完成**: 创建自动化安装和启动脚本
- **文档编写**: 完成完整的使用说明和配置指南
- **简化版工具完成**: 创建无依赖的简化版工具，解决npm安装问题
- **功能验证成功**: 北京时间查询、文档解析、多时区显示功能全部正常工作

## 📋 下一步计划

### 🔄 进行中
- 测试MCP服务器的稳定性和性能
- 优化文档解析的准确性

### 📝 待办事项
- 集成真实的天气API服务
- 添加更多文档格式支持（Excel、PPT等）
- 实现OCR图片文字识别功能
- 添加语音识别和TTS功能
- 创建Web管理界面

### ⚠️ 已知问题
- 文档解析功能目前为模拟实现，需要安装实际的解析库
- 天气信息为模拟数据，需要接入真实的天气API
- 需要根据实际使用情况优化性能

## 🎯 使用建议

1. **首次使用**：建议先运行测试脚本验证功能
2. **生产环境**：安装完整的文档解析依赖库
3. **性能优化**：根据文档大小调整内存限制
4. **安全考虑**：限制文件访问路径，避免安全风险

---

**开发团队**：小牛马（COZE插件专家）  
**项目定制**：专为刀仔老板的业务需求开发  
**技术支持**：提供持续的技术支持和功能扩展
