import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(username: string, name: string, password: string) {
    try {
      const user = await this.usersService.create(username, name, password);
      const payload = { sub: user.id, username: user.username };
      const access_token = this.jwtService.sign(payload);

      // 统一返回格式,符合Vue Vben Admin规范
      return {
        code: 0,
        message: '注册成功',
        data: {
          access_token,
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
          },
        },
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async login(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);

    if (!user) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const isPasswordValid = await this.usersService.validatePassword(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const payload = { sub: user.id, username: user.username };
    const access_token = this.jwtService.sign(payload);

    // 统一返回格式,符合Vue Vben Admin规范
    return {
      code: 0,
      message: '登录成功',
      data: {
        access_token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
        },
      },
    };
  }

  async validateUser(userId: string) {
    // 这里可以添加更多的用户验证逻辑
    return { userId };
  }
}

