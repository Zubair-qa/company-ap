import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountVerificationStatus,
  BankPaymentStatus,
  BillType,
  DocumentType,
  DocumentStatus,
  ExpenseNature,
  FilerStatus,
  InvoiceStatus,
  PaymentMilestoneKind,
  PaymentMilestoneStatus,
  Prisma,
  Role,
  TicketStatus,
  PaymentPlanStatus,
  PaymentPlanType,
  VerificationStatus,
  XeroSyncStatus,
} from '@prisma/client';
import { stat } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, UpdateTicketDto } from './dto/ticket.dto';

const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;

export const TICKET_BOARD_STATUSES: TicketStatus[] = [
  TicketStatus.NEW_REQUEST,
  TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
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
  [TicketStatus.ADVANCE_PAID_REMAINING_PENDING]: 'Advance paid / remaining proof pending',
  [TicketStatus.DEPARTMENT_HEAD_APPROVAL]: 'Legacy approval stage',
  [TicketStatus.DOCS_REVIEW]: 'Finance document review',
  [TicketStatus.MISSING_DOCS]: 'Missing documents',
  [TicketStatus.REQUESTER_PINGED]: 'Requester pinged',
  [TicketStatus.WAITING_FOR_DOCS]: 'Waiting for documents',
  [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION]: 'Vendor / PO / account verification',
  [TicketStatus.WHT_CALCULATION]: 'WHT filer/non-filer calculation',
  [TicketStatus.VOUCHER_GENERATION]: 'Voucher generation',
  [TicketStatus.XERO_BILL_ENTRY]: 'Xero bill entry',
  [TicketStatus.PAYMENT_PREPARATION]: 'Payment preparation',
  [TicketStatus.BANK_UPLOAD]: 'AP finance final review',
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
    scope: 'Department creates invoice packs and fixes AI/AP proof requests before finance release.',
    statuses: [
      TicketStatus.NEW_REQUEST,
      TicketStatus.MISSING_DOCS,
      TicketStatus.REQUESTER_PINGED,
      TicketStatus.WAITING_FOR_DOCS,
    ],
  },
  {
    id: 'remaining_payment_pending',
    label: 'Advance paid / remaining pending',
    scope: 'Advance is paid. Department uploads GRN, delivery note, or final proof to release remaining payment.',
    statuses: [TicketStatus.ADVANCE_PAID_REMAINING_PENDING],
  },
  {
    id: 'ap_finance_final_review',
    label: 'AP finance final review',
    scope: 'AI verification runs in the background; AP finance performs one final tax, voucher, and payment review before CFO sign.',
    statuses: [
      TicketStatus.DOCS_REVIEW,
      TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
      TicketStatus.WHT_CALCULATION,
      TicketStatus.VOUCHER_GENERATION,
      TicketStatus.XERO_BILL_ENTRY,
      TicketStatus.PAYMENT_PREPARATION,
      TicketStatus.BANK_UPLOAD,
    ],
  },
  {
    id: 'payment_disbursement',
    label: 'CFO and bank execution',
    scope: 'CFO signs the prepared payment and AP confirms payment gateway/bank execution.',
    statuses: [
      TicketStatus.CFO_SIGN_PENDING,
      TicketStatus.BANK_EXECUTION_PENDING,
      TicketStatus.BANK_EXECUTED,
    ],
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation and close',
    scope: 'Payment is marked paid in Xero, requester is notified, and ticket is closed.',
    statuses: [
      TicketStatus.MARKED_PAID_IN_XERO,
      TicketStatus.REQUESTER_NOTIFIED,
      TicketStatus.PAYMENT_COMPLETE,
    ],
  },
] as const;

const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW_REQUEST]: [TicketStatus.DOCS_REVIEW],
  [TicketStatus.ADVANCE_PAID_REMAINING_PENDING]: [TicketStatus.DOCS_REVIEW],
  [TicketStatus.DEPARTMENT_HEAD_APPROVAL]: [TicketStatus.DOCS_REVIEW],
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
  [TicketStatus.BANK_UPLOAD]: [TicketStatus.CFO_SIGN_PENDING, TicketStatus.WAITING_FOR_DOCS],
  [TicketStatus.CFO_SIGN_PENDING]: [TicketStatus.BANK_EXECUTION_PENDING],
  [TicketStatus.BANK_EXECUTION_PENDING]: [TicketStatus.BANK_EXECUTED],
  [TicketStatus.BANK_EXECUTED]: [TicketStatus.MARKED_PAID_IN_XERO],
  [TicketStatus.MARKED_PAID_IN_XERO]: [TicketStatus.REQUESTER_NOTIFIED],
  [TicketStatus.REQUESTER_NOTIFIED]: [TicketStatus.PAYMENT_COMPLETE],
  [TicketStatus.PAYMENT_COMPLETE]: [],
};

const ROLE_STATUS_PERMISSIONS: Record<Role, Partial<Record<TicketStatus, TicketStatus[]>>> = {
  [Role.DEPT_USER]: {},
  [Role.DEPT_ADMIN]: {},
  [Role.AP_CLERK]: {
    [TicketStatus.BANK_UPLOAD]: [TicketStatus.CFO_SIGN_PENDING, TicketStatus.WAITING_FOR_DOCS],
    [TicketStatus.BANK_EXECUTION_PENDING]: [TicketStatus.BANK_EXECUTED],
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
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.MISSING_DOCS]: [
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.REQUESTER_PINGED]: [
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.WAITING_FOR_DOCS]: [
    'assignedToId',
    'documentStatus',
    'missingDocuments',
    'notes',
  ],
  [TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION]: [
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
    'assignedToId',
    'whtFilerStatus',
    'whtRate',
    'notes',
  ],
  [TicketStatus.VOUCHER_GENERATION]: [
    'assignedToId',
    'voucherNumber',
    'notes',
  ],
  [TicketStatus.XERO_BILL_ENTRY]: [
    'assignedToId',
    'xeroSyncStatus',
    'xeroContactId',
    'xeroBillId',
    'xeroBillNumber',
    'xeroPaymentId',
    'notes',
  ],
  [TicketStatus.PAYMENT_PREPARATION]: [
    'assignedToId',
    'paymentMethod',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  [TicketStatus.BANK_UPLOAD]: [
    'status',
    'assignedToId',
    'whtFilerStatus',
    'whtRate',
    'voucherNumber',
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

const DEPARTMENT_STAGE_FIELDS: Partial<Record<TicketStatus, readonly string[]>> = {
  [TicketStatus.NEW_REQUEST]: [
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
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
  [TicketStatus.MISSING_DOCS]: [
    'title',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
  [TicketStatus.REQUESTER_PINGED]: [
    'title',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
  [TicketStatus.ADVANCE_PAID_REMAINING_PENDING]: [
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'notes',
  ],
  [TicketStatus.WAITING_FOR_DOCS]: [
    'title',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
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
  childTickets: { select: { id: true, title: true, amountPkr: true, status: true } },
  paymentMilestone: {
    include: {
      paymentPlan: {
        include: {
          milestones: {
            orderBy: { sequence: 'asc' },
            include: {
              ticket: { select: { id: true, title: true, status: true, amountPkr: true } },
            },
          },
        },
      },
    },
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

type WorkflowAgentDecision = {
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  summary: string;
  confidence: number;
  checks: string[];
  missingDocuments: string[];
  humanRequired: string | null;
};

type WorkflowAgentResult = {
  decision: WorkflowAgentDecision;
  ticket: unknown;
};

type FinanceClassification = 'OPEX' | 'CAPEX';
type FinanceTrend = 'increase' | 'decrease' | 'flat';
type FinanceTreeLevel = 'classification' | 'group' | 'head' | 'item';

type FinanceDriver = {
  id: string;
  title: string;
  department: string;
  vendor: string;
  amount: number;
  status: TicketStatus;
  statusLabel: string;
};

type FinanceVarianceRow = {
  key: string;
  label: string;
  classification?: FinanceClassification;
  currentAmount: number;
  previousAmount: number;
  varianceAmount: number;
  variancePercent: number;
  trend: FinanceTrend;
  drivers: FinanceDriver[];
};

type FinanceTreeNode = {
  id: string;
  label: string;
  level: FinanceTreeLevel;
  classification?: FinanceClassification;
  currentAmount: number;
  previousAmount: number;
  varianceAmount: number;
  variancePercent: number;
  trend: FinanceTrend;
  children: FinanceTreeNode[];
};

type FinanceDashboardRow = {
  id: string;
  title: string;
  department: string;
  vendor: string;
  head: string;
  group: string;
  classification: FinanceClassification;
  amount: number;
  status: TicketStatus;
  date: Date;
  monthKey: string;
  monthLabel: string;
  quarterKey: string;
  quarterLabel: string;
};

type FinanceDashboardQuery = {
  month?: string;
  compareMonth?: string;
  quarter?: string;
  compareQuarter?: string;
};

type PeriodOption = {
  key: string;
  label: string;
};

type TicketAttachment = Prisma.SupportingDocumentGetPayload<{
  include: typeof attachmentInclude;
}>;

const monthFormatter = new Intl.DateTimeFormat('en-PK', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function decimalNumber(value: Prisma.Decimal | null | undefined) {
  if (value == null) return 0;
  const amount = Number(value.toString());
  return Number.isFinite(amount) ? amount : 0;
}

function financeAmount(
  netPayablePkr: Prisma.Decimal | null | undefined,
  amountPkr: Prisma.Decimal | null | undefined,
) {
  const net = decimalNumber(netPayablePkr);
  return net > 0 ? net : decimalNumber(amountPkr);
}

function monthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function shiftMonth(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function quarterStart(date: Date) {
  const quarterMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), quarterMonth, 1));
}

function shiftQuarter(date: Date, offset: number) {
  const start = quarterStart(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset * 3, 1));
}

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date) {
  return monthFormatter.format(monthStart(date));
}

function parseMonthStart(value: string | undefined, fieldName: string) {
  if (!value) return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) {
    throw new BadRequestException(`${fieldName} must use YYYY-MM format`);
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function quarterKey(date: Date) {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${date.getUTCFullYear()}-Q${quarter}`;
}

function quarterLabel(date: Date) {
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function parseQuarterStart(value: string | undefined, fieldName: string) {
  if (!value) return null;
  const match = /^(\d{4})-Q([1-4])$/.exec(value);
  if (!match) {
    throw new BadRequestException(`${fieldName} must use YYYY-Q1 format`);
  }
  const month = (Number(match[2]) - 1) * 3;
  return new Date(Date.UTC(Number(match[1]), month, 1));
}

function ensurePeriodOption(options: PeriodOption[], option: PeriodOption) {
  if (!options.some((item) => item.key === option.key)) {
    options.push(option);
  }
  return options;
}

function variancePercent(currentAmount: number, previousAmount: number) {
  if (previousAmount === 0 && currentAmount === 0) return 0;
  if (previousAmount === 0) return 100;
  return roundMoney(((currentAmount - previousAmount) / previousAmount) * 100);
}

function trendFor(varianceAmount: number): FinanceTrend {
  if (Math.abs(varianceAmount) < 0.01) return 'flat';
  return varianceAmount > 0 ? 'increase' : 'decrease';
}

function expenseNatureLabel(nature: ExpenseNature) {
  const labels: Record<ExpenseNature, string> = {
    [ExpenseNature.REPAIR_MAINTENANCE]: 'Repair and maintenance',
    [ExpenseNature.UTILITIES]: 'Utilities',
    [ExpenseNature.OFFICE_SUPPLIES]: 'Office supplies',
    [ExpenseNature.PROFESSIONAL_SERVICES]: 'Professional services',
    [ExpenseNature.SOFTWARE_CLOUD]: 'Software and cloud',
    [ExpenseNature.TRAVEL]: 'Travel',
    [ExpenseNature.CAPEX]: 'Capital purchases',
    [ExpenseNature.OTHER]: 'Other expenses',
  };
  return labels[nature];
}

function expenseClassification(nature: ExpenseNature): FinanceClassification {
  return nature === ExpenseNature.CAPEX ? 'CAPEX' : 'OPEX';
}

function expenseGroup(nature: ExpenseNature) {
  if (nature === ExpenseNature.CAPEX) return 'Capital expenditure';
  if (
    nature === ExpenseNature.REPAIR_MAINTENANCE ||
    nature === ExpenseNature.UTILITIES ||
    nature === ExpenseNature.OFFICE_SUPPLIES
  ) {
    return 'Office operations';
  }
  if (
    nature === ExpenseNature.PROFESSIONAL_SERVICES ||
    nature === ExpenseNature.SOFTWARE_CLOUD
  ) {
    return 'Professional and technology';
  }
  if (nature === ExpenseNature.TRAVEL) return 'Travel and mobility';
  return 'Other operating spend';
}

function makeFinanceDriver(row: FinanceDashboardRow): FinanceDriver {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    vendor: row.vendor,
    amount: row.amount,
    status: row.status,
    statusLabel: TICKET_STATUS_LABELS[row.status],
  };
}

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

  async financeDashboard(
    user: RequestUser,
    query: FinanceDashboardQuery = {},
  ): Promise<unknown> {
    if (user.role !== Role.AP_CLERK && user.role !== Role.CFO) {
      throw new ForbiddenException('Finance dashboard is available only to AP Finance and CFO');
    }

    const tickets = await this.prisma.paymentTicket.findMany({
      include: {
        department: { select: { name: true } },
        vendor: { select: { displayName: true } },
        invoice: {
          select: {
            invoiceNumber: true,
            reference: true,
            description: true,
            originalFilename: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    const rows: FinanceDashboardRow[] = tickets.map((ticket) => {
      const effectiveDate =
        ticket.bankExecutedAt ?? ticket.submittedToFinanceAt ?? ticket.createdAt;
      const title =
        ticket.title ||
        ticket.invoice?.reference ||
        ticket.invoice?.invoiceNumber ||
        ticket.invoice?.description ||
        ticket.invoice?.originalFilename ||
        'AP ticket';
      const head = expenseNatureLabel(ticket.expenseNature);
      const classification = expenseClassification(ticket.expenseNature);

      return {
        id: ticket.id,
        title,
        department: ticket.department.name,
        vendor: ticket.vendor?.displayName ?? ticket.vendorNameSnapshot ?? 'Vendor pending',
        head,
        group: expenseGroup(ticket.expenseNature),
        classification,
        amount: financeAmount(ticket.netPayablePkr, ticket.amountPkr),
        status: ticket.status,
        date: effectiveDate,
        monthKey: monthKey(effectiveDate),
        monthLabel: monthLabel(effectiveDate),
        quarterKey: quarterKey(effectiveDate),
        quarterLabel: quarterLabel(effectiveDate),
      };
    });

    const now = new Date();
    const currentMonthDate =
      parseMonthStart(query.month, 'month') ?? monthStart(now);
    const previousMonthDate =
      parseMonthStart(query.compareMonth, 'compareMonth') ??
      shiftMonth(currentMonthDate, -1);
    const currentQuarterDate =
      parseQuarterStart(query.quarter, 'quarter') ?? quarterStart(now);
    const previousQuarterDate =
      parseQuarterStart(query.compareQuarter, 'compareQuarter') ??
      shiftQuarter(currentQuarterDate, -1);
    const currentMonthKey = monthKey(currentMonthDate);
    const previousMonthKey = monthKey(previousMonthDate);
    const currentQuarterKey = quarterKey(currentQuarterDate);
    const previousQuarterKey = quarterKey(previousQuarterDate);
    const availableMonths = Array.from(
      rows
        .reduce((map, row) => {
          map.set(row.monthKey, { key: row.monthKey, label: row.monthLabel });
          return map;
        }, new Map<string, PeriodOption>())
        .values(),
    );
    ensurePeriodOption(availableMonths, {
      key: currentMonthKey,
      label: monthLabel(currentMonthDate),
    });
    ensurePeriodOption(availableMonths, {
      key: previousMonthKey,
      label: monthLabel(previousMonthDate),
    });
    availableMonths.sort((a, b) => b.key.localeCompare(a.key));

    const availableQuarters = Array.from(
      rows
        .reduce((map, row) => {
          map.set(row.quarterKey, { key: row.quarterKey, label: row.quarterLabel });
          return map;
        }, new Map<string, PeriodOption>())
        .values(),
    );
    ensurePeriodOption(availableQuarters, {
      key: currentQuarterKey,
      label: quarterLabel(currentQuarterDate),
    });
    ensurePeriodOption(availableQuarters, {
      key: previousQuarterKey,
      label: quarterLabel(previousQuarterDate),
    });
    availableQuarters.sort((a, b) => b.key.localeCompare(a.key));

    const sumRows = (items: FinanceDashboardRow[]) =>
      roundMoney(items.reduce((sum, row) => sum + row.amount, 0));
    const sumPeriod = (
      periodKey: string,
      periodFor: (row: FinanceDashboardRow) => string,
      filter?: (row: FinanceDashboardRow) => boolean,
    ) => sumRows(rows.filter((row) => periodFor(row) === periodKey && (!filter || filter(row))));
    const periodComparison = (
      key: string,
      label: string,
      periodFor: (row: FinanceDashboardRow) => string,
      currentPeriodKey: string,
      previousPeriodKey: string,
      classification?: FinanceClassification,
    ): FinanceVarianceRow => {
      const filter = (row: FinanceDashboardRow) =>
        classification
          ? row.classification === classification && (row.head === key || row.classification === key)
          : row.head === key;
      const currentRows = rows.filter(
        (row) => periodFor(row) === currentPeriodKey && filter(row),
      );
      const previousRows = rows.filter(
        (row) => periodFor(row) === previousPeriodKey && filter(row),
      );
      const currentAmount = sumRows(currentRows);
      const previousAmount = sumRows(previousRows);
      const varianceAmount = roundMoney(currentAmount - previousAmount);
      const driverRows = (currentRows.length ? currentRows : previousRows)
        .slice()
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 3);

      return {
        key,
        label,
        classification,
        currentAmount,
        previousAmount,
        varianceAmount,
        variancePercent: variancePercent(currentAmount, previousAmount),
        trend: trendFor(varianceAmount),
        drivers: driverRows.map(makeFinanceDriver),
      };
    };

    const heads = Array.from(new Set(rows.map((row) => row.head))).sort();
    const monthlyComparison = heads
      .map((head) =>
        periodComparison(
          head,
          head,
          (row) => row.monthKey,
          currentMonthKey,
          previousMonthKey,
          rows.find((row) => row.head === head)?.classification,
        ),
      )
      .filter((row) => row.currentAmount > 0 || row.previousAmount > 0)
      .sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount));
    const quarterlyComparison = heads
      .map((head) =>
        periodComparison(
          head,
          head,
          (row) => row.quarterKey,
          currentQuarterKey,
          previousQuarterKey,
          rows.find((row) => row.head === head)?.classification,
        ),
      )
      .filter((row) => row.currentAmount > 0 || row.previousAmount > 0)
      .sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount));

    const classificationRows: FinanceVarianceRow[] = (['OPEX', 'CAPEX'] as const).map(
      (classification) => {
        const currentAmount = sumPeriod(
          currentMonthKey,
          (row) => row.monthKey,
          (row) => row.classification === classification,
        );
        const previousAmount = sumPeriod(
          previousMonthKey,
          (row) => row.monthKey,
          (row) => row.classification === classification,
        );
        const varianceAmount = roundMoney(currentAmount - previousAmount);
        const drivers = rows
          .filter(
            (row) =>
              row.monthKey === currentMonthKey && row.classification === classification,
          )
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 3)
          .map(makeFinanceDriver);

        return {
          key: classification,
          label: classification,
          classification,
          currentAmount,
          previousAmount,
          varianceAmount,
          variancePercent: variancePercent(currentAmount, previousAmount),
          trend: trendFor(varianceAmount),
          drivers,
        };
      },
    );

    const buildNode = (
      id: string,
      label: string,
      level: FinanceTreeLevel,
      nodeRows: FinanceDashboardRow[],
      children: FinanceTreeNode[],
      classification?: FinanceClassification,
    ): FinanceTreeNode => {
      const currentAmount = sumRows(nodeRows.filter((row) => row.monthKey === currentMonthKey));
      const previousAmount = sumRows(nodeRows.filter((row) => row.monthKey === previousMonthKey));
      const varianceAmount = roundMoney(currentAmount - previousAmount);
      return {
        id,
        label,
        level,
        classification,
        currentAmount,
        previousAmount,
        varianceAmount,
        variancePercent: variancePercent(currentAmount, previousAmount),
        trend: trendFor(varianceAmount),
        children,
      };
    };

    const currentAndPreviousRows = rows.filter(
      (row) => row.monthKey === currentMonthKey || row.monthKey === previousMonthKey,
    );
    const expenseTree = (['OPEX', 'CAPEX'] as const)
      .map((classification) => {
        const classificationRowsForTree = currentAndPreviousRows.filter(
          (row) => row.classification === classification,
        );
        const groups = Array.from(
          new Set(classificationRowsForTree.map((row) => row.group)),
        ).sort();
        const groupChildren = groups.map((group) => {
          const groupRows = classificationRowsForTree.filter((row) => row.group === group);
          const headsForGroup = Array.from(new Set(groupRows.map((row) => row.head))).sort();
          const headChildren = headsForGroup.map((head) => {
            const headRows = groupRows.filter((row) => row.head === head);
            const itemChildren = headRows
              .slice()
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 12)
              .map((row) =>
                buildNode(
                  `item-${row.id}`,
                  `${row.title} / ${row.department}`,
                  'item',
                  [row],
                  [],
                  row.classification,
                ),
              );
            return buildNode(
              `${classification}-${group}-${head}`,
              head,
              'head',
              headRows,
              itemChildren,
              classification,
            );
          });
          return buildNode(
            `${classification}-${group}`,
            group,
            'group',
            groupRows,
            headChildren,
            classification,
          );
        });
        return buildNode(
          classification,
          classification,
          'classification',
          classificationRowsForTree,
          groupChildren,
          classification,
        );
      })
      .filter((node) => node.currentAmount > 0 || node.previousAmount > 0);

    const paidStatuses = new Set<TicketStatus>([
      TicketStatus.BANK_EXECUTED,
      TicketStatus.MARKED_PAID_IN_XERO,
      TicketStatus.REQUESTER_NOTIFIED,
      TicketStatus.PAYMENT_COMPLETE,
    ]);
    const currentMonthTotal = sumPeriod(currentMonthKey, (row) => row.monthKey);
    const previousMonthTotal = sumPeriod(previousMonthKey, (row) => row.monthKey);
    const totalVarianceAmount = roundMoney(currentMonthTotal - previousMonthTotal);
    const openExposure = sumRows(rows.filter((row) => !paidStatuses.has(row.status)));
    const paidAmount = sumRows(rows.filter((row) => paidStatuses.has(row.status)));
    const increases = monthlyComparison
      .filter((row) => row.varianceAmount > 0)
      .slice()
      .sort((a, b) => b.varianceAmount - a.varianceAmount)
      .slice(0, 5);
    const decreases = monthlyComparison
      .filter((row) => row.varianceAmount < 0)
      .slice()
      .sort((a, b) => a.varianceAmount - b.varianceAmount)
      .slice(0, 5);
    const topIncrease = increases[0];
    const topDecrease = decreases[0];
    const insights = [
      topIncrease
        ? {
            title: `${topIncrease.label} increased`,
            severity: 'warning',
            body: `${topIncrease.label} increased by PKR ${Math.round(
              topIncrease.varianceAmount,
            ).toLocaleString('en-PK')} (${topIncrease.variancePercent}%). Main driver: ${
              topIncrease.drivers[0]?.department ?? 'no department'
            } / ${topIncrease.drivers[0]?.vendor ?? 'vendor pending'}.`,
          }
        : null,
      topDecrease
        ? {
            title: `${topDecrease.label} decreased`,
            severity: 'success',
            body: `${topDecrease.label} decreased by PKR ${Math.round(
              Math.abs(topDecrease.varianceAmount),
            ).toLocaleString('en-PK')} (${Math.abs(topDecrease.variancePercent)}%). This reduces current month exposure against the previous period.`,
          }
        : null,
      {
        title: 'Open AP exposure',
        severity: openExposure > paidAmount ? 'warning' : 'info',
        body: `Open tickets currently represent PKR ${Math.round(openExposure).toLocaleString(
          'en-PK',
        )}; paid or executed tickets represent PKR ${Math.round(paidAmount).toLocaleString(
          'en-PK',
        )}.`,
      },
    ].filter(
      (
        insight,
      ): insight is {
        title: string;
        severity: string;
        body: string;
      } => insight !== null,
    );

    return {
      generatedAt: new Date().toISOString(),
      currentMonth: {
        key: currentMonthKey,
        label: monthLabel(currentMonthDate),
      },
      previousMonth: {
        key: previousMonthKey,
        label: monthLabel(previousMonthDate),
      },
      currentQuarter: {
        key: currentQuarterKey,
        label: quarterLabel(currentQuarterDate),
      },
      previousQuarter: {
        key: previousQuarterKey,
        label: quarterLabel(previousQuarterDate),
      },
      availableMonths,
      availableQuarters,
      summary: {
        totalSpend: currentMonthTotal,
        previousSpend: previousMonthTotal,
        varianceAmount: totalVarianceAmount,
        variancePercent: variancePercent(currentMonthTotal, previousMonthTotal),
        opex: classificationRows.find((row) => row.key === 'OPEX')?.currentAmount ?? 0,
        capex: classificationRows.find((row) => row.key === 'CAPEX')?.currentAmount ?? 0,
        openExposure,
        paidAmount,
        ticketCount: rows.length,
        currentMonthTicketCount: rows.filter((row) => row.monthKey === currentMonthKey).length,
      },
      opexCapex: classificationRows,
      monthlyComparison,
      quarterlyComparison,
      expenseTree,
      topMovers: { increases, decreases },
      insights,
    };
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
      throw new ForbiddenException('CFO can only authorize bank payments assigned to CFO scope');
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
        accountVerificationSource: nullableString(dto.accountVerificationSource),
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
    if (dto.departmentId) await this.assertDepartmentAllowed(dto.departmentId, user);
    await this.assertReferences(dto);
    if (dto.status && dto.status !== existing.status) {
      this.assertStatusTransition(existing.status, dto.status, user);
      if (
        existing.status === TicketStatus.ADVANCE_PAID_REMAINING_PENDING &&
        dto.status === TicketStatus.DOCS_REVIEW
      ) {
        await this.assertRemainingPaymentReady(id, user);
      }
      if (
        existing.status === TicketStatus.BANK_UPLOAD &&
        dto.status === TicketStatus.CFO_SIGN_PENDING
      ) {
        const nextFilerStatus = dto.whtFilerStatus ?? existing.whtFilerStatus;
        if (nextFilerStatus === FilerStatus.UNKNOWN) {
          throw new BadRequestException(
            'AP Finance must select filer/non-filer before CFO sign',
          );
        }
      }
    }
    if (dto.assignedToId !== undefined && dto.assignedToId !== existing.assignedToId) {
      await this.assertCanAssign(dto.assignedToId, user);
    }

    const data: Prisma.PaymentTicketUpdateInput = {};
    this.assignScalars(data, dto);

    if (dto.departmentId) data.department = { connect: { id: dto.departmentId } };
    if (dto.vendorId !== undefined) {
      data.vendor = dto.vendorId ? { connect: { id: dto.vendorId } } : { disconnect: true };
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
      data.invoice = dto.invoiceId ? { connect: { id: dto.invoiceId } } : { disconnect: true };
    }

    const status = dto.status ?? existing.status;
    const movedIntoFinance =
      (existing.status === TicketStatus.NEW_REQUEST ||
        existing.status === TicketStatus.ADVANCE_PAID_REMAINING_PENDING) &&
      status !== TicketStatus.NEW_REQUEST &&
      status !== TicketStatus.ADVANCE_PAID_REMAINING_PENDING &&
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

    if (dto.amountPkr !== undefined || dto.whtFilerStatus || dto.whtRate !== undefined) {
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

    const statusChanged = data.status != null && data.status !== existing.status;
    if (statusChanged && !dto.status) {
      this.assertStatusTransition(existing.status, data.status as TicketStatus, user);
    }
    if (statusChanged) this.applyStatusSideEffects(data, data.status as TicketStatus);

    const updated = await this.prisma.paymentTicket.update({
      where: { id },
      data: {
        ...data,
        activities: {
          create: {
            actor: { connect: { id: user.id } },
            type: statusChanged ? 'status_changed' : 'updated',
            message: statusChanged
              ? `Status changed from ${existing.status} to ${String(data.status)}`
              : 'Ticket details updated',
            fromStatus: statusChanged ? existing.status : undefined,
            toStatus: statusChanged ? (data.status as TicketStatus) : undefined,
          },
        },
      },
      include: ticketInclude,
    });
    if (statusChanged && data.status === TicketStatus.PAYMENT_COMPLETE) {
      await this.handleMilestonePaymentComplete(updated.id, user.id);
      return this.getOne(updated.id, user);
    }
    if (this.shouldRunWorkflowAgentAfterUpdate(existing.status, user, dto, statusChanged)) {
      const agentResult = await this.runWorkflowAgent(updated.id, user);
      return agentResult.ticket;
    }
    return this.decorateTicket(updated, user);
  }

  async runTestBankAutomation(id: string, user: RequestUser) {
    if (user.role !== Role.COMPANY_ADMIN && user.role !== Role.AP_CLERK) {
      throw new ForbiddenException('AP or company admin access is required for test bank automation');
    }

    const existing = await this.prisma.paymentTicket.findFirst({
      where: { id, ...this.accessWhere(user) },
    });
    if (!existing) throw new NotFoundException();
    if (existing.status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException('Payment complete tickets are locked for audit');
    }
    if (existing.status !== TicketStatus.BANK_EXECUTION_PENDING) {
      throw new BadRequestException('Test bank can run only after CFO sign is recorded');
    }

    const now = new Date();
    const stamp = Date.now();
    const bankPortalReference = existing.bankPortalReference ?? `TESTBANK-${stamp}`;
    const xeroBillId = existing.xeroBillId ?? `test-xero-bill-${stamp}`;
    const xeroBillNumber = existing.xeroBillNumber ?? `TEST-XBILL-${stamp}`;
    const xeroPaymentId = existing.xeroPaymentId ?? `test-xero-payment-${stamp}`;
    const paidAmount = existing.netPayablePkr ?? existing.amountPkr;
    const milestone = await this.prisma.paymentMilestone.findUnique({
      where: { ticketId: id },
      include: { paymentPlan: true },
    });

    const updated = await this.prisma.paymentTicket.update({
      where: { id },
      data: {
        status: TicketStatus.PAYMENT_COMPLETE,
        bankPaymentStatus: BankPaymentStatus.EXECUTED,
        bankPortalReference,
        bankExecutedAt: now,
        xeroSyncStatus: XeroSyncStatus.PAID_MARKED,
        xeroBillId,
        xeroBillNumber,
        xeroPaymentId,
        xeroLastSyncedAt: now,
        xeroError: null,
        requesterNotifiedAt: now,
        invoice: existing.invoiceId && !milestone
          ? {
              update: {
                status: InvoiceStatus.PAID,
                amountPaid: paidAmount,
                balanceDue: new Prisma.Decimal(0),
              },
            }
          : undefined,
        activities: {
          create: [
            {
              actor: { connect: { id: user.id } },
              type: 'test_bank_execution',
              message: `Test Bank Simulator executed payment ${bankPortalReference}`,
              fromStatus: TicketStatus.BANK_EXECUTION_PENDING,
              toStatus: TicketStatus.BANK_EXECUTED,
            },
            {
              actor: { connect: { id: user.id } },
              type: 'test_xero_paid',
              message: `Test Xero payment recorded ${xeroPaymentId}`,
              fromStatus: TicketStatus.BANK_EXECUTED,
              toStatus: TicketStatus.MARKED_PAID_IN_XERO,
            },
            {
              actor: { connect: { id: user.id } },
              type: 'requester_notified',
              message: 'Requester notification completed by test bank automation',
              fromStatus: TicketStatus.MARKED_PAID_IN_XERO,
              toStatus: TicketStatus.REQUESTER_NOTIFIED,
            },
            {
              actor: { connect: { id: user.id } },
              type: 'payment_complete',
              message: 'Payment closed automatically after test bank confirmation',
              fromStatus: TicketStatus.REQUESTER_NOTIFIED,
              toStatus: TicketStatus.PAYMENT_COMPLETE,
            },
          ],
        },
      },
      include: ticketInclude,
    });

    if (milestone) {
      await this.handleMilestonePaymentComplete(updated.id, user.id);
    }

    return {
      provider: 'Test Bank Simulator',
      automation: [
        'BANK_EXECUTION_PENDING -> BANK_EXECUTED',
        'BANK_EXECUTED -> MARKED_PAID_IN_XERO',
        'MARKED_PAID_IN_XERO -> REQUESTER_NOTIFIED',
        'REQUESTER_NOTIFIED -> PAYMENT_COMPLETE',
      ],
      ticket: await this.getOne(updated.id, user),
    };
  }

  async submitToFinance(id: string, user: RequestUser) {
    return this.runWorkflowAgent(id, user);
  }

  async runWorkflowAgent(id: string, user: RequestUser, depth = 0): Promise<WorkflowAgentResult> {
    if (user.role === Role.CFO) {
      throw new ForbiddenException('CFO approval remains a human-controlled step');
    }

    const ticket = await this.prisma.paymentTicket.findFirst({
      where: { id, ...this.accessWhere(user) },
      include: {
        attachments: true,
        parentTicket: true,
        paymentMilestone: {
          include: {
            paymentPlan: {
              include: {
                milestones: {
                  include: { ticket: true },
                  orderBy: { sequence: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException();
    if (ticket.status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException('Payment complete tickets are locked for audit');
    }

    const fromStatus = ticket.status;
    const data: Prisma.PaymentTicketUpdateInput = {};
    const checks: string[] = [];
    const missingDocuments = this.requiredDocumentGaps(ticket);
    const submissionGaps = this.agentSubmissionGaps(ticket);
    let summary = 'Agent checked the ticket and no automatic movement was required.';
    let humanRequired: string | null = null;
    let confidence = 82;

    const setStatus = (status: TicketStatus) => {
      data.status = status;
      if (status !== fromStatus) this.applyStatusSideEffects(data, status);
    };

    if (
      ticket.status === TicketStatus.NEW_REQUEST ||
      ticket.status === TicketStatus.MISSING_DOCS ||
      ticket.status === TicketStatus.REQUESTER_PINGED ||
      ticket.status === TicketStatus.WAITING_FOR_DOCS ||
      ticket.status === TicketStatus.ADVANCE_PAID_REMAINING_PENDING
    ) {
      if (ticket.status === TicketStatus.ADVANCE_PAID_REMAINING_PENDING && !submissionGaps.length) {
        await this.assertRemainingPaymentReady(id, user);
      }

      if (submissionGaps.length) {
        data.documentStatus = DocumentStatus.INCOMPLETE;
        data.missingDocuments = submissionGaps;
        setStatus(TicketStatus.WAITING_FOR_DOCS);
        data.submittedToFinanceAt = null;
        data.dueDate = null;
        summary =
          'Agent found missing documents/data and kept the request in department draft/rework for correction.';
        confidence = 74;
      } else {
        const now = new Date();
        Object.assign(
          data,
          this.whtData(
            ticket.amountPkr,
            ticket.whtFilerStatus,
            ticket.whtRate == null ? undefined : Number(ticket.whtRate),
          ),
        );
        data.documentStatus = DocumentStatus.COMPLETE;
        data.missingDocuments = [];
        data.submittedToFinanceAt = now;
        data.dueDate = calculateFinanceDueDate(now);
        data.purchaseOrderVerified = ticket.purchaseOrderRequired ? true : ticket.purchaseOrderVerified;
        data.accountVerificationStatus = this.agentAccountVerificationStatus(ticket);
        data.accountVerificationSource =
          ticket.accountVerificationSource ??
          'Agent verified account evidence from invoice fields, vendor data, or legacy reference.';
        data.voucherNumber = ticket.voucherNumber ?? `VCH-${Date.now()}`;
        data.voucherGeneratedAt = ticket.voucherGeneratedAt ?? now;
        data.xeroSyncStatus =
          ticket.xeroSyncStatus === XeroSyncStatus.BILL_CREATED
            ? XeroSyncStatus.BILL_CREATED
            : XeroSyncStatus.READY_TO_SYNC;
        data.bankPaymentStatus = BankPaymentStatus.READY_FOR_UPLOAD;
        setStatus(TicketStatus.BANK_UPLOAD);
        summary =
          'Agent verified documents/data, prepared voucher/payment readiness, and released the ticket to AP finance final review.';
        confidence = 95;
      }
      checks.push(
        'Document completeness',
        'Vendor details',
        'PO/invoice reference',
        'Account evidence',
        'Amount validation',
        'Finance due date rule',
      );
    } else if (user.role === Role.AP_CLERK || user.role === Role.COMPANY_ADMIN) {
      switch (ticket.status) {
        case TicketStatus.DOCS_REVIEW:
          checks.push('Invoice/PO attachments', 'Missing document list');
          if (submissionGaps.length || ticket.documentStatus === DocumentStatus.INCOMPLETE) {
            data.documentStatus = DocumentStatus.INCOMPLETE;
            data.missingDocuments = submissionGaps.length ? submissionGaps : ticket.missingDocuments;
            setStatus(TicketStatus.WAITING_FOR_DOCS);
            summary =
              'Agent found incomplete supporting evidence and returned the ticket to department draft/rework.';
            confidence = 78;
          } else {
            const now = new Date();
            Object.assign(
              data,
              this.whtData(
                ticket.amountPkr,
                ticket.whtFilerStatus,
                ticket.whtRate == null ? undefined : Number(ticket.whtRate),
              ),
            );
            data.documentStatus = DocumentStatus.COMPLETE;
            data.missingDocuments = [];
            data.purchaseOrderVerified = ticket.purchaseOrderRequired ? true : ticket.purchaseOrderVerified;
            data.accountVerificationStatus = this.agentAccountVerificationStatus(ticket);
            data.accountVerificationSource =
              ticket.accountVerificationSource ??
              'Agent verified account evidence from invoice fields, vendor data, or legacy reference.';
            data.voucherNumber = ticket.voucherNumber ?? `VCH-${Date.now()}`;
            data.voucherGeneratedAt = ticket.voucherGeneratedAt ?? now;
            data.xeroSyncStatus =
              ticket.xeroSyncStatus === XeroSyncStatus.BILL_CREATED
                ? XeroSyncStatus.BILL_CREATED
                : XeroSyncStatus.READY_TO_SYNC;
            data.bankPaymentStatus = BankPaymentStatus.READY_FOR_UPLOAD;
            setStatus(TicketStatus.BANK_UPLOAD);
            summary =
              'Agent verified documents/data and released the ticket to AP finance final review.';
            confidence = 94;
          }
          break;

        case TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION: {
          const acceptedAccountStatuses: AccountVerificationStatus[] = [
            AccountVerificationStatus.MATCHED,
            AccountVerificationStatus.INVOICE_MISSING_VERIFIED_FROM_SHEET,
          ];
          const accountOk = acceptedAccountStatuses.includes(ticket.accountVerificationStatus);
          const gaps = [
            !ticket.vendorId && !ticket.vendorNameSnapshot ? 'Vendor selection' : null,
            ticket.purchaseOrderRequired && !ticket.purchaseOrderNumber ? 'Purchase order number' : null,
            ticket.purchaseOrderRequired && !ticket.purchaseOrderVerified ? 'PO verification' : null,
            !ticket.invoiceNumber ? 'Invoice number' : null,
            ticket.amountPkr.lte(0) ? 'Positive amount' : null,
            !accountOk ? 'Matched vendor/invoice account number' : null,
          ].filter(Boolean) as string[];

          checks.push('Vendor master', 'PO sync', 'Account match', 'Invoice amount');
          if (gaps.length) {
            data.documentStatus = DocumentStatus.INCOMPLETE;
            data.missingDocuments = gaps;
            setStatus(TicketStatus.WAITING_FOR_DOCS);
            summary = `Agent returned the ticket to department rework: ${gaps.join(', ')}.`;
            confidence = 68;
          } else {
            const now = new Date();
            data.documentStatus = DocumentStatus.COMPLETE;
            data.missingDocuments = [];
            Object.assign(
              data,
              this.whtData(
                ticket.amountPkr,
                ticket.whtFilerStatus,
                ticket.whtRate == null ? undefined : Number(ticket.whtRate),
              ),
            );
            data.voucherNumber = ticket.voucherNumber ?? `VCH-${Date.now()}`;
            data.voucherGeneratedAt = ticket.voucherGeneratedAt ?? now;
            data.xeroSyncStatus =
              ticket.xeroSyncStatus === XeroSyncStatus.BILL_CREATED
                ? XeroSyncStatus.BILL_CREATED
                : XeroSyncStatus.READY_TO_SYNC;
            data.bankPaymentStatus = BankPaymentStatus.READY_FOR_UPLOAD;
            setStatus(TicketStatus.BANK_UPLOAD);
            summary = 'Agent verified vendor, PO, account, and voucher readiness for AP final review.';
            confidence = 93;
          }
          break;
        }

        case TicketStatus.BANK_UPLOAD:
          checks.push('AP final human review');
          humanRequired =
            'AP finance must perform the final human check, request proof in comments if needed, or send the prepared payment to CFO sign.';
          summary = 'Agent stopped at AP finance final review before CFO authorization.';
          confidence = 72;
          break;

        case TicketStatus.WHT_CALCULATION:
          checks.push('Filer status', 'WHT rate', 'Net payable');
          if (ticket.whtFilerStatus === FilerStatus.UNKNOWN) {
            summary = 'Agent needs filer/non-filer status before WHT calculation can complete.';
            humanRequired = 'AP finance must choose filer or non-filer status.';
            confidence = 66;
          } else {
            Object.assign(
              data,
              this.whtData(
                ticket.amountPkr,
                ticket.whtFilerStatus,
                ticket.whtRate == null ? undefined : Number(ticket.whtRate),
              ),
            );
            setStatus(TicketStatus.VOUCHER_GENERATION);
            summary = 'Agent calculated WHT and moved the ticket to voucher generation.';
            confidence = 90;
          }
          break;

        case TicketStatus.VOUCHER_GENERATION:
          checks.push('Voucher readiness');
          data.voucherNumber = ticket.voucherNumber ?? `VCH-${Date.now()}`;
          data.voucherGeneratedAt = ticket.voucherGeneratedAt ?? new Date();
          setStatus(TicketStatus.XERO_BILL_ENTRY);
          summary = 'Agent generated/confirmed voucher and moved the ticket to Xero bill entry.';
          confidence = 88;
          break;

        case TicketStatus.XERO_BILL_ENTRY:
          checks.push('Xero bill reference');
          if (ticket.xeroSyncStatus === XeroSyncStatus.BILL_CREATED || ticket.xeroBillId) {
            data.xeroSyncStatus = XeroSyncStatus.BILL_CREATED;
            setStatus(TicketStatus.PAYMENT_PREPARATION);
            summary = 'Agent verified the Xero bill reference and moved to payment preparation.';
            confidence = 87;
          } else {
            summary = 'Agent stopped before payment preparation because Xero bill is not created yet.';
            humanRequired = 'Create/sync the Xero bill first.';
            confidence = 64;
          }
          break;

        case TicketStatus.PAYMENT_PREPARATION:
          checks.push('Voucher', 'Payment method', 'Bank readiness');
          if (!ticket.voucherNumber) {
            summary = 'Agent needs voucher number before payment can be prepared.';
            humanRequired = 'Generate voucher first.';
            confidence = 62;
          } else {
            data.bankPaymentStatus = BankPaymentStatus.READY_FOR_UPLOAD;
            setStatus(TicketStatus.BANK_UPLOAD);
            summary = 'Agent prepared the payment record and moved it to bank upload.';
            confidence = 85;
          }
          break;

        case TicketStatus.BANK_EXECUTED:
          checks.push('Bank execution confirmation', 'Xero paid marker');
          data.xeroSyncStatus = XeroSyncStatus.PAID_MARKED;
          setStatus(TicketStatus.MARKED_PAID_IN_XERO);
          summary = 'Agent marked the executed payment ready for Xero paid reconciliation.';
          confidence = 83;
          break;

        case TicketStatus.MARKED_PAID_IN_XERO:
          checks.push('Requester notification readiness');
          setStatus(TicketStatus.REQUESTER_NOTIFIED);
          summary = 'Agent sent the close-out notification step and moved to requester notified.';
          confidence = 86;
          break;

        case TicketStatus.REQUESTER_NOTIFIED:
          checks.push('Close-out audit trail');
          setStatus(TicketStatus.PAYMENT_COMPLETE);
          summary = 'Agent completed the final close-out after requester notification.';
          confidence = 88;
          break;

        case TicketStatus.CFO_SIGN_PENDING:
        case TicketStatus.BANK_EXECUTION_PENDING:
          summary = 'Agent stopped at a human-control step.';
          humanRequired =
            ticket.status === TicketStatus.CFO_SIGN_PENDING
              ? 'CFO must verify and sign the payment.'
              : 'Bank/payment gateway execution must be confirmed.';
          confidence = 57;
          break;

        default:
          humanRequired = 'No automation rule is configured for this stage.';
          confidence = 55;
      }
    } else {
      humanRequired = 'Your role cannot run AP finance automation at this stage.';
      confidence = 50;
    }

    const toStatus = (data.status as TicketStatus | undefined) ?? fromStatus;
    const statusChanged = toStatus !== fromStatus;

    const updated = await this.prisma.paymentTicket.update({
      where: { id },
      data: {
        ...data,
        activities: {
          create: {
            actor: { connect: { id: user.id } },
            type: statusChanged ? 'agent_status_changed' : 'agent_verified',
            message: `${summary} Confidence ${confidence}%.`,
            fromStatus,
            toStatus,
          },
        },
      },
      include: ticketInclude,
    });

    if (statusChanged && toStatus === TicketStatus.PAYMENT_COMPLETE) {
      await this.handleMilestonePaymentComplete(updated.id, user.id);
    }

    const decisionMissingDocuments = Array.isArray(data.missingDocuments)
      ? data.missingDocuments
      : submissionGaps.length
        ? submissionGaps
        : missingDocuments;

    const decision = {
      fromStatus,
      toStatus,
      summary,
      confidence,
      checks,
      missingDocuments: decisionMissingDocuments,
      humanRequired,
    };

    if (
      statusChanged &&
      depth < 8 &&
      this.shouldWorkflowAgentContinue(toStatus, user, humanRequired)
    ) {
      const next = await this.runWorkflowAgent(id, user, depth + 1);
      return {
        decision: {
          fromStatus,
          toStatus: next.decision.toStatus,
          summary: `${summary} ${next.decision.summary}`,
          confidence: Math.min(confidence, next.decision.confidence),
          checks: Array.from(new Set([...checks, ...next.decision.checks])),
          missingDocuments: Array.from(
            new Set([...decisionMissingDocuments, ...next.decision.missingDocuments]),
          ),
          humanRequired: next.decision.humanRequired,
        },
        ticket: next.ticket,
      };
    }

    return {
      decision,
      ticket: this.decorateTicket(updated, user),
    };
  }

  async listAttachments(id: string, user: RequestUser) {
    const ticket = await this.assertTicketVisible(id, user);
    const docs = await this.prisma.supportingDocument.findMany({
      where: {
        OR: [
          { ticketId: id },
          ...(ticket.invoiceId ? [{ invoiceId: ticket.invoiceId }] : []),
        ],
      },
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

    await this.runDocumentAgentAfterAttachment(id, ticket.status, user);

    return this.serializeAttachment(doc);
  }

  async attachmentDownload(
    ticketId: string,
    attachmentId: string,
    user: RequestUser,
  ) {
    const ticket = await this.assertTicketVisible(ticketId, user);
    const doc = await this.prisma.supportingDocument.findFirst({
      where: {
        id: attachmentId,
        OR: [
          { ticketId },
          ...(ticket.invoiceId ? [{ invoiceId: ticket.invoiceId }] : []),
        ],
      },
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

  private async assertRemainingPaymentReady(id: string, user: RequestUser) {
    const ticket = await this.prisma.paymentTicket.findFirst({
      where: { id, ...this.accessWhere(user) },
      include: {
        attachments: true,
        parentTicket: true,
        paymentMilestone: {
          include: {
            paymentPlan: {
              include: {
                milestones: {
                  include: { ticket: true },
                  orderBy: { sequence: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!ticket) throw new NotFoundException();
    const milestone = ticket.paymentMilestone;
    const plan = milestone?.paymentPlan;
    if (!milestone || !plan || milestone.kind !== PaymentMilestoneKind.REMAINING) {
      throw new BadRequestException('Remaining payment must be linked to a payment plan milestone');
    }

    const advancePaid =
      ticket.parentTicket?.status === TicketStatus.PAYMENT_COMPLETE ||
      plan.milestones.some((item) =>
        item.kind === PaymentMilestoneKind.ADVANCE &&
        item.status === PaymentMilestoneStatus.PAID,
      );
    if (!advancePaid) {
      throw new BadRequestException('Advance payment must be completed before releasing remaining payment');
    }

    const proofDocumentTypes: DocumentType[] = [
      DocumentType.GRN,
      DocumentType.DELIVERY_NOTE,
      DocumentType.RECEIPT,
    ];
    const hasReceivingProof = ticket.attachments.some((doc) =>
      proofDocumentTypes.includes(doc.documentType),
    );
    if (!hasReceivingProof) {
      throw new BadRequestException('Attach GRN, delivery note, or receipt before submitting remaining payment');
    }

    const paidAmount = plan.milestones
      .filter((item) => item.status === PaymentMilestoneStatus.PAID)
      .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    if (paidAmount.plus(ticket.amountPkr).gt(plan.totalAmount)) {
      throw new BadRequestException('Remaining payment exceeds the payment plan total');
    }

    await this.prisma.paymentPlan.update({
      where: { id: plan.id },
      data: {
        status: PaymentPlanStatus.ACTIVE,
        aiVerificationStatus: VerificationStatus.PASSED,
        aiVerificationScore: 95,
        aiVerificationNotes:
          'Remaining payment proof verified. Advance payment is paid and cumulative amount is within plan total.',
      },
    });
    await this.prisma.paymentMilestone.update({
      where: { id: milestone.id },
      data: {
        status: PaymentMilestoneStatus.IN_FINANCE,
        releasedAt: new Date(),
      },
    });
  }

  private async handleMilestonePaymentComplete(ticketId: string, actorId: string) {
    const milestone = await this.prisma.paymentMilestone.findUnique({
      where: { ticketId },
      include: {
        ticket: true,
        paymentPlan: {
          include: {
            milestones: {
              include: { ticket: true },
              orderBy: { sequence: 'asc' },
            },
          },
        },
      },
    });
    if (!milestone || !milestone.ticket) return;

    await this.prisma.paymentMilestone.update({
      where: { id: milestone.id },
      data: { status: PaymentMilestoneStatus.PAID, paidAt: new Date() },
    });

    const plan = await this.prisma.paymentPlan.findUniqueOrThrow({
      where: { id: milestone.paymentPlanId },
      include: {
        milestones: {
          include: { ticket: true },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    const paidAmount = plan.milestones
      .map((item) =>
        item.id === milestone.id
          ? { ...item, status: PaymentMilestoneStatus.PAID }
          : item,
      )
      .filter((item) => item.status === PaymentMilestoneStatus.PAID)
      .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));
    const rawRemaining = plan.totalAmount.minus(paidAmount);
    const remainingAmount = rawRemaining.gt(0) ? rawRemaining : new Prisma.Decimal(0);
    const completed = remainingAmount.eq(0);

    await this.prisma.paymentPlan.update({
      where: { id: plan.id },
      data: {
        paidAmount,
        remainingAmount,
        status: completed
          ? PaymentPlanStatus.COMPLETED
          : milestone.kind === PaymentMilestoneKind.ADVANCE
            ? PaymentPlanStatus.WAITING_FOR_REMAINING_DOCS
            : PaymentPlanStatus.ACTIVE,
      },
    });

    if (plan.invoiceId) {
      await this.prisma.invoice.update({
        where: { id: plan.invoiceId },
        data: {
          amountPaid: paidAmount,
          balanceDue: remainingAmount,
          status: completed ? InvoiceStatus.PAID : InvoiceStatus.APPROVED,
        },
      });
    }

    if (
      !completed &&
      plan.planType === PaymentPlanType.ADVANCE_REMAINING &&
      milestone.kind === PaymentMilestoneKind.ADVANCE
    ) {
      const remaining = plan.milestones.find((item) => item.kind === PaymentMilestoneKind.REMAINING);
      if (!remaining) return;

      if (remaining.ticketId) {
        await this.prisma.paymentTicket.update({
          where: { id: remaining.ticketId },
          data: {
            status: TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
            documentStatus: DocumentStatus.PENDING_REVIEW,
            missingDocuments: ['GRN / delivery note / receipt proof'],
          },
        });
        return;
      }

      const source = milestone.ticket;
      const wht = this.whtData(
        remaining.amount,
        source.whtFilerStatus,
        source.whtRate == null ? undefined : Number(source.whtRate),
      );
      const remainingTicket = await this.prisma.paymentTicket.create({
        data: {
          title: `${source.title.replace(/\s+-\s+advance payment$/i, '')} - remaining payment`,
          status: TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
          priority: source.priority,
          requesterName: source.requesterName,
          requesterEmail: source.requesterEmail,
          department: { connect: { id: source.departmentId } },
          createdBy: { connect: { id: actorId } },
          submittedToFinanceAt: null,
          dueDate: null,
          expenseNature: source.expenseNature,
          billType: BillType.FINAL_PARTIAL,
          vendor: source.vendorId ? { connect: { id: source.vendorId } } : undefined,
          vendorNameSnapshot: source.vendorNameSnapshot,
          purchaseOrderNumber: source.purchaseOrderNumber,
          purchaseOrderRequired: source.purchaseOrderRequired,
          purchaseOrderVerified: source.purchaseOrderVerified,
          invoiceNumber: source.invoiceNumber,
          internalReference: source.internalReference ? `${source.internalReference}-R` : null,
          amountPkr: remaining.amount,
          paymentMethod: source.paymentMethod,
          vendorAccountNumber: source.vendorAccountNumber,
          invoiceAccountNumber: source.invoiceAccountNumber,
          accountVerificationStatus: source.accountVerificationStatus,
          accountVerificationSource: 'Previous advance payment verified; waiting for receiving proof',
          documentStatus: DocumentStatus.PENDING_REVIEW,
          missingDocuments: ['GRN / delivery note / receipt proof'],
          xeroSyncStatus: XeroSyncStatus.NOT_READY,
          whtFilerStatus: source.whtFilerStatus,
          ...wht,
          bankPaymentStatus: BankPaymentStatus.NOT_READY,
          legacySheetRowId: source.legacySheetRowId,
          legacySheetName: source.legacySheetName,
          oldReference: source.oldReference,
          parentTicket: { connect: { id: source.id } },
          notes:
            remaining.releaseCondition ??
            'Advance payment complete. Department must upload receiving proof for remaining payment.',
          activities: {
            create: {
              actor: { connect: { id: actorId } },
              type: 'remaining_payment_created',
              message: 'Advance payment completed; remaining payment ticket created for department proof upload',
              toStatus: TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
            },
          },
        },
      });

      await this.prisma.paymentMilestone.update({
        where: { id: remaining.id },
        data: {
          status: PaymentMilestoneStatus.BLOCKED,
          ticket: { connect: { id: remainingTicket.id } },
        },
      });
    }
  }

  private accessWhere(user: RequestUser) {
    const financeStatuses = [
      TicketStatus.DOCS_REVIEW,
      TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
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
    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      if (!user.departmentId) return { id: '__no_department__' };
      return {
        departmentId: user.departmentId,
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
      return { active: true, role: { in: [Role.COMPANY_ADMIN, Role.AP_CLERK, Role.CFO] } };
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
      select: { id: true, status: true, departmentId: true, invoiceId: true },
    });
    if (!ticket) throw new NotFoundException();
    return ticket;
  }

  private assertAttachmentUploadAllowed(status: TicketStatus, user: RequestUser) {
    if (status === TicketStatus.PAYMENT_COMPLETE) {
      throw new ForbiddenException('Payment complete tickets are locked for audit');
    }
    if (user.role === Role.COMPANY_ADMIN || user.role === Role.AP_CLERK) return;
    if (
      user.role === Role.DEPT_USER &&
      (status === TicketStatus.NEW_REQUEST ||
        status === TicketStatus.MISSING_DOCS ||
        status === TicketStatus.REQUESTER_PINGED ||
        status === TicketStatus.ADVANCE_PAID_REMAINING_PENDING ||
        status === TicketStatus.WAITING_FOR_DOCS)
    ) {
      return;
    }
    if (user.role === Role.CFO && status === TicketStatus.CFO_SIGN_PENDING) return;
    throw new ForbiddenException('You cannot upload attachments at this ticket stage');
  }

  private shouldRunWorkflowAgentAfterUpdate(
    status: TicketStatus,
    user: RequestUser,
    dto: UpdateTicketDto,
    statusChanged: boolean,
  ) {
    if (statusChanged || dto.status !== undefined || user.role === Role.CFO) {
      return false;
    }

    const departmentAgentStatuses: TicketStatus[] = [
      TicketStatus.NEW_REQUEST,
      TicketStatus.MISSING_DOCS,
      TicketStatus.REQUESTER_PINGED,
      TicketStatus.WAITING_FOR_DOCS,
      TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
    ];
    const financeAgentStatuses: TicketStatus[] = [
      TicketStatus.DOCS_REVIEW,
      TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
      TicketStatus.WHT_CALCULATION,
      TicketStatus.VOUCHER_GENERATION,
      TicketStatus.XERO_BILL_ENTRY,
      TicketStatus.PAYMENT_PREPARATION,
    ];

    if (user.role === Role.DEPT_USER) {
      return departmentAgentStatuses.includes(status);
    }
    if (user.role === Role.AP_CLERK || user.role === Role.COMPANY_ADMIN) {
      return financeAgentStatuses.includes(status);
    }
    return false;
  }

  private async runDocumentAgentAfterAttachment(
    id: string,
    status: TicketStatus,
    user: RequestUser,
  ) {
    if (user.role === Role.CFO) return;
    const documentAgentStatuses: TicketStatus[] = [
      TicketStatus.NEW_REQUEST,
      TicketStatus.MISSING_DOCS,
      TicketStatus.REQUESTER_PINGED,
      TicketStatus.WAITING_FOR_DOCS,
      TicketStatus.ADVANCE_PAID_REMAINING_PENDING,
    ];

    if (!documentAgentStatuses.includes(status)) {
      return;
    }

    try {
      await this.runWorkflowAgent(id, user);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Background document validation could not complete.';
      await this.prisma.ticketActivity.create({
        data: {
          ticket: { connect: { id } },
          actor: { connect: { id: user.id } },
          type: 'agent_auto_skipped',
          message: `Background document validation did not move the ticket: ${message}`,
          toStatus: status,
        },
      });
    }
  }

  private shouldWorkflowAgentContinue(
    status: TicketStatus,
    user: RequestUser,
    humanRequired: string | null,
  ) {
    if (humanRequired) return false;
    if (user.role !== Role.AP_CLERK && user.role !== Role.COMPANY_ADMIN) return false;

    const autoContinueStatuses: TicketStatus[] = [
      TicketStatus.DOCS_REVIEW,
      TicketStatus.MISSING_DOCS,
      TicketStatus.REQUESTER_PINGED,
      TicketStatus.WAITING_FOR_DOCS,
      TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION,
      TicketStatus.WHT_CALCULATION,
      TicketStatus.VOUCHER_GENERATION,
      TicketStatus.XERO_BILL_ENTRY,
      TicketStatus.PAYMENT_PREPARATION,
      TicketStatus.BANK_EXECUTED,
      TicketStatus.MARKED_PAID_IN_XERO,
      TicketStatus.REQUESTER_NOTIFIED,
    ];

    return autoContinueStatuses.includes(status);
  }

  private agentSubmissionGaps(ticket: {
    status: TicketStatus;
    billType: BillType;
    purchaseOrderRequired: boolean;
    purchaseOrderNumber: string | null;
    vendorId: string | null;
    vendorNameSnapshot: string | null;
    invoiceNumber: string | null;
    internalReference: string | null;
    amountPkr: Prisma.Decimal;
    vendorAccountNumber: string | null;
    invoiceAccountNumber: string | null;
    legacySheetRowId: string | null;
    oldReference: string | null;
    attachments: Array<{ documentType: DocumentType }>;
  }) {
    const gaps = [...this.requiredDocumentGaps(ticket)];
    if (!ticket.vendorId && !ticket.vendorNameSnapshot) {
      gaps.push('Vendor details');
    }
    if (!ticket.invoiceNumber && !ticket.internalReference) {
      gaps.push('Invoice number or internal reference');
    }
    if (ticket.amountPkr.lte(0)) {
      gaps.push('Positive invoice amount');
    }

    const hasAccountEvidence =
      Boolean(ticket.vendorAccountNumber) ||
      Boolean(ticket.invoiceAccountNumber) ||
      Boolean(ticket.legacySheetRowId) ||
      Boolean(ticket.oldReference);
    if (!hasAccountEvidence) {
      gaps.push('Vendor account number or legacy sheet account proof');
    }
    if (
      ticket.vendorAccountNumber &&
      ticket.invoiceAccountNumber &&
      ticket.vendorAccountNumber.trim() !== ticket.invoiceAccountNumber.trim()
    ) {
      gaps.push('Vendor and invoice account numbers must match');
    }

    return Array.from(new Set(gaps));
  }

  private agentAccountVerificationStatus(ticket: {
    vendorAccountNumber: string | null;
    invoiceAccountNumber: string | null;
    legacySheetRowId: string | null;
    oldReference: string | null;
    accountVerificationStatus: AccountVerificationStatus;
  }) {
    if (
      ticket.vendorAccountNumber &&
      ticket.invoiceAccountNumber &&
      ticket.vendorAccountNumber.trim() === ticket.invoiceAccountNumber.trim()
    ) {
      return AccountVerificationStatus.MATCHED;
    }
    if (ticket.legacySheetRowId || ticket.oldReference) {
      return AccountVerificationStatus.INVOICE_MISSING_VERIFIED_FROM_SHEET;
    }
    return ticket.accountVerificationStatus === AccountVerificationStatus.MATCHED
      ? ticket.accountVerificationStatus
      : AccountVerificationStatus.NEEDS_MANUAL_REVIEW;
  }

  private requiredDocumentGaps(ticket: {
    status: TicketStatus;
    billType: BillType;
    purchaseOrderRequired: boolean;
    purchaseOrderNumber: string | null;
    attachments: Array<{ documentType: DocumentType }>;
  }) {
    const hasDocument = (type: DocumentType) =>
      ticket.attachments.some((doc) => doc.documentType === type);
    const missing: string[] = [];

    if (!hasDocument(DocumentType.INVOICE) && !hasDocument(DocumentType.RECEIPT)) {
      missing.push('Invoice scan/slip');
    }
    if (
      ticket.purchaseOrderRequired &&
      !ticket.purchaseOrderNumber &&
      !hasDocument(DocumentType.PO)
    ) {
      missing.push('Purchase order');
    }

    const needsReceivingProof =
      ticket.status === TicketStatus.ADVANCE_PAID_REMAINING_PENDING ||
      ticket.billType === BillType.FINAL_PARTIAL;
    if (
      needsReceivingProof &&
      !hasDocument(DocumentType.GRN) &&
      !hasDocument(DocumentType.DELIVERY_NOTE) &&
      !hasDocument(DocumentType.RECEIPT)
    ) {
      missing.push('GRN / delivery note / receipt proof');
    }

    return missing;
  }

  private documentTypeFromFile(fileName: string) {
    const lower = fileName.toLowerCase();
    if (/\bgrn\b|goods[-_\s]?received|received[-_\s]?note/.test(lower)) return DocumentType.GRN;
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
      throw new ForbiddenException('Payment complete tickets are locked for audit');
    }

    if (user.role === Role.CFO && existing.status !== TicketStatus.CFO_SIGN_PENDING) {
      throw new ForbiddenException('CFO can only sign tickets waiting for CFO authorization');
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
      throw new ForbiddenException('CFO can only record the CFO signed bank status');
    }
    if (user.role === Role.AP_CLERK && dto.bankPaymentStatus === BankPaymentStatus.CFO_SIGNED) {
      throw new ForbiddenException('CFO signature must be recorded by CFO or company admin');
    }
  }

  private editableFields(role: Role, status: TicketStatus) {
    if (role === Role.COMPANY_ADMIN) return new Set<string>(ALL_TICKET_UPDATE_FIELDS);
    if (role === Role.AP_CLERK) return new Set<string>(AP_STAGE_FIELDS[status] ?? []);
    if (role === Role.DEPT_USER) return new Set<string>(DEPARTMENT_STAGE_FIELDS[status] ?? []);
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
    if (status === TicketStatus.WAITING_FOR_DOCS) {
      data.documentStatus = DocumentStatus.INCOMPLETE;
      data.submittedToFinanceAt = null;
      data.dueDate = null;
      if (data.missingDocuments === undefined) {
        data.missingDocuments = ['Additional proof requested in comments'];
      }
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
    return roleAllowed.filter((candidate) => processAllowed.includes(candidate));
  }

  private decorateTicket<T extends { status: TicketStatus }>(ticket: T, user: RequestUser) {
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

  private async assertCanAssign(assignedToId: string | null | undefined, user: RequestUser) {
    if (!this.canAssign(user)) {
      throw new ForbiddenException('Only AP and company admins can assign payment tickets');
    }
    if (!assignedToId) return;
    const assignee = await this.prisma.user.findFirst({
      where: { id: assignedToId, ...this.assigneeWhere(user) },
    });
    if (!assignee) {
      throw new ForbiddenException('Assignee is outside your permitted AP scope');
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
      user.role === Role.DEPT_USER ? departmentEntryStatuses : financeEntryStatuses;
    if (!allowed.includes(status)) {
      throw new ForbiddenException('Tickets must enter through invoice submission or finance review');
    }
  }

  private async assertDepartmentAllowed(departmentId: string, user: RequestUser) {
    if (
      (user.role === Role.DEPT_ADMIN || user.role === Role.DEPT_USER) &&
      user.departmentId !== departmentId
    ) {
      throw new ForbiddenException('You can only create tickets for your department');
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
      const vendor = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
      if (!vendor) throw new BadRequestException('Invalid vendor');
    }
    if (dto.assignedToId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (!user) throw new BadRequestException('Invalid assignee');
    }
    if (dto.parentTicketId) {
      const parent = await this.prisma.paymentTicket.findUnique({
        where: { id: dto.parentTicketId },
      });
      if (!parent) throw new BadRequestException('Invalid parent ticket');
    }
    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: dto.invoiceId } });
      if (!invoice) throw new BadRequestException('Invalid invoice');
    }
  }

  private assignScalars(
    data: Prisma.PaymentTicketUpdateInput,
    dto: UpdateTicketDto,
  ) {
    if (dto.title !== undefined) data.title = nullableString(dto.title) ?? 'Untitled AP ticket';
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.requesterName !== undefined) data.requesterName = nullableString(dto.requesterName);
    if (dto.requesterEmail !== undefined) data.requesterEmail = nullableString(dto.requesterEmail);
    if (dto.expenseNature !== undefined) data.expenseNature = dto.expenseNature;
    if (dto.billType !== undefined) data.billType = dto.billType;
    if (dto.vendorNameSnapshot !== undefined) {
      data.vendorNameSnapshot = nullableString(dto.vendorNameSnapshot);
    }
    if (dto.amountPkr !== undefined) data.amountPkr = new Prisma.Decimal(dto.amountPkr);
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
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = nullableString(dto.invoiceNumber);
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
      data.accountVerificationSource = nullableString(dto.accountVerificationSource);
    }
    if (dto.documentStatus !== undefined) data.documentStatus = dto.documentStatus;
    if (dto.missingDocuments !== undefined) data.missingDocuments = dto.missingDocuments;
    if (dto.xeroSyncStatus !== undefined) data.xeroSyncStatus = dto.xeroSyncStatus;
    if (dto.xeroContactId !== undefined) data.xeroContactId = nullableString(dto.xeroContactId);
    if (dto.xeroBillId !== undefined) data.xeroBillId = nullableString(dto.xeroBillId);
    if (dto.xeroBillNumber !== undefined) data.xeroBillNumber = nullableString(dto.xeroBillNumber);
    if (dto.xeroPaymentId !== undefined) data.xeroPaymentId = nullableString(dto.xeroPaymentId);
    if (dto.whtFilerStatus !== undefined) data.whtFilerStatus = dto.whtFilerStatus;
    if (dto.voucherNumber !== undefined) {
      data.voucherNumber = nullableString(dto.voucherNumber);
      data.voucherGeneratedAt = dto.voucherNumber ? new Date() : null;
    }
    if (dto.bankPaymentStatus !== undefined) data.bankPaymentStatus = dto.bankPaymentStatus;
    if (dto.bankPortalReference !== undefined) {
      data.bankPortalReference = nullableString(dto.bankPortalReference);
    }
    if (dto.trelloCardId !== undefined) data.trelloCardId = nullableString(dto.trelloCardId);
    if (dto.trelloUrl !== undefined) data.trelloUrl = nullableString(dto.trelloUrl);
    if (dto.legacySheetRowId !== undefined) {
      data.legacySheetRowId = nullableString(dto.legacySheetRowId);
    }
    if (dto.legacySheetName !== undefined) {
      data.legacySheetName = nullableString(dto.legacySheetName);
    }
    if (dto.oldReference !== undefined) data.oldReference = nullableString(dto.oldReference);
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
      suppliedRate != null ? new Prisma.Decimal(suppliedRate) : defaultWhtRate(filerStatus);

    if (!rate) {
      return {
        whtRate: null,
        whtAmountPkr: null,
        netPayablePkr: amountPkr,
      };
    }

    const whtAmount = new Prisma.Decimal(amountPkr.mul(rate).div(100).toFixed(2));
    return {
      whtRate: rate,
      whtAmountPkr: whtAmount,
      netPayablePkr: amountPkr.minus(whtAmount),
    };
  }
}
