# 朋友圈自动发布系统 - 后端API

## 📋 项目概述

基于NestJS + Supabase的后端API服务,提供用户认证、数据管理等功能。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置Supabase数据库

#### 2.1 创建Supabase项目

1. 访问 [https://supabase.com](https://supabase.com)
2. 点击 "Start your project" 注册/登录
3. 点击 "New Project" 创建新项目
4. 填写项目信息:
   - Name: `pyq-system` (或任意名称)
   - Database Password: 设置一个强密码(请记住)
   - Region: 选择 `Southeast Asia (Singapore)` (最近的区域)
5. 点击 "Create new project" 等待项目创建完成(约2分钟)

#### 2.2 获取API密钥

1. 项目创建完成后,点击左侧菜单 "Settings" → "API"
2. 复制以下信息:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### 2.3 创建数据库表

1. 点击左侧菜单 "SQL Editor"
2. 点击 "New query"
3. 复制 `database/init.sql` 文件的内容粘贴到编辑器
4. 点击 "Run" 执行SQL
5. 看到 "Success. No rows returned" 表示创建成功

#### 2.4 配置环境变量

编辑 `.env` 文件,填入刚才复制的信息:

```env
# Supabase配置
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT配置(可以保持默认,或修改为更安全的密钥)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# 服务器配置
PORT=3000
```

### 3. 启动服务器

```bash
# 开发模式(自动重启)
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

启动成功后会看到:

```
🚀 服务器启动成功!
📡 API地址: http://localhost:3000/api
📝 登录接口: http://localhost:3000/api/auth/login
📝 注册接口: http://localhost:3000/api/auth/register
```

## 📡 API接口文档

### 1. 用户注册

**接口**: `POST /api/auth/register`

**请求体**:
```json
{
  "username": "daozilaob an",
  "name": "刀仔老板",
  "password": "123456"
}
```

**成功响应**:
```json
{
  "message": "注册成功",
  "user": {
    "id": "uuid",
    "username": "daozilaoban",
    "name": "刀仔老板"
  }
}
```

**错误响应**:
```json
{
  "statusCode": 400,
  "message": "用户名已存在"
}
```

### 2. 用户登录

**接口**: `POST /api/auth/login`

**请求体**:
```json
{
  "username": "daozilaoban",
  "password": "123456"
}
```

**成功响应**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "daozilaoban",
    "name": "刀仔老板"
  }
}
```

**错误响应**:
```json
{
  "statusCode": 401,
  "message": "账号或密码错误"
}
```

## 🔧 技术栈

- **框架**: NestJS 10.x
- **数据库**: Supabase (PostgreSQL)
- **认证**: JWT + Passport
- **密码加密**: bcrypt
- **验证**: class-validator

## 📁 项目结构

```
pyq-backend/
├── src/
│   ├── auth/              # 认证模块
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── jwt.strategy.ts
│   │   └── dto/
│   │       └── auth.dto.ts
│   ├── users/             # 用户模块
│   │   ├── users.service.ts
│   │   └── users.module.ts
│   ├── common/            # 公共模块
│   │   └── supabase.service.ts
│   ├── app.module.ts      # 根模块
│   └── main.ts            # 入口文件
├── database/
│   └── init.sql           # 数据库初始化脚本
├── .env                   # 环境变量
├── package.json
└── tsconfig.json
```

## 🛠️ 常见问题

### 1. 安装依赖失败

**问题**: `npm install` 报错

**解决**:
```bash
# 清除缓存
npm cache clean --force

# 重新安装
npm install
```

### 2. 数据库连接失败

**问题**: 启动后提示数据库连接错误

**检查**:
1. `.env` 文件中的 `SUPABASE_URL` 和 `SUPABASE_KEY` 是否正确
2. Supabase项目是否已创建成功
3. 数据库表是否已创建

### 3. 注册/登录失败

**问题**: 前端调用API失败

**检查**:
1. 后端服务是否已启动
2. 端口是否被占用(默认3000)
3. 浏览器控制台是否有CORS错误

## 📝 下一步计划

- [ ] 添加更多业务模块(采集、改写、发布)
- [ ] 集成Coze工作流API
- [ ] 集成飞书多维表格API
- [ ] 集成Puppeteer自动化
- [ ] 添加API文档(Swagger)
- [ ] 添加单元测试

## 📞 技术支持

如有问题,请联系刀仔老板团队。

