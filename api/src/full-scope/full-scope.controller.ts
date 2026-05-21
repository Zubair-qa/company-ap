import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Public } from '../common/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FullScopeService } from './full-scope.service';

type RequestUser = { id: string; role: Role; departmentId: string | null };
type BodyRecord = Record<string, unknown>;

@Controller('ap-ops')
@UseGuards(RolesGuard)
export class ApOpsController {
  constructor(private service: FullScopeService) {}

  @Get('overview')
  overview(@Req() req: { user: RequestUser }) {
    return this.service.overview(req.user);
  }
}

@Controller('purchase-orders')
@UseGuards(RolesGuard)
export class PurchaseOrdersController {
  constructor(private service: FullScopeService) {}

  @Get()
  list(@Req() req: { user: RequestUser }) {
    return this.service.listPurchaseOrders(req.user);
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.DEPT_USER)
  create(@Body() body: BodyRecord, @Req() req: { user: RequestUser }) {
    return this.service.createPurchaseOrder(body, req.user);
  }
}

@Controller('supporting-documents')
@UseGuards(RolesGuard)
export class SupportingDocumentsController {
  constructor(private service: FullScopeService) {}

  @Get()
  list(
    @Req() req: { user: RequestUser },
    @Query('invoiceId') invoiceId?: string,
  ) {
    return this.service.listSupportingDocuments(req.user, invoiceId);
  }

  @Post()
  create(@Body() body: BodyRecord, @Req() req: { user: RequestUser }) {
    return this.service.addSupportingDocument(body, req.user);
  }
}

@Controller('verifications')
@UseGuards(RolesGuard)
export class VerificationsController {
  constructor(private service: FullScopeService) {}

  @Get()
  list(
    @Req() req: { user: RequestUser },
    @Query('invoiceId') invoiceId?: string,
  ) {
    return this.service.listVerifications(req.user, invoiceId);
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  create(@Body() body: BodyRecord, @Req() req: { user: RequestUser }) {
    return this.service.createVerification(body, req.user);
  }
}

@Controller('queries')
@UseGuards(RolesGuard)
export class QueriesController {
  constructor(private service: FullScopeService) {}

  @Get()
  list(
    @Req() req: { user: RequestUser },
    @Query('invoiceId') invoiceId?: string,
  ) {
    return this.service.listQueries(req.user, invoiceId);
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  create(@Body() body: BodyRecord, @Req() req: { user: RequestUser }) {
    return this.service.raiseQuery(body, req.user);
  }

  @Patch(':id/respond')
  respond(
    @Param('id') id: string,
    @Body() body: BodyRecord,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.respondQuery(id, body, req.user);
  }

  @Patch(':id/close')
  close(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.service.closeQuery(id, req.user);
  }
}

@Controller('approval-matrix')
@UseGuards(RolesGuard)
export class ApprovalMatrixController {
  constructor(private service: FullScopeService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN)
  list(@Req() req: { user: RequestUser }) {
    return this.service.listApprovalMatrix(req.user);
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN)
  create(@Body() body: BodyRecord, @Req() req: { user: RequestUser }) {
    return this.service.createApprovalMatrixRule(body, req.user);
  }
}

@Controller('payment-batches')
@UseGuards(RolesGuard)
export class PaymentBatchesController {
  constructor(private service: FullScopeService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  list(@Req() req: { user: RequestUser }) {
    return this.service.listPaymentBatches(req.user);
  }

  @Post('from-approved')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  createFromApproved(
    @Body() body: BodyRecord,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.createBatchFromApproved(body, req.user);
  }

  @Get(':id/meezan-export')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  exportMeezan(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.service.exportMeezanBatch(id, req.user);
  }

  @Post('bank-response')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  importBankResponse(
    @Body() body: BodyRecord,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.importBankResponse(body, req.user);
  }
}

@Controller('reconciliations')
@UseGuards(RolesGuard)
export class ReconciliationsController {
  constructor(private service: FullScopeService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  list(@Req() req: { user: RequestUser }) {
    return this.service.listReconciliations(req.user);
  }

  @Post()
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  create(@Body() body: BodyRecord, @Req() req: { user: RequestUser }) {
    return this.service.reconcilePayment(body, req.user);
  }
}

@Controller('reference-data')
@UseGuards(RolesGuard)
export class ReferenceDataController {
  constructor(private service: FullScopeService) {}

  @Get('tax-codes')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  taxCodes() {
    return this.service.listTaxCodes();
  }

  @Get('gl-accounts')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  glAccounts() {
    return this.service.listGlAccounts();
  }
}

@Controller('audit-logs')
@UseGuards(RolesGuard)
export class AuditLogsController {
  constructor(private service: FullScopeService) {}

  @Get()
  @Roles(Role.COMPANY_ADMIN)
  list() {
    return this.service.auditLogs();
  }
}

@Controller('notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private service: FullScopeService) {}

  @Get()
  list(@Req() req: { user: RequestUser }) {
    return this.service.notifications(req.user);
  }

  @Patch(':id/read')
  read(@Param('id') id: string, @Req() req: { user: RequestUser }) {
    return this.service.markNotificationRead(id, req.user);
  }
}

@Controller('xero')
@UseGuards(RolesGuard)
export class XeroController {
  constructor(private service: FullScopeService) {}

  @Get('status')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  status() {
    return this.service.xeroStatus();
  }

  @Get('auth-url')
  @Roles(Role.COMPANY_ADMIN)
  authUrl(@Query('state') state?: string) {
    return this.service.xeroAuthUrl(state);
  }

  @Public()
  @Get('callback')
  callback(@Query('code') code?: string) {
    if (!code) return { connected: false, message: 'Missing Xero code' };
    return this.service.xeroCallback(code);
  }

  @Post('tickets/:ticketId/sync-bill')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  syncTicket(
    @Param('ticketId') ticketId: string,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.syncTicketToXero(ticketId, req.user);
  }

  @Post('tickets/:ticketId/mark-paid')
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  markTicketPaid(
    @Param('ticketId') ticketId: string,
    @Body() body: BodyRecord,
    @Req() req: { user: RequestUser },
  ) {
    return this.service.markTicketPaidInXero(ticketId, body, req.user);
  }
}
