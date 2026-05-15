import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  patch(
    @Param('id') id: string,
    @Body() dto: PatchInvoiceDto,
    @Req() req: { user: { id: string; role: Role } },
  ) {
    return this.invoices.patchInvoice(id, dto, req.user);
  }

  @Post(':id/submit-approval')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  submit(@Param('id') id: string, @Req() req: { user: { id: string } }) {
    return this.invoices.submitForApproval(id, req.user);
  }

  @Post('import/google-csv')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  importGoogleCsv(
    @Body() dto: GoogleCsvDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.invoices.importFromPublishedCsvUrl(dto.url, req.user.id);
  }
}
