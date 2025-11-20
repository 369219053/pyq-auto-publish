import { Module } from '@nestjs/common';
import { WechatMonitorController } from './wechat-monitor.controller';
import { WechatMonitorService } from './wechat-monitor.service';
import { WeMpRssService } from './we-mp-rss.service';
import { ArticlesModule } from '../articles/articles.module';

@Module({
  imports: [ArticlesModule],
  controllers: [WechatMonitorController],
  providers: [WechatMonitorService, WeMpRssService],
  exports: [WechatMonitorService, WeMpRssService],
})
export class WechatMonitorModule {}

