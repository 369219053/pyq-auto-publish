import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { CollectionService } from './collection.service';

@Controller('collection')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Post('extract')
  async extractArticle(@Body() body: { url: string }) {
    try {
      if (!body.url) {
        throw new HttpException('缺少URL参数', HttpStatus.BAD_REQUEST);
      }

      const result = await this.collectionService.extractArticle(body.url);

      return {
        success: true,
        data: result,
        message: '采集成功',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '采集失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

