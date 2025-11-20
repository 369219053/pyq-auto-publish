import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { SupabaseService } from '../common/supabase.service';

@Module({
  controllers: [ArticlesController],
  providers: [ArticlesService, SupabaseService],
  exports: [ArticlesService],
})
export class ArticlesModule {}

