import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';

@Injectable()
export class DuixueqiuAccountsService implements OnModuleInit {
  private readonly logger = new Logger(DuixueqiuAccountsService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async onModuleInit() {
    await this.checkTable();
  }

  /**
   * 检查堆雪球账号表是否存在
   */
  private async checkTable() {
    try {
      this.logger.log('🚀 检查堆雪球账号表...');

      const client = this.supabaseService.getClient();

      // 检查表是否存在
      const { data, error } = await client
        .from('duixueqiu_accounts')
        .select('id')
        .limit(1);

      if (error) {
        this.logger.warn('⚠️ duixueqiu_accounts表不存在,请在Supabase中手动创建');
        this.logger.warn('SQL: CREATE TABLE duixueqiu_accounts (id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, account_name VARCHAR(100) NOT NULL, username VARCHAR(100) NOT NULL, password TEXT NOT NULL, is_default BOOLEAN DEFAULT false, status VARCHAR(20) DEFAULT \'active\', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);');
      } else {
        this.logger.log('✅ duixueqiu_accounts表已存在');
      }
    } catch (error) {
      this.logger.error(`检查堆雪球账号表失败: ${error.message}`);
    }
  }

  /**
   * 获取用户的所有堆雪球账号
   */
  async getAccounts(userId: string) {  // 改为string类型(UUID)
    const { data, error } = await this.supabaseService.getClient()
      .from('duixueqiu_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`获取堆雪球账号失败: ${error.message}`);
    }

    return data;
  }

  /**
   * 添加堆雪球账号
   * 限制:每个用户只能配置一个堆雪球账号
   */
  async addAccount(userId: string, accountData: {  // 改为string类型(UUID)
    username: string;
    password: string;
  }) {
    // 检查用户是否已经有堆雪球账号
    const existingAccounts = await this.getAccounts(userId);
    if (existingAccounts.length > 0) {
      throw new Error('每个用户只能配置一个堆雪球账号,请先删除现有账号');
    }

    const { data, error } = await this.supabaseService.getClient()
      .from('duixueqiu_accounts')
      .insert({
        user_id: userId,
        account_name: accountData.username,  // 账号名称使用用户名
        username: accountData.username,  // 修正字段名
        password: accountData.password,  // 修正字段名 TODO: 加密存储
      })
      .select()
      .single();

    if (error) {
      throw new Error(`添加堆雪球账号失败: ${error.message}`);
    }

    return data;
  }

  /**
   * 更新堆雪球账号
   */
  async updateAccount(userId: string, accountId: number, accountData: {  // userId改为string类型(UUID)
    username?: string;
    password?: string;
  }) {
    const updateData: any = {};

    if (accountData.username) updateData.username = accountData.username;  // 修正字段名
    if (accountData.password) updateData.password = accountData.password;  // 修正字段名 TODO: 加密存储

    const { data, error } = await this.supabaseService.getClient()
      .from('duixueqiu_accounts')
      .update(updateData)
      .eq('id', accountId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`更新堆雪球账号失败: ${error.message}`);
    }

    return data;
  }

  /**
   * 删除堆雪球账号
   */
  async deleteAccount(userId: string, accountId: number) {  // userId改为string类型(UUID)
    const { error } = await this.supabaseService.getClient()
      .from('duixueqiu_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`删除堆雪球账号失败: ${error.message}`);
    }

    return { success: true };
  }

  /**
   * 获取第一个堆雪球账号(作为默认账号)
   */
  async getDefaultAccount(userId: string) {  // userId改为string类型(UUID)
    const accounts = await this.getAccounts(userId);
    return accounts[0] || null;
  }

  /**
   * 获取指定账号
   */
  async getAccount(userId: string, accountId: number) {  // userId改为string类型(UUID)
    const { data, error } = await this.supabaseService.getClient()
      .from('duixueqiu_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(`获取堆雪球账号失败: ${error.message}`);
    }

    return data;
  }
}

