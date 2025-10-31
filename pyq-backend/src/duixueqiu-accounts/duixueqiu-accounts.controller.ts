import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DuixueqiuAccountsService } from './duixueqiu-accounts.service';

@Controller('duixueqiu-accounts')
export class DuixueqiuAccountsController {
  private readonly logger = new Logger(DuixueqiuAccountsController.name);
  // 堆雪球账号管理API

  constructor(private readonly duixueqiuAccountsService: DuixueqiuAccountsService) {}

  /**
   * 获取所有堆雪球账号
   */
  @Get()
  async getAccounts(@Query('userId') userId: string) {
    try {
      // userId现在是UUID字符串,不需要转换
      if (!userId) {
        throw new Error('userId参数缺失');
      }
      const accounts = await this.duixueqiuAccountsService.getAccounts(userId);
      return {
        success: true,
        data: accounts,
      };
    } catch (error) {
      this.logger.error(`获取堆雪球账号失败: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || '获取堆雪球账号失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 添加堆雪球账号
   */
  @Post()
  async addAccount(@Body() body: {
    userId?: string;  // 改为string类型(UUID)
    username: string;
    password: string;
  }) {
    try {
      // userId现在是UUID字符串
      if (!body.userId) {
        throw new Error('userId参数缺失');
      }

      const account = await this.duixueqiuAccountsService.addAccount(body.userId, {
        username: body.username,
        password: body.password,
      });

      return {
        success: true,
        data: account,
        message: '堆雪球账号添加成功',
      };
    } catch (error) {
      this.logger.error(`添加堆雪球账号失败: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || '添加堆雪球账号失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 更新堆雪球账号
   */
  @Put(':id')
  async updateAccount(
    @Param('id') id: string,
    @Body() body: {
      userId?: string;  // 改为string类型(UUID)
      username?: string;
      password?: string;
    }
  ) {
    try {
      // userId现在是UUID字符串
      if (!body.userId) {
        throw new Error('userId参数缺失');
      }

      const account = await this.duixueqiuAccountsService.updateAccount(
        body.userId,
        parseInt(id),
        {
          username: body.username,
          password: body.password,
        }
      );

      return {
        success: true,
        data: account,
        message: '堆雪球账号更新成功',
      };
    } catch (error) {
      this.logger.error(`更新堆雪球账号失败: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || '更新堆雪球账号失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 删除堆雪球账号
   */
  @Delete(':id')
  async deleteAccount(
    @Param('id') id: string,
    @Query('userId') userId: string
  ) {
    try {
      // userId现在是UUID字符串
      if (!userId) {
        throw new Error('userId参数缺失');
      }
      const result = await this.duixueqiuAccountsService.deleteAccount(userId, parseInt(id));

      return {
        success: true,
        message: '堆雪球账号删除成功',
      };
    } catch (error) {
      this.logger.error(`删除堆雪球账号失败: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || '删除堆雪球账号失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取默认堆雪球账号
   */
  @Get('default')
  async getDefaultAccount(@Query('userId') userId: string) {
    try {
      // userId现在是UUID字符串
      if (!userId) {
        throw new Error('userId参数缺失');
      }
      const account = await this.duixueqiuAccountsService.getDefaultAccount(userId);

      return {
        success: true,
        data: account,
      };
    } catch (error) {
      this.logger.error(`获取默认堆雪球账号失败: ${error.message}`, error.stack);
      throw new HttpException(
        error.message || '获取默认堆雪球账号失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

