import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVendorDto } from './dto/create-vendor.dto';

@Controller('vendors')
@UseGuards(RolesGuard)
export class VendorsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK, Role.DEPT_ADMIN)
  list() {
    return this.prisma.vendor.findMany({
      where: { active: true },
      orderBy: { displayName: 'asc' },
    });
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  create(@Body() dto: CreateVendorDto) {
    return this.prisma.vendor.create({
      data: {
        displayName: dto.displayName,
        legalName: dto.legalName,
        taxNumber: dto.taxNumber,
        kind: dto.kind,
        active: dto.active ?? true,
      },
    });
  }
}
