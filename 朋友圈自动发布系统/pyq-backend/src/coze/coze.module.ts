import { Module } from '@nestjs/common';
import { CozeController } from './coze.controller';
import { CozeService } from './coze.service';

@Module({
  controllers: [CozeController],
  providers: [CozeService],
  exports: [CozeService],
})
export class CozeModule {}

