# we-mp-rss集成指南

## 📋 项目概述

本文档详细说明如何将we-mp-rss微信公众号监控系统集成到朋友圈自动发布系统中。

---

## 📊 监控方案对比

在实现公众号实时监控时,我们对比了三种技术方案:

| 方案 | 技术 | 实时性 | 成本 | 难度 | 推荐度 |
|------|------|--------|------|------|--------|
| **方案一** | we-mp-rss Webhook | ⭐⭐⭐⭐⭐ 秒级 | 免费 | ⭐⭐ 简单 | ⭐⭐⭐⭐⭐ |
| **方案二** | 定时轮询 | ⭐⭐⭐ 分钟级 | 免费 | ⭐ 简单 | ⭐⭐⭐ |
| **方案三** | WebSocket实时推送 | ⭐⭐⭐⭐⭐ 秒级 | 免费 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐ |

**最终选择**: 方案一(we-mp-rss Webhook) + 方案三(WebSocket实时推送)组合

**选择理由**:
- ✅ **实时性最强** - 秒级响应,公众号发布后立即收到通知
- ✅ **完全自动化** - 无需人工干预,全流程自动完成
- ✅ **资源消耗低** - 被动接收推送,不需要定时轮询
- ✅ **用户体验好** - 前端实时收到通知和状态更新

### 方案二: 定时轮询 (备选方案)

**核心原理**: 后端定时(如每5分钟)调用we-mp-rss API查询是否有新文章

**技术实现**:
```typescript
// 使用NestJS的定时任务
import { Cron } from '@nestjs/schedule';

@Cron('*/5 * * * *') // 每5分钟执行一次
async checkNewArticles() {
  const articles = await this.weMpRssService.getArticles();
  // 检查是否有新文章
  // 如果有,触发处理流程
}
```

**优势**:
- ✅ 实现简单
- ✅ 不依赖外部推送

**劣势**:
- ❌ 实时性差(5分钟延迟)
- ❌ 资源消耗高(频繁轮询)
- ❌ 可能错过文章(如果轮询间隔内发布多篇)

### 方案三: WebSocket实时推送 (前端通知)

**核心原理**: 前端通过WebSocket连接后端,后端收到新文章时立即推送到前端

**后端WebSocket服务**:
```typescript
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway()
export class ArticleGateway {
  @WebSocketServer()
  server: Server;

  // 推送新文章通知
  notifyNewArticle(article: any) {
    this.server.emit('newArticle', article);
  }
}
```

**前端WebSocket连接**:
```javascript
const socket = io('http://localhost:3000');

socket.on('newArticle', (article) => {
  // 显示新文章通知
  showNotification(`新文章: ${article.title}`);
  // 刷新文章列表
  refreshArticleList();
});
```

**优势**:
- ✅ 前端实时收到通知
- ✅ 用户体验好
- ✅ 可以显示实时状态

---

## 🎯 集成架构

### 完整技术架构

```
用户在Web系统添加对标公众号
  ↓
后端调用we-mp-rss API添加订阅
  ↓
we-mp-rss定时检查公众号(每1小时)
  ↓
发现新文章 → 自动采集数据
  ↓
通过Webhook推送到后端 (秒级)
  ↓
后端接收Webhook数据:
  - 文章标题
  - 文章正文(HTML格式)
  - 图片URL列表
  - 发布时间
  ↓
后端自动处理:
  ├─ 保存到飞书多维表格
  ├─ 调用Coze工作流改写文案
  ├─ 下载图片到本地
  └─ 调用Puppeteer发布到堆雪球
  ↓
通过WebSocket推送到前端 (实时)
  ↓
前端显示新文章通知 (实时)
  ↓
用户可以查看处理进度
  ↓
自动发布到微信朋友圈
```

---

## 🔄 实时监控实现原理

### 核心问题: we-mp-rss的缓存机制

**重要发现**: we-mp-rss服务**不会自动更新**文章缓存!

#### 问题表现

1. **定时任务只检查缓存** - we-mp-rss的定时任务只是定期检查公众号,但检查结果会缓存起来
2. **API返回缓存数据** - 调用`/api/v1/wx/articles`接口返回的是缓存的文章列表
3. **新文章不显示** - 即使公众号发布了新文章,API返回的还是旧的缓存数据

#### 实际案例

**问题场景**:
- 公众号"沪港纪老板"在11/19和11/20发布了新文章
- 系统定时任务每小时运行,调用`getArticles()`获取文章
- 但返回的文章总数一直是74篇,没有变化
- 新文章无法同步到系统中

**根本原因**:
- we-mp-rss的文章列表是**缓存数据**
- 需要**手动触发更新**才会刷新缓存
- 触发更新的API: `/api/v1/wx/mps/update/{mpId}`

---

### 解决方案: 主动触发更新

#### 方案架构

```
定时任务/手动同步
  ↓
1. 触发we-mp-rss更新
   调用: /api/v1/wx/mps/update/{mpId}
  ↓
2. 等待更新完成 (1-2秒)
  ↓
3. 获取最新文章列表
   调用: /api/v1/wx/articles?mp_id={mpId}
  ↓
4. 同步文章到数据库
   - URL去重
   - 保存新文章
   - 生成AI摘要
```

---

### 定时同步实现

#### 核心代码

**文件**: `pyq-backend/src/wechat-monitor/wechat-monitor.service.ts`

**关键修改**: 在获取文章前先触发更新

```typescript
// 定时任务: 每小时同步一次
@Cron('0 * * * *')
async syncArticles() {
  // 获取所有订阅的公众号
  const subscriptions = await this.getSubscriptions();

  for (const subscription of subscriptions) {
    const mpId = subscription.mp_id;
    const mpName = subscription.mp_name;

    // 🔑 关键步骤1: 先触发we-mp-rss更新
    try {
      this.logger.log(`🔄 触发we-mp-rss更新: ${mpName}`);
      await this.weMpRssService.triggerUpdate(mpId);
      this.logger.log(`✅ we-mp-rss更新完成: ${mpName}`);

      // 等待1秒,确保we-mp-rss完成更新
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (updateError) {
      this.logger.warn(`⚠️  触发更新失败,继续同步: ${updateError.message}`);
    }

    // 🔑 关键步骤2: 获取最新文章列表
    const articles = await this.weMpRssService.getArticles(mpId);

    // 🔑 关键步骤3: 同步文章到数据库
    for (const article of articles) {
      // URL去重
      const exists = await this.articlesService.findByUrl(article.url);
      if (exists) {
        this.logger.log(`⏭️  跳过已存在文章: ${article.title}`);
        continue;
      }

      // 保存新文章
      await this.articlesService.createArticle({
        title: article.title,
        content: article.content,
        url: article.url,
        account_name: mpName,
        // ... 其他字段
      });

      this.logger.log(`✅ 同步新文章: ${article.title}`);
    }
  }
}
```

#### 触发更新的实现

**文件**: `pyq-backend/src/wechat-monitor/we-mp-rss.service.ts`

```typescript
/**
 * 触发we-mp-rss更新公众号文章缓存
 * @param mpId 公众号ID
 */
async triggerUpdate(mpId: string) {
  try {
    const headers = await this.getHeaders();

    this.logger.log(`🔄 触发公众号更新: ${mpId}`);
    const response = await this.axiosInstance.get(
      `/api/v1/wx/mps/update/${mpId}`,
      { headers }
    );

    this.logger.log(`✅ 成功触发更新: ${mpId}`);
    return response.data;
  } catch (error) {
    this.logger.error(`❌ 触发更新失败: ${error.message}`);
    throw error;
  }
}
```

---

### 手动同步实现

#### 用户操作流程

1. 用户在前端点击"同步文章"按钮
2. 前端调用后端API: `POST /api/wechat-monitor/subscriptions/:id/update`
3. 后端执行同步流程
4. 前端刷新文章列表,显示新文章

#### 核心代码

**文件**: `pyq-backend/src/wechat-monitor/wechat-monitor.controller.ts`

```typescript
/**
 * 手动触发更新公众号文章
 */
@Post('subscriptions/:id/update')
async triggerUpdate(
  @Param('id') id: string,
  @Query('pages') pages: number = 10,
) {
  this.logger.log(`手动触发更新公众号: ${id}`);

  // 查询数据库获取公众号信息
  const subscription = await this.getSubscription(id);
  const mpId = subscription.standard_mp_id || id;
  const mpName = subscription.mp_name;
  const userId = subscription.user_id;

  // 🔑 关键步骤1: 触发we-mp-rss更新
  const result = await this.weMpRssService.updateMpArticles(mpId, 0, pages);

  if (result.code !== 0) {
    throw new HttpException(result, HttpStatus.BAD_REQUEST);
  }

  // 🔑 关键步骤2: 等待更新完成
  this.logger.log(`⏳ 等待we-mp-rss更新完成...`);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 🔑 关键步骤3: 立即同步文章到数据库
  this.logger.log(`🔄 开始同步文章到数据库: ${mpName}`);
  const syncResult = await this.wechatMonitorService.syncSingleAccount(
    mpId,
    mpName,
    userId
  );

  this.logger.log(`✅ 同步完成,新增 ${syncResult.synced} 篇文章`);

  return {
    code: 0,
    message: 'success',
    data: {
      updated: true,
      synced: syncResult.synced,
    },
  };
}
```

#### 单个公众号同步

**文件**: `pyq-backend/src/wechat-monitor/wechat-monitor.service.ts`

```typescript
/**
 * 同步单个公众号的文章
 * @param mpId 公众号ID
 * @param mpName 公众号名称
 * @param userId 用户ID
 */
async syncSingleAccount(mpId: string, mpName: string, userId: string) {
  this.logger.log(`🔄 开始同步单个公众号: ${mpName}`);

  let totalSynced = 0;
  let page = 0;
  const pageSize = 50;
  let hasMore = true;

  while (hasMore) {
    // 获取文章列表
    const response = await this.weMpRssService.getArticles(mpId, page, pageSize);
    const articles = response.data.list;

    if (!articles || articles.length === 0) {
      hasMore = false;
      break;
    }

    // 同步文章
    for (const article of articles) {
      // URL去重
      const existingArticle = await this.articlesService.findByUrl(article.url);

      if (existingArticle) {
        this.logger.log(`⏭️  跳过已存在文章: ${article.title}`);
        continue;
      }

      // 保存新文章
      await this.articlesService.createArticle({
        title: article.title,
        content: article.content,
        url: article.url,
        account_name: mpName,
        account_id: mpId,
        user_id: userId,
        // ... 其他字段
      });

      totalSynced++;
      this.logger.log(`✅ 同步新文章: ${article.title}`);
    }

    // 检查是否还有更多文章
    if (articles.length < pageSize) {
      hasMore = false;
    } else {
      page++;
    }
  }

  this.logger.log(`✅ ${mpName} 同步完成,共新增 ${totalSynced} 篇文章`);

  return {
    success: true,
    synced: totalSynced,
  };
}
```

---

### URL去重机制

#### 为什么需要去重?

- 同一篇文章可能被多次同步
- 避免数据库中出现重复记录
- 提高同步效率

#### 去重实现

**文件**: `pyq-backend/src/articles/articles.service.ts`

```typescript
/**
 * 根据URL查找文章(用于去重)
 * @param url 文章URL
 */
async findByUrl(url: string) {
  try {
    const supabase = this.supabaseService.getClient();

    // 使用limit(1)避免重复记录报错
    const { data, error } = await supabase
      .from('wechat_articles')
      .select('*')
      .eq('url', url)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      this.logger.error(`查找文章失败: ${error.message}`);
      throw error;
    }

    // 返回第一条记录(如果存在)
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    this.logger.error(`查找文章失败: ${error.message}`);
    throw error;
  }
}
```

**关键修复**:
- 之前使用`.maybeSingle()`,当有重复记录时会报错
- 现在使用`.limit(1)`,只返回第一条记录
- 避免了"JSON object requested, multiple rows returned"错误

---

### 完整流程图

```
┌─────────────────────────────────────────────────────────────┐
│                     实时监控完整流程                          │
└─────────────────────────────────────────────────────────────┘

方式1: 定时同步 (每小时自动)
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. 定时任务触发 (Cron: 0 * * * *)                            │
│    - 获取所有订阅的公众号列表                                  │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 遍历每个公众号                                             │
│    - 触发we-mp-rss更新: triggerUpdate(mpId)                  │
│    - 等待1秒,确保更新完成                                     │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 获取最新文章列表                                           │
│    - 调用: getArticles(mpId, page, pageSize)                │
│    - 分页获取,每页50篇                                        │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 同步文章到数据库                                           │
│    - 遍历文章列表                                             │
│    - URL去重: findByUrl(article.url)                        │
│    - 如果不存在,保存到数据库                                   │
│    - 生成AI摘要(可选)                                         │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 记录日志                                                   │
│    - 新增文章数量                                             │
│    - 跳过的已存在文章                                         │
└─────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════

方式2: 手动同步 (用户点击按钮)
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. 用户点击"同步文章"按钮                                      │
│    - 前端调用: POST /api/wechat-monitor/subscriptions/:id/update │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 后端触发we-mp-rss更新                                      │
│    - 调用: updateMpArticles(mpId, 0, pages)                 │
│    - 等待2秒,确保更新完成                                     │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. 立即同步文章到数据库                                        │
│    - 调用: syncSingleAccount(mpId, mpName, userId)          │
│    - 分页获取所有文章                                         │
│    - URL去重并保存新文章                                      │
└─────────────────────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. 返回同步结果                                               │
│    - 新增文章数量                                             │
│    - 前端刷新文章列表                                         │
│    - 用户立即看到新文章                                       │
└─────────────────────────────────────────────────────────────┘
```

---

### 关键时间节点

| 操作 | 耗时 | 说明 |
|------|------|------|
| 触发we-mp-rss更新 | 0.5-1秒 | 调用API触发更新 |
| 等待更新完成 | 1-2秒 | 确保we-mp-rss完成缓存刷新 |
| 获取文章列表 | 0.5-1秒 | 每页50篇文章 |
| URL去重查询 | 0.1秒/篇 | 数据库查询 |
| 保存新文章 | 0.2秒/篇 | 数据库插入 |
| **总耗时(手动同步)** | **3-5秒** | 假设有10篇新文章 |
| **总耗时(定时同步)** | **5-10分钟** | 假设有5个公众号,每个10篇新文章 |

---

### 最佳实践

#### 1. 定时同步间隔

- **推荐**: 60分钟 (当前配置)
- **最小**: 30分钟 (避免频繁触发)
- **最大**: 120分钟 (避免错过新文章)

#### 2. 手动同步使用场景

- 添加新订阅后,立即同步历史文章
- 发现新文章未同步时,手动触发
- 测试同步功能是否正常

#### 3. 错误处理

- 触发更新失败时,继续同步(使用缓存数据)
- URL去重失败时,跳过该文章
- 保存文章失败时,记录日志并继续

#### 4. 性能优化

- 分页获取文章,避免一次性加载过多
- 使用数据库索引加速URL去重查询
- 异步处理AI摘要生成,不阻塞同步流程

---

### 监控和日志

#### 关键日志示例

**定时同步日志**:
```
[WechatMonitorService] 🔄 开始定时同步文章...
[WechatMonitorService] 开始同步公众号: 沪港纪老板 (ID: MP_WXS_3928898756)
[WechatMonitorService] 🔄 触发we-mp-rss更新: 沪港纪老板
[WeMpRssService] 🔄 触发公众号更新: MP_WXS_3928898756
[WeMpRssService] ✅ 成功触发更新: MP_WXS_3928898756
[WechatMonitorService] ✅ we-mp-rss更新完成: 沪港纪老板
[WeMpRssService] 📄 调用getArticles - mpId: MP_WXS_3928898756, page: 0
[WeMpRssService] ✅ 获取文章成功,返回 50 篇文章,总数: 76
[WechatMonitorService] 沪港纪老板 - 第1页: 获取 50 篇文章,总数: 76
[WechatMonitorService] ⏭️  跳过已存在文章: 香港越来越像内地了吗？
[WechatMonitorService] ✅ 同步新文章: 普通家庭如何做好资产配置?
[WechatMonitorService] ✅ 同步新文章: 火爆!超6万人赶港买房!
[WechatMonitorService] 沪港纪老板 - 第1页同步完成,新增 2 篇
[WechatMonitorService] 沪港纪老板 同步完成,共新增 2 篇文章
```

**手动同步日志**:
```
[WechatMonitorController] 手动触发更新公众号: MP_WXS_3928898756
[WeMpRssService] 🔄 触发公众号更新: MP_WXS_3928898756
[WeMpRssService] ✅ 成功触发更新: MP_WXS_3928898756
[WechatMonitorController] ⏳ 等待we-mp-rss更新完成...
[WechatMonitorController] 🔄 开始同步文章到数据库: 沪港纪老板
[WechatMonitorService] 🔄 开始同步单个公众号: 沪港纪老板
[WechatMonitorService] ✅ 同步新文章: 普通家庭如何做好资产配置?
[WechatMonitorService] ✅ 同步新文章: 火爆!超6万人赶港买房!
[WechatMonitorService] ✅ 沪港纪老板 同步完成,共新增 2 篇文章
[WechatMonitorController] ✅ 同步完成,新增 2 篇文章
```

---

## 🚀 部署步骤

### 第一步: 部署we-mp-rss服务

#### 1.1 使用Docker部署

```bash
# 1. 拉取Docker镜像
docker pull ghcr.io/rachelos/we-mp-rss:latest

# 2. 创建数据目录
mkdir -p ./we-mp-rss-data

# 3. 启动服务
docker run -d \
  --name we-mp-rss \
  -p 8001:8001 \
  -v ./we-mp-rss-data:/app/data \
  -e ENABLE_JOB=True \
  -e SPAN_INTERVAL=3600 \
  -e CUSTOM_WEBHOOK=http://您的服务器IP:3000/api/wechat-monitor/webhook \
  ghcr.io/rachelos/we-mp-rss:latest
```

#### 1.2 环境变量说明

| 环境变量 | 说明 | 推荐值 |
|---------|------|--------|
| `ENABLE_JOB` | 是否启用定时任务 | `True` |
| `SPAN_INTERVAL` | 定时任务间隔(秒) | `3600` (1小时) |
| `CUSTOM_WEBHOOK` | Webhook推送地址 | `http://您的IP:3000/api/wechat-monitor/webhook` |
| `MAX_PAGE` | 最大采集页数 | `5` |
| `THREADS` | 线程数 | `2` |

#### 1.3 访问we-mp-rss管理界面

```
http://您的服务器IP:8001
```

**默认账号密码**:
- 账号: `admin`
- 密码: `admin@123`

#### 1.4 微信扫码授权

1. 登录we-mp-rss管理界面
2. 点击"扫码授权"
3. 使用微信扫描二维码
4. 授权成功后即可开始使用

---

### 第二步: 配置后端环境变量

在 `朋友圈自动发布系统/pyq-backend/.env` 文件中添加以下配置:

```env
# we-mp-rss配置
WE_MP_RSS_URL=http://localhost:8001
WE_MP_RSS_TOKEN=your-api-token-here

# 飞书配置
FEISHU_APP_ID=your-feishu-app-id
FEISHU_APP_SECRET=your-feishu-app-secret
FEISHU_TABLE_ID=your-feishu-table-id

# Coze配置
COZE_API_KEY=your-coze-api-key
COZE_WORKFLOW_ID=your-coze-workflow-id

# Puppeteer服务配置
PUPPETEER_SERVICE_URL=http://localhost:3002
```

---

### 第三步: 安装依赖并启动后端

```bash
# 进入后端目录
cd 朋友圈自动发布系统/pyq-backend

# 安装依赖
npm install

# 启动开发服务器
npm run start:dev
```

---

### 第四步: 启动前端

```bash
# 使用任意HTTP服务器启动前端
# 方法1: 使用Python
cd 朋友圈自动发布系统/pyq-frontend
python -m http.server 8080

# 方法2: 使用Node.js http-server
npx http-server -p 8080

# 访问地址
http://localhost:8080
```

---

## 🔧 使用指南

### 1. 添加公众号订阅

#### 方法1: 通过Web界面添加

1. 登录朋友圈自动发布系统
2. 点击左侧菜单"公众号监控"
3. 在"添加公众号订阅"卡片中输入公众号名称
4. 点击"添加订阅"按钮

#### 方法2: 通过API添加

```bash
curl -X POST http://localhost:3000/api/wechat-monitor/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"accountName": "公众号名称"}'
```

---

### 2. 查看订阅列表

在"公众号监控"页面的"订阅列表"卡片中可以看到:
- 公众号名称
- 订阅时间
- 最新文章
- 状态(正常/异常)
- 操作按钮(手动更新/删除)

---

### 3. 查看最新文章

在"公众号监控"页面的"最新文章"卡片中可以看到:
- 文章标题
- 公众号名称
- 发布时间
- 处理状态(待处理/已发布)
- 操作按钮(查看详情)

---

## 📊 Webhook数据格式

we-mp-rss推送到后端的Webhook数据格式:

```json
{
  "title": "文章标题",
  "content": "<p>文章正文HTML内容</p>",
  "author": "公众号名称",
  "publish_time": "2025-10-23 09:00:00",
  "url": "https://mp.weixin.qq.com/s/xxxxx",
  "account_id": "公众号ID",
  "images": [
    "https://mmbiz.qpic.cn/xxx.jpg",
    "https://mmbiz.qpic.cn/yyy.jpg"
  ]
}
```

---

## 📡 Webhook详细配置

### 什么是Webhook?

Webhook是一种**实时推送机制**:
- ✅ we-mp-rss抓取到新文章时,**立即推送**到我们的后端
- ✅ **秒级响应**,无需等待定时轮询
- ✅ **节省资源**,不需要频繁查询

### Webhook地址

我们的Webhook接口地址:
```
http://localhost:3000/api/wechat-monitor/webhook
```

**注意**: 如果we-mp-rss部署在Docker容器中,需要使用宿主机IP地址:
```
http://host.docker.internal:3000/api/wechat-monitor/webhook
```

或者使用局域网IP:
```
http://192.168.x.x:3000/api/wechat-monitor/webhook
```

### 配置方法

#### 方法1: 通过Web界面配置 (推荐)

1. 打开we-mp-rss管理界面: `http://localhost:8001`
2. 登录账号: `admin` / `admin@123`
3. 进入"系统设置"或"Webhook配置"
4. 填写Webhook URL: `http://host.docker.internal:3000/api/wechat-monitor/webhook`
5. 保存配置

#### 方法2: 通过环境变量配置

在we-mp-rss的docker run命令中添加:
```bash
-e CUSTOM_WEBHOOK=http://host.docker.internal:3000/api/wechat-monitor/webhook
```

完整命令参考[部署步骤](#第一步-部署we-mp-rss服务)

### 测试Webhook

#### 手动触发测试:

```bash
curl -X POST "http://localhost:3000/api/wechat-monitor/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-article-id",
    "title": "测试文章",
    "content": "<p>这是测试内容</p>",
    "url": "https://mp.weixin.qq.com/s/test",
    "author": "测试作者",
    "publish_time": 1735104000,
    "mp_name": "测试公众号",
    "mp_id": "test-mp-id"
  }'
```

**预期响应**:
```json
{
  "success": true,
  "message": "文章接收成功",
  "articleId": "xxx-xxx-xxx"
}
```

### 验证Webhook是否工作

#### 1. 查看后端日志

后端会输出类似日志:
```
[WechatMonitorService] 收到新文章推送: 测试文章
[WechatMonitorService] 获取文章详情: test-article-id
[WechatMonitorService] 成功获取完整文章内容,长度: 12345
[WechatMonitorService] 文章已保存到数据库: xxx-xxx-xxx
```

#### 2. 检查数据库

查询`wechat_articles`表,确认新文章已保存

#### 3. 前端验证

打开前端页面,查看文章列表是否显示新文章

### 常见问题

#### Q1: Webhook推送失败怎么办?

**检查清单**:
1. ✅ 确认后端服务正常运行
2. ✅ 确认Webhook地址配置正确
3. ✅ 确认防火墙允许端口访问
4. ✅ 查看we-mp-rss日志: `docker logs we-mp-rss | grep webhook`

#### Q2: 如何知道Webhook是否配置成功?

1. 查看we-mp-rss管理界面的Webhook配置
2. 使用curl手动测试Webhook接口
3. 查看后端日志是否收到推送

#### Q3: Webhook和定时同步可以同时使用吗?

可以,但不推荐。Webhook已经提供实时推送,定时同步会造成资源浪费。

---

## 🔄 自动化流程

### 完整流程说明

1. **we-mp-rss定时检查** - 每1小时自动检查订阅的公众号是否有新文章
2. **发现新文章** - 自动采集文章标题、正文、图片、发布时间等数据
3. **Webhook推送** - 将文章数据推送到后端 `/api/wechat-monitor/webhook` 接口(秒级)
4. **后端处理** - 后端接收数据后执行以下操作:
   - 保存到飞书多维表格
   - 触发Coze工作流生成AI摘要
   - 下载图片到本地
   - 调用Puppeteer自动化堆雪球
   - 自动发布到微信朋友圈
5. **WebSocket推送** - 通过WebSocket推送到前端(实时)
6. **前端通知** - 前端显示新文章通知,用户可以查看处理进度和AI摘要

### 后端Webhook接收接口

**文件**: `pyq-backend/src/wechat-monitor/wechat-monitor.controller.ts`

```typescript
@Post('webhook')
async handleWebhook(@Body() articleData: any) {
  return this.wechatMonitorService.handleArticleWebhook(articleData);
}
```

### 自动化处理服务

**文件**: `pyq-backend/src/wechat-monitor/wechat-monitor.service.ts`

- ✅ 提取文章数据(标题、正文、图片、发布时间)
- ✅ 保存到飞书多维表格
- ✅ 调用Coze工作流生成AI摘要
- ✅ 下载图片到本地
- ✅ 调用Puppeteer发布到堆雪球

---

## 🤖 AI摘要功能配置

### 功能概述

公众号监控系统集成了AI智能摘要功能,可以对公众号文章进行自动归纳总结,帮助用户快速了解文章核心内容。

**功能特点**:
- ✅ 自动提炼文章核心观点
- ✅ 生成结构化摘要(一句话总结、核心观点、目标受众、推荐理由、关键词)
- ✅ 支持前端一键生成和查看
- ✅ Markdown格式输出,排版美观

---

### Coze工作流配置

#### 1. 创建Coze工作流

1. 访问 [Coze平台](https://www.coze.cn/)
2. 创建新的工作流
3. 配置输入参数:
   - `article_content` (文章内容,类型: String)
   - `article_title` (文章标题,类型: String)
4. 配置输出参数:
   - `summary` (摘要内容,类型: String,格式: Markdown)

#### 2. 提示词模板

在Coze工作流中使用以下提示词:

```
你是一位专业的内容分析师，擅长快速提炼文章核心价值。请对以下公众号文章进行深度分析和归纳总结。

**输入内容：**
{article_content}

**输出要求：**
请按照以下结构化格式输出摘要（使用Markdown格式）：

## 📌 一句话总结
[用一句话（不超过50字）概括文章的核心主题]

## 💡 核心观点
1. [第一个核心观点]
2. [第二个核心观点]
3. [第三个核心观点]
（提炼3-5个最重要的观点，每条不超过30字）

## 🎯 目标受众
[描述这篇文章最适合哪类人群阅读，20字以内]

## ⭐ 推荐理由
[用2-3句话说明为什么值得阅读这篇文章，突出其独特价值]

## 🏷️ 关键词
[提取5-8个关键词，用逗号分隔]

**注意事项：**
1. 保持客观中立，不添加个人评价
2. 突出文章的实用性和可操作性
3. 语言简洁明了，避免冗长表述
4. 如果文章包含数据或案例，请在核心观点中体现
```

#### 3. 获取API信息

1. 发布工作流
2. 获取以下信息:
   - **Workflow ID**: 工作流唯一标识
   - **API Key**: 访问密钥
   - **API URL**: 工作流调用地址

#### 4. 配置环境变量

在后端 `.env` 文件中添加:

```env
# Coze API配置
COZE_API_KEY=your_api_key_here
COZE_WORKFLOW_ID=your_workflow_id_here
```

**当前配置** (已配置):
```env
COZE_API_KEY=sat_IypG3mLLmm4m1qaRx6qK4E0HpKN6z910uZlEuU9xzLKRja92fpeEVH4EcKsM0y9D
COZE_WORKFLOW_ID=7564955686342918154
```

---

### 前端代码对接

#### 1. 代码位置

**文件路径**: `pyq-frontend-vben/apps/web-antd/src/views/wechat/subscription.vue`

**函数名**: `generateAISummaryForCurrent` (约第977行)

#### 2. API调用代码

```javascript
// 为当前文章生成AI摘要
const generateAISummaryForCurrent = async () => {
  if (!selectedArticle.value) {
    message.error('请先选择文章');
    return;
  }

  try {
    aiSummaryLoading.value = true;
    aiSummaryError.value = '';

    // 调用Coze工作流API
    const response = await fetch('YOUR_COZE_WORKFLOW_API_URL', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY',
      },
      body: JSON.stringify({
        article_content: selectedArticle.value.content || '',
        article_title: selectedArticle.value.title || '',
      }),
    });

    const result = await response.json();

    if (result.success || result.code === 0) {
      // 根据实际返回格式调整
      aiSummary.value = result.data.summary || result.data || result.summary;
      message.success('AI摘要生成成功!');
    } else {
      throw new Error(result.message || 'AI摘要生成失败');
    }
  } catch (error: any) {
    console.error('AI摘要生成失败:', error);
    aiSummaryError.value = error.message || 'AI摘要生成失败，请重试';
    message.error('AI摘要生成失败');
  } finally {
    aiSummaryLoading.value = false;
  }
};
```

#### 3. 修改步骤

1. 打开文件: `pyq-frontend-vben/apps/web-antd/src/views/wechat/subscription.vue`
2. 找到 `generateAISummaryForCurrent` 函数
3. 替换以下参数:
   - `YOUR_COZE_WORKFLOW_API_URL` → 实际的Coze工作流API地址
   - `YOUR_API_KEY` → 实际的API密钥
   - 根据实际返回格式调整 `result.data.summary` 的取值路径

#### 4. 测试验证

**重新构建前端**:
```bash
cd pyq-frontend-vben
npx pnpm@10.14.0 build:antd
```

**部署到服务器**:
```bash
rsync -avz --delete apps/web-antd/dist/ root@124.223.35.102:/www/wwwroot/pyq-frontend/
```

**访问测试**:
```
https://autochat.lfdhk.com/
```

---

### 前端界面说明

#### 功能入口

1. **文章列表页面** - 每篇文章都有"🤖 摘要"按钮
2. **文章详情弹窗** - 右侧显示AI摘要面板

#### 用户操作流程

1. 点击文章的"🤖 摘要"按钮 → 打开文章详情并自动生成摘要
2. 或者先点击"查看"按钮 → 在右侧面板点击"生成AI摘要"
3. 等待AI分析(显示加载动画)
4. 查看摘要结果
5. 可以复制摘要或重新生成

#### 界面特点

- **左右分栏布局** - 左侧文章原文,右侧AI摘要
- **渐变紫粉配色** - 突出AI智能特性
- **加载动画** - 旋转圆圈+提示文字
- **错误处理** - 失败时显示错误信息和重试按钮
- **操作按钮** - 复制摘要、重新生成

---

### 数据格式示例

#### 前端发送给Coze的数据

```json
{
  "article_content": "文章的HTML内容...",
  "article_title": "文章标题"
}
```

#### Coze应该返回的数据格式

**标准格式**:
```json
{
  "success": true,
  "code": 0,
  "data": {
    "summary": "## 📌 一句话总结\n本文深入探讨了...\n\n## 💡 核心观点\n1. ...\n2. ...\n..."
  }
}
```

**简化格式**:
```json
{
  "summary": "## 📌 一句话总结\n本文深入探讨了...\n\n## 💡 核心观点\n1. ...\n2. ...\n..."
}
```

---

### 调试技巧

#### 查看API调用日志

打开浏览器开发者工具(F12),在Console中查看:
- API请求参数
- API返回结果
- 错误信息

#### 常见问题排查

1. **摘要不显示** - 检查API返回格式是否正确
2. **一直加载中** - 检查API是否超时或返回错误
3. **显示格式错乱** - 确认返回的是Markdown格式
4. **401错误** - 检查API Key是否正确配置

---

### 完成检查清单

- [ ] 在Coze中创建工作流并配置提示词
- [ ] 获取工作流API地址和密钥
- [ ] 配置后端环境变量(COZE_API_KEY, COZE_WORKFLOW_ID)
- [ ] 修改前端代码中的API调用
- [ ] 测试API连接是否正常
- [ ] 验证摘要内容格式是否正确
- [ ] 测试错误处理是否生效
- [ ] 测试复制功能是否正常
- [ ] 重新构建并部署前端

---

## 🛠️ 故障排查

### 问题1: we-mp-rss服务无法启动

**解决方案**:
```bash
# 检查Docker容器状态
docker ps -a

# 查看容器日志
docker logs we-mp-rss

# 重启容器
docker restart we-mp-rss
```

---

### 问题2: Webhook推送失败

**检查清单**:
1. 确认后端服务正常运行
2. 确认Webhook地址配置正确
3. 确认防火墙允许8001端口访问
4. 查看we-mp-rss日志

**查看日志**:
```bash
docker logs we-mp-rss | grep webhook
```

---

### 问题3: 扫码授权失效

**解决方案**:
1. 重新登录we-mp-rss管理界面
2. 点击"扫码授权"
3. 使用微信重新扫码授权

---

### 问题4: 订阅列表为空

**检查清单**:
1. 确认we-mp-rss服务正常运行
2. 确认后端API地址配置正确
3. 检查浏览器控制台是否有错误
4. 确认后端CORS配置正确

---

## 📝 API接口文档

### 1. 添加订阅

```
POST /api/wechat-monitor/subscriptions
```

**请求体**:
```json
{
  "accountName": "公众号名称"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": "订阅ID",
    "name": "公众号名称",
    "createdAt": "2025-10-23 09:00:00"
  }
}
```

---

### 2. 获取订阅列表

```
GET /api/wechat-monitor/subscriptions
```

**响应**:
```json
{
  "success": true,
  "data": [
    {
      "id": "订阅ID",
      "name": "公众号名称",
      "createdAt": "2025-10-23 09:00:00",
      "latestArticle": "最新文章标题",
      "status": "正常"
    }
  ]
}
```

---

### 3. 删除订阅

```
DELETE /api/wechat-monitor/subscriptions/:id
```

**响应**:
```json
{
  "success": true,
  "message": "删除成功"
}
```

---

### 4. 手动触发更新

```
POST /api/wechat-monitor/subscriptions/:id/update
```

**响应**:
```json
{
  "success": true,
  "message": "更新成功"
}
```

---

## 📋 下一步行动计划

### 实现优先级

1. **第一步**: 配置we-mp-rss Webhook (已完成后端代码) ✅
2. **第二步**: 配置飞书、Coze、Puppeteer环境变量
3. **第三步**: 测试Webhook接收和自动化流程
4. **第四步**: 添加WebSocket实时推送到前端
5. **第五步**: 前端添加实时通知UI

### 立即可做

1. ✅ 在we-mp-rss配置页面设置Webhook URL
2. ✅ 配置.env环境变量(飞书、Coze、Puppeteer)
3. ✅ 测试发布一篇公众号文章,验证Webhook是否触发

### 需要开发

1. ⏳ 完善Puppeteer自动化堆雪球服务
2. ⏳ 添加WebSocket实时推送功能
3. ⏳ 前端添加实时通知UI组件

### 需要配置

1. ⏳ 飞书多维表格创建和配置
2. ⏳ Coze工作流创建和配置
3. ⏳ 服务器部署和域名配置

---

## 🎉 预期效果

### 用户视角

1. 公众号发布新文章
2. 几秒钟后,前端页面右上角弹出通知: "检测到新文章: xxx"
3. 文章列表自动刷新,显示新文章
4. 文章状态显示: "处理中" → "改写完成" → "已发布"
5. 全程无需人工干预

### 技术视角

1. we-mp-rss检测到新文章(实时)
2. 调用Webhook推送到后端(秒级)
3. 后端自动处理(1-2分钟)
4. WebSocket推送到前端(实时)
5. 前端UI实时更新(秒级)

### 关键优势

- ✅ **完全自动化** - 从检测到发布全流程自动化
- ✅ **实时响应** - 秒级检测和通知
- ✅ **用户体验好** - 实时通知和状态更新
- ✅ **成本低** - 全部使用免费技术方案
- ✅ **可扩展** - 可以轻松添加更多自动化功能

---

## 🎯 最佳实践

### 1. 监控频率设置

- **推荐间隔**: 1小时(3600秒)
- **最小间隔**: 10秒(不推荐,容易触发限流)
- **最大间隔**: 24小时(86400秒)

### 2. 订阅数量控制

- **推荐数量**: 50个以内
- **最大数量**: 100个
- **超过100个**: 建议部署多个we-mp-rss实例

### 3. 数据备份

定期备份we-mp-rss数据目录:
```bash
tar -czf we-mp-rss-backup-$(date +%Y%m%d).tar.gz ./we-mp-rss-data
```

---

## 📞 技术支持

- **we-mp-rss项目**: https://github.com/rachelos/we-mp-rss
- **项目Issues**: https://github.com/rachelos/we-mp-rss/issues
- **项目文档**: 查看项目README.md

---

## 🔗 相关链接

- [we-mp-rss GitHub仓库](https://github.com/rachelos/we-mp-rss)
- [Docker Hub](https://hub.docker.com/)
- [飞书开放平台](https://open.feishu.cn/)
- [Coze平台](https://www.coze.cn/)

