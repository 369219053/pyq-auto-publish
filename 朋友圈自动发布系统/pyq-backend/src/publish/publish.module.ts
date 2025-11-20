import { Module, forwardRef } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { PuppeteerModule } from '../puppeteer/puppeteer.module';

@Module({
  imports: [forwardRef(() => PuppeteerModule)],
  controllers: [PublishController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}

