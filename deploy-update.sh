#!/bin/bash

# 朋友圈自动发布系统 - 代码更新部署脚本
# 作者: 小牛马 & 打工人
# 日期: 2025-10-28
# 使用方法: ./deploy-update.sh

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
SERVER_USER="root"
SERVER_HOST="124.223.35.102"
SERVER_PATH="/www/wwwroot/pyq-backend/pyq-backend"
LOCAL_BACKEND_PATH="./pyq-backend"
LOCAL_FRONTEND_PATH="./pyq-frontend"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  朋友圈自动发布系统 - 代码更新部署${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 编译后端代码
echo -e "${YELLOW}[1/5] 编译后端代码...${NC}"
cd "$LOCAL_BACKEND_PATH"
npm run build
echo -e "${GREEN}✅ 后端代码编译完成!${NC}"
echo ""

# 2. 上传后端dist文件夹
echo -e "${YELLOW}[2/5] 上传后端代码到服务器...${NC}"
rsync -avz --delete dist/ ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/dist/
echo -e "${GREEN}✅ 后端代码上传完成!${NC}"
echo ""

# 3. 上传前端文件
echo -e "${YELLOW}[3/5] 上传前端文件到服务器...${NC}"
cd ..
rsync -avz --delete ${LOCAL_FRONTEND_PATH}/ ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/../pyq-frontend/
echo -e "${GREEN}✅ 前端文件上传完成!${NC}"
echo ""

# 4. 重启PM2服务
echo -e "${YELLOW}[4/5] 重启PM2服务...${NC}"
ssh ${SERVER_USER}@${SERVER_HOST} "cd ${SERVER_PATH} && pm2 restart pyq-backend"
echo -e "${GREEN}✅ PM2服务重启完成!${NC}"
echo ""

# 5. 查看服务状态
echo -e "${YELLOW}[5/5] 查看服务状态...${NC}"
ssh ${SERVER_USER}@${SERVER_HOST} "pm2 list"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 部署完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}访问地址: https://autochat.lfdhk.com${NC}"
echo ""
echo -e "${YELLOW}提示: 如需查看日志,请执行:${NC}"
echo -e "${YELLOW}  ssh ${SERVER_USER}@${SERVER_HOST} 'pm2 logs pyq-backend'${NC}"
echo ""

