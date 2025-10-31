import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage/storage.service';
import axios from 'axios';

@Injectable()
export class CollectionService {
  private readonly logger = new Logger(CollectionService.name);
  private readonly cozeWorkflowId = '7564955686342918154';
  private readonly cozeApiKey = 'sat_IypG3mLLmm4m1qaRx6qK4E0HpKN6z910uZlEuU9xzLKRja92fpeEVH4EcKsM0y9D';

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * 提取公众号文章内容
   * @param url 公众号文章链接
   * @returns 文章内容和处理后的图片URL
   */
  async extractArticle(url: string) {
    try {
      this.logger.log(`开始提取文章: ${url}`);

      // 1. 调用Coze工作流提取文章内容
      const response = await axios.post(
        'https://api.coze.cn/v1/workflow/run',
        {
          workflow_id: this.cozeWorkflowId,
          parameters: {
            input: url,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.cozeApiKey}`,
          },
          timeout: 60000,
        },
      );

      this.logger.log('Coze工作流响应:', JSON.stringify(response.data));

      // 2. 检查响应
      if (response.data.code !== 0) {
        throw new Error(response.data.msg || 'Coze工作流执行失败');
      }

      // 3. 解析返回数据
      let resultData = null;
      if (typeof response.data.data === 'string') {
        resultData = JSON.parse(response.data.data);
      } else {
        resultData = response.data.data;
      }

      this.logger.log('解析后的数据:', resultData);

      // 4. 下载并上传图片到Supabase
      let processedImages: string[] = [];
      if (resultData.image_url_list && resultData.image_url_list.length > 0) {
        this.logger.log(`开始处理 ${resultData.image_url_list.length} 张图片`);
        processedImages = await this.storageService.downloadAndUploadWechatImages(
          resultData.image_url_list,
        );
        this.logger.log(`图片处理完成, 成功: ${processedImages.length} 张`);
      }

      // 5. 返回结果
      return {
        title: resultData.output || resultData.title || '未获取到标题',
        author: resultData.author || '未知作者',
        content: resultData.content || '未获取到内容',
        images: processedImages, // 返回Supabase的图片URL
        originalImages: resultData.image_url_list || [], // 保留原始URL
      };
    } catch (error) {
      this.logger.error('提取文章失败:', error);
      throw error;
    }
  }
}

