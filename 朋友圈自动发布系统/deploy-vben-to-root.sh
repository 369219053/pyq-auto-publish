#!/bin/bash

echo "========================================"
echo "  部署新前端到根目录"
echo "  替换旧前端文件"
echo "========================================"
echo ""

# 1. 备份旧文件
echo "[1/4] 备份旧前端文件..."
ssh root@124.223.35.102 "cd /www/wwwroot/autochat.lfdhk.com && mkdir -p backup-$(date +%Y%m%d-%H%M%S) && cp -r index.html js jse css _app.config.js logo.svg favicon.ico backup-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true"
echo "✅ 备份完成!"
echo ""

# 2. 上传新文件到根目录
echo "[2/4] 上传新前端文件到根目录..."
rsync -avz --delete \
  ./pyq-frontend-vben/apps/web-antd/dist/ \
  root@124.223.35.102:/www/wwwroot/autochat.lfdhk.com/
echo "✅ 文件上传完成!"
echo ""

# 3. 修改index.html中的路径为相对路径
echo "[3/4] 修复index.html中的路径..."
ssh root@124.223.35.102 "cd /www/wwwroot/autochat.lfdhk.com && \
  sed -i 's|src=\"/jse/|src=\"./jse/|g' index.html && \
  sed -i 's|href=\"/css/|href=\"./css/|g' index.html && \
  sed -i 's|src=\"/_app.config.js|src=\"./_app.config.js|g' index.html && \
  sed -i 's|href=\"/logo.svg|href=\"./logo.svg|g' index.html && \
  sed -i 's|href=\"/favicon.ico|href=\"./favicon.ico|g' index.html"
echo "✅ 路径修复完成!"
echo ""

# 4. 设置权限
echo "[4/4] 设置文件权限..."
ssh root@124.223.35.102 "chmod -R 755 /www/wwwroot/autochat.lfdhk.com"
echo "✅ 权限设置完成!"
echo ""

echo "========================================"
echo "  🎉 部署完成!"
echo "========================================"
echo ""
echo "访问地址: https://autochat.lfdhk.com/"
echo ""
echo "请刷新浏览器测试 (Ctrl+Shift+R 强制刷新)"
