import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class CozeService {
  private readonly logger = new Logger(CozeService.name);
  private readonly cozeApiKey: string;
  private readonly cozeBotId: string;
  private readonly cozeApiUrl = 'https://api.coze.cn/v3/chat';
  private readonly supabase;

  constructor(private configService: ConfigService) {
    // Coze配置
    this.cozeApiKey = 'sat_IypG3mLLmm4m1qaRx6qK4E0HpKN6z910uZlEuU9xzLKRja92fpeEVH4EcKsM0y9D';
    this.cozeBotId = '7564586994702762027';

    // Supabase配置
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * 调用Coze AI进行文案转写
   */
  async rewriteContent(content: string, userId: string): Promise<string> {
    try {
      this.logger.log(`开始调用Coze AI转写文案,用户ID: ${userId}`);

      // 第一步: 创建对话
      const createResponse = await axios.post(
        this.cozeApiUrl,
        {
          bot_id: this.cozeBotId,
          user_id: userId,
          stream: false,
          additional_messages: [
            {
              role: 'user',
              content: content,
              content_type: 'text',
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.cozeApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      this.logger.log('Coze API创建对话成功');
      this.logger.log('Coze API响应数据:', JSON.stringify(createResponse.data, null, 2));

      const conversationId = createResponse.data?.data?.conversation_id;
      const chatId = createResponse.data?.data?.id;

      if (!conversationId || !chatId) {
        this.logger.error('无法从响应中获取conversation_id或chat_id');
        this.logger.error('响应结构:', createResponse.data);
        throw new Error('未能获取conversation_id或chat_id');
      }

      this.logger.log(
        `对话ID: ${conversationId}, Chat ID: ${chatId}, 开始轮询获取结果...`,
      );

      // 第二步: 轮询获取对话结果
      const maxRetries = 30; // 最多轮询30次
      const retryInterval = 2000; // 每2秒轮询一次

      for (let i = 0; i < maxRetries; i++) {
        await new Promise((resolve) => setTimeout(resolve, retryInterval));

        const retrieveResponse = await axios.get(
          `https://api.coze.cn/v3/chat/retrieve?conversation_id=${conversationId}&chat_id=${chatId}`,
          {
            headers: {
              Authorization: `Bearer ${this.cozeApiKey}`,
            },
          },
        );

        const status = retrieveResponse.data?.data?.status;
        this.logger.log(`轮询第${i + 1}次, 状态: ${status}`);

        if (status === 'completed') {
          // 对话完成,获取消息列表
          const messagesResponse = await axios.get(
            `https://api.coze.cn/v3/chat/message/list?conversation_id=${conversationId}&chat_id=${chatId}`,
            {
              headers: {
                Authorization: `Bearer ${this.cozeApiKey}`,
              },
            },
          );

          const messages = messagesResponse.data?.data || [];
          this.logger.log(`获取到${messages.length}条消息`);

          // 查找assistant的回复
          const answerMessage = messages.find(
            (msg: any) => msg.role === 'assistant' && msg.type === 'answer',
          );

          if (answerMessage && answerMessage.content) {
            this.logger.log('成功获取转写结果');
            return answerMessage.content;
          }

          throw new Error('未能从消息列表中找到转写结果');
        } else if (status === 'failed') {
          const errorMsg =
            retrieveResponse.data?.data?.last_error?.msg || '未知错误';
          throw new Error(`Coze AI转写失败: ${errorMsg}`);
        }
      }

      throw new Error('转写超时,请稍后重试');
    } catch (error) {
      this.logger.error('调用Coze API失败', error);
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Coze API调用失败: ${error.response?.data?.msg || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * 保存转写历史到数据库
   */
  async saveRewriteHistory(data: {
    userId: string;
    articleId?: string;
    originalContent: string;
    originalImages: string[];
    rewrittenContent: string;
    selectedImages: string[];
  }): Promise<any> {
    try {
      const { data: result, error } = await this.supabase
        .from('rewrite_history')
        .insert({
          user_id: data.userId,
          article_id: data.articleId,
          original_content: data.originalContent,
          original_images: data.originalImages,
          rewritten_content: data.rewrittenContent,
          selected_images: data.selectedImages,
          coze_workflow_id: this.cozeBotId,
          status: 'completed',
        })
        .select()
        .single();

      if (error) {
        this.logger.error('保存转写历史失败', error);
        throw new Error(`保存转写历史失败: ${error.message}`);
      }

      this.logger.log(`转写历史保存成功,ID: ${result.id}`);
      return result;
    } catch (error) {
      this.logger.error('保存转写历史异常', error);
      throw error;
    }
  }

  /**
   * 获取转写历史列表
   */
  async getRewriteHistory(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ): Promise<any> {
    try {
      const offset = (page - 1) * pageSize;

      const { data, error, count } = await this.supabase
        .from('rewrite_history')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        throw new Error(`获取转写历史失败: ${error.message}`);
      }

      return {
        data,
        total: count,
        page,
        pageSize,
      };
    } catch (error) {
      this.logger.error('获取转写历史失败', error);
      throw error;
    }
  }
}

