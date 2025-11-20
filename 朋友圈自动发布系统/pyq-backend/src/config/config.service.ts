import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * 获取配置值
   */
  async getConfig(key: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('monitor_config')
        .select('config_value')
        .eq('config_key', key)
        .single();

      if (error) {
        this.logger.error(`获取配置失败: ${error.message}`);
        return null;
      }

      return data?.config_value || null;
    } catch (error) {
      this.logger.error(`获取配置异常: ${error.message}`);
      return null;
    }
  }

  /**
   * 设置配置值
   */
  async setConfig(key: string, value: string, description?: string): Promise<boolean> {
    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('monitor_config')
        .upsert(
          {
            config_key: key,
            config_value: value,
            description: description || '',
          },
          {
            onConflict: 'config_key',  // 指定冲突字段
          }
        );

      if (error) {
        this.logger.error(`设置配置失败: ${error.message}`);
        return false;
      }

      this.logger.log(`配置已更新: ${key} = ${value}`);
      return true;
    } catch (error) {
      this.logger.error(`设置配置异常: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取所有配置
   */
  async getAllConfigs(): Promise<any[]> {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('monitor_config')
        .select('*')
        .order('config_key');

      if (error) {
        this.logger.error(`获取所有配置失败: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (error) {
      this.logger.error(`获取所有配置异常: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取同步间隔(分钟)
   */
  async getSyncInterval(): Promise<number> {
    const value = await this.getConfig('sync_interval_minutes');
    return value ? parseInt(value, 10) : 30; // 默认30分钟
  }

  /**
   * 设置同步间隔(分钟)
   */
  async setSyncInterval(minutes: number): Promise<boolean> {
    return this.setConfig(
      'sync_interval_minutes',
      minutes.toString(),
      '自动同步文章的时间间隔(分钟)',
    );
  }
}

