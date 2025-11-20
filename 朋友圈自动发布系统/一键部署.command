#!/bin/bash

# 朋友圈自动发布系统 - 双击运行部署脚本
# 作者: 小牛马 & 打工人
# 日期: 2025-10-28
# 使用方法: 双击此文件即可运行

# 获取脚本所在目录
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 进入项目目录
cd "$SCRIPT_DIR"

# 执行部署脚本
./deploy-update.sh

# 等待用户按键后关闭
echo ""
echo "按任意键关闭窗口..."
read -n 1

