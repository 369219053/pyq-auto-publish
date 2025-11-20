import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { SupabaseService } from '../common/supabase.service';

/**
 * we-mp-rss API服务
 * 负责与we-mp-rss系统进行交互
 */
@Injectable()
export class WeMpRssService {
  private readonly logger = new Logger(WeMpRssService.name);
  private readonly weMpRssUrl: string;
  private readonly username: string;
  private readonly password: string;
  private axiosInstance: AxiosInstance;
  private accessToken: string = '';

  constructor(private readonly supabaseService: SupabaseService) {
    // we-mp-rss服务地址(默认本地部署)
    this.weMpRssUrl = process.env.WE_MP_RSS_URL || 'http://localhost:8001';
    // we-mp-rss登录凭证
    this.username = process.env.WE_MP_RSS_USERNAME || 'admin';
    this.password = process.env.WE_MP_RSS_PASSWORD || 'admin@123';

    // 创建axios实例,启用cookie支持
    this.axiosInstance = axios.create({
      baseURL: this.weMpRssUrl,
      withCredentials: true, // 启用cookie
    });
  }

  /**
   * 登录获取Access Token
   */
  private async login() {
    try {
      // we-mp-rss登录接口使用application/x-www-form-urlencoded格式
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);

      const response = await this.axiosInstance.post(
        '/api/v1/wx/auth/login',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

      // we-mp-rss返回的是JWT token,不是session cookie
      if (response.data && response.data.code === 0 && response.data.data) {
        this.accessToken = response.data.data.access_token;
        this.logger.log(`we-mp-rss登录成功,获取到access token: ${this.accessToken.substring(0, 20)}...`);
      } else {
        this.logger.error(`we-mp-rss登录失败: ${JSON.stringify(response.data)}`);
        throw new Error('登录失败,未获取到access_token');
      }

      return this.accessToken;
    } catch (error) {
      this.logger.error(`we-mp-rss登录失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 确保已登录
   */
  private async ensureLoggedIn() {
    if (!this.accessToken) {
      this.logger.log('🔐 Token不存在,开始登录...');
      await this.login();
    }
  }

  /**
   * 获取请求头(包含Authorization)
   */
  private async getHeaders() {
    await this.ensureLoggedIn();
    return {
      'Authorization': `Bearer ${this.accessToken}`,
    };
  }

  /**
   * 执行API请求(带自动重试登录机制)
   * @param requestFn 请求函数
   * @param retryCount 重试次数(默认1次)
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    retryCount: number = 1,
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error) {
      // 检查是否是401未授权错误
      if (error.response?.status === 401 && retryCount > 0) {
        this.logger.warn(`⚠️ Token可能已过期(401错误),尝试重新登录...`);

        // 清空旧token
        this.accessToken = '';

        // 重新登录
        await this.login();

        // 重试请求
        this.logger.log(`🔄 重新登录成功,重试API请求...`);
        return await this.executeWithRetry(requestFn, retryCount - 1);
      }

      // 其他错误或重试次数用完,直接抛出
      throw error;
    }
  }

  /**
   * 获取微信公众平台登录二维码
   */
  async getQrCode() {
    try {
      const headers = await this.getHeaders();

      const response = await this.axiosInstance.get(
        '/api/v1/wx/auth/qr/code',
        {
          headers,
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`获取二维码失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取二维码图片
   */
  async getQrImage() {
    try {
      // 1. 强制重新登录获取新token(避免token过期)
      await this.login();

      // 2. 获取二维码路径
      const response = await this.getQrCode();
      this.logger.log(`getQrCode返回: ${JSON.stringify(response)}`);

      // 3. 解析we-mp-rss返回的数据结构
      // 格式: { code: 0, message: 'success', data: { code: 'static/wx_qrcode.png?t=xxx', is_exists: false } }
      if (!response || response.code !== 0 || !response.data || !response.data.code) {
        throw new Error('未获取到二维码路径');
      }

      // 4. 从路径中提取完整路径(包含时间戳)
      const qrPath = response.data.code; // static/wx_qrcode.png?t=xxx
      this.logger.log(`二维码路径: ${qrPath}`);

      // 5. 轮询等待二维码文件生成(最多等待30秒)
      const headers = await this.getHeaders();
      const maxAttempts = 30; // 最多尝试30次
      const delayMs = 1000; // 每次间隔1秒

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // 使用HEAD请求检查文件是否存在
          await this.axiosInstance.head(`/${qrPath}`, { headers });
          this.logger.log(`二维码文件已生成(第${attempt}次检查)`);
          break; // 文件存在,跳出循环
        } catch (error) {
          if (error.response?.status === 404) {
            // 文件不存在,继续等待
            if (attempt < maxAttempts) {
              this.logger.log(`二维码文件尚未生成,等待1秒后重试(${attempt}/${maxAttempts})`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
              throw new Error('等待二维码文件生成超时');
            }
          } else {
            // 其他错误,直接抛出
            throw error;
          }
        }
      }

      // 6. 获取二维码图片
      const imageResponse = await this.axiosInstance.get(`/${qrPath}`, {
        headers,
        responseType: 'arraybuffer',
      });

      this.logger.log(`二维码图片大小: ${imageResponse.data.length} bytes`);
      return imageResponse.data;
    } catch (error) {
      this.logger.error(`获取二维码图片失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查二维码扫描状态
   */
  async checkQrStatus() {
    try {
      const headers = await this.getHeaders();

      const response = await this.axiosInstance.get(
        '/api/v1/wx/auth/qr/status',
        {
          headers,
        },
      );

      // we-mp-rss返回格式: { code: 0, message: 'success', data: { login_status: true/false } }
      // 转换为前端期望的格式: { code: 0, message: 'success', data: { status: 'confirmed' | 'expired' } }
      const weMpRssData = response.data;
      if (weMpRssData.code === 0 && weMpRssData.data) {
        const loginStatus = weMpRssData.data.login_status;
        return {
          code: 0,
          message: 'success',
          data: {
            status: loginStatus ? 'confirmed' : 'expired',
          },
        };
      }

      return response.data;
    } catch (error) {
      this.logger.error(`检查二维码状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 搜索公众号
   * @param keyword 搜索关键词
   */
  async searchAccount(keyword: string) {
    try {
      const headers = await this.getHeaders();

      const response = await this.axiosInstance.get(
        `/api/v1/wx/mps/search/${encodeURIComponent(keyword)}`,
        {
          headers,
        },
      );

      this.logger.log(`搜索公众号成功: ${keyword}`);
      return response.data;
    } catch (error) {
      this.logger.error(`搜索公众号失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 添加公众号订阅
   * @param userId 用户ID
   * @param mpData 公众号数据
   */
  async addSubscription(
    userId: string,
    mpData: {
      mp_name: string;
      mp_id: string;
      mp_cover?: string;
      avatar?: string;
      mp_intro?: string;
    },
  ) {
    try {
      // 1. 检查用户是否已订阅
      const { data: existing } = await this.supabaseService
        .getClient()
        .from('wechat_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('mp_id', mpData.mp_id)
        .single();

      if (existing) {
        this.logger.warn(`用户 ${userId} 已订阅公众号 ${mpData.mp_name}`);
        return { success: true, message: '已订阅该公众号' };
      }

      const headers = await this.getHeaders();

      // 2. 先检查we-mp-rss中是否已有这个公众号订阅
      let existingSubscription = null;
      let standardMpId = mpData.mp_id;
      let mpCover = mpData.mp_cover || mpData.avatar; // 优先使用传入的头像
      let mpIntro = mpData.mp_intro;

      try {
        const listResponse = await this.axiosInstance.get('/api/v1/wx/mps', {
          headers,
        });
        const allSubscriptions = listResponse.data?.data?.list || [];

        // 通过mp_name查找是否已有订阅
        existingSubscription = allSubscriptions.find(
          (sub: any) => sub.mp_name === mpData.mp_name || sub.name === mpData.mp_name,
        );

        if (existingSubscription) {
          standardMpId = existingSubscription.id || existingSubscription.mp_id || mpData.mp_id;
          // 从we-mp-rss获取头像和简介
          mpCover = mpCover || existingSubscription.avatar || existingSubscription.mp_cover;
          mpIntro = mpIntro || existingSubscription.mp_intro || existingSubscription.intro;
          this.logger.log(`we-mp-rss中已存在订阅: ${mpData.mp_name}, mp_id: ${standardMpId}, avatar: ${mpCover}`);
        }
      } catch (err) {
        this.logger.warn(`查询we-mp-rss订阅列表失败: ${err.message}`);
      }

      // 3. 如果we-mp-rss中不存在,则添加订阅
      if (!existingSubscription) {
        this.logger.log(`we-mp-rss中不存在订阅,开始添加: ${mpData.mp_name}`);

        const response = await this.axiosInstance.post(
          '/api/v1/wx/mps',
          mpData,
          {
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
          },
        );

        // 重新查询获取标准格式的mp_id和头像
        try {
          const listResponse = await this.axiosInstance.get('/api/v1/wx/mps', {
            headers,
          });
          const allSubscriptions = listResponse.data?.data?.list || [];
          const subscription = allSubscriptions.find(
            (sub: any) => sub.mp_name === mpData.mp_name || sub.name === mpData.mp_name,
          );
          if (subscription) {
            standardMpId = subscription.id || subscription.mp_id || mpData.mp_id;
            // 从we-mp-rss获取头像和简介
            mpCover = mpCover || subscription.avatar || subscription.mp_cover;
            mpIntro = mpIntro || subscription.mp_intro || subscription.intro;
            this.logger.log(`找到标准格式mp_id: ${standardMpId} for ${mpData.mp_name}, avatar: ${mpCover}`);
          }
        } catch (err) {
          this.logger.warn(`获取标准格式mp_id失败,使用原始mp_id: ${err.message}`);
        }
      }

      // 4. 保存到数据库(记录用户订阅关系)
      const { error } = await this.supabaseService
        .getClient()
        .from('wechat_subscriptions')
        .insert({
          user_id: userId,
          mp_id: mpData.mp_id,
          standard_mp_id: standardMpId,
          mp_name: mpData.mp_name,
          mp_cover: mpCover,
          mp_intro: mpIntro,
        });

      if (error) {
        this.logger.error(`保存订阅到数据库失败: ${error.message}`);
        throw new Error(`保存订阅失败: ${error.message}`);
      }

      this.logger.log(`用户 ${userId} 成功添加公众号订阅: ${mpData.mp_name}`);
      return { success: true, message: '添加订阅成功', data: { mp_id: standardMpId } };
    } catch (error) {
      this.logger.error(`添加公众号订阅失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 获取订阅列表(按用户过滤)
   * @param userId 用户ID
   */
  async getSubscriptions(userId?: string) {
    return await this.executeWithRetry(async () => {
      try {
        this.logger.log('📋 正在获取订阅列表...');

        // 1. 如果没有传入userId,从we-mp-rss获取所有订阅(系统级操作)
        if (!userId) {
          const headers = await this.getHeaders();
          const response = await this.axiosInstance.get('/api/v1/wx/mps', {
            headers,
          });
          const allSubscriptions = response.data?.data?.list || [];
          this.logger.log(`✅ 成功获取订阅列表,共 ${allSubscriptions.length} 个订阅`);
          return { success: true, data: { list: allSubscriptions } };
        }

        // 2. 如果传入userId,直接从数据库读取用户的订阅(用户级操作)
        const { data: userSubscriptions, error } = await this.supabaseService
          .getClient()
          .from('wechat_subscriptions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          this.logger.error(`查询用户订阅失败: ${error.message}`);
          throw new Error(`查询用户订阅失败: ${error.message}`);
        }

        if (!userSubscriptions || userSubscriptions.length === 0) {
          this.logger.log(`用户 ${userId} 暂无订阅`);
          return { success: true, data: { list: [] } };
        }

        // 3. 从we-mp-rss获取所有订阅(用于补充头像信息)
        const headers = await this.getHeaders();
        const rssResponse = await this.axiosInstance.get('/api/v1/wx/mps', {
          headers,
        });
        const allRssSubscriptions = rssResponse.data?.data?.list || [];

        // 4. 将数据库记录转换为前端需要的格式,并补充头像信息
        const formattedSubscriptions = userSubscriptions.map((sub) => {
          // 在we-mp-rss中查找对应的订阅,获取头像
          const rssSubscription = allRssSubscriptions.find(
            (rssSub: any) =>
              rssSub.mp_name === sub.mp_name ||
              rssSub.name === sub.mp_name ||
              rssSub.id === sub.standard_mp_id ||
              rssSub.mp_id === sub.standard_mp_id
          );

          const avatar = sub.mp_cover || rssSubscription?.avatar || rssSubscription?.mp_cover;

          return {
            id: sub.mp_id,
            mp_id: sub.mp_id,
            mp_name: sub.mp_name,
            avatar: avatar,
            mp_cover: avatar,
            mp_intro: sub.mp_intro || rssSubscription?.mp_intro || rssSubscription?.intro,
          };
        });

        this.logger.log(
          `✅ 用户 ${userId} 的订阅列表,共 ${formattedSubscriptions.length} 个订阅`,
        );

        return {
          success: true,
          data: { list: formattedSubscriptions },
        };
      } catch (error) {
        this.logger.error(`❌ 获取订阅列表失败: ${error.message}`);
        if (error.response) {
          this.logger.error(`   状态码: ${error.response.status}`);
          this.logger.error(
            `   响应数据: ${JSON.stringify(error.response.data)}`,
          );
        }
        throw error;
      }
    });
  }

  /**
   * 更新所有订阅的头像
   * @param userId 用户ID
   */
  async updateSubscriptionAvatars(userId: string) {
    try {
      this.logger.log(`开始更新用户 ${userId} 的订阅头像...`);

      // 1. 获取用户的所有订阅
      const { data: userSubscriptions, error: queryError } = await this.supabaseService
        .getClient()
        .from('wechat_subscriptions')
        .select('*')
        .eq('user_id', userId);

      if (queryError) {
        this.logger.error(`查询用户订阅失败: ${queryError.message}`);
        throw new Error(`查询用户订阅失败: ${queryError.message}`);
      }

      if (!userSubscriptions || userSubscriptions.length === 0) {
        this.logger.log(`用户 ${userId} 暂无订阅`);
        return { success: true, message: '暂无订阅需要更新' };
      }

      // 2. 从we-mp-rss获取所有订阅(包含头像信息)
      const headers = await this.getHeaders();
      const listResponse = await this.axiosInstance.get('/api/v1/wx/mps', {
        headers,
      });
      const allSubscriptions = listResponse.data?.data?.list || [];

      // 3. 更新每个订阅的头像
      let updated = 0;
      for (const userSub of userSubscriptions) {
        // 在we-mp-rss中查找对应的订阅
        const rssSubscription = allSubscriptions.find(
          (sub: any) =>
            sub.mp_name === userSub.mp_name ||
            sub.name === userSub.mp_name ||
            sub.id === userSub.standard_mp_id ||
            sub.mp_id === userSub.standard_mp_id
        );

        if (rssSubscription) {
          const newAvatar = rssSubscription.avatar || rssSubscription.mp_cover;
          const newIntro = rssSubscription.mp_intro || rssSubscription.intro;

          // 只有当头像或简介有变化时才更新
          if (newAvatar !== userSub.mp_cover || newIntro !== userSub.mp_intro) {
            const { error: updateError } = await this.supabaseService
              .getClient()
              .from('wechat_subscriptions')
              .update({
                mp_cover: newAvatar,
                mp_intro: newIntro,
              })
              .eq('user_id', userId)
              .eq('mp_id', userSub.mp_id);

            if (updateError) {
              this.logger.error(`更新订阅 ${userSub.mp_name} 失败: ${updateError.message}`);
            } else {
              this.logger.log(`✅ 更新订阅 ${userSub.mp_name} 的头像: ${newAvatar}`);
              updated++;
            }
          }
        } else {
          this.logger.warn(`在we-mp-rss中未找到订阅: ${userSub.mp_name}`);
        }
      }

      this.logger.log(`✅ 头像更新完成,共更新 ${updated} 个订阅`);
      return {
        success: true,
        message: `成功更新 ${updated} 个订阅的头像`,
        updated,
      };
    } catch (error) {
      this.logger.error(`更新订阅头像失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 删除公众号订阅
   * @param userId 用户ID
   * @param mpId 公众号ID
   */
  async deleteSubscription(userId: string, mpId: string) {
    try {
      // 1. 检查权限 - 只能删除自己的订阅
      const { data: subscription } = await this.supabaseService
        .getClient()
        .from('wechat_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('mp_id', mpId)
        .single();

      if (!subscription) {
        this.logger.warn(`用户 ${userId} 无权删除订阅 ${mpId}`);
        throw new Error('无权删除该订阅');
      }

      // 2. 从数据库删除用户订阅关系
      // 注意: 不删除we-mp-rss中的订阅,因为其他用户可能还在使用
      const { error } = await this.supabaseService
        .getClient()
        .from('wechat_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('mp_id', mpId);

      if (error) {
        this.logger.error(`从数据库删除订阅失败: ${error.message}`);
        throw new Error(`删除订阅失败: ${error.message}`);
      }

      this.logger.log(`用户 ${userId} 成功删除公众号订阅: ${mpId}`);
      return { success: true, message: '删除订阅成功' };
    } catch (error) {
      this.logger.error(`删除公众号订阅失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 手动触发更新
   * @param mpId 公众号ID
   */
  async triggerUpdate(mpId: string) {
    return await this.executeWithRetry(async () => {
      try {
        const headers = await this.getHeaders();

        this.logger.log(`🔄 触发公众号更新: ${mpId}`);
        const response = await this.axiosInstance.get(
          `/api/v1/wx/mps/update/${mpId}`,
          {
            headers,
          },
        );

        this.logger.log(`✅ 成功触发更新: ${mpId}`);
        return response.data;
      } catch (error) {
        this.logger.error(`❌ 触发更新失败: ${error.message}`);
        if (error.response) {
          this.logger.error(`   状态码: ${error.response.status}`);
        }
        throw error;
      }
    });
  }

  /**
   * 获取文章列表
   * @param mpId 公众号ID (可选)
   * @param page 页码
   * @param pageSize 每页数量
   */
  async getArticles(mpId?: string, page: number = 0, pageSize: number = 10) {
    return await this.executeWithRetry(async () => {
      try {
        const headers = await this.getHeaders();

        const offset = page * pageSize; // 计算偏移量

        // 构建params对象,只在mpId有值时才添加mp_id参数
        const params: any = {
          offset: offset,  // 使用offset而不是page
          limit: pageSize,  // 使用limit而不是pageSize
        };

        if (mpId) {
          params.mp_id = mpId;
        }

        // 添加详细日志
        this.logger.log(`📄 调用getArticles - mpId: ${mpId || '全部'}, page: ${page}, pageSize: ${pageSize}`);
        this.logger.log(`   请求参数: ${JSON.stringify(params)}`);

        const response = await this.axiosInstance.get(
          '/api/v1/wx/articles',
          {
            params,
            headers,
          },
        );

        // we-mp-rss返回格式: { code: 0, message: "success", data: { list: [...], total: 57 } }
        const articleCount = response.data?.data?.list?.length || 0;
        const total = response.data?.data?.total || 0;
        this.logger.log(`✅ 获取文章成功,返回 ${articleCount} 篇文章,总数: ${total}`);
        return response.data;
      } catch (error) {
        this.logger.error(`❌ 获取文章列表失败: ${error.message}`);
        if (error.response) {
          this.logger.error(`   状态码: ${error.response.status}`);
          this.logger.error(`   响应数据: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }
    });
  }

  /**
   * 获取文章详情
   * @param articleId 文章ID
   */
  async getArticleDetail(articleId: string) {
    try {
      const headers = await this.getHeaders();

      const response = await this.axiosInstance.get(
        `/api/v1/wx/articles/${articleId}`,
        {
          headers,
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error(`获取文章详情失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查we-mp-rss服务状态
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.weMpRssUrl}/api/v1/wx/sys/base_info`);
      return { status: 'ok', data: response.data };
    } catch (error) {
      this.logger.error(`we-mp-rss服务不可用: ${error.message}`);
      return { status: 'error', message: error.message };
    }
  }

  /**
   * 手动更新公众号文章
   * @param mpId 公众号ID
   * @param startPage 起始页(默认0)
   * @param endPage 结束页(默认10,爬取10页)
   */
  async updateMpArticles(mpId: string, startPage: number = 0, endPage: number = 10) {
    try {
      await this.ensureLoggedIn();

      this.logger.log(`开始手动更新公众号文章: ${mpId}, 页数: ${startPage}-${endPage}`);

      const response = await this.axiosInstance.get(
        `/api/v1/wx/mps/update/${mpId}`,
        {
          params: {
            start_page: startPage,
            end_page: endPage,
          },
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        },
      );

      this.logger.log(`成功触发公众号文章更新: ${mpId}`);
      // 直接返回we-mp-rss的响应数据,避免双层嵌套
      return response.data;
    } catch (error) {
      this.logger.error(`更新公众号文章失败: ${error.message}`);

      // 处理axios错误响应
      if (error.response) {
        // 服务器返回了错误状态码
        const errorData = error.response.data;
        return {
          code: errorData.code || -1,
          message: errorData.message || error.message || '更新失败',
          data: errorData.data || null,
        };
      }

      // 其他错误
      return {
        code: -1,
        message: error.message || '更新失败',
        data: null,
      };
    }
  }
}

