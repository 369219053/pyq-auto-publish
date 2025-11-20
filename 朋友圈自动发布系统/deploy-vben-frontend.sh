#!/bin/bash

# 朋友圈自动发布系统 - 新前端部署脚本 (Vue Vben Admin)
# 作者: 小牛马 & 打工人
# 日期: 2025-01-21
# 使用方法: ./deploy-vben-frontend.sh

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置变量
SERVER_USER="root"
SERVER_HOST="124.223.35.102"
SERVER_PATH="/www/wwwroot/autochat.lfdhk.com"
LOCAL_DIST_PATH="./pyq-frontend-vben/apps/web-antd/dist"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  朋友圈自动发布系统 - 新前端部署${NC}"
echo -e "${GREEN}  Vue Vben Admin V5.0${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查dist文件夹是否存在
if [ ! -d "$LOCAL_DIST_PATH" ]; then
    echo -e "${RED}❌ 错误: 未找到打包文件夹 $LOCAL_DIST_PATH${NC}"
    echo -e "${YELLOW}请先运行打包命令:${NC}"
    echo -e "${YELLOW}  cd pyq-frontend-vben && npx pnpm@10.14.0 build:antd${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 找到打包文件夹: $LOCAL_DIST_PATH${NC}"
echo ""

# 1. 在服务器上创建new文件夹
echo -e "${YELLOW}[1/4] 在服务器上创建/new/目录...${NC}"
ssh ${SERVER_USER}@${SERVER_HOST} "mkdir -p ${SERVER_PATH}/new"
echo -e "${GREEN}✅ 目录创建完成!${NC}"
echo ""

# 2. 上传dist文件夹内容到服务器/new/目录
echo -e "${YELLOW}[2/4] 上传新前端文件到服务器...${NC}"
echo -e "${YELLOW}源路径: $LOCAL_DIST_PATH/${NC}"
echo -e "${YELLOW}目标路径: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/new/${NC}"
rsync -avz --delete ${LOCAL_DIST_PATH}/ ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/new/
echo -e "${GREEN}✅ 文件上传完成!${NC}"
echo ""

# 3. 设置文件权限
echo -e "${YELLOW}[3/4] 设置文件权限...${NC}"
ssh ${SERVER_USER}@${SERVER_HOST} "chmod -R 755 ${SERVER_PATH}/new"
echo -e "${GREEN}✅ 权限设置完成!${NC}"
echo ""

# 4. 验证部署
echo -e "${YELLOW}[4/4] 验证部署...${NC}"
ssh ${SERVER_USER}@${SERVER_HOST} "ls -lh ${SERVER_PATH}/new/ | head -10"
echo -e "${GREEN}✅ 部署验证完成!${NC}"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  🎉 新前端部署完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${GREEN}访问地址:${NC}"
echo -e "${GREEN}  旧前端: https://autochat.lfdhk.com/index.html${NC}"
echo -e "${GREEN}  新前端: https://autochat.lfdhk.com/new/${NC}"
echo ""
echo -e "${YELLOW}测试清单:${NC}"
echo -e "${YELLOW}  1. 访问新前端URL${NC}"
echo -e "${YELLOW}  2. 测试登录功能 (lifangde01 / 52wangyibo.)${NC}"
echo -e "${YELLOW}  3. 测试公众号监控功能${NC}"
echo -e "${YELLOW}  4. 测试文案转写功能${NC}"
echo -e "${YELLOW}  5. 测试自动发布功能${NC}"
echo ""
echo -e "${YELLOW}注意事项:${NC}"
echo -e "${YELLOW}  - 旧前端保持不变,继续正常使用${NC}"
echo -e "${YELLOW}  - 新前端部署在/new/目录,方便测试${NC}"
echo -e "${YELLOW}  - 确认新前端100%正常后,再考虑替换旧前端${NC}"
echo ""

