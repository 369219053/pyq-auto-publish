import { Module, forwardRef } from '@nestjs/common';
import { PuppeteerService } from './puppeteer.service';
import { PublishModule } from '../publish/publish.module';
import { DuixueqiuAccountsModule } from '../duixueqiu-accounts/duixueqiu-accounts.module';

@Module({
  imports: [
    forwardRef(() => PublishModule),
    DuixueqiuAccountsModule,
  ],
  providers: [PuppeteerService],
  exports: [PuppeteerService],
})
export class PuppeteerModule {}

