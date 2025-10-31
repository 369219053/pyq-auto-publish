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

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.supabase = createClient(supabaseUrl, supabaseKey);
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
}

