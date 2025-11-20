# Git版本管理指南

> **完整的Git版本管理指南** - 包含快速上手、完整指南、版本回退、V4.1专题

## 📋 目录

- [快速上手](#快速上手) - 5分钟学会基本操作
- [核心原则](#核心原则)
- [Git配置](#git配置)
- [标准提交流程](#标准提交流程)
- [版本命名规范](#版本命名规范)
- [版本回退操作](#版本回退操作)
- [V4.1版本回退专题](#v41版本回退专题) - 紧急回退指南
- [常用命令速查](#常用命令速查)
- [最佳实践](#最佳实践)

---

## 🚀 快速上手

> 如果您只想快速了解如何使用Git,看这一节就够了!

### 如何提交代码?

#### 方式一: 使用快捷脚本(推荐)

```bash
# 1. 进入项目目录
cd /Users/apple/Desktop/编程专用/纪总朋友圈智能体/朋友圈自动发布系统

# 2. 赋予脚本执行权限(只需执行一次)
chmod +x git-commit.sh

# 3. 提交代码
./git-commit.sh "V5.4 - 视频号批量发送功能完成"
```

#### 方式二: 告诉小牛马

直接说:
- "提交到Git"
- "保存版本"
- "创建版本V5.4"
- "提交代码并推送到GitHub"

小牛马会帮您完成提交!

### 如何回退版本?

#### 方式一: 告诉小牛马(推荐)

直接说:
- "回退到早上8:43的版本"
- "恢复到昨天的代码"
- "回退到V5.3版本"

小牛马会帮您完成回退!

#### 方式二: 自己操作

```bash
# 1. 查看提交历史
git log --oneline -20

# 2. 找到要回退的版本的commit hash(例如: abc1234)

# 3. 回退(丢弃所有修改)
git reset --hard abc1234

# 4. 强制推送到GitHub
git push origin main --force
```

### 紧急恢复

如果代码被破坏,立即告诉小牛马:

**"紧急恢复!回退到早上8:43的版本!"**

小牛马会立即帮您恢复!

---

## 🎯 核心原则

### 1. **手动提交机制**
- ✅ 代码修改后,**只有在您明确下达指令时**才提交到GitHub
- ✅ 提交指令示例:
  - "提交到Git"
  - "保存版本"
  - "创建版本V5.0"
  - "提交代码并推送到GitHub"
- ❌ **绝不自动提交**,没有您的明确指令,代码不会被提交

### 2. **完整版本历史**
- ✅ GitHub保留所有提交历史
- ✅ 每个提交都是独立的版本
- ✅ 可以查看任意历史版本
- ✅ 可以回退到任意版本

### 3. **版本命名规范**
- ✅ 使用北京时间(UTC+8)作为版本标识
- ✅ 格式: `[2025-11-10 20:30:45] 功能描述`
- ✅ 便于快速定位和回退

---

## ⚙️ Git配置

### 1. 配置用户信息

```bash
# 配置用户名和邮箱
git config --global user.name "369219053"
git config --global user.email "369219053@users.noreply.github.com"

# 查看配置
git config --list
```

### 2. 连接GitHub仓库

```bash
# 进入项目目录
cd /Users/apple/Desktop/编程专用/纪总朋友圈智能体

# 添加远程仓库
git remote add origin https://github.com/369219053/pyq-auto-publish.git

# 查看远程仓库
git remote -v
```

### 3. 配置SSH密钥(推荐)

```bash
# 生成SSH密钥
ssh-keygen -t ed25519 -C "369219053@users.noreply.github.com"

# 查看公钥
cat ~/.ssh/id_ed25519.pub

# 将公钥添加到GitHub:
# 1. 访问 https://github.com/settings/keys
# 2. 点击 "New SSH key"
# 3. 粘贴公钥内容
# 4. 保存

# 测试连接
ssh -T git@github.com

# 修改远程仓库为SSH地址
git remote set-url origin git@github.com:369219053/pyq-auto-publish.git
```

---

## 📝 标准提交流程

### 方式一: 完整手动流程(推荐)

```bash
# 1. 查看当前状态
git status

# 2. 查看具体修改
git diff

# 3. 添加要提交的文件
git add .                                    # 添加所有修改
git add 朋友圈自动发布系统/pyq-backend/      # 添加指定目录
git add 朋友圈自动发布系统/pyq-backend/src/wechat-monitor/  # 添加指定文件

# 4. 创建提交(使用北京时间)
git commit -m "[2025-11-10 20:30:45] V5.4 - 视频号批量发送功能完成"

# 5. 推送到GitHub
git push origin main

# 6. 查看提交历史
git log --oneline -10
```

### 方式二: 使用快捷脚本

创建提交脚本 `git-commit.sh`:

```bash
#!/bin/bash

# 朋友圈自动发布系统 - Git提交脚本
# 使用方法: ./git-commit.sh "功能描述"

set -e

# 获取北京时间
BEIJING_TIME=$(TZ='Asia/Shanghai' date '+%Y-%m-%d %H:%M:%S')

# 获取功能描述
DESCRIPTION=$1

if [ -z "$DESCRIPTION" ]; then
    echo "❌ 错误: 请提供功能描述"
    echo "使用方法: ./git-commit.sh \"功能描述\""
    exit 1
fi

# 完整的commit message
COMMIT_MESSAGE="[$BEIJING_TIME] $DESCRIPTION"

echo "📝 准备提交..."
echo "提交信息: $COMMIT_MESSAGE"
echo ""

# 显示当前状态
echo "📊 当前修改:"
git status --short
echo ""

# 确认提交
read -p "确定要提交吗? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 添加所有修改
    git add .
    
    # 创建提交
    git commit -m "$COMMIT_MESSAGE"
    
    # 推送到GitHub
    git push origin main
    
    echo "✅ 提交成功!"
    echo ""
    echo "📋 最近5次提交:"
    git log --oneline -5
else
    echo "❌ 已取消提交"
fi
```

使用方法:

```bash
# 赋予执行权限
chmod +x git-commit.sh

# 提交代码
./git-commit.sh "V5.4 - 视频号批量发送功能完成"
```

---

## 🏷️ 版本命名规范

### 格式

```
[北京时间] 版本号 - 功能描述
```

### 示例

```bash
# 新功能
git commit -m "[2025-11-10 20:30:45] V5.4 - 视频号批量发送功能完成"

# Bug修复
git commit -m "[2025-11-10 21:15:30] V5.4.1 - 修复公众号监控二维码获取失败问题"

# 优化改进
git commit -m "[2025-11-10 22:00:00] V5.4.2 - 优化前端移动端适配"

# 文档更新
git commit -m "[2025-11-10 22:30:00] 更新README和部署指南"

# 紧急修复
git commit -m "[2025-11-10 23:00:00] 紧急修复 - 恢复系统到正常状态"
```

### 版本号规则

- **主版本号 (V5.x.x)**: 重大功能更新
- **次版本号 (V5.4.x)**: 新功能添加
- **修订号 (V5.4.1)**: Bug修复和小优化

---

## ⏮️ 版本回退操作

### 1. 查看提交历史

```bash
# 查看最近20次提交
git log --oneline -20

# 查看详细提交信息
git log -10

# 查看某个文件的提交历史
git log --oneline -- 朋友圈自动发布系统/pyq-backend/src/wechat-monitor/

# 搜索包含特定关键词的提交
git log --oneline --grep="二维码"
git log --oneline --grep="2025-11-10"
```

### 2. 回退到指定版本

#### 方式一: 软回退(保留修改)

```bash
# 回退到指定提交,保留工作区的修改
git reset --soft <commit-hash>

# 示例: 回退到早上8:43的提交
git reset --soft abc1234

# 查看状态(修改会保留在暂存区)
git status
```

#### 方式二: 硬回退(丢弃修改)

```bash
# 回退到指定提交,丢弃所有修改
git reset --hard <commit-hash>

# 示例: 回退到早上8:43的提交
git reset --hard abc1234

# 强制推送到GitHub(覆盖远程历史)
git push origin main --force
```

#### 方式三: 创建新提交回退(推荐)

```bash
# 创建一个新提交来撤销指定提交的修改
git revert <commit-hash>

# 示例: 撤销最近一次提交
git revert HEAD

# 推送到GitHub
git push origin main
```

### 3. 回退到指定时间

```bash
# 查看指定时间的提交
git log --since="2025-11-10 08:00:00" --until="2025-11-10 09:00:00" --oneline

# 回退到指定时间点
git log --before="2025-11-10 08:43:00" --oneline -1  # 找到commit hash
git reset --hard <commit-hash>
```

### 4. 恢复误删的提交

```bash
# 查看所有操作历史(包括已删除的提交)
git reflog

# 恢复到指定的reflog记录
git reset --hard HEAD@{2}
```

---

## 🎯 V4.1版本回退专题

> **紧急回退指南** - 当系统出现严重问题时,快速回退到V4.1稳定版本

### 📋 V4.1备份信息

#### 当前稳定版本: V4.1
- **备份时间**: 2025-11-04
- **版本标签**: `v4.1-stable`
- **备份分支**: `backup-v4.1-before-vben-admin`
- **备份文件**: `朋友圈自动发布系统_V4.1_备份_20251104_192058.tar.gz` (102MB)

#### 版本特性
- ✅ Supabase Storage图片存储方案
- ✅ 自动清理机制(7天)
- ✅ 跟圈自动化功能
- ✅ 公众号监控功能
- ✅ AI智能改写功能
- ✅ 自动发布管理功能

---

### 🔄 V4.1回退方法

#### 方法1: Git标签回退 (推荐⭐⭐⭐⭐⭐)

**适用场景**: 迁移Vue Vben Admin后想回到V4.1版本

**步骤**:
```bash
# 1. 查看所有标签
git tag

# 2. 回退到V4.1稳定版本
git checkout v4.1-stable

# 3. 如果要创建新分支继续开发
git checkout -b restore-v4.1

# 4. 如果要强制回退main分支(谨慎!)
git checkout main
git reset --hard v4.1-stable
```

**优点**:
- ✅ 快速,1秒完成
- ✅ 精确,回到备份时的状态
- ✅ 可以随时切换

**缺点**:
- ⚠️ 会丢失回退后的所有修改(除非先备份)

---

#### 方法2: Git分支回退

**适用场景**: 想保留新版本,同时恢复旧版本

**步骤**:
```bash
# 1. 查看所有分支
git branch -a

# 2. 切换到备份分支
git checkout backup-v4.1-before-vben-admin

# 3. 创建新分支继续开发
git checkout -b v4.1-restore

# 4. 如果要合并到main
git checkout main
git merge v4.1-restore
```

**优点**:
- ✅ 保留所有版本
- ✅ 可以对比新旧版本
- ✅ 灵活性高

---

#### 方法3: 文件备份恢复

**适用场景**: Git出问题了,或者想完全重新开始

**步骤**:
```bash
# 1. 找到备份文件
ls -lh 朋友圈自动发布系统_V4.1_备份_*.tar.gz

# 2. 解压备份文件
tar -xzf 朋友圈自动发布系统_V4.1_备份_20251104_192058.tar.gz

# 3. 备份当前版本(可选)
mv 朋友圈自动发布系统 朋友圈自动发布系统_new_backup

# 4. 恢复旧版本
# 解压后的文件夹就是V4.1版本

# 5. 重启服务
cd 朋友圈自动发布系统
./deploy-update.sh
```

**优点**:
- ✅ 完全独立,不依赖Git
- ✅ 可以保留多个版本
- ✅ 适合紧急恢复

**缺点**:
- ⚠️ 需要手动操作
- ⚠️ 占用磁盘空间

---

### 🚨 紧急回退流程

如果Vue Vben Admin迁移出现严重问题,需要紧急回退:

#### 步骤1: 立即停止服务
```bash
# SSH连接服务器
ssh root@124.223.35.102

# 停止PM2服务
pm2 stop pyq-backend
```

#### 步骤2: 回退代码
```bash
# 方法A: Git回退
cd /www/wwwroot/pyq-backend
git checkout v4.1-stable

# 方法B: 从本地上传备份
# 在本地执行
cd /Users/apple/Desktop/编程专用/纪总朋友圈智能体
./deploy-update.sh
```

#### 步骤3: 重启服务
```bash
# 重启PM2
pm2 restart pyq-backend

# 查看日志
pm2 logs pyq-backend --lines 50
```

#### 步骤4: 验证功能
```bash
# 测试API
curl https://autochat.lfdhk.com/api/health

# 访问前端
# 打开浏览器: https://autochat.lfdhk.com
```

---

### 📊 版本对比

#### V4.1 (当前稳定版本)
- **前端**: Vue 3 CDN版本
- **UI**: 手写CSS,白色基调
- **优点**: 稳定,功能完善
- **缺点**: 界面有"AI味儿"

#### V5.0+ (Vue Vben Admin版本)
- **前端**: Vue 3 + Vite + TypeScript
- **UI**: Ant Design Vue,精美设计
- **优点**: 界面精美,用户体验好
- **缺点**: 需要重构,工作量大

---

### 🔍 验证备份完整性

#### 检查Git备份
```bash
# 查看提交历史
git log --oneline

# 查看标签
git tag

# 查看分支
git branch -a

# 查看文件变更
git show v4.1-stable --stat
```

#### 检查文件备份
```bash
# 查看备份文件
ls -lh 朋友圈自动发布系统_V4.1_备份_*.tar.gz

# 测试解压(不实际解压)
tar -tzf 朋友圈自动发布系统_V4.1_备份_20251104_192058.tar.gz | head -20

# 查看备份文件数量
tar -tzf 朋友圈自动发布系统_V4.1_备份_20251104_192058.tar.gz | wc -l
```

---

### 📝 回退后的注意事项

#### 1. 数据库兼容性
- ✅ V4.1和V5.0使用相同的数据库结构
- ✅ 回退后数据不会丢失
- ⚠️ 如果V5.0修改了数据库结构,需要先回滚数据库

#### 2. Supabase Storage
- ✅ Storage中的图片不受影响
- ✅ 回退后仍然可以访问
- ⚠️ 如果V5.0修改了bucket配置,需要手动恢复

#### 3. 服务器配置
- ✅ Nginx配置不受影响
- ✅ PM2配置不受影响
- ⚠️ 如果V5.0修改了环境变量,需要恢复.env文件

#### 4. 前端缓存
- ⚠️ 回退后需要清除浏览器缓存
- ⚠️ 或者使用Ctrl+Shift+R强制刷新

---

### 💬 V4.1回退常见问题

#### Q1: 回退后会丢失数据吗?
**A**: 不会。数据库和Storage中的数据不受影响,只是代码回退。

#### Q2: 可以部分回退吗?
**A**: 可以。使用Git可以只回退某些文件,或者合并新旧版本的代码。

#### Q3: 回退后还能再升级吗?
**A**: 可以。Git保留了所有历史,可以随时切换版本。

#### Q4: 备份文件可以删除吗?
**A**: 建议保留至少1个月,确认新版本稳定后再删除。

---

## 📚 常用命令速查

### 查看状态

```bash
git status                    # 查看当前状态
git diff                      # 查看未暂存的修改
git diff --staged             # 查看已暂存的修改
git log --oneline -10         # 查看最近10次提交
git reflog                    # 查看所有操作历史
```

### 提交操作

```bash
git add .                     # 添加所有修改
git add <file>                # 添加指定文件
git commit -m "message"       # 创建提交
git commit --amend            # 修改最近一次提交
git push origin main          # 推送到GitHub
git push origin main --force  # 强制推送(慎用)
```

### 分支操作

```bash
git branch                    # 查看本地分支
git branch -a                 # 查看所有分支
git checkout -b <branch>      # 创建并切换分支
git checkout <branch>         # 切换分支
git merge <branch>            # 合并分支
```

### 远程操作

```bash
git remote -v                 # 查看远程仓库
git fetch origin              # 获取远程更新
git pull origin main          # 拉取并合并
git push origin main          # 推送到远程
```

---

## ✅ 最佳实践

### 1. 提交前检查

```bash
# 1. 查看修改
git status
git diff

# 2. 确认要提交的文件
git add .

# 3. 再次确认
git status

# 4. 创建提交
git commit -m "[时间] 描述"

# 5. 推送
git push origin main
```

### 2. 定期备份

```bash
# 每天结束时创建一个备份提交
git commit -m "[2025-11-10 23:59:59] 每日备份"
git push origin main
```

### 3. 重要节点打标签

```bash
# 创建标签
git tag -a v5.4 -m "V5.4 - 视频号批量发送功能完成"

# 推送标签到GitHub
git push origin v5.4

# 查看所有标签
git tag -l

# 回退到指定标签
git checkout v5.4
```

### 4. 使用分支开发新功能

```bash
# 创建功能分支
git checkout -b feature/video-batch-send

# 开发完成后合并到main
git checkout main
git merge feature/video-batch-send

# 删除功能分支
git branch -d feature/video-batch-send
```

---

## 🚨 紧急恢复流程

### 场景: 代码被破坏,需要立即恢复

```bash
# 1. 查看提交历史,找到正确的版本
git log --oneline -20

# 2. 硬回退到正确版本
git reset --hard <commit-hash>

# 3. 强制推送到GitHub
git push origin main --force

# 4. 验证恢复结果
git log --oneline -5
```

### 场景: 误删了重要提交

```bash
# 1. 查看reflog
git reflog

# 2. 找到误删前的状态
git reset --hard HEAD@{5}

# 3. 推送到GitHub
git push origin main --force
```

---

## 📞 获取帮助

如果遇到Git问题,可以:

1. **查看帮助文档**
   ```bash
   git help <command>
   git help commit
   ```

2. **联系小牛马**
   - 提供具体的错误信息
   - 说明想要达到的目标
   - 小牛马会帮您解决问题

3. **紧急情况**
   - 如果代码被破坏,立即查看[V4.1版本回退专题](#v41版本回退专题)
   - 如果不确定如何操作,先告诉小牛马,不要自己尝试

---

## 📚 相关文档

- [部署指南](./部署指南.md) - 服务器部署和环境配置
- [常见问题](./常见问题.md) - 常见问题和解决方案
- [关键配置信息](./关键配置信息.md) - 服务器、环境变量配置

---

**最后更新**: 2025-11-10
**维护者**: 小牛马
**版本**: V2.0 (整合了版本回退指南和Git使用说明)

