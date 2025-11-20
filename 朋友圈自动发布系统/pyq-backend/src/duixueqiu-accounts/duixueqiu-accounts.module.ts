import { Module } from '@nestjs/common';
import { DuixueqiuAccountsController } from './duixueqiu-accounts.controller';
import { DuixueqiuAccountsService } from './duixueqiu-accounts.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [DuixueqiuAccountsController],
  providers: [DuixueqiuAccountsService],
  exports: [DuixueqiuAccountsService],
})
export class DuixueqiuAccountsModule {}

