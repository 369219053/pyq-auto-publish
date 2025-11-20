import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { PuppeteerService } from '../puppeteer/puppeteer.service';

@Injectable()
export class PublishService implements OnModuleInit {
  private readonly logger = new Logger(PublishService.name);
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => PuppeteerService))
    private puppeteerService: PuppeteerService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async onModuleInit() {
    this.logger.log('🚀 初始化发布服务,检查数据库表...');
    await this.ensureTableExists();
  }

  /**
   * 确保publish_tasks表存在
   */
  private async ensureTableExists() {
    try {
      // 尝试查询表,如果表不存在会抛出错误
      const { error } = await this.supabase
        .from('publish_tasks')
        .select('id')
        .limit(1);

      if (error) {
        this.logger.warn('⚠️  publish_tasks表可能不存在');
        this.logger.warn('请在Supabase Dashboard中执行以下SQL:');
        this.logger.warn(`
CREATE TABLE IF NOT EXISTS publish_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  rewrite_id UUID,
  task_title VARCHAR(255),
  content TEXT NOT NULL,
  images TEXT[],
  wechat_account VARCHAR(100),
  publish_time TIMESTAMP NOT NULL,
  is_immediate BOOLEAN DEFAULT false,
  random_delay_minutes INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  duixueqiu_task_id VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_tasks_status ON publish_tasks(status);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_publish_time ON publish_tasks(publish_time);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_user_id ON publish_tasks(user_id);
        `);
      } else {
        this.logger.log('✅ publish_tasks表已存在');
      }
    } catch (error) {
      this.logger.error('检查数据库表失败:', error.message);
    }
  }

  /**
   * 创建发布任务
   */
  async createTask(taskData: {
    userId: string;
    rewriteId?: string;
    taskTitle?: string;
    content: string;
    images?: string[];
    wechatAccount?: string;
    publishTime: Date;
    isImmediate?: boolean;
    randomDelayMinutes?: number;
    visibilityRange?: string;
    selectedTags?: string[];
    comments?: string[];
    useLocation?: boolean;
    randomContent?: string;
    endTime?: Date;
  }) {
    try {
      const insertData: any = {
        user_id: taskData.userId,
        rewrite_id: taskData.rewriteId,
        task_title: taskData.taskTitle,
        content: taskData.content,
        images: taskData.images || [],
        wechat_account: taskData.wechatAccount,
        publish_time: taskData.publishTime.toISOString(),
        is_immediate: taskData.isImmediate || false,
        random_delay_minutes: taskData.randomDelayMinutes || 0,
        status: 'pending',
      };

      // 添加新字段(数据库已经添加这些字段)
      if (taskData.visibilityRange !== undefined) {
        insertData.visibility_range = taskData.visibilityRange;
      }
      if (taskData.selectedTags !== undefined) {
        insertData.selected_tags = taskData.selectedTags;
      }
      if (taskData.comments !== undefined) {
        insertData.comments = taskData.comments;
      }
      if (taskData.useLocation !== undefined) {
        insertData.use_location = taskData.useLocation;
      }
      if (taskData.randomContent !== undefined) {
        insertData.random_content = taskData.randomContent;
      }
      if (taskData.endTime !== undefined) {
        // 验证endTime是否有效
        if (taskData.endTime && !isNaN(taskData.endTime.getTime())) {
          insertData.end_time = taskData.endTime.toISOString();
        } else {
          insertData.end_time = null;
        }
      }

      const { data, error } = await this.supabase
        .from('publish_tasks')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        this.logger.error('创建发布任务失败:', error);
        throw error;
      }

      this.logger.log(`发布任务创建成功: ${data.id}`);

      // 如果是立即发布,立即执行任务
      if (taskData.isImmediate) {
        this.logger.log(`🚀 检测到立即发布任务,开始执行...`);
        // 异步执行,不阻塞返回
        this.executeTaskImmediately(data.id).catch(err => {
          this.logger.error(`立即执行任务失败: ${err.message}`);
        });
      }

      return data;
    } catch (error) {
      this.logger.error('创建发布任务异常:', error);
      throw error;
    }
  }

  /**
   * 获取待发布的任务 (仅返回定时发布的任务)
   * 立即发布的任务会在创建时直接执行,不需要轮询
   */
  async getPendingTasks() {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.supabase
        .from('publish_tasks')
        .select('*')
        .eq('status', 'pending')
        .eq('is_immediate', false)  // 只获取定时发布的任务
        .lte('publish_time', now)
        .order('publish_time', { ascending: true });

      if (error) {
        this.logger.error('获取待发布任务失败:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      this.logger.error('获取待发布任务异常:', error);
      throw error;
    }
  }

  /**
   * 更新任务状态
   */
  async updateTaskStatus(
    taskId: string,
    status: string,
    errorMessage?: string,
    duixueqiuTaskId?: string,
  ) {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      if (duixueqiuTaskId) {
        updateData.duixueqiu_task_id = duixueqiuTaskId;
      }

      const { data, error } = await this.supabase
        .from('publish_tasks')
        .update(updateData)
        .eq('id', taskId)
        .select()
        .single();

      if (error) {
        this.logger.error('更新任务状态失败:', error);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('更新任务状态异常:', error);
      throw error;
    }
  }

  /**
   * 获取用户的发布任务列表
   */
  async getUserTasks(userId: string, page = 1, pageSize = 20) {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await this.supabase
        .from('publish_tasks')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        this.logger.error('获取用户任务列表失败:', error);
        throw error;
      }

      return {
        tasks: data || [],
        total: count || 0,
        page,
        pageSize,
      };
    } catch (error) {
      this.logger.error('获取用户任务列表异常:', error);
      throw error;
    }
  }

  /**
   * 下载图片到本地
   */
  async downloadImages(imageUrls: string[]): Promise<string[]> {
    const tempDir = path.join(__dirname, '../../temp_images');

    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const localPaths: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      try {
        let imageUrl = imageUrls[i];

        // 如果是相对路径,转换为完整URL
        if (imageUrl.startsWith('/')) {
          // 使用后端服务器地址
          const baseUrl = process.env.NODE_ENV === 'production'
            ? 'https://autochat.lfdhk.com'
            : 'http://localhost:3000';
          imageUrl = `${baseUrl}${imageUrl}`;
          this.logger.log(`转换相对路径为完整URL: ${imageUrl}`);
        }

        // 从URL中提取图片格式
        let ext = '.jpg'; // 默认扩展名

        // 尝试从URL参数中提取wx_fmt参数
        const urlObj = new URL(imageUrl);
        const urlParam = urlObj.searchParams.get('url');
        if (urlParam) {
          // 解码URL参数
          const decodedUrl = decodeURIComponent(urlParam);
          // 从解码后的URL中查找wx_fmt参数
          const fmtMatch = decodedUrl.match(/wx_fmt=(\w+)/);
          if (fmtMatch) {
            const format = fmtMatch[1];
            if (format === 'png') {
              ext = '.png';
            } else if (format === 'jpeg' || format === 'jpg') {
              ext = '.jpg';
            }
          }
        }

        const filename = `image_${Date.now()}_${i}${ext}`;
        const savePath = path.join(tempDir, filename);

        this.logger.log(`下载图片: ${imageUrl} -> ${savePath}`);

        const response = await axios({
          url: imageUrl,
          method: 'GET',
          responseType: 'stream',
          timeout: 30000,
        });

        const writer = fs.createWriteStream(savePath);
        response.data.pipe(writer);

        await new Promise<void>((resolve, reject) => {
          writer.on('finish', () => resolve());
          writer.on('error', reject);
        });

        localPaths.push(savePath);
        this.logger.log(`图片下载成功: ${savePath}`);
      } catch (error) {
        this.logger.error(`下载图片失败: ${imageUrls[i]}`, error);
        throw error;
      }
    }

    return localPaths;
  }

  /**
   * 清理临时图片文件
   */
  cleanupTempImages(imagePaths: string[]) {
    for (const imagePath of imagePaths) {
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
          this.logger.log(`清理临时文件: ${imagePath}`);
        }
      } catch (error) {
        this.logger.error(`清理临时文件失败: ${imagePath}`, error);
      }
    }
  }

  /**
   * 🚀 立即执行发布任务
   */
  async executeTaskImmediately(taskId: string) {
    this.logger.log(`🚀 开始立即执行任务: ${taskId}`);

    try {
      // 1. 获取任务详情
      const { data: task, error } = await this.supabase
        .from('publish_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error || !task) {
        throw new Error(`任务不存在: ${taskId}`);
      }

      // 2. 更新任务状态为执行中
      await this.supabase
        .from('publish_tasks')
        .update({ status: 'processing' })
        .eq('id', taskId);

      // 3. 调用Puppeteer执行发布
      this.logger.log(`📝 任务内容: ${task.content}`);
      this.logger.log(`🖼️  图片数量: ${task.images?.length || 0}`);

      const result = await this.puppeteerService.publishToDuixueqiu(task);

      // 4. 更新任务状态为成功
      await this.supabase
        .from('publish_tasks')
        .update({
          status: 'completed',
          duixueqiu_task_id: result.taskId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      this.logger.log(`✅ 任务执行成功: ${taskId}`);
      return result;
    } catch (error) {
      this.logger.error(`❌ 任务执行失败: ${taskId}`, error);

      // 更新任务状态为失败
      await this.supabase
        .from('publish_tasks')
        .update({
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId);

      throw error;
    }
  }
}

