import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    try {
      return await this.authService.register(
        registerDto.username,
        registerDto.name,
        registerDto.password,
      );
    } catch (error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message || '注册失败',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    try {
      return await this.authService.login(loginDto.username, loginDto.password);
    } catch (error) {
      throw new HttpException(
        {
          statusCode: HttpStatus.UNAUTHORIZED,
          message: error.message || '登录失败',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Post('logout')
  async logout() {
    // JWT是无状态的,前端删除token即可
    // 这里返回成功响应即可
    return {
      code: 0,
      message: '退出登录成功',
      data: null,
    };
  }
}

