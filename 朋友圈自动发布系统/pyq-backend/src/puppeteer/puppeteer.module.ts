import { Module, forwardRef } from '@nestjs/common';
import { PuppeteerService } from './puppeteer.service';
import { TaskQueueService } from './task-queue.service';
import { PublishModule } from '../publish/publish.module';
import { DuixueqiuAccountsModule } from '../duixueqiu-accounts/duixueqiu-accounts.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports: [
    forwardRef(() => PublishModule),
    forwardRef(() => AutomationModule), // 使用forwardRef避免循环依赖
    DuixueqiuAccountsModule,
  ],
  providers: [PuppeteerService, TaskQueueService],
  exports: [PuppeteerService, TaskQueueService],
})
export class PuppeteerModule {}

