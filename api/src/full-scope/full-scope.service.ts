import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuditAction,
  DocumentType,
  NotificationType,
  PaymentBatchStatus,
  PaymentMethod,
  PaymentRecordStatus,
  Prisma,
  QueryStatus,
  ReconciliationStatus,
  Role,
  TicketStatus,
  VerificationStatus,
  VerificationType,
  XeroSyncStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RequestUser = { id: string; role: Role; departmentId: string | null };
type Body = Record<string, unknown>;

function text(body: Body, key: string) {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function requiredText(body: Body, key: string) {
  const value = text(body, key);
  if (!value) throw new BadRequestException(`${key} is required`);
  return value;
}

function optionalNumber(body: Body, key: string, fallback = 0) {
  const value = body[key];
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new BadRequestException(`${key} must be numeric`);
  return parsed;
}

function requiredDate(body: Body, key: string) {
  const value = requiredText(body, key);
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new BadRequestException(`${key} must be a date`);
  return date;
}

function enumValue<T extends Record<string, string>>(
  source: T,
  body: Body,
  key: string,
  fallback: T[keyof T],
) {
  const value = text(body, key);
  if (!value) return fallback;
  if (!Object.values(source).includes(value)) {
    throw new BadRequestException(`${key} is invalid`);
  }
  return value as T[keyof T];
}

function decimal(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

@Injectable()
export class FullScopeService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async overview(user: RequestUser) {
    const invoiceWhere = this.invoiceScopeWhere(user);
    const queryWhere = this.queryScopeWhere(user);
    const [
      invoices,
      openQueries,
      pendingVerifications,
      scheduledPayments,
      failedPayments,
      unreconciled,
      notifications,
      batches,
    ] = await Promise.all([
      this.prisma.invoice.count({ where: invoiceWhere }),
      this.prisma.interdepartmentalQuery.count({
        where: { ...queryWhere, status: QueryStatus.OPEN },
      }),
      this.prisma.verification.count({
        where: { status: VerificationStatus.PENDING, invoice: invoiceWhere },
      }),
      this.prisma.paymentRecord.count({
        where: {
          status: {
            in: [PaymentRecordStatus.SCHEDULED, PaymentRecordStatus.PENDING],
          },
          invoice: invoiceWhere,
        },
      }),
      this.prisma.paymentRecord.count({
        where: { status: PaymentRecordStatus.FAILED, invoice: invoiceWhere },
      }),
      this.prisma.reconciliation.count({
        where: {
          status: { in: [ReconciliationStatus.DISCREPANCY] },
          payment: { invoice: invoiceWhere },
        },
      }),
      this.prisma.notification.count({
        where: { userId: user.id, read: false },
      }),
      user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN
        ? []
        : this.prisma.paymentBatch.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: { payments: true },
          }),
    ]);

    return {
      invoices,
      openQueries,
      pendingVerifications,
      scheduledPayments,
      failedPayments,
      unreconciled,
      unreadNotifications: notifications,
      recentBatches: batches,
    };
  }

  async listPurchaseOrders(user: RequestUser) {
    return this.prisma.purchaseOrder.findMany({
      where: this.departmentScopedWhere(user),
      include: {
        vendor: true,
        department: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        lineItems: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPurchaseOrder(body: Body, user: RequestUser) {
    if (user.role === Role.AP_CLERK) {
      throw new ForbiddenException(
        'AP can verify POs but department/company creates them',
      );
    }
    await this.assertDepartmentAccess(requiredText(body, 'departmentId'), user);
    const lineItems = Array.isArray(body.lineItems)
      ? (body.lineItems as Body[])
      : [];
    const subtotal = lineItems.reduce(
      (sum, line) =>
        sum +
        optionalNumber(line, 'quantity', 1) *
          optionalNumber(line, 'unitPrice', 0),
      0,
    );
    const taxAmount = optionalNumber(body, 'taxAmount', 0);
    const po = await this.prisma.purchaseOrder.create({
      data: {
        poNumber: requiredText(body, 'poNumber'),
        vendor: { connect: { id: requiredText(body, 'vendorId') } },
        department: { connect: { id: requiredText(body, 'departmentId') } },
        requestedBy: { connect: { id: user.id } },
        poDate: body.poDate ? requiredDate(body, 'poDate') : new Date(),
        expectedDeliveryDate: text(body, 'expectedDeliveryDate')
          ? requiredDate(body, 'expectedDeliveryDate')
          : undefined,
        currency: text(body, 'currency') ?? 'PKR',
        subtotal: decimal(subtotal),
        taxAmount: decimal(taxAmount),
        totalAmount: decimal(subtotal + taxAmount),
        notes: text(body, 'notes'),
        lineItems: {
          create: lineItems.map((line, index) => {
            const quantity = optionalNumber(line, 'quantity', 1);
            const unitPrice = optionalNumber(line, 'unitPrice', 0);
            return {
              lineNo: index + 1,
              description: requiredText(line, 'description'),
              quantity: decimal(quantity),
              unit: text(line, 'unit'),
              unitPrice: decimal(unitPrice),
              lineTotal: decimal(quantity * unitPrice),
              glAccountCode: text(line, 'glAccountCode'),
            };
          }),
        },
      },
      include: { lineItems: true, vendor: true, department: true },
    });
    await this.audit(
      'purchase_order',
      po.id,
      AuditAction.CREATE,
      user,
      undefined,
      po,
    );
    return po;
  }

  async addSupportingDocument(body: Body, user: RequestUser) {
    if (text(body, 'invoiceId'))
      await this.assertInvoiceAccess(requiredText(body, 'invoiceId'), user);
    if (text(body, 'poId'))
      await this.assertPurchaseOrderAccess(requiredText(body, 'poId'), user);
    const doc = await this.prisma.supportingDocument.create({
      data: {
        invoice: text(body, 'invoiceId')
          ? { connect: { id: requiredText(body, 'invoiceId') } }
          : undefined,
        purchaseOrder: text(body, 'poId')
          ? { connect: { id: requiredText(body, 'poId') } }
          : undefined,
        documentType: enumValue(
          DocumentType,
          body,
          'documentType',
          DocumentType.OTHER,
        ),
        fileName: requiredText(body, 'fileName'),
        filePath: requiredText(body, 'filePath'),
        mimeType: text(body, 'mimeType') ?? 'application/octet-stream',
        fileSize: BigInt(optionalNumber(body, 'fileSize', 0)),
        uploadedBy: { connect: { id: user.id } },
      },
    });
    await this.audit(
      'supporting_document',
      doc.id,
      AuditAction.CREATE,
      user,
      undefined,
      doc,
    );
    return doc;
  }

  async listSupportingDocuments(user: RequestUser, invoiceId?: string) {
    return this.prisma.supportingDocument.findMany({
      where: {
        ...(invoiceId ? { invoiceId } : {}),
        OR: [
          { invoice: this.invoiceScopeWhere(user) },
          { purchaseOrder: this.departmentScopedWhere(user) },
        ],
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  async createVerification(body: Body, user: RequestUser) {
    this.assertApOrCompany(user);
    await this.assertInvoiceAccess(requiredText(body, 'invoiceId'), user);
    const verification = await this.prisma.verification.create({
      data: {
        invoice: { connect: { id: requiredText(body, 'invoiceId') } },
        verifiedBy: { connect: { id: user.id } },
        verificationType: enumValue(
          VerificationType,
          body,
          'verificationType',
          VerificationType.ACCURACY,
        ),
        status: enumValue(
          VerificationStatus,
          body,
          'status',
          VerificationStatus.PENDING,
        ),
        comments: text(body, 'comments'),
        verifiedAt:
          text(body, 'status') &&
          text(body, 'status') !== VerificationStatus.PENDING
            ? new Date()
            : undefined,
      },
    });
    await this.audit(
      'verification',
      verification.id,
      AuditAction.CREATE,
      user,
      undefined,
      verification,
    );
    return verification;
  }

  async listVerifications(user: RequestUser, invoiceId?: string) {
    return this.prisma.verification.findMany({
      where: {
        ...(invoiceId ? { invoiceId } : {}),
        invoice: this.invoiceScopeWhere(user),
      },
      include: {
        verifiedBy: { select: { id: true, name: true, email: true } },
        invoice: true,
      },
      orderBy: { id: 'desc' },
    });
  }

  async raiseQuery(body: Body, user: RequestUser) {
    this.assertApOrCompany(user);
    await this.assertInvoiceAccess(requiredText(body, 'invoiceId'), user);
    const query = await this.prisma.interdepartmentalQuery.create({
      data: {
        invoice: { connect: { id: requiredText(body, 'invoiceId') } },
        raisedBy: { connect: { id: user.id } },
        assignedToUser: text(body, 'assignedToUserId')
          ? { connect: { id: requiredText(body, 'assignedToUserId') } }
          : undefined,
        assignedToDepartment: text(body, 'assignedToDepartmentId')
          ? { connect: { id: requiredText(body, 'assignedToDepartmentId') } }
          : undefined,
        queryText: requiredText(body, 'queryText'),
      },
    });
    await this.audit(
      'interdepartmental_query',
      query.id,
      AuditAction.CREATE,
      user,
      undefined,
      query,
    );
    await this.notifyAssignee(query.id);
    return query;
  }

  async respondQuery(id: string, body: Body, user: RequestUser) {
    const existing = await this.prisma.interdepartmentalQuery.findFirst({
      where: { id, ...this.queryScopeWhere(user) },
    });
    if (!existing) throw new NotFoundException();
    const query = await this.prisma.interdepartmentalQuery.update({
      where: { id },
      data: {
        responseText: requiredText(body, 'responseText'),
        status: QueryStatus.RESPONDED,
        respondedAt: new Date(),
      },
    });
    await this.audit(
      'interdepartmental_query',
      id,
      AuditAction.UPDATE,
      user,
      undefined,
      query,
    );
    return query;
  }

  async closeQuery(id: string, user: RequestUser) {
    this.assertApOrCompany(user);
    const existing = await this.prisma.interdepartmentalQuery.findFirst({
      where: { id, ...this.queryScopeWhere(user) },
    });
    if (!existing) throw new NotFoundException();
    const query = await this.prisma.interdepartmentalQuery.update({
      where: { id },
      data: { status: QueryStatus.CLOSED, closedAt: new Date() },
    });
    await this.audit(
      'interdepartmental_query',
      id,
      AuditAction.STATUS_CHANGE,
      user,
      undefined,
      query,
    );
    return query;
  }

  async listQueries(user: RequestUser, invoiceId?: string) {
    return this.prisma.interdepartmentalQuery.findMany({
      where: {
        ...this.queryScopeWhere(user),
        ...(invoiceId ? { invoiceId } : {}),
      },
      include: {
        raisedBy: { select: { id: true, name: true, email: true } },
        assignedToUser: { select: { id: true, name: true, email: true } },
        assignedToDepartment: true,
        invoice: true,
      },
      orderBy: { raisedAt: 'desc' },
    });
  }

  async createApprovalMatrixRule(body: Body, user: RequestUser) {
    this.assertCompany(user);
    const rule = await this.prisma.approvalMatrix.create({
      data: {
        department: text(body, 'departmentId')
          ? { connect: { id: requiredText(body, 'departmentId') } }
          : undefined,
        currency: text(body, 'currency') ?? 'PKR',
        minAmount: decimal(optionalNumber(body, 'minAmount', 0)),
        maxAmount: decimal(optionalNumber(body, 'maxAmount', 999999999)),
        requiredRole: enumValue(Role, body, 'requiredRole', Role.COMPANY_ADMIN),
        requiredUser: text(body, 'requiredUserId')
          ? { connect: { id: requiredText(body, 'requiredUserId') } }
          : undefined,
        approvalLevel: optionalNumber(body, 'approvalLevel', 1),
      },
    });
    await this.audit(
      'approval_matrix',
      rule.id,
      AuditAction.CREATE,
      user,
      undefined,
      rule,
    );
    return rule;
  }

  async listApprovalMatrix(user: RequestUser) {
    this.assertCompany(user);
    return this.prisma.approvalMatrix.findMany({
      include: {
        department: true,
        requiredUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ departmentId: 'asc' }, { approvalLevel: 'asc' }],
    });
  }

  async createBatchFromApproved(body: Body, user: RequestUser) {
    this.assertApOrCompany(user);
    const invoiceIds = Array.isArray(body.invoiceIds)
      ? body.invoiceIds.filter((id) => typeof id === 'string')
      : [];
    const invoices = await this.prisma.invoice.findMany({
      where: invoiceIds.length
        ? { id: { in: invoiceIds }, ...this.invoiceScopeWhere(user) }
        : { status: { in: ['APPROVED'] }, ...this.invoiceScopeWhere(user) },
      include: { vendor: true },
    });
    if (!invoices.length)
      throw new BadRequestException('No approved invoices available');
    const eligible = invoices.filter(
      (invoice) => invoice.vendorId && invoice.vendor,
    );
    if (!eligible.length)
      throw new BadRequestException('Approved invoices need linked vendors');
    const total = eligible.reduce(
      (sum, invoice) => sum + Number(invoice.balanceDue || invoice.amountPkr),
      0,
    );
    const batch = await this.prisma.paymentBatch.create({
      data: {
        batchNumber: `PB-${Date.now()}`,
        batchDate: body.batchDate
          ? requiredDate(body, 'batchDate')
          : new Date(),
        currency: text(body, 'currency') ?? 'PKR',
        totalCount: eligible.length,
        totalAmount: decimal(total),
        payments: {
          create: eligible.map((invoice, index) => ({
            paymentRef: `PAY-${Date.now()}-${index + 1}`,
            invoice: { connect: { id: invoice.id } },
            vendor: { connect: { id: invoice.vendorId as string } },
            paymentDate: body.paymentDate
              ? requiredDate(body, 'paymentDate')
              : new Date(),
            paymentMethod: enumValue(
              PaymentMethod,
              body,
              'paymentMethod',
              PaymentMethod.BANK_PORTAL,
            ),
            amount: invoice.balanceDue.gt(0)
              ? invoice.balanceDue
              : invoice.amountPkr,
            withholdingTaxDeducted: invoice.withholdingTax,
            currency: invoice.currency,
            status: PaymentRecordStatus.SCHEDULED,
            initiatedBy: { connect: { id: user.id } },
          })),
        },
      },
      include: { payments: { include: { invoice: true, vendor: true } } },
    });
    await this.audit(
      'payment_batch',
      batch.id,
      AuditAction.CREATE,
      user,
      undefined,
      batch,
    );
    return batch;
  }

  async listPaymentBatches(user: RequestUser) {
    this.assertApOrCompany(user);
    return this.prisma.paymentBatch.findMany({
      include: { payments: { include: { vendor: true, invoice: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async exportMeezanBatch(id: string, user: RequestUser) {
    this.assertApOrCompany(user);
    const batch = await this.prisma.paymentBatch.findUnique({
      where: { id },
      include: { payments: { include: { vendor: true, invoice: true } } },
    });
    if (!batch) throw new NotFoundException();
    const headers = [
      'Beneficiary Name',
      'Beneficiary IBAN',
      'Beneficiary Bank',
      'Amount',
      'Currency',
      'Value Date',
      'Payment Reference',
      'Narration / Purpose',
    ];
    const rows = batch.payments.map((payment) => [
      payment.vendor.bankAccountTitle || payment.vendor.displayName,
      payment.vendor.iban || '',
      payment.vendor.bankName || '',
      payment.amount.toFixed(2),
      payment.currency,
      payment.paymentDate.toISOString().slice(0, 10),
      payment.paymentRef,
      `${payment.invoice.internalRef || payment.invoice.reference || payment.invoice.id} ${payment.invoice.invoiceNumber || ''}`.trim(),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
    await this.prisma.paymentBatch.update({
      where: { id },
      data: {
        status: PaymentBatchStatus.EXPORTED,
        exportedAt: new Date(),
        exportedByUserId: user.id,
      },
    });
    await this.audit('payment_batch', id, AuditAction.EXPORT, user, undefined, {
      csvRows: rows.length,
    });
    return {
      fileName: `${batch.batchNumber}-meezan.csv`,
      contentType: 'text/csv',
      csv,
    };
  }

  async importBankResponse(body: Body, user: RequestUser) {
    this.assertApOrCompany(user);
    const rows = Array.isArray(body.rows) ? (body.rows as Body[]) : [];
    if (!rows.length) throw new BadRequestException('rows are required');
    const results = [];
    for (const row of rows) {
      const paymentRef = requiredText(row, 'paymentRef');
      const statusText = text(row, 'status')?.toUpperCase();
      const status =
        statusText === 'COMPLETED'
          ? PaymentRecordStatus.COMPLETED
          : statusText === 'FAILED'
            ? PaymentRecordStatus.FAILED
            : PaymentRecordStatus.PROCESSING;
      const payment = await this.prisma.paymentRecord.update({
        where: { paymentRef },
        data: {
          status,
          meezanTransactionRef: text(row, 'meezanTransactionRef'),
          bankResponseCode: text(row, 'bankResponseCode'),
          bankResponseMessage: text(row, 'bankResponseMessage'),
        },
      });
      results.push(payment);
    }
    await this.audit(
      'payment_response',
      'bank-response',
      AuditAction.IMPORT,
      user,
      undefined,
      results,
    );
    return { updated: results.length, payments: results };
  }

  async reconcilePayment(body: Body, user: RequestUser) {
    this.assertApOrCompany(user);
    const reconciliation = await this.prisma.reconciliation.create({
      data: {
        payment: { connect: { id: requiredText(body, 'paymentId') } },
        bankStatementRef: text(body, 'bankStatementRef'),
        statementDate: body.statementDate
          ? requiredDate(body, 'statementDate')
          : new Date(),
        reconciledAmount: decimal(optionalNumber(body, 'reconciledAmount', 0)),
        status: enumValue(
          ReconciliationStatus,
          body,
          'status',
          ReconciliationStatus.MATCHED,
        ),
        discrepancyNotes: text(body, 'discrepancyNotes'),
        reconciledBy: { connect: { id: user.id } },
      },
    });
    await this.audit(
      'reconciliation',
      reconciliation.id,
      AuditAction.CREATE,
      user,
      undefined,
      reconciliation,
    );
    return reconciliation;
  }

  async listReconciliations(user: RequestUser) {
    this.assertApOrCompany(user);
    return this.prisma.reconciliation.findMany({
      include: {
        payment: { include: { vendor: true, invoice: true } },
        reconciledBy: true,
      },
      orderBy: { reconciledAt: 'desc' },
    });
  }

  async listTaxCodes() {
    return this.prisma.taxCode.findMany({ orderBy: { code: 'asc' } });
  }

  async listGlAccounts() {
    return this.prisma.glAccount.findMany({ orderBy: { accountCode: 'asc' } });
  }

  async auditLogs() {
    return this.prisma.auditLog.findMany({
      include: {
        performedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async notifications(user: RequestUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markNotificationRead(id: string, user: RequestUser) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId: user.id },
    });
    if (!notification) throw new NotFoundException();
    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  xeroAuthUrl(state = 'company-ap') {
    const clientId = this.config.get<string>('XERO_CLIENT_ID');
    const redirectUri = this.config.get<string>('XERO_REDIRECT_URI');
    if (!clientId || !redirectUri) {
      throw new BadRequestException(
        'XERO_CLIENT_ID and XERO_REDIRECT_URI are required',
      );
    }
    const url = new URL('https://login.xero.com/identity/connect/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set(
      'scope',
      this.config.get<string>('XERO_SCOPES') ??
        'openid profile email accounting.transactions offline_access',
    );
    url.searchParams.set('state', state);
    return { url: url.toString() };
  }

  async xeroCallback(code: string) {
    const clientId = this.config.get<string>('XERO_CLIENT_ID');
    const clientSecret = this.config.get<string>('XERO_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('XERO_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('Xero OAuth env vars are required');
    }
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(
        `Xero token exchange failed: ${await tokenRes.text()}`,
      );
    }
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const connectionsRes = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!connectionsRes.ok) {
      throw new BadRequestException(
        `Xero connections failed: ${await connectionsRes.text()}`,
      );
    }
    const connections = (await connectionsRes.json()) as Array<{
      tenantId: string;
      tenantName?: string;
    }>;
    const first = connections[0];
    if (!first) throw new BadRequestException('No Xero tenant connected');
    const connection = await this.prisma.xeroConnection.upsert({
      where: { tenantId: first.tenantId },
      update: {
        tenantName: first.tenantName,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : undefined,
        active: true,
      },
      create: {
        tenantId: first.tenantId,
        tenantName: first.tenantName,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : undefined,
      },
    });
    return { connected: true, connection };
  }

  async syncTicketToXero(ticketId: string, user: RequestUser) {
    const ticket = await this.prisma.paymentTicket.findUnique({
      where: { id: ticketId },
      include: { vendor: true, invoice: true },
    });
    if (!ticket) throw new NotFoundException();
    if (ticket.status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException(
        'Payment complete tickets are locked for audit',
      );
    }
    if (ticket.status !== TicketStatus.XERO_BILL_ENTRY) {
      throw new BadRequestException(
        'Xero bill can only be created at the Xero bill entry step',
      );
    }
    const connection = await this.activeXeroConnection();
    const accountCode =
      this.config.get<string>('XERO_DEFAULT_EXPENSE_ACCOUNT') ?? '500';
    const response = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Invoices: [
          {
            Type: 'ACCPAY',
            Contact: ticket.xeroContactId
              ? { ContactID: ticket.xeroContactId }
              : {
                  Name:
                    ticket.vendor?.displayName ??
                    ticket.vendorNameSnapshot ??
                    'Unknown vendor',
                },
            DateString: new Date().toISOString().slice(0, 10),
            DueDateString: (ticket.dueDate ?? new Date())
              .toISOString()
              .slice(0, 10),
            InvoiceNumber:
              ticket.invoiceNumber ?? ticket.internalReference ?? ticket.id,
            Reference:
              ticket.internalReference ?? ticket.oldReference ?? ticket.id,
            LineAmountTypes: 'Exclusive',
            LineItems: [
              {
                Description: ticket.title,
                Quantity: 1,
                UnitAmount: Number(ticket.amountPkr),
                AccountCode: accountCode,
              },
            ],
          },
        ],
      }),
    });
    const result: unknown = await response.json().catch((): unknown => ({}));
    if (!response.ok) {
      await this.prisma.paymentTicket.update({
        where: { id: ticketId },
        data: {
          xeroSyncStatus: XeroSyncStatus.SYNC_FAILED,
          xeroError: JSON.stringify(result),
        },
      });
      throw new BadRequestException(`Xero sync failed`);
    }
    const xeroBillId = (
      result as {
        Invoices?: Array<{ InvoiceID?: string; InvoiceNumber?: string }>;
      }
    ).Invoices?.[0]?.InvoiceID;
    const xeroBillNumber = (
      result as {
        Invoices?: Array<{ InvoiceID?: string; InvoiceNumber?: string }>;
      }
    ).Invoices?.[0]?.InvoiceNumber;
    const updated = await this.prisma.paymentTicket.update({
      where: { id: ticketId },
      data: {
        xeroSyncStatus: XeroSyncStatus.BILL_CREATED,
        xeroBillId,
        xeroBillNumber,
        xeroLastSyncedAt: new Date(),
        xeroError: null,
      },
    });
    await this.prisma.xeroConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
    await this.audit(
      'payment_ticket',
      ticketId,
      AuditAction.SYNC,
      user,
      undefined,
      updated,
    );
    return { synced: true, result, ticket: updated };
  }

  async markTicketPaidInXero(ticketId: string, body: Body, user: RequestUser) {
    const ticket = await this.prisma.paymentTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException();
    if (ticket.status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException(
        'Payment complete tickets are locked for audit',
      );
    }
    if (ticket.status !== TicketStatus.BANK_EXECUTED) {
      throw new BadRequestException(
        'Payment can only be marked paid after bank execution',
      );
    }
    if (!ticket.xeroBillId) {
      throw new BadRequestException(
        'Create the Xero bill before marking it paid',
      );
    }
    const connection = await this.activeXeroConnection();
    const accountCode =
      text(body, 'accountCode') ??
      this.config.get<string>('XERO_BANK_ACCOUNT_CODE');
    if (!accountCode) {
      throw new BadRequestException(
        'XERO_BANK_ACCOUNT_CODE or accountCode is required',
      );
    }
    const amount = Number(ticket.netPayablePkr ?? ticket.amountPkr);
    const response = await fetch('https://api.xero.com/api.xro/2.0/Payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        'xero-tenant-id': connection.tenantId,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Payments: [
          {
            Invoice: { InvoiceID: ticket.xeroBillId },
            Account: { Code: accountCode },
            Date: text(body, 'date') ?? new Date().toISOString().slice(0, 10),
            Amount: amount,
            Reference:
              text(body, 'reference') ??
              ticket.bankPortalReference ??
              ticket.voucherNumber,
          },
        ],
      }),
    });
    const result: unknown = await response.json().catch((): unknown => ({}));
    if (!response.ok) {
      await this.prisma.paymentTicket.update({
        where: { id: ticketId },
        data: {
          xeroSyncStatus: XeroSyncStatus.SYNC_FAILED,
          xeroError: JSON.stringify(result),
        },
      });
      throw new BadRequestException('Xero payment sync failed');
    }
    const xeroPaymentId = (
      result as { Payments?: Array<{ PaymentID?: string }> }
    ).Payments?.[0]?.PaymentID;
    const updated = await this.prisma.paymentTicket.update({
      where: { id: ticketId },
      data: {
        status: TicketStatus.MARKED_PAID_IN_XERO,
        xeroSyncStatus: XeroSyncStatus.PAID_MARKED,
        xeroPaymentId,
        xeroLastSyncedAt: new Date(),
        xeroError: null,
      },
    });
    await this.prisma.xeroConnection.update({
      where: { id: connection.id },
      data: { lastSyncedAt: new Date() },
    });
    await this.audit(
      'payment_ticket',
      ticketId,
      AuditAction.SYNC,
      user,
      undefined,
      updated,
    );
    return { synced: true, result, ticket: updated };
  }

  async xeroStatus() {
    return this.prisma.xeroConnection.findMany({
      select: {
        id: true,
        tenantId: true,
        tenantName: true,
        expiresAt: true,
        connectedAt: true,
        lastSyncedAt: true,
        active: true,
      },
      orderBy: { connectedAt: 'desc' },
    });
  }

  private invoiceScopeWhere(user: RequestUser): Prisma.InvoiceWhereInput {
    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      return { departmentId: user.departmentId ?? '__no_department__' };
    }
    return {};
  }

  private departmentScopedWhere(
    user: RequestUser,
  ): Prisma.PurchaseOrderWhereInput {
    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      return { departmentId: user.departmentId ?? '__no_department__' };
    }
    return {};
  }

  private queryScopeWhere(
    user: RequestUser,
  ): Prisma.InterdepartmentalQueryWhereInput {
    if (user.role !== Role.DEPT_USER && user.role !== Role.DEPT_ADMIN)
      return {};
    const departmentId = user.departmentId ?? '__no_department__';
    return {
      OR: [
        { assignedToDepartmentId: departmentId },
        { invoice: { departmentId } },
        { assignedToUserId: user.id },
        { raisedByUserId: user.id },
      ],
    };
  }

  private assertCompany(user: RequestUser) {
    if (user.role !== Role.COMPANY_ADMIN) {
      throw new ForbiddenException('Company admin access is required');
    }
  }

  private assertApOrCompany(user: RequestUser) {
    if (user.role !== Role.AP_CLERK && user.role !== Role.COMPANY_ADMIN) {
      throw new ForbiddenException('AP or company admin access is required');
    }
  }

  private async assertDepartmentAccess(
    departmentId: string,
    user: RequestUser,
  ) {
    if (
      (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) &&
      user.departmentId !== departmentId
    ) {
      throw new ForbiddenException(
        'Department users can only operate on their own department',
      );
    }
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) throw new BadRequestException('Invalid department');
  }

  private async assertInvoiceAccess(invoiceId: string, user: RequestUser) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, ...this.invoiceScopeWhere(user) },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException();
  }

  private async assertPurchaseOrderAccess(poId: string, user: RequestUser) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, ...this.departmentScopedWhere(user) },
      select: { id: true },
    });
    if (!po) throw new NotFoundException();
  }

  private async activeXeroConnection() {
    const connection = await this.prisma.xeroConnection.findFirst({
      where: { active: true, accessToken: { not: null } },
      orderBy: { connectedAt: 'desc' },
    });
    if (!connection?.accessToken) {
      throw new BadRequestException('Connect Xero before syncing bills');
    }
    const expiresSoon =
      connection.expiresAt &&
      connection.expiresAt.getTime() <= Date.now() + 60_000;
    if (expiresSoon && connection.refreshToken) {
      return this.refreshXeroConnection(connection);
    }
    return connection as typeof connection & { accessToken: string };
  }

  private async refreshXeroConnection(connection: {
    id: string;
    refreshToken: string | null;
  }) {
    const clientId = this.config.get<string>('XERO_CLIENT_ID');
    const clientSecret = this.config.get<string>('XERO_CLIENT_SECRET');
    if (!clientId || !clientSecret || !connection.refreshToken) {
      throw new BadRequestException(
        'Xero refresh token or client credentials are missing',
      );
    }
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refreshToken,
    });
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!tokenRes.ok) {
      throw new BadRequestException(
        `Xero token refresh failed: ${await tokenRes.text()}`,
      );
    }
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const updated = await this.prisma.xeroConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? connection.refreshToken,
        expiresAt: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000)
          : undefined,
      },
    });
    if (!updated.accessToken) {
      throw new BadRequestException(
        'Xero token refresh did not return an access token',
      );
    }
    return updated as typeof updated & { accessToken: string };
  }

  private async notifyAssignee(queryId: string) {
    const query = await this.prisma.interdepartmentalQuery.findUnique({
      where: { id: queryId },
    });
    if (!query?.assignedToUserId) return;
    await this.prisma.notification.create({
      data: {
        userId: query.assignedToUserId,
        type: NotificationType.QUERY_RAISED,
        title: 'Query raised',
        message: query.queryText,
        link: `/invoices/${query.invoiceId}`,
      },
    });
  }

  private async audit(
    entityType: string,
    entityId: string,
    action: AuditAction,
    user: RequestUser,
    oldValue?: unknown,
    newValue?: unknown,
  ) {
    await this.prisma.auditLog.create({
      data: {
        entityType,
        entityId,
        action,
        performedByUserId: user.id,
        oldValue:
          oldValue == null ? undefined : (oldValue as Prisma.InputJsonValue),
        newValue:
          newValue == null ? undefined : (newValue as Prisma.InputJsonValue),
      },
    });
  }
}
