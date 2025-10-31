import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { WechatMonitorModule } from './wechat-monitor/wechat-monitor.module';
import { ArticlesModule } from './articles/articles.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { ConfigModule } from './config/config.module';
import { CozeModule } from './coze/coze.module';
import { PublishModule } from './publish/publish.module';
import { PuppeteerModule } from './puppeteer/puppeteer.module';
import { StorageModule } from './storage/storage.module';
import { CollectionModule } from './collection/collection.module';
import { AutomationModule } from './automation/automation.module';
import { DuixueqiuAccountsModule } from './duixueqiu-accounts/duixueqiu-accounts.module';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true, // 使配置在整个应用中可用
      envFilePath: '.env',
    }),
    CommonModule,
    AuthModule,
    UsersModule,
    WechatMonitorModule,
    ArticlesModule,
    SchedulerModule,
    ConfigModule,
    CozeModule,
    PublishModule,
    PuppeteerModule,
    StorageModule,
    CollectionModule,
    AutomationModule,
    DuixueqiuAccountsModule,
  ],
})
export class AppModule {}

