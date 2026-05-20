import { Controller, Get } from '@nestjs/common';
import { Public } from './common/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, service: 'company-ap-api' };
  }
}
