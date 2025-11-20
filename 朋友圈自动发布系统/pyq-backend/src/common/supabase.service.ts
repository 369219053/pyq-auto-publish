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
          // 设置数据库查询超时为120秒 (增加到2分钟)
          'x-statement-timeout': '120000',
        },
        // 增加HTTP请求超时时间
        fetch: (url: string, options: any = {}) => {
          return fetch(url, {
            ...options,
            // 设置HTTP请求超时为120秒
            signal: AbortSignal.timeout(120000),
          });
        },
      },
      // 增加超时时间到120秒
      realtime: {
        timeout: 120000,
      },
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }
}

