import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PublishService } from './publish.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('publish')
@UseGuards(JwtAuthGuard)
export class PublishController {
  constructor(private readonly publishService: PublishService) {}

  /**
   * 创建发布任务
   */
  @Post('create')
  async createTask(@Body() body: any, @Request() req) {
    try {
      const userId = req.user.userId;

      // 处理发布时间:如果是立即发布或publishTime无效,使用当前时间
      let publishTime: Date;
      if (body.isImmediate || !body.publishTime) {
        publishTime = new Date();
      } else {
        publishTime = new Date(body.publishTime);
        // 验证时间是否有效
        if (isNaN(publishTime.getTime())) {
          publishTime = new Date();
        }
      }

      const task = await this.publishService.createTask({
        userId,
        rewriteId: body.rewriteId,
        taskTitle: body.taskTitle,
        content: body.content,
        images: body.images,
        wechatAccount: body.wechatAccount,
        publishTime,
        isImmediate: body.isImmediate,
        randomDelayMinutes: body.randomDelayMinutes,
        visibilityRange: body.visibilityRange,
        selectedTags: body.selectedTags,
        comments: body.comments,
        useLocation: body.useLocation,
        randomContent: body.randomContent,
        endTime: body.endTime ? new Date(body.endTime) : undefined,
      });

      // 🚀 如果是立即发布,创建任务后立即执行
      if (body.isImmediate) {
        this.publishService.executeTaskImmediately(task.id).catch((error) => {
          // 异步执行,不阻塞响应,错误会记录到数据库
          console.error('立即执行任务失败:', error);
        });
      }

      return {
        success: true,
        data: task,
        message: body.isImmediate ? '发布任务创建成功,正在执行...' : '发布任务创建成功',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '创建发布任务失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取用户的发布任务列表
   */
  @Get('tasks')
  async getTasks(@Query() query: any, @Request() req) {
    try {
      const userId = req.user.userId;
      const page = parseInt(query.page) || 1;
      const pageSize = parseInt(query.pageSize) || 20;

      const result = await this.publishService.getUserTasks(
        userId,
        page,
        pageSize,
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取任务列表失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取待发布的任务(仅用于测试)
   */
  @Get('pending')
  async getPendingTasks() {
    try {
      const tasks = await this.publishService.getPendingTasks();

      return {
        success: true,
        data: tasks,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取待发布任务失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

