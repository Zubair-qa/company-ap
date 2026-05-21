import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BankPaymentStatus,
  DocumentType,
  DocumentStatus,
  FilerStatus,
  Prisma,
  Role,
  TicketStatus,
  XeroSyncStatus,
} from '@prisma/client';
import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, UpdateTicketDto } from './dto/ticket.dto';

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

export const TICKET_BOARD_STATUSES: TicketStatus[] = [
  TicketStatus.NEW_REQUEST,
  TicketStatus.DEPARTMENT_HEAD_APPROVAL,
  TicketStatus.DOCS_REVIEW,
  TicketStatus.MISSING_DOCS,
  TicketStatus.REQUESTER_PINGED,
  TicketStatus.WAITING_FOR_DOCS,
  TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
  TicketStatus.WHT_CALCULATION,
  TicketStatus.VOUCHER_GENERATION,
  TicketStatus.XERO_BILL_ENTRY,
  TicketStatus.PAYMENT_PREPARATION,
  TicketStatus.BANK_UPLOAD,
  TicketStatus.CFO_SIGN_PENDING,
  TicketStatus.BANK_EXECUTION_PENDING,
  TicketStatus.BANK_EXECUTED,
  TicketStatus.MARKED_PAID_IN_XERO,
  TicketStatus.REQUESTER_NOTIFIED,
  TicketStatus.PAYMENT_COMPLETE,
];

const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.NEW_REQUEST]: 'Invoice / PO submitted',
  [TicketStatus.DEPARTMENT_HEAD_APPROVAL]: 'Department head approval',
  [TicketStatus.DOCS_REVIEW]: 'Finance document review',
  [TicketStatus.MISSING_DOCS]: 'Missing documents',
  [TicketStatus.REQUESTER_PINGED]: 'Requester pinged',
  [TicketStatus.WAITING_FOR_DOCS]: 'Waiting for documents',
  [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION]:
    'Vendor / PO / account verification',
  [TicketStatus.WHT_CALCULATION]: 'WHT filer/non-filer calculation',
  [TicketStatus.VOUCHER_GENERATION]: 'Voucher generation',
  [TicketStatus.XERO_BILL_ENTRY]: 'Xero bill entry',
  [TicketStatus.PAYMENT_PREPARATION]: 'Payment preparation',
  [TicketStatus.BANK_UPLOAD]: 'Bank upload',
  [TicketStatus.CFO_SIGN_PENDING]: 'CFO sign pending',
  [TicketStatus.BANK_EXECUTION_PENDING]: 'Bank execution pending',
  [TicketStatus.BANK_EXECUTED]: 'Bank executed',
  [TicketStatus.MARKED_PAID_IN_XERO]: 'Marked paid in Xero',
  [TicketStatus.REQUESTER_NOTIFIED]: 'Requester notified',
  [TicketStatus.PAYMENT_COMPLETE]: 'Payment complete',
};

export const TICKET_BOARD_COLUMNS = [
  {
    id: 'submission',
    label: 'Department draft / rework',
    scope: 'Department creates invoice and fixes rejected requests.',
    statuses: [TicketStatus.NEW_REQUEST],
  },
  {
    id: 'department_head_approval',
    label: 'Department head approval',
    scope:
      'Department head reviews read-only invoice and approves or rejects with reason.',
    statuses: [TicketStatus.DEPARTMENT_HEAD_APPROVAL],
  },
  {
    id: 'department_verification',
    label: 'Department verification',
    scope: 'Finance reviews documents; missing docs go back to requester.',
    statuses: [
      TicketStatus.DOCS_REVIEW,
      TicketStatus.MISSING_DOCS,
      TicketStatus.REQUESTER_PINGED,
      TicketStatus.WAITING_FOR_DOCS,
    ],
  },
  {
    id: 'data_verification',
    label: 'Data verification',
    scope:
      'Vendor, PO, account number, old sheet reference, and invoice data are checked.',
    statuses: [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION],
  },
  {
    id: 'tax_voucher',
    label: 'WHT and voucher',
    scope:
      'Filer/non-filer WHT is calculated and payment voucher is generated.',
    statuses: [TicketStatus.WHT_CALCULATION, TicketStatus.VOUCHER_GENERATION],
  },
  {
    id: 'xero_bookkeeping',
    label: 'Xero bookkeeping',
    scope: 'AP bill is entered/synced to Xero before payment processing.',
    statuses: [TicketStatus.XERO_BILL_ENTRY],
  },
  {
    id: 'payment_disbursement',
    label: 'Payment disbursement',
    scope:
      'Payment file is prepared, uploaded to Meezan, signed by CFO, and executed.',
    statuses: [
      TicketStatus.PAYMENT_PREPARATION,
      TicketStatus.BANK_UPLOAD,
      TicketStatus.CFO_SIGN_PENDING,
      TicketStatus.BANK_EXECUTION_PENDING,
      TicketStatus.BANK_EXECUTED,
    ],
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation and close',
    scope:
      'Payment is marked paid in Xero, requester is notified, and ticket is closed.',
    statuses: [
      TicketStatus.MARKED_PAID_IN_XERO,
      TicketStatus.REQUESTER_NOTIFIED,
      TicketStatus.PAYMENT_COMPLETE,
    ],
  },
] as const;

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW_REQUEST]: [TicketStatus.DEPARTMENT_HEAD_APPROVAL],
  [TicketStatus.DEPARTMENT_HEAD_APPROVAL]: [
    TicketStatus.NEW_REQUEST,
    TicketStatus.DOCS_REVIEW,
  ],
  [TicketStatus.DOCS_REVIEW]: [
    TicketStatus.MISSING_DOCS,
    TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
  ],
  [TicketStatus.MISSING_DOCS]: [TicketStatus.REQUESTER_PINGED],
  [TicketStatus.REQUESTER_PINGED]: [TicketStatus.WAITING_FOR_DOCS],
  [TicketStatus.WAITING_FOR_DOCS]: [TicketStatus.DOCS_REVIEW],
  [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION]: [TicketStatus.WHT_CALCULATION],
  [TicketStatus.WHT_CALCULATION]: [TicketStatus.VOUCHER_GENERATION],
  [TicketStatus.VOUCHER_GENERATION]: [TicketStatus.XERO_BILL_ENTRY],
  [TicketStatus.XERO_BILL_ENTRY]: [TicketStatus.PAYMENT_PREPARATION],
  [TicketStatus.PAYMENT_PREPARATION]: [TicketStatus.BANK_UPLOAD],
  [TicketStatus.BANK_UPLOAD]: [TicketStatus.CFO_SIGN_PENDING],
  [TicketStatus.CFO_SIGN_PENDING]: [TicketStatus.BANK_EXECUTION_PENDING],
  [TicketStatus.BANK_EXECUTION_PENDING]: [TicketStatus.BANK_EXECUTED],
  [TicketStatus.BANK_EXECUTED]: [TicketStatus.MARKED_PAID_IN_XERO],
  [TicketStatus.MARKED_PAID_IN_XERO]: [TicketStatus.REQUESTER_NOTIFIED],
  [TicketStatus.REQUESTER_NOTIFIED]: [TicketStatus.PAYMENT_COMPLETE],
  [TicketStatus.PAYMENT_COMPLETE]: [],
};

const ROLE_STATUS_PERMISSIONS: Record<
  Role,
  Partial<Record<TicketStatus, TicketStatus[]>>
> = {
  [Role.DEPT_USER]: {
    [TicketStatus.NEW_REQUEST]: [TicketStatus.DEPARTMENT_HEAD_APPROVAL],
    [TicketStatus.WAITING_FOR_DOCS]: [TicketStatus.DOCS_REVIEW],
  },
  [Role.DEPT_ADMIN]: {},
  [Role.AP_CLERK]: {
    [TicketStatus.DOCS_REVIEW]: [
      TicketStatus.MISSING_DOCS,
      TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
    ],
    [TicketStatus.MISSING_DOCS]: [TicketStatus.REQUESTER_PINGED],
    [TicketStatus.REQUESTER_PINGED]: [TicketStatus.WAITING_FOR_DOCS],
    [TicketStatus.WAITING_FOR_DOCS]: [TicketStatus.DOCS_REVIEW],
    [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION]: [
      TicketStatus.WHT_CALCULATION,
    ],
    [TicketStatus.WHT_CALCULATION]: [TicketStatus.VOUCHER_GENERATION],
    [TicketStatus.VOUCHER_GENERATION]: [TicketStatus.XERO_BILL_ENTRY],
    [TicketStatus.XERO_BILL_ENTRY]: [TicketStatus.PAYMENT_PREPARATION],
    [TicketStatus.PAYMENT_PREPARATION]: [TicketStatus.BANK_UPLOAD],
    [TicketStatus.BANK_UPLOAD]: [TicketStatus.CFO_SIGN_PENDING],
    [TicketStatus.BANK_EXECUTED]: [TicketStatus.MARKED_PAID_IN_XERO],
    [TicketStatus.MARKED_PAID_IN_XERO]: [TicketStatus.REQUESTER_NOTIFIED],
    [TicketStatus.REQUESTER_NOTIFIED]: [TicketStatus.PAYMENT_COMPLETE],
  },
  [Role.CFO]: {
    [TicketStatus.CFO_SIGN_PENDING]: [TicketStatus.BANK_EXECUTION_PENDING],
  },
  [Role.COMPANY_ADMIN]: STATUS_TRANSITIONS,
};

const ALL_TICKET_UPDATE_FIELDS = [
  'title',
  'status',
  'priority',
  'requesterName',
  'requesterEmail',
  'departmentId',
  'assignedToId',
  'vendorId',
  'vendorNameSnapshot',
  'purchaseOrderNumber',
  'purchaseOrderRequired',
  'purchaseOrderVerified',
  'invoiceNumber',
  'internalReference',
  'amountPkr',
  'paymentMethod',
  'vendorAccountNumber',
  'invoiceAccountNumber',
  'accountVerificationStatus',
  'accountVerificationSource',
  'documentStatus',
  'missingDocuments',
  'expenseNature',
  'billType',
  'xeroSyncStatus',
  'xeroContactId',
  'xeroBillId',
  'xeroBillNumber',
  'xeroPaymentId',
  'whtFilerStatus',
  'whtRate',
  'voucherNumber',
  'bankPaymentStatus',
  'bankPortalReference',
  'trelloCardId',
  'trelloUrl',
  'legacySheetRowId',
  'legacySheetName',
  'oldReference',
  'parentTicketId',
  'invoiceId',
  'notes',
  'submittedToFinanceAt',
  'dueDate',
] as const;

const AP_STAGE_FIELDS: Partial<Record<TicketStatus, readonly string[]>> = {
  [TicketStatus.DOCS_REVIEW]: [
    'status',
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.MISSING_DOCS]: [
    'status',
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.REQUESTER_PINGED]: [
    'status',
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.WAITING_FOR_DOCS]: [
    'status',
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION]: [
    'status',
    'assignedToId',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'purchaseOrderRequired',
    'purchaseOrderVerified',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationStatus',
    'accountVerificationSource',
    'notes',
  ],
  [TicketStatus.WHT_CALCULATION]: [
    'status',
    'assignedToId',
    'whtFilerStatus',
    'whtRate',
    'notes',
  ],
  [TicketStatus.VOUCHER_GENERATION]: [
    'status',
    'assignedToId',
    'voucherNumber',
    'notes',
  ],
  [TicketStatus.XERO_BILL_ENTRY]: [
    'status',
    'assignedToId',
    'xeroSyncStatus',
    'xeroContactId',
    'xeroBillId',
    'xeroBillNumber',
    'xeroPaymentId',
    'notes',
  ],
  [TicketStatus.PAYMENT_PREPARATION]: [
    'status',
    'assignedToId',
    'paymentMethod',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  [TicketStatus.BANK_UPLOAD]: [
    'status',
    'assignedToId',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  [TicketStatus.CFO_SIGN_PENDING]: ['status', 'assignedToId', 'notes'],
  [TicketStatus.BANK_EXECUTION_PENDING]: [
    'status',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  [TicketStatus.BANK_EXECUTED]: [
    'status',
    'xeroSyncStatus',
    'xeroPaymentId',
    'notes',
  ],
  [TicketStatus.MARKED_PAID_IN_XERO]: ['status', 'notes'],
  [TicketStatus.REQUESTER_NOTIFIED]: ['status', 'notes'],
};

const DEPARTMENT_STAGE_FIELDS: Partial<
  Record<TicketStatus, readonly string[]>
> = {
  [TicketStatus.NEW_REQUEST]: [
    'status',
    'title',
    'priority',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'notes',
  ],
  [TicketStatus.WAITING_FOR_DOCS]: [
    'status',
    'title',
    'requesterName',
    'requesterEmail',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'notes',
  ],
};

const CFO_STAGE_FIELDS: Partial<Record<TicketStatus, readonly string[]>> = {
  [TicketStatus.CFO_SIGN_PENDING]: [
    'status',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
};

const ticketInclude = Prisma.validator<Prisma.PaymentTicketInclude>()({
  department: true,
  vendor: true,
  assignedTo: { select: { id: true, name: true, email: true, role: true } },
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  invoice: {
    select: {
      id: true,
      reference: true,
      status: true,
      amountPkr: true,
      originalFilename: true,
    },
  },
  parentTicket: { select: { id: true, title: true, internalReference: true } },
  childTickets: {
    select: { id: true, title: true, amountPkr: true, status: true },
  },
  activities: {
    orderBy: { createdAt: 'desc' },
    take: 12,
    include: { actor: { select: { id: true, name: true, email: true } } },
  },
});

const attachmentInclude = Prisma.validator<Prisma.SupportingDocumentInclude>()({
  uploadedBy: { select: { id: true, name: true, email: true } },
});

type RequestUser = { id: string; role: Role; departmentId: string | null };

type TicketAttachment = Prisma.SupportingDocumentGetPayload<{
  include: typeof attachmentInclude;
}>;

function toKarachiShifted(date: Date) {
  return new Date(date.getTime() + KARACHI_OFFSET_MS);
}

function fromKarachiUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  return new Date(Date.UTC(year, month, day, hour, minute) - KARACHI_OFFSET_MS);
}

export function calculateFinanceDueDate(receivedAt = new Date()) {
  const local = toKarachiShifted(receivedAt);
  const startDay = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );

  if (local.getUTCHours() >= 16) {
    startDay.setUTCDate(startDay.getUTCDate() + 1);
  }

  startDay.setUTCDate(startDay.getUTCDate() + 3);

  return fromKarachiUtc(
    startDay.getUTCFullYear(),
    startDay.getUTCMonth(),
    startDay.getUTCDate(),
    18,
  );
}

function defaultWhtRate(status: FilerStatus) {
  if (status === FilerStatus.FILER) return new Prisma.Decimal(4.5);
  if (status === FilerStatus.NON_FILER) return new Prisma.Decimal(10);
  return null;
}

function buildTitle(dto: CreateTicketDto) {
  if (dto.title?.trim()) return dto.title.trim();
  const reference = dto.invoiceNumber || dto.internalReference;
  const vendor = dto.vendorNameSnapshot || 'Vendor pending';
  return reference ? `${reference} - ${vendor}` : `${vendor} payment request`;
}

function nullableString(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function uploadRoot() {
  return process.env.UPLOAD_DIR || './uploads';
}

@Injectable()
export class TicketsService {
  constructor(private prisma: PrismaService) {}

  async meta(user: RequestUser) {
    const [departments, vendors, assignees] = await Promise.all([
      this.prisma.department.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.vendor.findMany({
        where: { active: true },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: this.assigneeWhere(user),
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, role: true },
      }),
    ]);

    return {
      departments,
      vendors,
      assignees,
      boardStatuses: TICKET_BOARD_STATUSES,
      boardColumns: TICKET_BOARD_COLUMNS,
      statusLabels: TICKET_STATUS_LABELS,
      canAssign: this.canAssign(user),
    };
  }

  async board(user: RequestUser) {
    const tickets = await this.listForUser(user);
    return TICKET_BOARD_COLUMNS.map((column) => ({
      ...column,
      tickets: tickets.filter((ticket) =>
        (column.statuses as readonly TicketStatus[]).includes(ticket.status),
      ),
    }));
  }

  async listForUser(user: RequestUser) {
    const tickets = await this.prisma.paymentTicket.findMany({
      where: this.accessWhere(user),
      include: ticketInclude,
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });
    return tickets.map((ticket) => this.decorateTicket(ticket, user));
  }

  async getOne(id: string, user: RequestUser) {
    const ticket = await this.prisma.paymentTicket.findFirst({
      where: { id, ...this.accessWhere(user) },
      include: ticketInclude,
    });
    if (!ticket) throw new NotFoundException();
    return this.decorateTicket(ticket, user);
  }

  async create(dto: CreateTicketDto, user: RequestUser) {
    if (user.role === Role.CFO) {
      throw new ForbiddenException(
        'CFO can only authorize bank payments assigned to CFO scope',
      );
    }
    await this.assertDepartmentAllowed(dto.departmentId, user);
    await this.assertReferences(dto);

    const status = dto.status ?? TicketStatus.DOCS_REVIEW;
    if (dto.assignedToId) await this.assertCanAssign(dto.assignedToId, user);
    this.assertCreateStatus(status, user);
    const submittedToFinanceAt =
      dto.submittedToFinanceAt != null
        ? new Date(dto.submittedToFinanceAt)
        : status === TicketStatus.NEW_REQUEST
          ? null
          : new Date();
    const dueDate =
      dto.dueDate != null
        ? new Date(dto.dueDate)
        : submittedToFinanceAt
          ? calculateFinanceDueDate(submittedToFinanceAt)
          : null;

    const amountPkr = new Prisma.Decimal(dto.amountPkr ?? 0);
    const wht = this.whtData(
      amountPkr,
      dto.whtFilerStatus ?? FilerStatus.UNKNOWN,
      dto.whtRate,
    );

    const ticket = await this.prisma.paymentTicket.create({
      data: {
        title: buildTitle(dto),
        status,
        priority: dto.priority,
        requesterName: nullableString(dto.requesterName),
        requesterEmail: nullableString(dto.requesterEmail),
        department: { connect: { id: dto.departmentId } },
        assignedTo: dto.assignedToId
          ? { connect: { id: dto.assignedToId } }
          : undefined,
        createdBy: { connect: { id: user.id } },
        submittedToFinanceAt,
        dueDate,
        expenseNature: dto.expenseNature,
        billType: dto.billType,
        vendor: dto.vendorId ? { connect: { id: dto.vendorId } } : undefined,
        vendorNameSnapshot: nullableString(dto.vendorNameSnapshot),
        purchaseOrderNumber: nullableString(dto.purchaseOrderNumber),
        purchaseOrderRequired: dto.purchaseOrderRequired,
        purchaseOrderVerified: dto.purchaseOrderVerified,
        invoiceNumber: nullableString(dto.invoiceNumber),
        internalReference: nullableString(dto.internalReference),
        amountPkr,
        paymentMethod: dto.paymentMethod,
        vendorAccountNumber: nullableString(dto.vendorAccountNumber),
        invoiceAccountNumber: nullableString(dto.invoiceAccountNumber),
        accountVerificationStatus: dto.accountVerificationStatus,
        accountVerificationSource: nullableString(
          dto.accountVerificationSource,
        ),
        documentStatus: dto.documentStatus,
        missingDocuments: dto.missingDocuments ?? [],
        xeroSyncStatus: dto.xeroSyncStatus ?? XeroSyncStatus.NOT_READY,
        xeroContactId: nullableString(dto.xeroContactId),
        xeroBillId: nullableString(dto.xeroBillId),
        xeroBillNumber: nullableString(dto.xeroBillNumber),
        xeroPaymentId: nullableString(dto.xeroPaymentId),
        whtFilerStatus: dto.whtFilerStatus,
        ...wht,
        voucherNumber: nullableString(dto.voucherNumber),
        voucherGeneratedAt: dto.voucherNumber ? new Date() : undefined,
        bankPaymentStatus: dto.bankPaymentStatus,
        bankPortalReference: nullableString(dto.bankPortalReference),
        trelloCardId: nullableString(dto.trelloCardId),
        trelloUrl: nullableString(dto.trelloUrl),
        legacySheetRowId: nullableString(dto.legacySheetRowId),
        legacySheetName: nullableString(dto.legacySheetName),
        oldReference: nullableString(dto.oldReference),
        parentTicket: dto.parentTicketId
          ? { connect: { id: dto.parentTicketId } }
          : undefined,
        invoice: dto.invoiceId ? { connect: { id: dto.invoiceId } } : undefined,
        notes: nullableString(dto.notes),
        activities: {
          create: {
            actor: { connect: { id: user.id } },
            type: 'created',
            message: 'Ticket created in AP workflow',
            toStatus: status,
          },
        },
      },
      include: ticketInclude,
    });

    return this.decorateTicket(ticket, user);
  }

  async update(id: string, dto: UpdateTicketDto, user: RequestUser) {
    const existing = await this.prisma.paymentTicket.findFirst({
      where: { id, ...this.accessWhere(user) },
    });
    if (!existing) throw new NotFoundException();

    this.assertUpdateScope(dto, user, existing);
    if (dto.departmentId)
      await this.assertDepartmentAllowed(dto.departmentId, user);
    await this.assertReferences(dto);
    if (dto.status && dto.status !== existing.status) {
      this.assertStatusTransition(existing.status, dto.status, user);
    }
    if (
      dto.assignedToId !== undefined &&
      dto.assignedToId !== existing.assignedToId
    ) {
      await this.assertCanAssign(dto.assignedToId, user);
    }

    const data: Prisma.PaymentTicketUpdateInput = {};
    this.assignScalars(data, dto);

    if (dto.departmentId)
      data.department = { connect: { id: dto.departmentId } };
    if (dto.vendorId !== undefined) {
      data.vendor = dto.vendorId
        ? { connect: { id: dto.vendorId } }
        : { disconnect: true };
    }
    if (dto.assignedToId !== undefined) {
      data.assignedTo = dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : { disconnect: true };
    }
    if (dto.parentTicketId !== undefined) {
      data.parentTicket = dto.parentTicketId
        ? { connect: { id: dto.parentTicketId } }
        : { disconnect: true };
    }
    if (dto.invoiceId !== undefined) {
      data.invoice = dto.invoiceId
        ? { connect: { id: dto.invoiceId } }
        : { disconnect: true };
    }

    const status = dto.status ?? existing.status;
    const movedIntoFinance =
      existing.status === TicketStatus.NEW_REQUEST &&
      status !== TicketStatus.NEW_REQUEST &&
      existing.submittedToFinanceAt == null;

    const submittedToFinanceAt =
      dto.submittedToFinanceAt === null
        ? null
        : dto.submittedToFinanceAt
          ? new Date(dto.submittedToFinanceAt)
          : movedIntoFinance
            ? new Date()
            : undefined;

    if (submittedToFinanceAt !== undefined) {
      data.submittedToFinanceAt = submittedToFinanceAt;
    }

    if (dto.dueDate === null) {
      data.dueDate = null;
    } else if (dto.dueDate) {
      data.dueDate = new Date(dto.dueDate);
    } else if (submittedToFinanceAt instanceof Date) {
      data.dueDate = calculateFinanceDueDate(submittedToFinanceAt);
    }

    if (
      dto.amountPkr !== undefined ||
      dto.whtFilerStatus ||
      dto.whtRate !== undefined
    ) {
      const amount =
        dto.amountPkr !== undefined
          ? new Prisma.Decimal(dto.amountPkr)
          : existing.amountPkr;
      const filer = dto.whtFilerStatus ?? existing.whtFilerStatus;
      const rate =
        dto.whtRate === null
          ? undefined
          : dto.whtRate !== undefined
            ? dto.whtRate
            : existing.whtRate == null
              ? undefined
              : Number(existing.whtRate);
      Object.assign(data, this.whtData(amount, filer, rate));
    }

    if (dto.documentStatus === DocumentStatus.INCOMPLETE && !dto.status) {
      data.status = TicketStatus.MISSING_DOCS;
    }
    if (dto.documentStatus === DocumentStatus.COMPLETE && !dto.status) {
      data.status = TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION;
    }

    const statusChanged =
      data.status != null && data.status !== existing.status;
    const nextStatus = data.status as TicketStatus;
    if (statusChanged && !dto.status) {
      this.assertStatusTransition(existing.status, nextStatus, user);
    }
    if (statusChanged) this.applyStatusSideEffects(data, nextStatus);

    const updated = await this.prisma.paymentTicket.update({
      where: { id },
      data: {
        ...data,
        activities: {
          create: {
            actor: { connect: { id: user.id } },
            type: statusChanged ? 'status_changed' : 'updated',
            message: statusChanged
              ? `Status changed from ${existing.status} to ${nextStatus}`
              : 'Ticket details updated',
            fromStatus: statusChanged ? existing.status : undefined,
            toStatus: statusChanged ? nextStatus : undefined,
          },
        },
      },
      include: ticketInclude,
    });
    return this.decorateTicket(updated, user);
  }

  async submitToFinance(id: string, user: RequestUser) {
    const now = new Date();
    return this.update(
      id,
      {
        status: TicketStatus.DOCS_REVIEW,
        submittedToFinanceAt: now.toISOString(),
        dueDate: calculateFinanceDueDate(now).toISOString(),
      },
      user,
    );
  }

  async listAttachments(id: string, user: RequestUser) {
    await this.assertTicketVisible(id, user);
    const docs = await this.prisma.supportingDocument.findMany({
      where: { ticketId: id },
      include: attachmentInclude,
      orderBy: { uploadedAt: 'desc' },
    });
    return docs.map((doc) => this.serializeAttachment(doc));
  }

  async addComment(id: string, message: string, user: RequestUser) {
    const ticket = await this.assertTicketVisible(id, user);
    const trimmed = String(message ?? '').trim();
    if (!trimmed) throw new BadRequestException('Comment is required');

    await this.prisma.ticketActivity.create({
      data: {
        ticket: { connect: { id } },
        actor: { connect: { id: user.id } },
        type: 'comment',
        message: trimmed,
        toStatus: ticket.status,
      },
    });

    return this.getOne(id, user);
  }

  async uploadAttachment(
    id: string,
    file: Express.Multer.File,
    user: RequestUser,
  ) {
    const ticket = await this.assertTicketVisible(id, user);
    this.assertAttachmentUploadAllowed(ticket.status, user);

    const doc = await this.prisma.supportingDocument.create({
      data: {
        ticket: { connect: { id } },
        documentType: this.documentTypeFromFile(file.originalname),
        fileName: file.originalname,
        filePath: join('ticket-attachments', file.filename),
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: BigInt(file.size),
        uploadedBy: { connect: { id: user.id } },
      },
      include: attachmentInclude,
    });

    await this.prisma.ticketActivity.create({
      data: {
        ticket: { connect: { id } },
        actor: { connect: { id: user.id } },
        type: 'attachment_uploaded',
        message: `Attachment uploaded: ${file.originalname}`,
        toStatus: ticket.status,
      },
    });

    return this.serializeAttachment(doc);
  }

  async attachmentDownload(
    ticketId: string,
    attachmentId: string,
    user: RequestUser,
  ) {
    await this.assertTicketVisible(ticketId, user);
    const doc = await this.prisma.supportingDocument.findFirst({
      where: { id: attachmentId, ticketId },
      include: attachmentInclude,
    });
    if (!doc) throw new NotFoundException();

    const root = resolve(uploadRoot());
    const absolutePath = resolve(root, doc.filePath);
    if (
      absolutePath !== root &&
      !absolutePath.startsWith(`${root}\\`) &&
      !absolutePath.startsWith(`${root}/`)
    ) {
      throw new ForbiddenException('Invalid attachment path');
    }
    try {
      await stat(absolutePath);
    } catch {
      throw new NotFoundException('Attachment file not found');
    }
    return { doc: this.serializeAttachment(doc), absolutePath };
  }

  private accessWhere(user: RequestUser) {
    const financeStatuses = [
      TicketStatus.DOCS_REVIEW,
      TicketStatus.MISSING_DOCS,
      TicketStatus.REQUESTER_PINGED,
      TicketStatus.WAITING_FOR_DOCS,
      TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
      TicketStatus.WHT_CALCULATION,
      TicketStatus.VOUCHER_GENERATION,
      TicketStatus.XERO_BILL_ENTRY,
      TicketStatus.PAYMENT_PREPARATION,
      TicketStatus.BANK_UPLOAD,
      TicketStatus.CFO_SIGN_PENDING,
      TicketStatus.BANK_EXECUTION_PENDING,
      TicketStatus.BANK_EXECUTED,
      TicketStatus.MARKED_PAID_IN_XERO,
      TicketStatus.REQUESTER_NOTIFIED,
      TicketStatus.PAYMENT_COMPLETE,
    ];
    if (user.role === Role.DEPT_USER) {
      if (!user.departmentId) return { id: '__no_department__' };
      return {
        departmentId: user.departmentId,
        status: {
          in: [TicketStatus.NEW_REQUEST, TicketStatus.DEPARTMENT_HEAD_APPROVAL],
        },
      };
    }
    if (user.role === Role.DEPT_ADMIN) {
      if (!user.departmentId) return { id: '__no_department__' };
      return {
        departmentId: user.departmentId,
        status: TicketStatus.DEPARTMENT_HEAD_APPROVAL,
      };
    }
    if (user.role === Role.CFO) {
      return {
        OR: [
          { status: TicketStatus.CFO_SIGN_PENDING },
          { assignedToId: user.id },
        ],
      };
    }
    if (user.role === Role.AP_CLERK) return { status: { in: financeStatuses } };
    return {};
  }

  private assigneeWhere(user: RequestUser): Prisma.UserWhereInput {
    if (user.role === Role.COMPANY_ADMIN) return { active: true };
    if (user.role === Role.AP_CLERK) {
      return {
        active: true,
        role: { in: [Role.COMPANY_ADMIN, Role.AP_CLERK, Role.CFO] },
      };
    }
    if (user.role === Role.CFO) {
      return { active: true, id: user.id };
    }
    return {
      active: true,
      departmentId: user.departmentId ?? '__no_department__',
    };
  }

  private canAssign(user: RequestUser) {
    return user.role === Role.COMPANY_ADMIN || user.role === Role.AP_CLERK;
  }

  private async assertTicketVisible(id: string, user: RequestUser) {
    const ticket = await this.prisma.paymentTicket.findFirst({
      where: { id, ...this.accessWhere(user) },
      select: { id: true, status: true, departmentId: true },
    });
    if (!ticket) throw new NotFoundException();
    return ticket;
  }

  private assertAttachmentUploadAllowed(
    status: TicketStatus,
    user: RequestUser,
  ) {
    if (status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException(
        'Payment complete tickets are locked for audit',
      );
    }
    if (user.role === Role.COMPANY_ADMIN || user.role === Role.AP_CLERK) return;
    if (
      user.role === Role.DEPT_USER &&
      (status === TicketStatus.NEW_REQUEST ||
        status === TicketStatus.WAITING_FOR_DOCS)
    ) {
      return;
    }
    if (user.role === Role.CFO && status === TicketStatus.CFO_SIGN_PENDING)
      return;
    throw new ForbiddenException(
      'You cannot upload attachments at this ticket stage',
    );
  }

  private documentTypeFromFile(fileName: string) {
    const lower = fileName.toLowerCase();
    if (/\bpo\b|purchase[-_\s]?order/.test(lower)) return DocumentType.PO;
    if (/receipt|slip/.test(lower)) return DocumentType.RECEIPT;
    if (/contract/.test(lower)) return DocumentType.CONTRACT;
    if (/delivery/.test(lower)) return DocumentType.DELIVERY_NOTE;
    return DocumentType.INVOICE;
  }

  private serializeAttachment(doc: TicketAttachment) {
    return {
      id: doc.id,
      ticketId: doc.ticketId,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize.toString(),
      documentType: doc.documentType,
      uploadedAt: doc.uploadedAt,
      uploadedBy: doc.uploadedBy,
    };
  }

  private assertUpdateScope(
    dto: UpdateTicketDto,
    user: RequestUser,
    existing: { status: TicketStatus },
  ) {
    const keys = Object.keys(dto).filter(
      (key) => dto[key as keyof UpdateTicketDto] !== undefined,
    );

    if (!keys.length) return;
    if (existing.status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException(
        'Payment complete tickets are locked for audit',
      );
    }

    if (
      user.role === Role.CFO &&
      existing.status !== TicketStatus.CFO_SIGN_PENDING
    ) {
      throw new ForbiddenException(
        'CFO can only sign tickets waiting for CFO authorization',
      );
    }

    const allowed = this.editableFields(user.role, existing.status);
    const forbidden = keys.filter((key) => !allowed.has(key));
    if (forbidden.length) {
      throw new ForbiddenException(
        `${user.role} cannot update ticket fields: ${forbidden.join(', ')}`,
      );
    }
    if (
      user.role === Role.CFO &&
      dto.bankPaymentStatus !== undefined &&
      dto.bankPaymentStatus !== BankPaymentStatus.CFO_SIGNED
    ) {
      throw new ForbiddenException(
        'CFO can only record the CFO signed bank status',
      );
    }
    if (
      user.role === Role.AP_CLERK &&
      dto.bankPaymentStatus === BankPaymentStatus.CFO_SIGNED
    ) {
      throw new ForbiddenException(
        'CFO signature must be recorded by CFO or company admin',
      );
    }
  }

  private editableFields(role: Role, status: TicketStatus) {
    if (role === Role.COMPANY_ADMIN)
      return new Set<string>(ALL_TICKET_UPDATE_FIELDS);
    if (role === Role.AP_CLERK)
      return new Set<string>(AP_STAGE_FIELDS[status] ?? []);
    if (role === Role.DEPT_USER)
      return new Set<string>(DEPARTMENT_STAGE_FIELDS[status] ?? []);
    if (role === Role.DEPT_ADMIN) return new Set<string>();
    return new Set<string>(CFO_STAGE_FIELDS[status] ?? []);
  }

  private applyStatusSideEffects(
    data: Prisma.PaymentTicketUpdateInput,
    status: TicketStatus,
  ) {
    if (status === TicketStatus.CFO_SIGN_PENDING) {
      data.bankPaymentStatus = BankPaymentStatus.UPLOADED;
    }
    if (status === TicketStatus.BANK_EXECUTION_PENDING) {
      data.bankPaymentStatus = BankPaymentStatus.CFO_SIGNED;
      data.cfoSignedAt = new Date();
    }
    if (status === TicketStatus.BANK_EXECUTED) {
      data.bankPaymentStatus = BankPaymentStatus.EXECUTED;
      data.bankExecutedAt = new Date();
    }
    if (status === TicketStatus.MARKED_PAID_IN_XERO) {
      data.xeroSyncStatus = XeroSyncStatus.PAID_MARKED;
    }
    if (status === TicketStatus.REQUESTER_NOTIFIED) {
      data.requesterNotifiedAt = new Date();
    }
  }

  private allowedTransitions(status: TicketStatus, user: RequestUser) {
    const roleAllowed = ROLE_STATUS_PERMISSIONS[user.role][status] ?? [];
    const processAllowed = STATUS_TRANSITIONS[status] ?? [];
    return roleAllowed.filter((candidate) =>
      processAllowed.includes(candidate),
    );
  }

  private decorateTicket<T extends { status: TicketStatus }>(
    ticket: T,
    user: RequestUser,
  ) {
    const availableTransitions = this.allowedTransitions(ticket.status, user);
    return {
      ...ticket,
      statusLabel: TICKET_STATUS_LABELS[ticket.status],
      availableTransitions,
      canAssign: this.canAssign(user),
    };
  }

  private assertStatusTransition(
    fromStatus: TicketStatus,
    toStatus: TicketStatus,
    user: RequestUser,
  ) {
    const allowed = this.allowedTransitions(fromStatus, user);
    if (!allowed.includes(toStatus)) {
      throw new ForbiddenException(
        `Status cannot move from ${fromStatus} to ${toStatus} for ${user.role}`,
      );
    }
  }

  private async assertCanAssign(
    assignedToId: string | null | undefined,
    user: RequestUser,
  ) {
    if (!this.canAssign(user)) {
      throw new ForbiddenException(
        'Only AP and company admins can assign payment tickets',
      );
    }
    if (!assignedToId) return;
    const assignee = await this.prisma.user.findFirst({
      where: { id: assignedToId, ...this.assigneeWhere(user) },
    });
    if (!assignee) {
      throw new ForbiddenException(
        'Assignee is outside your permitted AP scope',
      );
    }
  }

  private assertCreateStatus(status: TicketStatus, user: RequestUser) {
    const financeEntryStatuses: TicketStatus[] = [
      TicketStatus.NEW_REQUEST,
      TicketStatus.DOCS_REVIEW,
      TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
    ];
    const departmentEntryStatuses: TicketStatus[] = [
      TicketStatus.NEW_REQUEST,
      TicketStatus.DOCS_REVIEW,
    ];
    const allowed =
      user.role === Role.DEPT_USER
        ? departmentEntryStatuses
        : financeEntryStatuses;
    if (!allowed.includes(status)) {
      throw new ForbiddenException(
        'Tickets must enter through invoice submission or finance review',
      );
    }
  }

  private async assertDepartmentAllowed(
    departmentId: string,
    user: RequestUser,
  ) {
    if (
      (user.role === Role.DEPT_ADMIN || user.role === Role.DEPT_USER) &&
      user.departmentId !== departmentId
    ) {
      throw new ForbiddenException(
        'You can only create tickets for your department',
      );
    }
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) throw new BadRequestException('Invalid department');
  }

  private async assertReferences(dto: {
    vendorId?: string | null;
    assignedToId?: string | null;
    parentTicketId?: string | null;
    invoiceId?: string | null;
  }) {
    if (dto.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: dto.vendorId },
      });
      if (!vendor) throw new BadRequestException('Invalid vendor');
    }
    if (dto.assignedToId) {
      const user = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
      });
      if (!user) throw new BadRequestException('Invalid assignee');
    }
    if (dto.parentTicketId) {
      const parent = await this.prisma.paymentTicket.findUnique({
        where: { id: dto.parentTicketId },
      });
      if (!parent) throw new BadRequestException('Invalid parent ticket');
    }
    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: dto.invoiceId },
      });
      if (!invoice) throw new BadRequestException('Invalid invoice');
    }
  }

  private assignScalars(
    data: Prisma.PaymentTicketUpdateInput,
    dto: UpdateTicketDto,
  ) {
    if (dto.title !== undefined)
      data.title = nullableString(dto.title) ?? 'Untitled AP ticket';
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.requesterName !== undefined)
      data.requesterName = nullableString(dto.requesterName);
    if (dto.requesterEmail !== undefined)
      data.requesterEmail = nullableString(dto.requesterEmail);
    if (dto.expenseNature !== undefined) data.expenseNature = dto.expenseNature;
    if (dto.billType !== undefined) data.billType = dto.billType;
    if (dto.vendorNameSnapshot !== undefined) {
      data.vendorNameSnapshot = nullableString(dto.vendorNameSnapshot);
    }
    if (dto.amountPkr !== undefined)
      data.amountPkr = new Prisma.Decimal(dto.amountPkr);
    if (dto.paymentMethod !== undefined) data.paymentMethod = dto.paymentMethod;
    if (dto.purchaseOrderNumber !== undefined) {
      data.purchaseOrderNumber = nullableString(dto.purchaseOrderNumber);
    }
    if (dto.purchaseOrderRequired !== undefined) {
      data.purchaseOrderRequired = dto.purchaseOrderRequired;
    }
    if (dto.purchaseOrderVerified !== undefined) {
      data.purchaseOrderVerified = dto.purchaseOrderVerified;
    }
    if (dto.invoiceNumber !== undefined)
      data.invoiceNumber = nullableString(dto.invoiceNumber);
    if (dto.internalReference !== undefined) {
      data.internalReference = nullableString(dto.internalReference);
    }
    if (dto.vendorAccountNumber !== undefined) {
      data.vendorAccountNumber = nullableString(dto.vendorAccountNumber);
    }
    if (dto.invoiceAccountNumber !== undefined) {
      data.invoiceAccountNumber = nullableString(dto.invoiceAccountNumber);
    }
    if (dto.accountVerificationStatus !== undefined) {
      data.accountVerificationStatus = dto.accountVerificationStatus;
    }
    if (dto.accountVerificationSource !== undefined) {
      data.accountVerificationSource = nullableString(
        dto.accountVerificationSource,
      );
    }
    if (dto.documentStatus !== undefined)
      data.documentStatus = dto.documentStatus;
    if (dto.missingDocuments !== undefined)
      data.missingDocuments = dto.missingDocuments;
    if (dto.xeroSyncStatus !== undefined)
      data.xeroSyncStatus = dto.xeroSyncStatus;
    if (dto.xeroContactId !== undefined)
      data.xeroContactId = nullableString(dto.xeroContactId);
    if (dto.xeroBillId !== undefined)
      data.xeroBillId = nullableString(dto.xeroBillId);
    if (dto.xeroBillNumber !== undefined)
      data.xeroBillNumber = nullableString(dto.xeroBillNumber);
    if (dto.xeroPaymentId !== undefined)
      data.xeroPaymentId = nullableString(dto.xeroPaymentId);
    if (dto.whtFilerStatus !== undefined)
      data.whtFilerStatus = dto.whtFilerStatus;
    if (dto.voucherNumber !== undefined) {
      data.voucherNumber = nullableString(dto.voucherNumber);
      data.voucherGeneratedAt = dto.voucherNumber ? new Date() : null;
    }
    if (dto.bankPaymentStatus !== undefined)
      data.bankPaymentStatus = dto.bankPaymentStatus;
    if (dto.bankPortalReference !== undefined) {
      data.bankPortalReference = nullableString(dto.bankPortalReference);
    }
    if (dto.trelloCardId !== undefined)
      data.trelloCardId = nullableString(dto.trelloCardId);
    if (dto.trelloUrl !== undefined)
      data.trelloUrl = nullableString(dto.trelloUrl);
    if (dto.legacySheetRowId !== undefined) {
      data.legacySheetRowId = nullableString(dto.legacySheetRowId);
    }
    if (dto.legacySheetName !== undefined) {
      data.legacySheetName = nullableString(dto.legacySheetName);
    }
    if (dto.oldReference !== undefined)
      data.oldReference = nullableString(dto.oldReference);
    if (dto.notes !== undefined) data.notes = nullableString(dto.notes);
  }

  private whtData(
    amountPkr: Prisma.Decimal,
    filerStatus: FilerStatus,
    suppliedRate?: number | null,
  ): Pick<
    Prisma.PaymentTicketCreateInput,
    'whtRate' | 'whtAmountPkr' | 'netPayablePkr'
  > {
    const rate =
      suppliedRate != null
        ? new Prisma.Decimal(suppliedRate)
        : defaultWhtRate(filerStatus);

    if (!rate) {
      return {
        whtRate: null,
        whtAmountPkr: null,
        netPayablePkr: amountPkr,
      };
    }

    const whtAmount = new Prisma.Decimal(
      amountPkr.mul(rate).div(100).toFixed(2),
    );
    return {
      whtRate: rate,
      whtAmountPkr: whtAmount,
      netPayablePkr: amountPkr.minus(whtAmount),
    };
  }
}
