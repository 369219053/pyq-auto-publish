import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

/**
 * 文章管理服务
 */
@Injectable()
export class ArticlesService {
  private readonly logger = new Logger(ArticlesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * 获取文章列表
   * @param page 页码
   * @param pageSize 每页数量
   * @param accountId 公众号ID(可选)
   * @param status 状态(可选)
   * @param userId 用户ID(可选,用于多用户隔离)
   */
  async getArticles(
    page: number = 1,
    pageSize: number = 20,
    accountId?: string,
    status?: string,
    userId?: string,
  ) {
    try {
      const supabase = this.supabaseService.getClient();

      let query = supabase
        .from('wechat_articles')
        .select('*', { count: 'exact' })
        .order('publish_time', { ascending: false });

      // 筛选条件
      if (userId) {
        query = query.eq('user_id', userId);
      }
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      if (status) {
        query = query.eq('status', status);
      }

      // 分页
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) {
        this.logger.error(`获取文章列表失败: ${error.message}`);
        throw error;
      }

      return {
        data,
        total: count,
        page,
        pageSize,
        totalPages: Math.ceil(count / pageSize),
      };
    } catch (error) {
      this.logger.error(`获取文章列表失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取文章详情
   * @param id 文章ID
   */
  async getArticleById(id: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      const { data, error } = await supabase
        .from('wechat_articles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        this.logger.error(`获取文章详情失败: ${error.message}`);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error(`获取文章详情失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 创建文章
   * @param articleData 文章数据
   */
  async createArticle(articleData: any) {
    try {
      const supabase = this.supabaseService.getClient();

      const { data, error } = await supabase
        .from('wechat_articles')
        .insert([
          {
            title: articleData.title,
            content: articleData.content,
            images: articleData.images || [],
            publish_time: articleData.publish_time,
            author: articleData.author,
            url: articleData.url,
            account_name: articleData.account_name,
            account_id: articleData.account_id,
            user_id: articleData.user_id, // 添加user_id字段
            status: '待处理',
          },
        ])
        .select()
        .single();

      if (error) {
        this.logger.error(`创建文章失败: ${error.message}`);
        throw error;
      }

      this.logger.log(`文章创建成功: ${data.title}`);
      return data;
    } catch (error) {
      this.logger.error(`创建文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 更新文章状态
   * @param id 文章ID
   * @param status 新状态
   * @param rewrittenContent 改写后的内容(可选)
   */
  async updateArticleStatus(
    id: string,
    status: string,
    rewrittenContent?: string,
  ) {
    try {
      const supabase = this.supabaseService.getClient();
      
      const updateData: any = { status };
      if (rewrittenContent) {
        updateData.rewritten_content = rewrittenContent;
      }

      const { data, error } = await supabase
        .from('wechat_articles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.logger.error(`更新文章状态失败: ${error.message}`);
        throw error;
      }

      this.logger.log(`文章状态更新成功: ${id} -> ${status}`);
      return data;
    } catch (error) {
      this.logger.error(`更新文章状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除文章
   * @param id 文章ID
   */
  async deleteArticle(id: string) {
    try {
      const supabase = this.supabaseService.getClient();
      
      const { error } = await supabase
        .from('wechat_articles')
        .delete()
        .eq('id', id);

      if (error) {
        this.logger.error(`删除文章失败: ${error.message}`);
        throw error;
      }

      this.logger.log(`文章删除成功: ${id}`);
      return { success: true };
    } catch (error) {
      this.logger.error(`删除文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取公众号列表
   */
  async getAccounts() {
    try {
      const supabase = this.supabaseService.getClient();
      
      const { data, error } = await supabase
        .from('wechat_articles')
        .select('account_id, account_name')
        .order('account_name');

      if (error) {
        this.logger.error(`获取公众号列表失败: ${error.message}`);
        throw error;
      }

      // 去重
      const uniqueAccounts = Array.from(
        new Map(data.map((item) => [item.account_id, item])).values(),
      );

      return uniqueAccounts;
    } catch (error) {
      this.logger.error(`获取公众号列表失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取文章统计信息
   */
  async getStatistics() {
    try {
      const supabase = this.supabaseService.getClient();

      // 总文章数
      const { count: totalCount } = await supabase
        .from('wechat_articles')
        .select('*', { count: 'exact', head: true });

      // 待处理文章数
      const { count: pendingCount } = await supabase
        .from('wechat_articles')
        .select('*', { count: 'exact', head: true })
        .eq('status', '待处理');

      // 已发布文章数
      const { count: publishedCount } = await supabase
        .from('wechat_articles')
        .select('*', { count: 'exact', head: true })
        .eq('status', '已发布');

      // 今日新增文章数
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase
        .from('wechat_articles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      return {
        total: totalCount || 0,
        pending: pendingCount || 0,
        published: publishedCount || 0,
        today: todayCount || 0,
      };
    } catch (error) {
      this.logger.error(`获取统计信息失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 根据URL查找文章(用于去重)
   * @param url 文章URL
   */
  async findByUrl(url: string) {
    try {
      const supabase = this.supabaseService.getClient();

      // 🔧 修复: 使用limit(1)代替maybeSingle(),避免重复记录报错
      const { data, error } = await supabase
        .from('wechat_articles')
        .select('*')
        .eq('url', url)
        .order('created_at', { ascending: false }) // 优先返回最新的记录
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

  /**
   * 根据公众号ID查找所有文章
   * @param accountId 公众号ID
   */
  async findByAccountId(accountId: string) {
    try {
      const supabase = this.supabaseService.getClient();

      const { data, error } = await supabase
        .from('wechat_articles')
        .select('*')
        .eq('account_id', accountId);

      if (error) {
        this.logger.error(`查找文章失败: ${error.message}`);
        throw error;
      }

      return data || [];
    } catch (error) {
      this.logger.error(`查找文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除指定公众号的所有文章
   * @param accountId 公众号ID
   */
  async deleteArticlesByAccountId(accountId: string) {
    try {
      const supabase = this.supabaseService.getClient();

      const { error, count } = await supabase
        .from('wechat_articles')
        .delete({ count: 'exact' })
        .eq('account_id', accountId);

      if (error) {
        this.logger.error(`删除文章失败: ${error.message}`);
        throw error;
      }

      this.logger.log(`成功删除 ${count} 篇文章`);
      return { success: true, deleted: count };
    } catch (error) {
      this.logger.error(`删除文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取最近的文章(用于定时监控)
   * @param since 起始时间(ISO格式)
   * @param accountIds 公众号ID列表(可选)
   */
  async getRecentArticles(since: string, accountIds?: string[]) {
    try {
      const supabase = this.supabaseService.getClient();

      let query = supabase
        .from('wechat_articles')
        .select('*')
        .gte('publish_time', since)
        .order('publish_time', { ascending: false });

      // 如果指定了公众号ID列表,则筛选
      if (accountIds && accountIds.length > 0) {
        query = query.in('account_id', accountIds);
      }

      const { data, error } = await query;

      if (error) {
        this.logger.error(`获取最近文章失败: ${error.message}`);
        throw error;
      }

      this.logger.log(`获取到 ${data.length} 篇最近文章`);
      return data;
    } catch (error) {
      this.logger.error(`获取最近文章失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取所有不同的account_id列表
   * 用于清理孤立文章
   */
  async getAllAccountIds(): Promise<string[]> {
    try {
      const supabase = this.supabaseService.getClient();

      const { data, error } = await supabase
        .from('wechat_articles')
        .select('account_id');

      if (error) {
        this.logger.error(`获取account_id列表失败: ${error.message}`);
        throw error;
      }

      // 去重
      const uniqueAccountIds = [...new Set(data.map((item: any) => item.account_id))];
      return uniqueAccountIds.filter((id: string) => id); // 过滤掉null/undefined
    } catch (error) {
      this.logger.error(`获取account_id列表失败: ${error.message}`);
      throw error;
    }
  }
}

