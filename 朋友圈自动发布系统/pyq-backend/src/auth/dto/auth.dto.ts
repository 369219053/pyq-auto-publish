import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  @MinLength(4, { message: '账号至少需要4个字符' })
  @MaxLength(20, { message: '账号最多20个字符' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少需要6个字符' })
  password: string;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '账号不能为空' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;
}

