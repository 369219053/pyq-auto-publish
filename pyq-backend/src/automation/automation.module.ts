import { Module, forwardRef } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { FollowCircleService } from './follow-circle.service';
import { AutomationGateway } from './automation.gateway';
import { CollectionModule } from '../collection/collection.module';
import { CozeModule } from '../coze/coze.module';
import { PublishModule } from '../publish/publish.module';
import { ArticlesModule } from '../articles/articles.module';
import { PuppeteerModule } from '../puppeteer/puppeteer.module';
import { Pool } from 'pg';

@Module({
  imports: [
    CollectionModule,
    CozeModule,
    forwardRef(() => PublishModule),
    ArticlesModule,
    PuppeteerModule,
  ],
  controllers: [AutomationController],
  providers: [
    AutomationService,
    FollowCircleService,
    AutomationGateway,
    {
      provide: 'DATABASE_POOL',
      useFactory: () => {
        return new Pool({
          connectionString: process.env.DATABASE_URL,
        });
      },
    },
  ],
  exports: [AutomationService, FollowCircleService, AutomationGateway],
})
export class AutomationModule {}

