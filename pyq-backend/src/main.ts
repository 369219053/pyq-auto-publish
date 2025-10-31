import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });

  // 增加请求体大小限制(支持Base64图片上传)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ limit: '50mb', extended: true }));

  // 启用CORS
  app.enableCors({
    origin: true, // 允许所有来源(开发环境)
    credentials: true,
  });

  // 启用全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // 设置全局前缀
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 服务器启动成功!`);
  console.log(`📡 API地址: http://localhost:${port}/api`);
  console.log(`📝 登录接口: http://localhost:${port}/api/auth/login`);
  console.log(`📝 注册接口: http://localhost:${port}/api/auth/register`);
}

bootstrap();

