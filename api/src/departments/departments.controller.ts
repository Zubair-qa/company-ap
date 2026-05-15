import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../auth/roles.guard';

@Controller('departments')
@UseGuards(RolesGuard)
export class DepartmentsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }
}
