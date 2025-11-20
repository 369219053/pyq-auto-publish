import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { SupabaseService } from '../common/supabase.service';

@Module({
  providers: [UsersService, SupabaseService],
  exports: [UsersService],
})
export class UsersModule {}

