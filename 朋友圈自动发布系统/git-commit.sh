#!/bin/bash

# 朋友圈自动发布系统 - Git提交脚本
# 使用方法: ./git-commit.sh "功能描述"
# 示例: ./git-commit.sh "V5.4 - 视频号批量发送功能完成"

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 获取北京时间
BEIJING_TIME=$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S')

# 获取功能描述
DESCRIPTION=$1

if [ -z "$DESCRIPTION" ]; then
    echo -e "${RED}❌ 错误: 请提供功能描述${NC}"
    echo ""
    echo "使用方法:"
    echo "  ./git-commit.sh \"功能描述\""
    echo ""
    echo "示例:"
    echo "  ./git-commit.sh \"V5.4 - 视频号批量发送功能完成\""
    echo "  ./git-commit.sh \"修复公众号监控二维码获取失败问题\""
    echo "  ./git-commit.sh \"更新README和部署指南\""
    exit 1
fi

# 完整的commit message
COMMIT_MESSAGE="[$BEIJING_TIME] $DESCRIPTION"

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Git提交工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}📝 提交信息:${NC} $COMMIT_MESSAGE"
echo ""

# 显示当前状态
echo -e "${YELLOW}📊 当前修改:${NC}"
git status --short
echo ""

# 统计修改
MODIFIED_COUNT=$(git status --short | wc -l | tr -d ' ')
echo -e "${YELLOW}共 $MODIFIED_COUNT 个文件被修改${NC}"
echo ""

# 确认提交
echo -e "${YELLOW}确定要提交吗? (y/n)${NC}"
read -p "> " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${GREEN}[1/4] 添加文件到暂存区...${NC}"
    git add .
    
    echo -e "${GREEN}[2/4] 创建提交...${NC}"
    git commit -m "$COMMIT_MESSAGE"
    
    echo -e "${GREEN}[3/4] 推送到GitHub...${NC}"
    git push origin main
    
    echo -e "${GREEN}[4/4] 完成!${NC}"
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${GREEN}✅ 提交成功!${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo -e "${YELLOW}📋 最近5次提交:${NC}"
    git log --oneline -5
    echo ""
else
    echo ""
    echo -e "${RED}❌ 已取消提交${NC}"
    echo ""
fi

