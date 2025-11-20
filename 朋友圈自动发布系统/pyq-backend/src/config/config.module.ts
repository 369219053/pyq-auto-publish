import { Module, forwardRef } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';
import { SupabaseService } from '../common/supabase.service';
import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({
  imports: [forwardRef(() => SchedulerModule)],
  controllers: [ConfigController],
  providers: [ConfigService, SupabaseService],
  exports: [ConfigService],
})
export class ConfigModule {}

