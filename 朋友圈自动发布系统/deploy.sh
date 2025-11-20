#!/bin/bash

# 朋友圈自动发布系统 - 一键部署脚本
# 适用于Ubuntu 20.04+ / Debian 10+

set -e  # 遇到错误立即退出

echo "=========================================="
echo "  朋友圈自动发布系统 - 自动部署脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用root用户运行此脚本${NC}"
    echo "使用命令: sudo bash deploy.sh"
    exit 1
fi

# 步骤1: 更新系统
echo -e "${GREEN}[1/10] 更新系统包...${NC}"
apt update
apt upgrade -y

# 步骤2: 安装Node.js
echo -e "${GREEN}[2/10] 安装Node.js 18.x...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    echo -e "${GREEN}Node.js 安装成功: $(node -v)${NC}"
else
    echo -e "${YELLOW}Node.js 已安装: $(node -v)${NC}"
fi

# 步骤3: 安装Puppeteer依赖
echo -e "${GREEN}[3/10] 安装Puppeteer系统依赖...${NC}"
apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

# 步骤4: 安装PM2
echo -e "${GREEN}[4/10] 安装PM2进程管理器...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo -e "${GREEN}PM2 安装成功: $(pm2 -v)${NC}"
else
    echo -e "${YELLOW}PM2 已安装: $(pm2 -v)${NC}"
fi

# 步骤5: 安装http-server
echo -e "${GREEN}[5/10] 安装http-server...${NC}"
if ! command -v http-server &> /dev/null; then
    npm install -g http-server
    echo -e "${GREEN}http-server 安装成功${NC}"
else
    echo -e "${YELLOW}http-server 已安装${NC}"
fi

# 步骤6: 配置环境变量
echo -e "${GREEN}[6/10] 配置环境变量...${NC}"
cd pyq-backend

if [ ! -f .env ]; then
    echo -e "${YELLOW}未找到.env文件,请手动创建并配置${NC}"
    echo -e "${YELLOW}参考.env.example文件${NC}"
    
    # 创建.env模板
    cat > .env << 'EOF'
# Supabase配置
SUPABASE_URL=https://upcsdbcpmzpywvykiqtu.supabase.co
SUPABASE_KEY=请填写您的SUPABASE_KEY

# PostgreSQL连接字符串
DATABASE_URL=postgresql://postgres.yjqxqxqxqxqxqxqx:请填写密码@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres

# JWT配置
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3000

# we-mp-rss配置
WE_MP_RSS_URL=http://localhost:8001
WE_MP_RSS_USERNAME=admin
WE_MP_RSS_PASSWORD=admin@123

# Puppeteer服务配置
PUPPETEER_SERVICE_URL=http://localhost:3002
EOF
    
    echo -e "${RED}请编辑 pyq-backend/.env 文件,填入正确的配置信息${NC}"
    echo -e "${RED}编辑完成后,重新运行此脚本${NC}"
    exit 1
else
    echo -e "${GREEN}.env文件已存在${NC}"
fi

# 步骤7: 安装后端依赖
echo -e "${GREEN}[7/10] 安装后端依赖...${NC}"
npm install

# 步骤8: 编译后端代码
echo -e "${GREEN}[8/10] 编译TypeScript代码...${NC}"
npm run build

# 步骤9: 启动服务
echo -e "${GREEN}[9/10] 启动服务...${NC}"

# 停止旧服务(如果存在)
pm2 delete pyq-backend 2>/dev/null || true
pm2 delete pyq-frontend 2>/dev/null || true

# 启动后端
pm2 start npm --name "pyq-backend" -- run start:prod

# 启动前端
cd ../pyq-frontend
pm2 start http-server --name "pyq-frontend" -- -p 8080

# 保存PM2进程列表
pm2 save

# 步骤10: 配置防火墙
echo -e "${GREEN}[10/10] 配置防火墙...${NC}"
if command -v ufw &> /dev/null; then
    ufw allow 3000/tcp
    ufw allow 8080/tcp
    echo -e "${GREEN}防火墙规则已添加${NC}"
else
    echo -e "${YELLOW}未检测到ufw,请手动配置防火墙${NC}"
fi

# 设置PM2开机自启
echo -e "${GREEN}设置PM2开机自启...${NC}"
pm2 startup | grep "sudo" | bash

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成!${NC}"
echo "=========================================="
echo ""
echo -e "${GREEN}服务状态:${NC}"
pm2 status
echo ""
echo -e "${GREEN}访问地址:${NC}"
echo "  前端: http://$(hostname -I | awk '{print $1}'):8080"
echo "  后端API: http://$(hostname -I | awk '{print $1}'):3000/api"
echo ""
echo -e "${GREEN}常用命令:${NC}"
echo "  查看日志: pm2 logs"
echo "  重启服务: pm2 restart all"
echo "  停止服务: pm2 stop all"
echo "  查看状态: pm2 status"
echo ""
echo -e "${YELLOW}重要提醒:${NC}"
echo "  1. 请确保.env文件中的配置信息正确"
echo "  2. 请确保Supabase数据库已创建相关表"
echo "  3. 请确保服务器防火墙已开放3000和8080端口"
echo "  4. 如需配置域名,请参考文档配置Nginx"
echo ""

