import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
    const supabaseKey = process.env.SUPABASE_KEY || 'your-supabase-anon-key';

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      db: {
        schema: 'public',
      },
      auth: {
        persistSession: false,
      },
      global: {
        headers: {
          'x-client-info': 'supabase-js-node',
          // 设置数据库查询超时为60秒
          'x-statement-timeout': '60000',
        },
      },
      // 增加超时时间到60秒
      realtime: {
        timeout: 60000,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
}

