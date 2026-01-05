#!/bin/bash

# ========================================
# 服务器重做系统前备份脚本
# ========================================

echo "🔒 开始备份服务器数据..."

# 设置备份目录
BACKUP_DIR="./server-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📁 备份目录: $BACKUP_DIR"

# ========================================
# 1. 备份环境变量和配置文件
# ========================================
echo ""
echo "📝 1. 备份环境变量和配置文件..."

ssh root@124.223.35.102 "cat /www/wwwroot/pyq-backend/pyq-backend/.env" > "$BACKUP_DIR/backend.env"
echo "  ✅ 后端.env文件已备份"

ssh root@124.223.35.102 "cat /www/server/panel/vhost/nginx/autochat.lfdhk.com.conf" > "$BACKUP_DIR/nginx-autochat.conf" 2>/dev/null || echo "  ⚠️  Nginx配置文件不存在或无法访问"

# ========================================
# 2. 备份SSL证书
# ========================================
echo ""
echo "🔐 2. 备份SSL证书..."

mkdir -p "$BACKUP_DIR/ssl-cert"
scp -r root@124.223.35.102:/www/server/panel/vhost/cert/autochat.lfdhk.com/* "$BACKUP_DIR/ssl-cert/" 2>/dev/null || echo "  ⚠️  SSL证书不存在或无法访问"

# ========================================
# 3. 备份PM2配置
# ========================================
echo ""
echo "⚙️  3. 备份PM2配置..."

ssh root@124.223.35.102 "pm2 save && cat ~/.pm2/dump.pm2" > "$BACKUP_DIR/pm2-dump.json" 2>/dev/null || echo "  ⚠️  PM2配置备份失败"

# ========================================
# 4. 备份we-mp-rss数据
# ========================================
echo ""
echo "📦 4. 备份we-mp-rss数据..."

mkdir -p "$BACKUP_DIR/we-mp-rss-data"
scp -r root@124.223.35.102:/www/wwwroot/we-mp-rss-data/* "$BACKUP_DIR/we-mp-rss-data/" 2>/dev/null || echo "  ⚠️  we-mp-rss数据备份失败"

# ========================================
# 5. 备份宝塔面板配置(可选)
# ========================================
echo ""
echo "🔧 5. 备份宝塔面板配置..."

ssh root@124.223.35.102 "cat /www/server/panel/data/default.db" > "$BACKUP_DIR/bt-panel.db" 2>/dev/null || echo "  ⚠️  宝塔面板配置备份失败(可选)"

# ========================================
# 6. 导出服务器信息
# ========================================
echo ""
echo "📊 6. 导出服务器信息..."

cat > "$BACKUP_DIR/server-info.txt" << EOF
# ========================================
# 服务器信息
# ========================================

服务器IP: 124.223.35.102
域名: autochat.lfdhk.com

# ========================================
# 端口信息
# ========================================

后端API: 3000 (只监听127.0.0.1)
前端: 80/443 (Nginx)
宝塔面板: 17005
SSH: 22

# ========================================
# 服务信息
# ========================================

后端进程: PM2管理 (进程名: pyq-backend)
前端部署: /www/wwwroot/pyq-frontend
后端部署: /www/wwwroot/pyq-backend/pyq-backend

# ========================================
# 数据库信息
# ========================================

数据库: Supabase PostgreSQL (云端托管)
URL: https://upcsdbcpmzpywvykiqtu.supabase.co
连接: aws-0-ap-southeast-1.pooler.supabase.com:6543

⚠️ 数据库在云端,重做系统不会丢失!

# ========================================
# Docker容器信息
# ========================================

we-mp-rss: 端口8001
  - 镜像: ghcr.io/rachelos/we-mp-rss:latest
  - 数据: /www/wwwroot/we-mp-rss-data
  - Webhook: http://124.223.35.102:3000/api/wechat-monitor/webhook

# ========================================
# 重要提醒
# ========================================

1. Supabase数据库在云端,不需要备份
2. 代码已在GitHub,不需要备份
3. 重做系统后需要重新安装:
   - Node.js (v20+)
   - PM2
   - Nginx
   - Docker (如果需要we-mp-rss)
   - 宝塔面板 (可选)

EOF

echo "  ✅ 服务器信息已导出"

# ========================================
# 7. 打包备份文件
# ========================================
echo ""
echo "📦 7. 打包备份文件..."

tar -czf "${BACKUP_DIR}.tar.gz" "$BACKUP_DIR"
echo "  ✅ 备份文件已打包: ${BACKUP_DIR}.tar.gz"

# ========================================
# 完成
# ========================================
echo ""
echo "✅ 备份完成!"
echo ""
echo "📁 备份文件位置:"
echo "  - 目录: $BACKUP_DIR"
echo "  - 压缩包: ${BACKUP_DIR}.tar.gz"
echo ""
echo "⚠️  重要提醒:"
echo "  1. 请妥善保管备份文件(包含敏感信息)"
echo "  2. Supabase数据库在云端,不会丢失"
echo "  3. GitHub代码仓库不会丢失"
echo "  4. 重做系统后参考 server-info.txt 恢复配置"
echo ""

