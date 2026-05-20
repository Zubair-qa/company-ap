import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../auth/roles.guard';
import { Public } from '../common/public.decorator';

@Controller('departments')
@UseGuards(RolesGuard)
export class DepartmentsController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  list() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }
}
