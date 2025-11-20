import { Controller, Get, Post, Body, UseGuards, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from './config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SchedulerService } from '../scheduler/scheduler.service';

@Controller('config')
@UseGuards(JwtAuthGuard)
export class ConfigController {
  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SchedulerService))
    private readonly schedulerService: SchedulerService,
  ) {}

  /**
   * 获取所有配置
   */
  @Get()
  async getAllConfigs() {
    const configs = await this.configService.getAllConfigs();
    return {
      success: true,
      data: configs,
    };
  }

  /**
   * 获取同步间隔
   */
  @Get('sync-interval')
  async getSyncInterval() {
    const interval = await this.configService.getSyncInterval();
    return {
      success: true,
      data: {
        interval_minutes: interval,
      },
    };
  }

  /**
   * 设置同步间隔
   */
  @Post('sync-interval')
  async setSyncInterval(@Body() body: { interval_minutes: number }) {
    const { interval_minutes } = body;

    if (!interval_minutes || interval_minutes < 1) {
      return {
        success: false,
        message: '同步间隔必须大于0分钟',
      };
    }

    const success = await this.configService.setSyncInterval(interval_minutes);

    if (success) {
      // 更新定时任务的间隔
      await this.schedulerService.updateSyncInterval(interval_minutes);
    }

    return {
      success,
      message: success ? '同步间隔设置成功,定时任务已重启' : '同步间隔设置失败',
    };
  }
}
