import { Module, forwardRef } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { FollowCircleService } from './follow-circle.service';
import { WechatReachService } from './wechat-reach.service';
import { VideoMaterialService } from './video-material.service';
import { LinkMaterialService } from './link-material.service';
import { DuixueqiuFriendsService } from './duixueqiu-friends.service';
import { AutomationGateway } from './automation.gateway';
import { TaskQueueService } from '../puppeteer/task-queue.service';
import { CollectionModule } from '../collection/collection.module';
import { CozeModule } from '../coze/coze.module';
import { PublishModule } from '../publish/publish.module';
import { ArticlesModule } from '../articles/articles.module';
import { PuppeteerModule } from '../puppeteer/puppeteer.module';
import { StorageModule } from '../storage/storage.module'; // 🆕 导入StorageModule
import { Pool } from 'pg';

@Module({
  imports: [
    CollectionModule,
    CozeModule,
    forwardRef(() => PublishModule),
    ArticlesModule,
    forwardRef(() => PuppeteerModule), // 使用forwardRef避免循环依赖
    StorageModule, // 🆕 添加StorageModule
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    FollowCircleService,
    WechatReachService,
    VideoMaterialService,
    LinkMaterialService,
    DuixueqiuFriendsService,
    AutomationGateway,
    TaskQueueService,
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        return new Pool({
          connectionString: process.env.DATABASE_URL,
        });
      },
    },
  ],
  exports: [AutomationService, FollowCircleService, WechatReachService, VideoMaterialService, LinkMaterialService, DuixueqiuFriendsService, AutomationGateway, TaskQueueService],
})
export class AutomationModule {}

