#!/bin/bash

# MCP工具安装脚本
# 作者：小牛马团队

echo "🚀 开始安装自定义MCP工具..."

# 检查Node.js版本
echo "📋 检查Node.js环境..."
if ! command -v node &> /dev/null; then
    echo "❌ 错误：未找到Node.js，请先安装Node.js 18+版本"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ 错误：Node.js版本过低，需要18+版本，当前版本：$(node -v)"
    exit 1
fi

echo "✅ Node.js版本检查通过：$(node -v)"

# 安装依赖
echo "📦 安装MCP SDK依赖..."
npm install @modelcontextprotocol/sdk

# 安装可选依赖（用于实际的文档解析）
echo "📦 安装文档解析依赖（可选）..."
npm install pdf-parse mammoth --save-optional

# 安装网络请求依赖（用于天气API）
echo "📦 安装网络请求依赖（可选）..."
npm install axios node-fetch --save-optional

# 设置执行权限
echo "🔧 设置执行权限..."
chmod +x document-parser-server.js
chmod +x weather-time-server.js

# 创建测试文件
echo "📝 创建测试文件..."
cat > test-doc-parser.js << 'EOF'
// 文档解析器测试文件
console.log('文档解析器测试');
console.log('支持的格式：PDF, Word, 文本文件');
console.log('使用方法：node document-parser-server.js');
EOF

cat > test-weather-time.js << 'EOF'
// 天气时间服务器测试文件
console.log('天气时间服务器测试');
console.log('功能：北京时间查询、天气信息、时区转换');
console.log('使用方法：node weather-time-server.js');
EOF

# 创建启动脚本
echo "🚀 创建启动脚本..."
cat > start-doc-parser.sh << 'EOF'
#!/bin/bash
echo "启动文档解析MCP服务器..."
node document-parser-server.js
EOF

cat > start-weather-time.sh << 'EOF'
#!/bin/bash
echo "启动天气时间MCP服务器..."
node weather-time-server.js
EOF

chmod +x start-doc-parser.sh
chmod +x start-weather-time.sh

echo ""
echo "🎉 安装完成！"
echo ""
echo "📋 可用的MCP服务器："
echo "  1. 文档解析服务器：./start-doc-parser.sh 或 npm run start:doc-parser"
echo "  2. 天气时间服务器：./start-weather-time.sh 或 npm run start:weather-time"
echo ""
echo "🔧 配置说明："
echo "  - 将这些服务器添加到您的MCP客户端配置中"
echo "  - 文档解析器支持：PDF、Word、文本文件"
echo "  - 天气时间服务器支持：北京时间、多时区、天气查询"
echo ""
echo "📖 使用示例："
echo "  node document-parser-server.js  # 启动文档解析服务"
echo "  node weather-time-server.js     # 启动天气时间服务"
echo ""
echo "✨ 由小牛马团队开发，专为刀仔老板定制！"
