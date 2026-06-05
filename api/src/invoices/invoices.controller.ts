import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GoogleCsvDto, PatchInvoiceDto } from './dto/invoice.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
@UseGuards(RolesGuard)
export class InvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Get()
  list(@Req() req: { user: { id: string; role: Role; departmentId: string | null } }) {
    return this.invoices.listForUser(req.user);
  }

  @Get(':id')
  getOne(
    @Param('id') id: string,
    @Req() req: { user: { id: string; role: Role; departmentId: string | null } },
  ) {
    return this.invoices.getOne(id, req.user);
  }

  @Patch(':id')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK, Role.DEPT_USER)
  patch(
    @Param('id') id: string,
    @Body() dto: PatchInvoiceDto,
    @Req() req: { user: { id: string; role: Role; departmentId: string | null } },
  ) {
    return this.invoices.patchInvoice(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(Role.DEPT_USER)
  delete(
    @Param('id') id: string,
    @Req() req: { user: { id: string; role: Role; departmentId: string | null } },
  ) {
    return this.invoices.deleteDepartmentInvoice(id, req.user);
  }

  @Post(':id/submit-approval')
  @Roles(Role.COMPANY_ADMIN)
  submit(
    @Param('id') id: string,
    @Req() req: { user: { id: string; role: Role; departmentId: string | null } },
  ) {
    return this.invoices.submitForApproval(id, req.user);
  }

  @Post('import/google-csv')
  @Roles(Role.COMPANY_ADMIN, Role.DEPT_USER)
  importGoogleCsv(
    @Body() dto: GoogleCsvDto,
    @Req() req: { user: { id: string; role: Role; departmentId: string | null } },
  ) {
    return this.invoices.importFromPublishedCsvUrl(dto.url, dto.departmentId, req.user);
  }
}
