#!/bin/bash

# Token过期自动重试修复部署脚本
# 用途: 修复we-mp-rss token过期导致定时同步失败的问题

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 开始部署Token自动重试修复..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 服务器信息
SERVER="root@124.223.35.102"
REMOTE_DIR="/www/wwwroot/pyq-backend/pyq-backend"

echo ""
echo "📦 步骤1: 编译TypeScript代码..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 编译失败,请检查代码错误"
    exit 1
fi

echo "✅ 编译成功"
echo ""

echo "📤 步骤2: 上传修复后的文件到服务器..."
echo "   上传文件: dist/wechat-monitor/we-mp-rss.service.js"
echo "   上传文件: dist/wechat-monitor/wechat-monitor.service.js"
echo "   上传文件: dist/wechat-monitor/wechat-monitor.controller.js"
echo "   上传文件: dist/scheduler/scheduler.service.js"

# 使用rsync上传编译后的文件(支持SSH密钥免密登录)
rsync -avz dist/wechat-monitor/we-mp-rss.service.js $SERVER:$REMOTE_DIR/dist/wechat-monitor/
rsync -avz dist/wechat-monitor/wechat-monitor.service.js $SERVER:$REMOTE_DIR/dist/wechat-monitor/
rsync -avz dist/wechat-monitor/wechat-monitor.controller.js $SERVER:$REMOTE_DIR/dist/wechat-monitor/
rsync -avz dist/scheduler/scheduler.service.js $SERVER:$REMOTE_DIR/dist/scheduler/

if [ $? -ne 0 ]; then
    echo "❌ 文件上传失败,请检查SSH连接"
    exit 1
fi

echo "✅ 文件上传成功"
echo ""

echo "🔄 步骤3: 重启后端服务..."
ssh $SERVER "cd $REMOTE_DIR && pm2 restart pyq-backend"

if [ $? -ne 0 ]; then
    echo "❌ 服务重启失败"
    exit 1
fi

echo "✅ 服务重启成功"
echo ""

echo "⏳ 等待5秒让服务完全启动..."
sleep 5
echo ""

echo "📋 步骤4: 查看服务日志(最近100行)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh $SERVER "pm2 logs pyq-backend --lines 100 --nostream | tail -50"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 部署完成!"
echo ""
echo "📝 修复说明:"
echo "   1. 添加了Token过期自动重试机制(we-mp-rss系统登录)"
echo "   2. 添加了微信公众平台登录状态检测"
echo "   3. 定时任务执行前先检查微信是否登录"
echo "   4. 前端每5分钟自动检查登录状态"
echo "   5. 登录过期时显示提示并引导用户扫码"
echo "   6. 增强了日志输出,方便排查问题"
echo "   7. 修复了定时任务初始化问题(OnModuleInit)"
echo ""
echo "🔍 验证方法:"
echo "   1. 查看日志中是否有 '✅ SchedulerService 模块初始化完成'"
echo "   2. 查看日志中是否有 '🔍 检查微信公众平台登录状态...'"
echo "   3. 如果微信已登录,应该看到 '✅ 微信公众平台登录状态正常'"
echo "   4. 如果微信未登录,应该看到 '⚠️ 微信公众平台未登录或登录已过期'"
echo "   5. 前端应该显示登录过期提示(如果未登录)"
echo "   6. 等待30分钟后查看是否有 '🔄 开始执行定时同步任务'"
echo ""
echo "📊 实时监控命令:"
echo "   ssh $SERVER 'pm2 logs pyq-backend --lines 100'"
echo ""
echo "🔧 手动触发同步测试:"
echo "   curl http://124.223.35.102:3000/wechat-monitor/sync-articles"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

