import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDepartmentDto, RegisterDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post('register-department')
  registerDepartment(@Body() dto: RegisterDepartmentDto) {
    return this.auth.registerDepartment(dto);
  }

  @Get('me')
  me(@Req() req: { user: unknown }) {
    return req.user;
  }
}
