import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 文章管理控制器
 */
@Controller('articles')
@UseGuards(JwtAuthGuard)
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  /**
   * 获取文章列表
   * GET /api/articles?page=1&pageSize=20&account_id=xxx&status=xxx
   */
  @Get()
  async getArticles(
    @Request() req,
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Query('account_id') accountId?: string,
    @Query('accountId') accountIdCamel?: string,
    @Query('status') status?: string,
  ) {
    // 支持两种参数名: account_id 和 accountId
    const finalAccountId = accountId || accountIdCamel;

    // 提取userId
    const userId = req.user?.userId;

    return this.articlesService.getArticles(
      parseInt(page),
      parseInt(pageSize),
      finalAccountId,
      status,
      userId, // 传递userId
    );
  }

  /**
   * 获取文章详情
   * GET /api/articles/:id
   */
  @Get(':id')
  async getArticleById(@Param('id') id: string) {
    const article = await this.articlesService.getArticleById(id);
    return {
      success: true,
      data: article,
    };
  }

  /**
   * 删除文章
   * DELETE /api/articles/:id
   */
  @Delete(':id')
  async deleteArticle(@Param('id') id: string) {
    return this.articlesService.deleteArticle(id);
  }

  /**
   * 获取公众号列表
   * GET /api/articles/accounts/list
   */
  @Get('accounts/list')
  async getAccounts() {
    return this.articlesService.getAccounts();
  }

  /**
   * 获取统计信息
   * GET /api/articles/statistics/summary
   */
  @Get('statistics/summary')
  async getStatistics() {
    return this.articlesService.getStatistics();
  }
}

