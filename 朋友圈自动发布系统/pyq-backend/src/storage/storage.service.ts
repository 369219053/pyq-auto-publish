import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import sharp from 'sharp';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private readonly bucketName = 'wechat-images';
  private readonly followCircleBucketName = 'follow-circle-images'; // 🆕 跟圈图片bucket

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.ensureFollowCircleBucketExists(); // 🆕 确保跟圈bucket存在
  }

  /**
   * 下载微信图片并上传到Supabase Storage
   * @param imageUrl 微信图片URL
   * @returns Supabase Storage中的公开URL
   */
  async downloadAndUploadWechatImage(imageUrl: string): Promise<string> {
    try {
      this.logger.log(`开始下载图片: ${imageUrl}`);

      // 1. 下载图片 (添加Referer绕过防盗链)
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        headers: {
          'Referer': 'https://mp.weixin.qq.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000,
      });

      const imageBuffer = Buffer.from(response.data);
      this.logger.log(`图片下载成功, 大小: ${imageBuffer.length} bytes`);

      // 2. 压缩图片 (目标100KB左右)
      const compressedBuffer = await sharp(imageBuffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      this.logger.log(`图片压缩完成, 压缩后大小: ${compressedBuffer.length} bytes`);

      // 3. 生成文件名
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const fileName = `wechat_${timestamp}_${randomStr}.jpg`;

      // 4. 上传到Supabase Storage
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, compressedBuffer, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });

      if (error) {
        throw new Error(`上传失败: ${error.message}`);
      }

      // 5. 获取公开URL
      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(fileName);

      this.logger.log(`图片上传成功: ${publicUrlData.publicUrl}`);
      return publicUrlData.publicUrl;
    } catch (error) {
      this.logger.error(`图片处理失败: ${imageUrl}`, error);
      throw error;
    }
  }

  /**
   * 批量下载并上传图片
   * @param imageUrls 图片URL数组
   * @returns Supabase Storage中的公开URL数组
   */
  async downloadAndUploadWechatImages(imageUrls: string[]): Promise<string[]> {
    this.logger.log(`开始批量处理 ${imageUrls.length} 张图片`);

    const results: string[] = [];

    for (const url of imageUrls) {
      try {
        const publicUrl = await this.downloadAndUploadWechatImage(url);
        results.push(publicUrl);
      } catch (error) {
        this.logger.error(`图片处理失败,跳过: ${url}`, error);
        // 失败的图片使用原URL
        results.push(url);
      }
    }

    this.logger.log(`批量处理完成, 成功: ${results.length}/${imageUrls.length}`);
    return results;
  }

  /**
   * 删除超过指定天数的旧图片
   * @param days 天数
   */
  async cleanOldImages(days: number = 7): Promise<number> {
    try {
      this.logger.log(`开始清理 ${days} 天前的图片`);

      // 1. 列出所有文件
      const { data: files, error: listError } = await this.supabase.storage
        .from(this.bucketName)
        .list();

      if (listError) {
        throw new Error(`列出文件失败: ${listError.message}`);
      }

      if (!files || files.length === 0) {
        this.logger.log('没有文件需要清理');
        return 0;
      }

      // 2. 筛选出需要删除的文件
      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
      const filesToDelete: string[] = [];

      for (const file of files) {
        // 从文件名中提取时间戳 (格式: wechat_timestamp_random.jpg)
        const match = file.name.match(/wechat_(\d+)_/);
        if (match) {
          const fileTimestamp = parseInt(match[1]);
          if (fileTimestamp < cutoffTime) {
            filesToDelete.push(file.name);
          }
        }
      }

      if (filesToDelete.length === 0) {
        this.logger.log('没有需要清理的旧文件');
        return 0;
      }

      // 3. 批量删除
      const { error: deleteError } = await this.supabase.storage
        .from(this.bucketName)
        .remove(filesToDelete);

      if (deleteError) {
        throw new Error(`删除文件失败: ${deleteError.message}`);
      }

      this.logger.log(`成功清理 ${filesToDelete.length} 个旧文件`);
      return filesToDelete.length;
    } catch (error) {
      this.logger.error('清理旧图片失败', error);
      throw error;
    }
  }

  /**
   * 确保Storage Bucket存在
   */
  async ensureBucketExists(): Promise<void> {
    try {
      // 检查bucket是否存在
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b) => b.name === this.bucketName);

      if (!bucketExists) {
        this.logger.log(`创建Storage Bucket: ${this.bucketName}`);
        const { error } = await this.supabase.storage.createBucket(this.bucketName, {
          public: true,
          fileSizeLimit: 5242880, // 5MB
        });

        if (error) {
          throw new Error(`创建Bucket失败: ${error.message}`);
        }

        this.logger.log('Bucket创建成功');
      } else {
        this.logger.log('Bucket已存在');
      }
    } catch (error) {
      this.logger.error('检查/创建Bucket失败', error);
      throw error;
    }
  }

  /**
   * 🆕 确保跟圈图片Bucket存在
   */
  async ensureFollowCircleBucketExists(): Promise<void> {
    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some((b) => b.name === this.followCircleBucketName);

      if (!bucketExists) {
        this.logger.warn(`⚠️ Bucket "${this.followCircleBucketName}" 不存在,请在Supabase控制台手动创建`);
        this.logger.warn(`📝 创建步骤: Storage -> New Bucket -> 名称: ${this.followCircleBucketName}, Public: true`);
        // 不抛出错误,允许服务继续启动
      } else {
        this.logger.log(`✅ 跟圈图片Bucket已存在: ${this.followCircleBucketName}`);
      }
    } catch (error) {
      this.logger.error('检查跟圈Bucket失败', error);
    }
  }

  /**
   * 🆕 上传Base64图片到Storage
   * @param base64Data Base64图片数据
   * @param taskGroupId 任务组ID
   * @param index 图片索引
   * @returns 图片URL
   */
  async uploadFollowCircleImage(base64Data: string, taskGroupId: string, index: number): Promise<string> {
    try {
      // 解析Base64数据
      const matches = base64Data.match(/^data:image\/(png|jpg|jpeg);base64,(.+)$/);
      if (!matches) {
        throw new Error('无效的Base64图片数据');
      }

      const ext = matches[1] === 'jpg' ? 'jpg' : matches[1];
      const base64Content = matches[2];
      const buffer = Buffer.from(base64Content, 'base64');

      // 🆕 生成安全的文件路径 - 使用纯数字和字母,避免中文
      // 从taskGroupId中提取时间戳部分 (例如: 跟圈_1762140518186 -> 1762140518186)
      const timestamp = taskGroupId.split('_').pop() || Date.now().toString();
      const fileName = `${timestamp}_${index}.${ext}`;
      const folderName = `task_${timestamp}`; // 使用task_前缀代替中文
      const filePath = `${folderName}/${fileName}`;

      // 上传到Storage
      const { error } = await this.supabase.storage
        .from(this.followCircleBucketName)
        .upload(filePath, buffer, {
          contentType: `image/${ext}`,
          upsert: false,
        });

      if (error) {
        throw new Error(`上传失败: ${error.message}`);
      }

      // 获取公开URL
      const { data: urlData } = this.supabase.storage
        .from(this.followCircleBucketName)
        .getPublicUrl(filePath);

      this.logger.log(`✅ 跟圈图片上传成功: ${fileName}, 大小: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
      return urlData.publicUrl;
    } catch (error) {
      this.logger.error(`上传跟圈图片失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🆕 批量上传跟圈图片
   * @param base64Images Base64图片数组
   * @param taskGroupId 任务组ID
   * @returns 图片URL数组
   */
  async uploadFollowCircleImages(base64Images: string[], taskGroupId: string): Promise<string[]> {
    this.logger.log(`开始上传 ${base64Images.length} 张跟圈图片...`);
    const urls: string[] = [];

    for (let i = 0; i < base64Images.length; i++) {
      const url = await this.uploadFollowCircleImage(base64Images[i], taskGroupId, i);
      urls.push(url);
    }

    this.logger.log(`✅ 批量上传完成: ${urls.length}张图片`);
    return urls;
  }

  /**
   * 🆕 从URL下载图片为Base64
   * @param url 图片URL
   * @returns Base64数据
   */
  async downloadImageAsBase64(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');

      // 根据URL判断图片类型
      const ext = url.match(/\.(png|jpg|jpeg)$/i)?.[1] || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      this.logger.error(`下载图片失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 🆕 批量下载图片为Base64
   * @param urls 图片URL数组
   * @returns Base64数组
   */
  async downloadImagesAsBase64(urls: string[]): Promise<string[]> {
    const base64Images: string[] = [];

    for (const url of urls) {
      const base64 = await this.downloadImageAsBase64(url);
      base64Images.push(base64);
    }

    return base64Images;
  }

  /**
   * 🆕 删除任务组的所有图片
   * @param taskGroupId 任务组ID
   */
  async deleteFollowCircleTaskImages(taskGroupId: string): Promise<void> {
    try {
      // 🆕 从taskGroupId提取时间戳,生成文件夹名称
      const timestamp = taskGroupId.split('_').pop() || '';
      const folderName = `task_${timestamp}`;

      // 列出该任务组的所有文件
      const { data: files, error: listError } = await this.supabase.storage
        .from(this.followCircleBucketName)
        .list(folderName);

      if (listError) {
        throw new Error(`列出文件失败: ${listError.message}`);
      }

      if (!files || files.length === 0) {
        return;
      }

      // 删除所有文件
      const filePaths = files.map(file => `${folderName}/${file.name}`);
      const { error: deleteError } = await this.supabase.storage
        .from(this.followCircleBucketName)
        .remove(filePaths);

      if (deleteError) {
        throw new Error(`删除文件失败: ${deleteError.message}`);
      }

      this.logger.log(`✅ 已删除任务组 ${taskGroupId} 的 ${files.length} 张图片`);
    } catch (error) {
      this.logger.error(`删除任务图片失败: ${error.message}`);
    }
  }

  /**
   * 🆕 清理7天前完成的跟圈任务图片
   */
  async cleanOldFollowCircleImages(): Promise<number> {
    try {
      this.logger.log('🧹 开始清理7天前的跟圈图片...');

      // 查询7天前完成的任务
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: oldTasks, error } = await this.supabase
        .from('follow_circle_tasks')
        .select('task_group_id')
        .eq('status', 'completed')
        .lt('updated_at', sevenDaysAgo.toISOString());

      if (error) {
        throw new Error(`查询旧任务失败: ${error.message}`);
      }

      if (!oldTasks || oldTasks.length === 0) {
        this.logger.log('✅ 没有需要清理的图片');
        return 0;
      }

      // 获取唯一的taskGroupId
      const taskGroupIds = [...new Set(oldTasks.map(t => t.task_group_id))];

      let deletedCount = 0;
      for (const taskGroupId of taskGroupIds) {
        await this.deleteFollowCircleTaskImages(taskGroupId);
        deletedCount++;
      }

      this.logger.log(`✅ 清理完成,共删除 ${deletedCount} 个任务组的图片`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`清理旧图片失败: ${error.message}`);
      return 0;
    }
  }
}

