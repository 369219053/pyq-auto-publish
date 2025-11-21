import { Injectable, Logger } from '@nestjs/common';
import { WeMpRssService } from './we-mp-rss.service';
import { ArticlesService } from '../articles/articles.service';
import { SupabaseService } from '../common/supabase.service';
import axios from 'axios';

/**
 * 微信公众号监控服务
 * 负责处理we-mp-rss推送的文章数据
 */
@Injectable()
export class WechatMonitorService {
  private readonly logger = new Logger(WechatMonitorService.name);

  constructor(
    private readonly weMpRssService: WeMpRssService,
    private readonly articlesService: ArticlesService,
    private readonly supabaseService: SupabaseService,
  ) {}

  /**
   * 处理we-mp-rss推送的文章数据
   * @param articleData we-mp-rss推送的文章数据
   */
  async handleArticleWebhook(articleData: any) {
    try {
      this.logger.log(`收到新文章推送: ${articleData.title}`);

      // 1. 获取文章详情(包含完整正文)
      let fullArticle = articleData;

      if (articleData.id) {
        this.logger.log(`获取文章详情: ${articleData.id}`);
        try {
          const detailResponse = await this.weMpRssService.getArticleDetail(articleData.id);
          if (detailResponse && detailResponse.data) {
            fullArticle = detailResponse.data;
            this.logger.log(`成功获取完整文章内容,长度: ${fullArticle.content?.length || 0}`);
          }
        } catch (error) {
          this.logger.error(`获取文章详情失败,使用推送数据: ${error.message}`);
        }
      }

      // 2. 提取文章数据
      const images = this.extractImages(fullArticle.content || articleData.content);

      const article = {
        title: fullArticle.title || articleData.title,
        content: fullArticle.content || articleData.content, // HTML格式
        images: images, // 从HTML中提取图片URL
        publish_time: articleData.publish_time,
        author: fullArticle.author || articleData.author,
        url: fullArticle.url || articleData.url,
        account_name: articleData.account_name || articleData.mp_name || '未知公众号',
        account_id: articleData.account_id || articleData.mp_id,
      };

      // 3. 保存到数据库
      const savedArticle = await this.articlesService.createArticle(article);
      this.logger.log(`文章已保存到数据库: ${savedArticle.id}`);

      // 4. 异步处理后续流程(不阻塞Webhook响应)
      this.processArticleAsync(savedArticle.id, article).catch((error) => {
        this.logger.error(`文章异步处理失败: ${error.message}`);
      });

      return {
        success: true,
        message: '文章接收成功',
        articleId: savedArticle.id,
      };
    } catch (error) {
      this.logger.error(`文章处理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 异步处理文章(改写、发布等)
   * @param articleId 文章ID
   * @param article 文章数据
   */
  private async processArticleAsync(articleId: string, article: any) {
    try {
      // 更新状态为"改写中"
      await this.articlesService.updateArticleStatus(articleId, '改写中');

      // 1. 触发Coze工作流改写文案
      const rewrittenContent = await this.triggerCozeWorkflow(article);

      // 更新状态为"已改写"
      await this.articlesService.updateArticleStatus(
        articleId,
        '已改写',
        rewrittenContent,
      );

      // 2. 下载图片到本地
      const localImages = await this.downloadImages(article.images);

      // 更新状态为"发布中"
      await this.articlesService.updateArticleStatus(articleId, '发布中');

      // 3. 调用Puppeteer自动化堆雪球
      await this.publishToDuixueqiu({
        content: rewrittenContent,
        images: localImages,
      });

      // 更新状态为"已发布"
      await this.articlesService.updateArticleStatus(articleId, '已发布');

      this.logger.log(`文章处理完成: ${article.title}`);
    } catch (error) {
      // 更新状态为"失败"
      await this.articlesService.updateArticleStatus(articleId, '失败');
      this.logger.error(`文章处理失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 从HTML内容中提取图片URL
   * @param htmlContent HTML内容
   */
  private extractImages(htmlContent: string): string[] {
    const images: string[] = [];
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    let match;

    while ((match = imgRegex.exec(htmlContent)) !== null) {
      images.push(match[1]);
    }

    return images;
  }

  /**
   * 保存文章到飞书多维表格
   * @param article 文章数据
   */
  private async saveToFeishu(article: any) {
    try {
      const feishuAppId = process.env.FEISHU_APP_ID;
      const feishuAppSecret = process.env.FEISHU_APP_SECRET;
      const feishuTableId = process.env.FEISHU_TABLE_ID;

      // 1. 获取飞书访问令牌
      const tokenResponse = await axios.post(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          app_id: feishuAppId,
          app_secret: feishuAppSecret,
        },
      );

      const accessToken = tokenResponse.data.tenant_access_token;

      // 2. 添加记录到飞书多维表格
      await axios.post(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${feishuTableId}/tables/tblxxxxxx/records`,
        {
          fields: {
            '标题': article.title,
            '正文': article.content,
            '图片': article.images.join(','),
            '发布时间': article.publishTime,
            '作者': article.author,
            '原文链接': article.url,
            '状态': '待处理',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`文章已保存到飞书: ${article.title}`);
    } catch (error) {
      this.logger.error(`保存到飞书失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 触发Coze工作流改写文案
   * @param article 文章数据
   */
  private async triggerCozeWorkflow(article: any): Promise<string> {
    try {
      const cozeApiKey = process.env.COZE_API_KEY;
      const cozeWorkflowId = process.env.COZE_WORKFLOW_ID;

      const response = await axios.post(
        `https://api.coze.cn/v1/workflow/run`,
        {
          workflow_id: cozeWorkflowId,
          parameters: {
            title: article.title,
            content: article.content,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${cozeApiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const rewrittenContent = response.data.data.output;
      this.logger.log(`文案改写完成: ${article.title}`);
      return rewrittenContent;
    } catch (error) {
      this.logger.error(`Coze工作流调用失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 下载图片到本地
   * @param imageUrls 图片URL数组
   */
  private async downloadImages(imageUrls: string[]): Promise<string[]> {
    const localPaths: string[] = [];

    for (const url of imageUrls) {
      try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const fileName = `image_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const filePath = `./uploads/${fileName}`;

        // 保存图片到本地
        const fs = require('fs');
        fs.writeFileSync(filePath, response.data);

        localPaths.push(filePath);
        this.logger.log(`图片下载成功: ${fileName}`);
      } catch (error) {
        this.logger.error(`图片下载失败: ${url}`);
      }
    }

    return localPaths;
  }

  /**
   * 调用Puppeteer自动化堆雪球
   * @param data 发布数据
   */
  private async publishToDuixueqiu(data: { content: string; images: string[] }) {
    try {
      // 调用Puppeteer服务
      const puppeteerServiceUrl = process.env.PUPPETEER_SERVICE_URL || 'http://localhost:3002';

      await axios.post(
        `${puppeteerServiceUrl}/api/publish`,
        {
          content: data.content,
          images: data.images,
        },
      );

      this.logger.log('堆雪球发布成功');
    } catch (error) {
      this.logger.error(`堆雪球发布失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 导入历史文章 - 方案一:一键导入所有历史文章
   * @param userId 用户ID
   * @param mpId 可选:只导入特定公众号的文章
   * @param limit 可选:限制导入数量
   */
  async importHistoryArticles(userId: string, mpId?: string, limit?: number) {
    try {
      this.logger.log(`用户 ${userId} 开始导入历史文章... mpId: ${mpId}, limit: ${limit}`);

      // 🔒 安全检查1: 必须指定mpId,不允许导入所有公众号的文章
      if (!mpId) {
        throw new Error('必须指定公众号ID(mpId),不允许批量导入所有公众号的文章');
      }

      // 🔒 安全检查2: 验证公众号是否在用户的订阅列表中
      const subscriptions = await this.weMpRssService.getSubscriptions(userId);
      const validMpIds = subscriptions.data?.list?.map((sub: any) => sub.id || sub.mp_id) || [];

      if (!validMpIds.includes(mpId)) {
        throw new Error(`公众号 ${mpId} 不在您的订阅列表中,无法导入文章`);
      }

      this.logger.log(`✅ 公众号验证通过: ${mpId}`);

      let page = 0;
      const pageSize = 20;
      let totalImported = 0;
      let hasMore = true;

      while (hasMore && (!limit || totalImported < limit)) {
        this.logger.log(`正在获取第 ${page + 1} 页文章...`);

        // 从we-mp-rss获取文章列表
        const response = await this.weMpRssService.getArticles(mpId, page, pageSize);

        this.logger.log(`获取到响应: ${JSON.stringify(response).substring(0, 200)}...`);

        // we-mp-rss返回格式: { code: 0, message: "success", data: { list: [...], total: 57 } }
        // response已经是完整的响应对象,所以直接访问response.data.list
        if (!response.data || !response.data.list || response.data.list.length === 0) {
          this.logger.log(`没有更多文章了,退出循环`);
          hasMore = false;
          break;
        }

        const articles = response.data.list;  // 修复: 数据在response.data.list中
        this.logger.log(`本页获取到 ${articles.length} 篇文章`);

        // 批量导入文章
        for (const article of articles) {
          if (limit && totalImported >= limit) {
            hasMore = false;
            break;
          }

          try {
            // 检查文章是否已存在(通过URL去重)
            const existingArticle = await this.articlesService.findByUrl(article.url);

            if (existingArticle) {
              this.logger.log(`文章已存在,跳过: ${article.title}`);
              continue;
            }

            // 获取文章完整正文
            let fullContent = article.content || '';
            try {
              this.logger.log(`正在获取文章完整正文: ${article.title}`);
              const detailResponse = await this.weMpRssService.getArticleDetail(article.id);
              if (detailResponse?.data?.content) {
                fullContent = detailResponse.data.content;
                this.logger.log(`成功获取完整正文,长度: ${fullContent.length} 字符`);
              }
            } catch (detailError) {
              this.logger.warn(`获取文章详情失败,使用摘要: ${detailError.message}`);
            }

            // 提取图片
            const images = this.extractImages(fullContent);

            // 转换Unix时间戳(秒)为ISO日期字符串
            // article.publish_time是Unix时间戳(秒),需要转换为ISO格式
            const publishDate = new Date(article.publish_time * 1000).toISOString();

            // 保存文章到数据库
            await this.articlesService.createArticle({
              title: article.title,
              content: fullContent,  // 使用完整正文
              images: images,
              publish_time: publishDate,  // 使用转换后的ISO格式日期
              author: article.author,
              url: article.url,
              account_name: article.mp_name || '未知公众号',
              account_id: article.mp_id,
              user_id: userId, // 添加user_id
            });

            totalImported++;
            this.logger.log(`导入文章成功 (${totalImported}): ${article.title}`);
          } catch (error) {
            this.logger.error(`导入文章失败: ${article.title}, ${error.message}`);
          }
        }

        page++;
      }

      this.logger.log(`历史文章导入完成,共导入 ${totalImported} 篇文章`);

      return {
        success: true,
        message: `成功导入 ${totalImported} 篇历史文章`,
        totalImported,
      };
    } catch (error) {
      this.logger.error(`导入历史文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查微信公众平台登录状态
   */
  async checkWechatLoginStatus(): Promise<{ isLoggedIn: boolean; message: string }> {
    try {
      const statusResponse = await this.weMpRssService.checkQrStatus();

      this.logger.log(`🔍 checkQrStatus返回: ${JSON.stringify(statusResponse)}`);

      // we-mp-rss返回格式: { code: 0, message: 'success', data: { status: 'confirmed' | 'expired' } }
      if (statusResponse && statusResponse.code === 0 && statusResponse.data) {
        const isLoggedIn = statusResponse.data.status === 'confirmed';
        this.logger.log(`✅ 登录状态检测: status=${statusResponse.data.status}, isLoggedIn=${isLoggedIn}`);
        return {
          isLoggedIn,
          message: isLoggedIn ? '微信公众平台已登录' : '微信公众平台登录已过期',
        };
      }

      this.logger.warn(`⚠️ checkQrStatus返回数据格式不正确`);
      return {
        isLoggedIn: false,
        message: '无法获取微信登录状态',
      };
    } catch (error) {
      this.logger.error(`检查微信登录状态失败: ${error.message}`);
      return {
        isLoggedIn: false,
        message: `检查登录状态失败: ${error.message}`,
      };
    }
  }

  /**
   * 同步单个公众号的文章
   * @param mpId 公众号ID
   * @param mpName 公众号名称
   * @param userId 用户ID
   */
  async syncSingleAccount(mpId: string, mpName: string, userId: string) {
    this.logger.log(`🔄 开始同步单个公众号: ${mpName} (ID: ${mpId})`);

    let totalSynced = 0;

    try {
      // 获取该公众号的所有文章(分页获取)
      let page = 0;
      const pageSize = 50; // 每页50篇
      let hasMore = true;

      while (hasMore) {
        const response = await this.weMpRssService.getArticles(mpId, page, pageSize);

        if (!response.data || !response.data.list || response.data.list.length === 0) {
          hasMore = false;
          break;
        }

        const articles = response.data.list;
        const total = response.data.total || 0;

        this.logger.log(`${mpName} - 第${page + 1}页: 获取 ${articles.length} 篇文章,总数: ${total}`);

        // 同步文章
        let synced = 0;
        for (const article of articles) {
          try {
            // 检查文章是否已存在
            const existingArticle = await this.articlesService.findByUrl(article.url);

            if (existingArticle) {
              this.logger.log(`⏭️  跳过已存在文章: ${article.title} (发布时间: ${new Date(article.publish_time * 1000).toISOString()})`);
              continue;
            }

            // 获取文章详情
            this.logger.log(`获取文章详情: ${article.title}`);
            const detailResponse = await this.weMpRssService.getArticleDetail(article.id);

            if (!detailResponse || !detailResponse.data) {
              this.logger.error(`获取文章详情失败: ${article.title}`);
              continue;
            }

            const fullArticle = detailResponse.data;
            const images = this.extractImages(fullArticle.content || article.content);
            const publishDate = new Date(article.publish_time * 1000).toISOString();

            // 保存新文章
            await this.articlesService.createArticle({
              title: fullArticle.title || article.title,
              content: fullArticle.content || article.content,
              images: images,
              publish_time: publishDate,
              author: fullArticle.author || article.author,
              url: fullArticle.url || article.url,
              account_name: mpName,
              account_id: mpId,
              user_id: userId,
            });

            synced++;
            totalSynced++;
            this.logger.log(`同步新文章: ${article.title}`);
          } catch (error) {
            this.logger.error(`同步文章失败: ${article.title}, ${error.message}`);
          }
        }

        this.logger.log(`${mpName} - 第${page + 1}页同步完成,新增 ${synced} 篇`);

        // 如果本页文章数少于pageSize,说明已经是最后一页
        if (articles.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      this.logger.log(`${mpName} 同步完成,共新增 ${totalSynced} 篇文章`);

      return {
        success: true,
        synced: totalSynced,
      };
    } catch (error) {
      this.logger.error(`同步公众号失败: ${mpName}, ${error.message}`);
      throw error;
    }
  }

  /**
   * 定时同步文章 - 方案三:定时自动同步
   * 根据订阅列表,同步每个订阅的所有文章
   */
  async syncArticles() {
    try {
      this.logger.log('开始同步文章...');

      // 1. 获取所有用户的订阅列表(从wechat_subscriptions表)
      const supabase = this.supabaseService.getClient();
      const { data: allSubscriptions, error } = await supabase
        .from('wechat_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        this.logger.error(`获取订阅列表失败: ${error.message}`);
        throw new Error(`获取订阅列表失败: ${error.message}`);
      }

      if (!allSubscriptions || allSubscriptions.length === 0) {
        this.logger.log('没有订阅的公众号');
        return {
          success: true,
          message: '没有订阅的公众号',
          synced: 0,
        };
      }

      this.logger.log(`找到 ${allSubscriptions.length} 个订阅记录`);

      let totalSynced = 0;

      // 2. 遍历每个订阅,获取该订阅的所有文章
      for (const subscription of allSubscriptions) {
        try {
          const mpId = subscription.mp_id;
          const mpName = subscription.mp_name || '未知公众号';
          const userId = subscription.user_id;

          this.logger.log(`开始同步公众号: ${mpName} (ID: ${mpId}) for 用户: ${userId}`);

          // 🔄 关键修复: 先触发we-mp-rss更新,获取最新文章
          try {
            this.logger.log(`🔄 触发we-mp-rss更新: ${mpName}`);
            await this.weMpRssService.triggerUpdate(mpId);
            this.logger.log(`✅ we-mp-rss更新完成: ${mpName}`);

            // 等待1秒,确保we-mp-rss完成更新
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (updateError) {
            this.logger.warn(`⚠️  触发更新失败,继续同步: ${updateError.message}`);
          }

          // 获取该公众号的所有文章(分页获取)
          let page = 0;
          const pageSize = 50; // 每页50篇
          let hasMore = true;

          while (hasMore) {
            const response = await this.weMpRssService.getArticles(mpId, page, pageSize);

            if (!response.data || !response.data.list || response.data.list.length === 0) {
              hasMore = false;
              break;
            }

            const articles = response.data.list;
            const total = response.data.total || 0;

            this.logger.log(`${mpName} - 第${page + 1}页: 获取 ${articles.length} 篇文章,总数: ${total}`);

            // 3. 同步文章
            let synced = 0; // 本页同步的文章数
            for (const article of articles) {
              try {
                // 检查文章是否已存在
                const existingArticle = await this.articlesService.findByUrl(article.url);

                if (existingArticle) {
                  this.logger.log(`⏭️  跳过已存在文章: ${article.title} (发布时间: ${new Date(article.publish_time * 1000).toISOString()})`);
                  continue; // 已存在,跳过
                }

                // 获取文章详情(包含完整正文)
                this.logger.log(`获取文章详情: ${article.title}`);
                const detailResponse = await this.weMpRssService.getArticleDetail(article.id);

                if (!detailResponse || !detailResponse.data) {
                  this.logger.error(`获取文章详情失败: ${article.title}`);
                  continue;
                }

                const fullArticle = detailResponse.data;

                // 提取图片
                const images = this.extractImages(fullArticle.content || article.content);

                // 转换Unix时间戳(秒)为ISO日期字符串
                const publishDate = new Date(article.publish_time * 1000).toISOString();

                // 保存新文章(使用完整文章内容)
                await this.articlesService.createArticle({
                  title: fullArticle.title || article.title,
                  content: fullArticle.content || article.content,
                  images: images,
                  publish_time: publishDate,
                  author: fullArticle.author || article.author,
                  url: fullArticle.url || article.url,
                  account_name: mpName,
                  account_id: mpId,
                  user_id: userId, // 添加user_id
                });

                synced++;
                totalSynced++;
                this.logger.log(`同步新文章: ${article.title}`);
              } catch (error) {
                this.logger.error(`同步文章失败: ${article.title}, ${error.message}`);
              }
            }

            this.logger.log(`${mpName} - 第${page + 1}页同步完成,新增 ${synced} 篇`);

            // 4. 判断是否还有更多文章
            if (articles.length < pageSize) {
              hasMore = false; // 最后一页
            } else {
              page++; // 继续下一页
            }
          }

          this.logger.log(`${mpName} 同步完成`);
        } catch (error) {
          this.logger.error(`同步公众号 ${subscription.mp_name} 失败: ${error.message}`);
        }
      }

      this.logger.log(`所有文章同步完成,共同步 ${totalSynced} 篇新文章`);

      return {
        success: true,
        message: `成功同步 ${totalSynced} 篇新文章`,
        synced: totalSynced,
      };
    } catch (error) {
      this.logger.error(`同步文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除指定公众号的所有文章
   * @param accountId 公众号ID
   */
  async deleteArticlesByAccountId(accountId: string) {
    try {
      this.logger.log(`开始删除公众号 ${accountId} 的所有文章`);
      const result = await this.articlesService.deleteArticlesByAccountId(accountId);
      this.logger.log(`成功删除公众号 ${accountId} 的所有文章`);
      return result;
    } catch (error) {
      this.logger.error(`删除公众号文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 清理孤立文章 - 删除不在订阅列表中的公众号的文章
   * 用于清理历史遗留的无效数据
   */
  async cleanOrphanArticles() {
    try {
      this.logger.log('🧹 开始清理孤立文章...');

      // 1. 获取当前订阅列表
      const subscriptions = await this.weMpRssService.getSubscriptions();
      const validMpIds = subscriptions.data?.list?.map((sub: any) => sub.id || sub.mp_id) || [];

      this.logger.log(`✅ 当前有效订阅: ${validMpIds.join(', ')}`);

      // 2. 获取数据库中所有文章的account_id
      const allArticles = await this.articlesService.getAllAccountIds();

      // 3. 找出不在订阅列表中的account_id
      const orphanAccountIds = allArticles.filter((accountId: string) => !validMpIds.includes(accountId));

      if (orphanAccountIds.length === 0) {
        this.logger.log('✅ 没有孤立文章需要清理');
        return {
          success: true,
          message: '没有孤立文章需要清理',
          deletedCount: 0,
        };
      }

      this.logger.log(`⚠️  发现 ${orphanAccountIds.length} 个孤立公众号: ${orphanAccountIds.join(', ')}`);

      // 4. 删除这些孤立文章
      let totalDeleted = 0;
      for (const accountId of orphanAccountIds) {
        const result = await this.articlesService.deleteArticlesByAccountId(accountId);
        totalDeleted += result.deleted || 0;
        this.logger.log(`🗑️  已删除公众号 ${accountId} 的 ${result.deleted} 篇文章`);
      }

      this.logger.log(`✅ 清理完成,共删除 ${totalDeleted} 篇孤立文章`);

      return {
        success: true,
        message: `成功清理 ${totalDeleted} 篇孤立文章`,
        deletedCount: totalDeleted,
        orphanAccountIds,
      };
    } catch (error) {
      this.logger.error(`清理孤立文章失败: ${error.message}`);
      throw error;
    }
  }
}

