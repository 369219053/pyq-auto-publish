#!/bin/bash

# 定时任务修复部署脚本
# 用途: 修复公众号监控定时同步任务不生效的问题

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 开始部署定时任务修复..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 服务器信息
SERVER="root@47.115.229.78"
REMOTE_DIR="/www/wwwroot/pyq-backend"

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
echo "   上传文件: dist/scheduler/scheduler.service.js"

# 使用scp上传编译后的文件
scp dist/scheduler/scheduler.service.js $SERVER:$REMOTE_DIR/dist/scheduler/

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

echo "📋 步骤4: 查看服务日志(最近50行)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ssh $SERVER "pm2 logs pyq-backend --lines 50 --nostream | grep -E '(SchedulerService|初始化|同步任务|同步完成)'"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 部署完成!"
echo ""
echo "📝 修复说明:"
echo "   1. 修复了定时任务初始化问题(使用OnModuleInit生命周期钩子)"
echo "   2. 增强了日志输出,方便监控定时任务执行情况"
echo "   3. 添加了错误重试机制(使用默认30分钟间隔)"
echo ""
echo "🔍 验证方法:"
echo "   1. 查看日志中是否有 '✅ SchedulerService 模块初始化完成'"
echo "   2. 查看日志中是否有 '🚀 新的同步任务已启动'"
echo "   3. 等待30分钟后查看是否有 '🔄 开始执行定时同步任务'"
echo ""
echo "📊 实时监控命令:"
echo "   ssh $SERVER 'pm2 logs pyq-backend --lines 100'"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

