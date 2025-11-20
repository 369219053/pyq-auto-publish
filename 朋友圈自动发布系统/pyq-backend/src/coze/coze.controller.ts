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
import { CozeService } from './coze.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('coze')
@UseGuards(JwtAuthGuard)
export class CozeController {
  constructor(private readonly cozeService: CozeService) {}

  /**
   * 文案转写接口
   */
  @Post('rewrite')
  async rewrite(
    @Body()
    body: {
      content: string;
      images?: string[];
      articleId?: string;
    },
    @Request() req,
  ) {
    try {
      const userId = req.user?.userId || 'anonymous';

      if (!body.content) {
        throw new HttpException('内容不能为空', HttpStatus.BAD_REQUEST);
      }

      // 并发调用3次Coze AI,生成3个不同版本
      const rewritePromises = [
        this.cozeService.rewriteContent(body.content, userId),
        this.cozeService.rewriteContent(body.content, userId),
        this.cozeService.rewriteContent(body.content, userId),
      ];

      const [version1, version2, version3] =
        await Promise.all(rewritePromises);

      // 保存转写历史(保存第一个版本)
      const history = await this.cozeService.saveRewriteHistory({
        userId,
        articleId: body.articleId,
        originalContent: body.content,
        originalImages: body.images || [],
        rewrittenContent: version1,
        selectedImages: body.images || [],
      });

      return {
        success: true,
        data: {
          version1,
          version2,
          version3,
          historyId: history.id,
        },
        message: '转写成功',
      };
    } catch (error) {
      throw new HttpException(
        error.message || '转写失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取转写历史
   */
  @Get('history')
  async getHistory(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '20',
    @Request() req,
  ) {
    try {
      const userId = req.user?.userId || 'anonymous';
      const result = await this.cozeService.getRewriteHistory(
        userId,
        parseInt(page),
        parseInt(pageSize),
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new HttpException(
        error.message || '获取历史失败',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

