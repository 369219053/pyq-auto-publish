import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../common/supabase.service';
import * as bcrypt from 'bcrypt';

export interface User {
  id: string;
  username: string;
  name: string;
  password: string;
  created_at: string;
}

@Injectable()
export class UsersService {
  constructor(private supabaseService: SupabaseService) {}

  async create(username: string, name: string, password: string): Promise<User> {
    const supabase = this.supabaseService.getClient();
    
    // 检查用户名是否已存在
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (existingUser) {
      throw new Error('用户名已存在');
    }
    
    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 创建用户
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          username,
          name,
          password: hashedPassword,
        },
      ])
      .select()
      .single();
    
    if (error) {
      throw new Error(error.message);
    }
    
    return data;
  }

  async findByUsername(username: string): Promise<User | null> {
    const supabase = this.supabaseService.getClient();
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return data;
  }

  async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}

