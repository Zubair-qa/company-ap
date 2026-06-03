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
  InvoiceStatus,
  PaymentMilestoneKind,
  PaymentMilestoneStatus,
  PaymentMethod,
  PaymentPlanStatus,
  PaymentPlanType,
  Prisma,
  PurchaseOrderStatus,
  Role,
  TicketPriority,
  TicketStatus,
  VerificationStatus,
  Vendor,
  VendorKind,
  XeroSyncStatus,
} from '@prisma/client';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { calculateFinanceDueDate } from '../tickets/tickets.service';
import { PatchInvoiceDto } from './dto/invoice.dto';
import { parseSpreadsheetBuffer } from './invoice-parse.util';

const SPREADSHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function uploadRoot() {
  return process.env.UPLOAD_DIR || './uploads';
}

const DEFAULT_REMAINING_DOCUMENTS = ['GRN', 'DELIVERY_NOTE', 'RECEIPT'];

const invoiceInclude = Prisma.validator<Prisma.InvoiceInclude>()({
  vendor: true,
  department: true,
  purchaseOrder: {
    include: {
      vendor: true,
      department: true,
      lineItems: true,
    },
  },
  paymentPlan: {
    include: {
      milestones: {
        orderBy: { sequence: 'asc' },
        include: { ticket: { select: { id: true, title: true, status: true, amountPkr: true } } },
      },
    },
  },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvals: { orderBy: { createdAt: 'desc' }, take: 3 },
});

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async createFromUpload(
    file: Express.Multer.File,
    departmentId: string,
    submittedBy: { id: string; role: Role; departmentId: string | null },
  ) {
    this.assertDepartmentCanCreateInvoice(departmentId, submittedBy);
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) throw new BadRequestException('Invalid department');

    const relPath = file.filename;
    let extracted: Record<string, unknown> | null = null;
    let amountPkr = new Prisma.Decimal(0);
    let reference: string | null = null;
    let description: string | null = null;
    let status: InvoiceStatus = InvoiceStatus.UPLOADED;

    const looksSpreadsheet =
      SPREADSHEET_MIMES.has(file.mimetype) ||
      /\.(xlsx|xls|csv)$/i.test(file.originalname);

    if (looksSpreadsheet) {
      const buf = await readFile(join(uploadRoot(), file.filename));
      const parsed = parseSpreadsheetBuffer(buf);
      extracted = parsed as unknown as Record<string, unknown>;
      amountPkr = new Prisma.Decimal(parsed.amountPkr ?? 0);
      reference = parsed.reference ?? null;
      description = parsed.description ?? null;
      status = InvoiceStatus.EXTRACTED;
    } else if (IMAGE_MIMES.has(file.mimetype) || /^image\//i.test(file.mimetype)) {
      extracted = {
        needsManualEntry: true,
        hint: 'Enter amount, reference, and link a vendor manually (OCR can be added later).',
      };
      status = InvoiceStatus.EXTRACTED;
    } else {
      extracted = {
        note: 'No automatic line-item extraction for this file type; use Edit to complete the invoice.',
      };
      status = InvoiceStatus.EXTRACTED;
    }

    const inv = await this.prisma.invoice.create({
      data: {
        departmentId,
        submittedById: submittedBy.id,
        fileRelPath: relPath,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        extracted: extracted as Prisma.InputJsonValue,
        amountPkr,
        reference,
        description,
        status,
      },
    });

    const invoice =
      status === InvoiceStatus.EXTRACTED
        ? await this.applyVendorMatch(inv.id)
        : await this.prisma.invoice.findUniqueOrThrow({
            where: { id: inv.id },
            include: invoiceInclude,
          });

    await this.ensureInvoicePurchaseOrder(inv.id, submittedBy.id);
    await this.upsertPaymentPlanFromInvoice(inv.id, submittedBy.id);
    await this.upsertDepartmentTicketFromInvoice(inv.id, submittedBy.id);

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: invoiceInclude,
    });
  }

  private async upsertDepartmentTicketFromInvoice(invoiceId: string, submittedById: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) return;
    const existing = await this.prisma.paymentTicket.findUnique({ where: { invoiceId } });
    const firstMilestone = this.firstPayableMilestone(inv.paymentPlan);
    const title =
      inv.invoiceNumber ??
      inv.reference ??
      inv.description ??
      `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`;
    const ticketTitle =
      firstMilestone?.kind === PaymentMilestoneKind.ADVANCE
        ? `${title} - advance payment`
        : title;
    const ticketAmount = firstMilestone?.amount ?? inv.amountPkr;
    const billType = firstMilestone
      ? this.billTypeForMilestone(firstMilestone.kind, inv.mimeType)
      : inv.mimeType?.startsWith('image/')
        ? BillType.CASH_SLIP
        : BillType.STANDARD_INVOICE;
    const data = {
      title: ticketTitle,
      status: TicketStatus.NEW_REQUEST,
      priority: TicketPriority.NORMAL,
      department: { connect: { id: inv.departmentId } },
      createdBy: { connect: { id: submittedById } },
      submittedToFinanceAt: null,
      dueDate: inv.dueDate,
      expenseNature: ExpenseNature.OTHER,
      billType,
      vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
      vendorNameSnapshot: inv.vendor?.displayName ?? null,
      purchaseOrderNumber: inv.purchaseOrder?.poNumber,
      purchaseOrderRequired: true,
      purchaseOrderVerified: false,
      invoiceNumber: inv.invoiceNumber ?? inv.reference,
      internalReference: `AP-${invoiceId.slice(0, 8).toUpperCase()}`,
      amountPkr: ticketAmount,
      paymentMethod: PaymentMethod.BANK_PORTAL,
      accountVerificationStatus: AccountVerificationStatus.NOT_CHECKED,
      documentStatus: DocumentStatus.PENDING_REVIEW,
      missingDocuments: [],
      xeroSyncStatus: XeroSyncStatus.NOT_READY,
      bankPaymentStatus: BankPaymentStatus.NOT_READY,
      invoice: { connect: { id: invoiceId } },
      notes: inv.description ?? `Created from invoice upload: ${inv.originalFilename ?? invoiceId}`,
    } satisfies Prisma.PaymentTicketCreateInput;

    if (existing) {
      if (existing.status !== TicketStatus.NEW_REQUEST) {
        return;
      }
      await this.prisma.paymentTicket.update({
        where: { id: existing.id },
        data: {
          title: ticketTitle,
          status: TicketStatus.NEW_REQUEST,
          dueDate: inv.dueDate,
          vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : { disconnect: true },
          vendorNameSnapshot: inv.vendor?.displayName ?? null,
          purchaseOrderNumber: inv.purchaseOrder?.poNumber,
          invoiceNumber: inv.invoiceNumber ?? inv.reference,
          billType,
          amountPkr: ticketAmount,
          notes: inv.description ?? existing.notes,
        },
      });
      if (firstMilestone) {
        await this.prisma.paymentMilestone.update({
          where: { id: firstMilestone.id },
          data: { ticket: { connect: { id: existing.id } } },
        });
      }
      return;
    }

    const ticket = await this.prisma.paymentTicket.create({
      data: {
        ...data,
        activities: {
          create: {
            actor: { connect: { id: submittedById } },
            type: 'invoice_uploaded',
            message: 'Department invoice and synced PO draft created',
            toStatus: TicketStatus.NEW_REQUEST,
          },
        },
      },
    });

    if (inv.fileRelPath && inv.originalFilename) {
      await this.prisma.supportingDocument.create({
        data: {
          invoice: { connect: { id: invoiceId } },
          ticket: { connect: { id: ticket.id } },
          documentType: DocumentType.INVOICE,
          fileName: inv.originalFilename,
          filePath: inv.fileRelPath,
          mimeType: inv.mimeType ?? 'application/octet-stream',
          fileSize: BigInt(0),
          uploadedBy: { connect: { id: submittedById } },
        },
      });
    }
  }

  private async createTicketFromInvoice(invoiceId: string, submittedById: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) return;

    const existing = await this.prisma.paymentTicket.findUnique({
      where: { invoiceId },
    });

    const extracted =
      inv.extracted && typeof inv.extracted === 'object'
        ? (inv.extracted as Record<string, unknown>)
        : {};
    const submittedToFinanceAt = new Date();
    const vendorName =
      inv.vendor?.displayName ??
      (typeof extracted.vendorName === 'string' ? extracted.vendorName : null);
    const needsVendorReview = inv.status === InvoiceStatus.VENDOR_UNVERIFIED;
    const firstMilestone = this.firstPayableMilestone(inv.paymentPlan);
    const ticketAmount = firstMilestone?.amount ?? inv.amountPkr;
    const billType = firstMilestone
      ? this.billTypeForMilestone(firstMilestone.kind, inv.mimeType)
      : inv.mimeType?.startsWith('image/')
        ? BillType.CASH_SLIP
        : BillType.STANDARD_INVOICE;
    const titleSuffix =
      firstMilestone?.kind === PaymentMilestoneKind.ADVANCE ? ' - advance payment' : '';

    if (existing) {
      await this.prisma.paymentTicket.update({
        where: { id: existing.id },
        data: {
          title:
            (inv.invoiceNumber ??
              inv.reference ??
              inv.description ??
              `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`) + titleSuffix,
          status: needsVendorReview
            ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
            : TicketStatus.DOCS_REVIEW,
          submittedToFinanceAt,
          dueDate: calculateFinanceDueDate(submittedToFinanceAt),
          vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
          vendorNameSnapshot: vendorName,
          purchaseOrderNumber: inv.purchaseOrder?.poNumber,
          purchaseOrderVerified: true,
          invoiceNumber: inv.invoiceNumber ?? inv.reference,
          billType,
          amountPkr: ticketAmount,
          accountVerificationSource: needsVendorReview
            ? 'Auto-created from invoice upload; verify vendor account from master sheet'
            : 'Agent verified invoice and synced PO before finance release',
          notes: inv.description ?? existing.notes,
          activities: {
            create: {
              actor: { connect: { id: submittedById } },
              type: 'released_to_finance',
              message: 'Agent validation passed; ticket released to finance',
              fromStatus: existing.status,
              toStatus: needsVendorReview
                ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
                : TicketStatus.DOCS_REVIEW,
            },
          },
        },
      });
      if (firstMilestone) {
        await this.prisma.paymentMilestone.update({
          where: { id: firstMilestone.id },
          data: {
            status: PaymentMilestoneStatus.IN_FINANCE,
            releasedAt: new Date(),
            ticket: { connect: { id: existing.id } },
          },
        });
      }
      return;
    }

    const ticket = await this.prisma.paymentTicket.create({
      data: {
        title:
          (inv.reference ??
            inv.description ??
            `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`) + titleSuffix,
        status: needsVendorReview
          ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
          : TicketStatus.DOCS_REVIEW,
        priority: TicketPriority.NORMAL,
        department: { connect: { id: inv.departmentId } },
        createdBy: { connect: { id: submittedById } },
        submittedToFinanceAt,
        dueDate: calculateFinanceDueDate(submittedToFinanceAt),
        expenseNature: ExpenseNature.OTHER,
        billType,
        vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
        vendorNameSnapshot: vendorName,
        purchaseOrderNumber: inv.purchaseOrder?.poNumber,
        purchaseOrderRequired: true,
        purchaseOrderVerified: true,
        invoiceNumber: inv.reference,
        internalReference: `AP-${invoiceId.slice(0, 8).toUpperCase()}`,
        amountPkr: ticketAmount,
        paymentMethod: PaymentMethod.BANK_PORTAL,
        accountVerificationStatus: needsVendorReview
          ? AccountVerificationStatus.NEEDS_MANUAL_REVIEW
          : AccountVerificationStatus.NOT_CHECKED,
        accountVerificationSource: needsVendorReview
          ? 'Auto-created from invoice upload; verify vendor account from master sheet'
          : 'Agent verified invoice and synced PO before finance release',
        documentStatus: needsVendorReview
          ? DocumentStatus.INCOMPLETE
          : DocumentStatus.PENDING_REVIEW,
        missingDocuments: needsVendorReview
          ? ['Vendor verification', 'Vendor account proof', 'Purchase order']
          : [],
        xeroSyncStatus: XeroSyncStatus.NOT_READY,
        bankPaymentStatus: BankPaymentStatus.NOT_READY,
        invoice: { connect: { id: invoiceId } },
        notes: inv.originalFilename
          ? `Created automatically from upload: ${inv.originalFilename}`
          : 'Created automatically from invoice import',
        activities: {
          create: {
            actor: { connect: { id: submittedById } },
            type: 'invoice_uploaded',
            message: 'AP ticket created automatically from invoice upload/import',
            toStatus: needsVendorReview
              ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
              : TicketStatus.DOCS_REVIEW,
          },
        },
      },
    });

    if (inv.fileRelPath && inv.originalFilename) {
      await this.prisma.supportingDocument.create({
        data: {
          invoice: { connect: { id: invoiceId } },
          ticket: { connect: { id: ticket.id } },
          documentType: DocumentType.INVOICE,
          fileName: inv.originalFilename,
          filePath: inv.fileRelPath,
          mimeType: inv.mimeType ?? 'application/octet-stream',
          fileSize: BigInt(0),
          uploadedBy: { connect: { id: submittedById } },
        },
      });
    }
  }

  private async ensureInvoicePurchaseOrder(invoiceId: string, requestedById: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) throw new NotFoundException();

    const vendorId = inv.vendorId ?? (await this.ensurePendingVendor(inv.departmentId, inv.department.name));
    const amount = inv.totalAmount.gt(0) ? inv.totalAmount : inv.amountPkr;
    const subtotal = inv.subtotal.gt(0) ? inv.subtotal : amount;
    const poNumber = `PO-${inv.id.slice(0, 8).toUpperCase()}`;
    const poDate = inv.invoiceDate ?? inv.receivedDate ?? new Date();
    const expectedDeliveryDate = inv.dueDate ?? undefined;
    const notes =
      inv.description ??
      inv.reference ??
      inv.originalFilename ??
      `Synced PO for invoice ${inv.id.slice(0, 8)}`;
    const lineDescription = inv.description ?? inv.reference ?? inv.originalFilename ?? poNumber;

    const po = inv.poId
      ? await this.prisma.purchaseOrder.update({
          where: { id: inv.poId },
          data: {
            vendor: { connect: { id: vendorId } },
            department: { connect: { id: inv.departmentId } },
            poDate,
            expectedDeliveryDate,
            currency: inv.currency,
            subtotal,
            taxAmount: inv.taxAmount,
            totalAmount: amount,
            notes,
          },
        })
      : await this.prisma.purchaseOrder.create({
          data: {
            poNumber,
            vendor: { connect: { id: vendorId } },
            department: { connect: { id: inv.departmentId } },
            requestedBy: { connect: { id: requestedById } },
            poDate,
            expectedDeliveryDate,
            currency: inv.currency,
            subtotal,
            taxAmount: inv.taxAmount,
            totalAmount: amount,
            notes,
          },
        });

    await this.prisma.poLineItem.deleteMany({ where: { poId: po.id } });
    await this.prisma.poLineItem.create({
      data: {
        poId: po.id,
        lineNo: 1,
        description: lineDescription,
        quantity: new Prisma.Decimal(1),
        unit: 'item',
        unitPrice: amount,
        lineTotal: amount,
      },
    });

    if (!inv.poId) {
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { poId: po.id },
      });
    }

    return po;
  }

  private async upsertPaymentPlanFromInvoice(
    invoiceId: string,
    actorId: string,
    dto?: Pick<
      PatchInvoiceDto,
      'paymentPlanType' | 'advancePercent' | 'releaseCondition' | 'requiredFinalDocuments'
    >,
  ) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) throw new NotFoundException();

    const totalAmount = inv.totalAmount.gt(0) ? inv.totalAmount : inv.amountPkr;
    const existing = inv.paymentPlan;
    const planType = dto?.paymentPlanType ?? existing?.planType ?? PaymentPlanType.FULL_PAYMENT;
    const advancePercent =
      planType === PaymentPlanType.ADVANCE_REMAINING
        ? new Prisma.Decimal(dto?.advancePercent ?? existing?.advancePercent ?? 50)
        : null;
    const requiredFinalDocuments =
      dto?.requiredFinalDocuments?.length
        ? dto.requiredFinalDocuments
        : existing?.requiredFinalDocuments?.length
          ? existing.requiredFinalDocuments
          : DEFAULT_REMAINING_DOCUMENTS;
    const releaseCondition =
      dto?.releaseCondition ??
      existing?.releaseCondition ??
      'Products/services received and GRN or delivery proof attached';

    const plan = existing
      ? await this.prisma.paymentPlan.update({
          where: { id: existing.id },
          data: {
            planType,
            purchaseOrder: inv.poId ? { connect: { id: inv.poId } } : { disconnect: true },
            department: { connect: { id: inv.departmentId } },
            vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : { disconnect: true },
            totalAmount,
            remainingAmount: totalAmount.minus(existing.paidAmount),
            advancePercent,
            releaseCondition,
            requiredFinalDocuments,
            aiVerificationStatus: VerificationStatus.PENDING,
            aiVerificationScore: 0,
            aiVerificationNotes: null,
          },
        })
      : await this.prisma.paymentPlan.create({
          data: {
            planNumber: `PP-${invoiceId.slice(0, 8).toUpperCase()}`,
            planType,
            status: PaymentPlanStatus.DRAFT,
            invoice: { connect: { id: invoiceId } },
            purchaseOrder: inv.poId ? { connect: { id: inv.poId } } : undefined,
            department: { connect: { id: inv.departmentId } },
            vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
            createdBy: { connect: { id: actorId } },
            totalAmount,
            paidAmount: new Prisma.Decimal(0),
            remainingAmount: totalAmount,
            advancePercent,
            releaseCondition,
            requiredFinalDocuments,
          },
        });

    if (planType === PaymentPlanType.ADVANCE_REMAINING) {
      const percent = advancePercent ?? new Prisma.Decimal(50);
      const advanceAmount = totalAmount.mul(percent).div(100);
      const remainingAmount = totalAmount.minus(advanceAmount);

      await this.upsertMilestone(plan.id, {
        sequence: 1,
        label: `Advance ${percent.toFixed(0)}% payment`,
        kind: PaymentMilestoneKind.ADVANCE,
        amount: advanceAmount,
        percent,
        status: PaymentMilestoneStatus.DRAFT,
        requiredDocuments: ['INVOICE', 'PO'],
      });
      await this.upsertMilestone(plan.id, {
        sequence: 2,
        label: 'Remaining payment after receiving proof',
        kind: PaymentMilestoneKind.REMAINING,
        amount: remainingAmount,
        percent: new Prisma.Decimal(100).minus(percent),
        status: PaymentMilestoneStatus.BLOCKED,
        releaseCondition,
        requiredDocuments: requiredFinalDocuments,
      });
      await this.prisma.paymentMilestone.deleteMany({
        where: { paymentPlanId: plan.id, sequence: { gt: 2 }, status: { not: PaymentMilestoneStatus.PAID } },
      });
    } else {
      await this.upsertMilestone(plan.id, {
        sequence: 1,
        label: 'Full payment',
        kind: PaymentMilestoneKind.FULL,
        amount: totalAmount,
        percent: new Prisma.Decimal(100),
        status: PaymentMilestoneStatus.DRAFT,
        requiredDocuments: ['INVOICE', 'PO'],
      });
      await this.prisma.paymentMilestone.deleteMany({
        where: { paymentPlanId: plan.id, sequence: { gt: 1 }, status: { not: PaymentMilestoneStatus.PAID } },
      });
    }

    return this.prisma.paymentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
          include: { ticket: { select: { id: true, title: true, status: true, amountPkr: true } } },
        },
      },
    });
  }

  private async upsertMilestone(
    paymentPlanId: string,
    data: {
      sequence: number;
      label: string;
      kind: PaymentMilestoneKind;
      amount: Prisma.Decimal;
      percent?: Prisma.Decimal | null;
      status: PaymentMilestoneStatus;
      releaseCondition?: string | null;
      requiredDocuments: string[];
    },
  ) {
    const existing = await this.prisma.paymentMilestone.findUnique({
      where: {
        paymentPlanId_sequence: {
          paymentPlanId,
          sequence: data.sequence,
        },
      },
    });
    const nextData = {
      label: data.label,
      kind: data.kind,
      amount: data.amount,
      percent: data.percent ?? null,
      releaseCondition: data.releaseCondition ?? null,
      requiredDocuments: data.requiredDocuments,
      status: existing?.status === PaymentMilestoneStatus.PAID ? existing.status : data.status,
    };
    return existing
      ? this.prisma.paymentMilestone.update({ where: { id: existing.id }, data: nextData })
      : this.prisma.paymentMilestone.create({
          data: {
            paymentPlan: { connect: { id: paymentPlanId } },
            sequence: data.sequence,
            ...nextData,
          },
        });
  }

  private firstPayableMilestone(
    plan:
      | (Prisma.PaymentPlanGetPayload<{
          include: { milestones: { orderBy: { sequence: 'asc' } } };
        }>)
      | null,
  ) {
    const firstKinds: PaymentMilestoneKind[] = [
      PaymentMilestoneKind.FULL,
      PaymentMilestoneKind.ADVANCE,
    ];
    return plan?.milestones.find((milestone) =>
      firstKinds.includes(milestone.kind),
    );
  }

  private billTypeForMilestone(kind: PaymentMilestoneKind, mimeType?: string | null) {
    if (kind === PaymentMilestoneKind.ADVANCE) return BillType.ADVANCE_PARTIAL;
    if (kind === PaymentMilestoneKind.REMAINING || kind === PaymentMilestoneKind.FINAL) {
      return BillType.FINAL_PARTIAL;
    }
    return mimeType?.startsWith('image/') ? BillType.CASH_SLIP : BillType.STANDARD_INVOICE;
  }

  private async ensurePendingVendor(departmentId: string, departmentName: string) {
    const vendorCode = `PENDING-${departmentId.slice(0, 18)}`;
    const existing = await this.prisma.vendor.findFirst({
      where: { vendorCode },
    });
    if (existing) return existing.id;
    const vendor = await this.prisma.vendor.create({
      data: {
        vendorCode,
        displayName: `Vendor pending - ${departmentName}`,
        kind: VendorKind.ONE_OFF,
        active: true,
      },
    });
    return vendor.id;
  }

  private async runAgentVerification(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) throw new NotFoundException();

    const errors: string[] = [];
    const warnings: string[] = [];
    const invoiceTotal = inv.totalAmount.gt(0) ? inv.totalAmount : inv.amountPkr;

    if (!inv.invoiceNumber && !inv.reference) errors.push('Invoice number or reference is required');
    if (invoiceTotal.lte(0)) errors.push('Invoice amount must be greater than zero');
    if (!inv.vendorId || inv.vendor?.displayName.startsWith('Vendor pending')) {
      errors.push('Vendor must be selected before finance release');
    }
    if (!inv.poId || !inv.purchaseOrder) {
      errors.push('Synced purchase order is required');
    } else {
      if (inv.purchaseOrder.departmentId !== inv.departmentId) {
        errors.push('Purchase order department must match invoice department');
      }
      if (inv.vendorId && inv.purchaseOrder.vendorId !== inv.vendorId) {
        errors.push('Purchase order vendor must match invoice vendor');
      }
      if (!inv.purchaseOrder.totalAmount.equals(invoiceTotal)) {
        errors.push('Purchase order total must match invoice total');
      }
    }
    if (!inv.dueDate) warnings.push('Due date is not provided');
    if (!inv.description) warnings.push('Description is not provided');
    if (!inv.paymentPlan) {
      errors.push('Payment plan is required');
    } else {
      const milestoneTotal = inv.paymentPlan.milestones.reduce(
        (sum, milestone) => sum.plus(milestone.amount),
        new Prisma.Decimal(0),
      );
      if (!milestoneTotal.equals(invoiceTotal)) {
        errors.push('Payment milestone total must match invoice/PO total');
      }
      if (inv.paymentPlan.planType === PaymentPlanType.ADVANCE_REMAINING) {
        if (!inv.paymentPlan.advancePercent || inv.paymentPlan.advancePercent.lte(0)) {
          errors.push('Advance percent must be configured');
        }
        if (!inv.paymentPlan.milestones.some((m) => m.kind === PaymentMilestoneKind.ADVANCE)) {
          errors.push('Advance milestone is required');
        }
        if (!inv.paymentPlan.milestones.some((m) => m.kind === PaymentMilestoneKind.REMAINING)) {
          errors.push('Remaining milestone is required');
        }
        if (!inv.paymentPlan.requiredFinalDocuments.length) {
          warnings.push('Remaining payment proof requirements are not configured');
        }
      }
    }

    const extracted =
      inv.extracted && typeof inv.extracted === 'object' && !Array.isArray(inv.extracted)
        ? (inv.extracted as Prisma.JsonObject)
        : {};

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        extracted: {
          ...extracted,
          agentVerification: {
            status: errors.length ? 'FAILED' : 'PASSED',
            checkedAt: new Date().toISOString(),
            errors,
            warnings,
          },
        },
      },
    });

    if (errors.length) {
      throw new BadRequestException(`Agent verification failed: ${errors.join('; ')}`);
    }

    return { errors, warnings };
  }

  async releaseApprovedInvoiceToFinance(invoiceId: string, actorId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();
    if (inv.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException('Invoice must be agent-approved before finance release');
    }
    if (inv.poId) {
      await this.prisma.purchaseOrder.update({
        where: { id: inv.poId },
        data: { status: PurchaseOrderStatus.APPROVED },
      });
    }
    await this.upsertPaymentPlanFromInvoice(invoiceId, actorId);
    await this.createTicketFromInvoice(invoiceId, actorId);
    await this.prisma.paymentPlan.updateMany({
      where: { invoiceId, status: PaymentPlanStatus.DRAFT },
      data: { status: PaymentPlanStatus.ACTIVE },
    });
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
  }

  async returnRejectedInvoiceToDepartment(invoiceId: string, actorId: string, reason?: string) {
    await this.prisma.paymentTicket.updateMany({
      where: { invoiceId },
      data: {
        status: TicketStatus.NEW_REQUEST,
        documentStatus: DocumentStatus.INCOMPLETE,
        missingDocuments: reason
          ? [`Returned by reviewer: ${reason}`]
          : ['Returned by reviewer'],
        notes: reason ? `Returned by reviewer: ${reason}` : 'Returned by reviewer',
      },
    });

    const ticket = await this.prisma.paymentTicket.findUnique({ where: { invoiceId } });
    if (ticket) {
      await this.prisma.ticketActivity.create({
        data: {
          ticket: { connect: { id: ticket.id } },
          actor: { connect: { id: actorId } },
          type: 'reviewer_returned',
          message: reason ? `Returned by reviewer: ${reason}` : 'Returned by reviewer',
          fromStatus: TicketStatus.DOCS_REVIEW,
          toStatus: TicketStatus.NEW_REQUEST,
        },
      });
    }

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
  }

  private async applyVendorMatch(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();

    if (inv.vendorId && inv.status === InvoiceStatus.VENDOR_VERIFIED) {
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: invoiceInclude,
      });
    }

    if (!inv.extracted || typeof inv.extracted !== 'object') {
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: invoiceInclude,
      });
    }

    const e = inv.extracted as Record<string, unknown>;
    let vendor: Vendor | null = null;

    if (e.vendorTaxNumber) {
      vendor = await this.prisma.vendor.findFirst({
        where: { taxNumber: String(e.vendorTaxNumber), active: true },
      });
    }
    if (!vendor && e.vendorName) {
      const name = String(e.vendorName).toLowerCase();
      const list = await this.prisma.vendor.findMany({ where: { active: true } });
      vendor =
        list.find(
          (v) =>
            v.displayName.toLowerCase().includes(name) ||
            name.includes(v.displayName.toLowerCase()),
        ) ?? null;
    }

    if (vendor) {
      return this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          vendorId: vendor.id,
          status: InvoiceStatus.VENDOR_VERIFIED,
        },
        include: invoiceInclude,
      });
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.VENDOR_UNVERIFIED },
      include: invoiceInclude,
    });
  }

  async patchInvoice(
    id: string,
    dto: PatchInvoiceDto,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (user.role === Role.DEPT_USER) {
      if (inv.departmentId !== user.departmentId) {
        throw new ForbiddenException('Invoice is outside your department scope');
      }
      if (
        !([
          InvoiceStatus.UPLOADED,
          InvoiceStatus.EXTRACTED,
          InvoiceStatus.VENDOR_UNVERIFIED,
          InvoiceStatus.VENDOR_VERIFIED,
          InvoiceStatus.REJECTED,
        ] as InvoiceStatus[]).includes(inv.status)
      ) {
        throw new ForbiddenException(
          'Department can only complete invoice details before head or finance processing starts',
        );
      }
    }
    if (user.role === Role.DEPT_ADMIN) {
      throw new ForbiddenException('Department head can review, approve, or reject, not edit invoice details');
    }
    if (
      inv.status === InvoiceStatus.PAID ||
      inv.status === InvoiceStatus.PAYMENT_INITIATED
    ) {
      throw new BadRequestException('Invoice is locked after payment');
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.amountPkr != null) data.amountPkr = new Prisma.Decimal(dto.amountPkr);
    if (dto.invoiceNumber !== undefined) data.invoiceNumber = dto.invoiceNumber;
    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.departmentId) {
      if (user.role === Role.DEPT_USER && dto.departmentId !== user.departmentId) {
        throw new ForbiddenException('Department users cannot move invoices to another department');
      }
      const d = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
      });
      if (!d) throw new BadRequestException('Invalid department');
      data.department = { connect: { id: dto.departmentId } };
    }
    if (dto.vendorId) {
      const v = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
      if (!v) throw new BadRequestException('Invalid vendor');
      data.vendor = { connect: { id: dto.vendorId } };
      data.status = InvoiceStatus.VENDOR_VERIFIED;
    }
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.invoiceDate) data.invoiceDate = new Date(dto.invoiceDate);
    if (dto.receivedDate) data.receivedDate = new Date(dto.receivedDate);
    if (dto.currency) data.currency = dto.currency;
    if (dto.subtotal != null) data.subtotal = new Prisma.Decimal(dto.subtotal);
    if (dto.taxAmount != null) data.taxAmount = new Prisma.Decimal(dto.taxAmount);
    if (dto.withholdingTax != null) {
      data.withholdingTax = new Prisma.Decimal(dto.withholdingTax);
    }
    if (dto.totalAmount != null) data.totalAmount = new Prisma.Decimal(dto.totalAmount);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data,
      include: invoiceInclude,
    });

    if (dto.vendorId) {
      await this.ensureInvoicePurchaseOrder(updated.id, user.id);
      await this.upsertPaymentPlanFromInvoice(updated.id, user.id, dto);
      await this.upsertDepartmentTicketFromInvoice(updated.id, user.id);
      await this.syncTicketFromInvoice(updated.id);
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: updated.id },
        include: invoiceInclude,
      });
    }
    if (inv.vendorId && inv.status === InvoiceStatus.VENDOR_VERIFIED) {
      await this.ensureInvoicePurchaseOrder(updated.id, user.id);
      await this.upsertPaymentPlanFromInvoice(updated.id, user.id, dto);
      await this.upsertDepartmentTicketFromInvoice(updated.id, user.id);
      await this.syncTicketFromInvoice(updated.id);
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: updated.id },
        include: invoiceInclude,
      });
    }

    const matched = await this.applyVendorMatch(id);
    await this.ensureInvoicePurchaseOrder(id, user.id);
    await this.upsertPaymentPlanFromInvoice(id, user.id, dto);
    await this.upsertDepartmentTicketFromInvoice(id, user.id);
    await this.syncTicketFromInvoice(id);
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: matched.id },
      include: invoiceInclude,
    });
  }

  private async syncTicketFromInvoice(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) return;

    const ticket = await this.prisma.paymentTicket.findUnique({
      where: { invoiceId },
    });
    if (!ticket) return;

    const title =
      inv.invoiceNumber ??
      inv.reference ??
      inv.description ??
      `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`;
    const firstMilestone = this.firstPayableMilestone(inv.paymentPlan);
    const titleSuffix =
      firstMilestone?.kind === PaymentMilestoneKind.ADVANCE ? ' - advance payment' : '';

    await this.prisma.paymentTicket.update({
      where: { id: ticket.id },
      data: {
        title: `${title}${titleSuffix}`,
        invoiceNumber: inv.invoiceNumber ?? inv.reference,
        billType: firstMilestone
          ? this.billTypeForMilestone(firstMilestone.kind)
          : ticket.billType,
        amountPkr: firstMilestone?.amount ?? inv.amountPkr,
        dueDate: inv.dueDate ?? ticket.dueDate,
        vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
        vendorNameSnapshot:
          inv.vendor?.displayName ??
          ticket.vendorNameSnapshot ??
          null,
        notes: inv.description ?? ticket.notes,
      },
    });
  }

  async submitForApproval(
    id: string,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (user.role === Role.DEPT_USER && inv.departmentId !== user.departmentId) {
      throw new ForbiddenException('Invoice is outside your department scope');
    }
    if (user.role === Role.DEPT_ADMIN) {
      throw new ForbiddenException('Department admins are not part of the AP submission scope');
    }
    if (inv.amountPkr.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (!inv.vendorId || inv.status !== InvoiceStatus.VENDOR_VERIFIED) {
      throw new BadRequestException(
        'Vendor must be verified before sending for approval',
      );
    }
    await this.ensureInvoicePurchaseOrder(id, user.id);
    await this.upsertPaymentPlanFromInvoice(id, user.id);
    await this.runAgentVerification(id);
    await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.APPROVED },
    });
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (invoice?.poId) {
      await this.prisma.purchaseOrder.update({
        where: { id: invoice.poId },
        data: { status: PurchaseOrderStatus.APPROVED },
      });
    }
    await this.createTicketFromInvoice(id, user.id);
    await this.prisma.paymentPlan.updateMany({
      where: { invoiceId: id, status: PaymentPlanStatus.DRAFT },
      data: { status: PaymentPlanStatus.ACTIVE },
    });

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: invoiceInclude,
    });
  }

  async listForUser(user: {
    id: string;
    role: Role;
    departmentId: string | null;
  }) {
    const args = {
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' as const },
    };

    if (user.role === Role.COMPANY_ADMIN || user.role === Role.AP_CLERK) {
      return this.prisma.invoice.findMany(args);
    }

    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      if (!user.departmentId) return [];
      return this.prisma.invoice.findMany({
        ...args,
        where: {
          departmentId: user.departmentId,
        },
      });
    }

    return [];
  }

  async getOne(
    id: string,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        ...invoiceInclude,
        approvals: {
          include: { approver: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!inv) throw new NotFoundException();

    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      if (inv.departmentId !== user.departmentId) {
        throw new ForbiddenException();
      }
    }

    return inv;
  }

  async importFromPublishedCsvUrl(
    url: string,
    departmentId: string,
    submittedBy: { id: string; role: Role; departmentId: string | null },
  ) {
    this.assertDepartmentCanCreateInvoice(departmentId, submittedBy);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Only HTTPS URLs are allowed');
    }

    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new BadRequestException('Could not download file');
    const buf = Buffer.from(await res.arrayBuffer());
    const extracted = parseSpreadsheetBuffer(buf);
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) throw new BadRequestException('Invalid department');

    const inv = await this.prisma.invoice.create({
      data: {
        departmentId: department.id,
        submittedById: submittedBy.id,
        extracted: extracted as Prisma.InputJsonValue,
        amountPkr: new Prisma.Decimal(extracted.amountPkr ?? 0),
        reference: extracted.reference ?? null,
        description:
          extracted.description ?? 'Imported from published spreadsheet (CSV) URL',
        mimeType: 'text/csv',
        originalFilename: 'import.csv',
        status: InvoiceStatus.EXTRACTED,
      },
    });
    const invoice = await this.applyVendorMatch(inv.id);
    await this.ensureInvoicePurchaseOrder(inv.id, submittedBy.id);
    await this.upsertPaymentPlanFromInvoice(inv.id, submittedBy.id);
    await this.upsertDepartmentTicketFromInvoice(inv.id, submittedBy.id);
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: invoiceInclude,
    });
  }

  async markPaidFromStripe(
    invoiceId: string,
    sessionId: string | null,
    piId: string | null,
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();

    if (inv.status === InvoiceStatus.PAID) {
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: invoiceInclude,
      });
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: piId,
      },
      include: invoiceInclude,
    });
  }

  private assertDepartmentCanCreateInvoice(
    departmentId: string,
    user: { role: Role; departmentId: string | null },
  ) {
    if (user.role === Role.AP_CLERK) {
      throw new ForbiddenException('Departments create invoices; AP reviews them after submission');
    }
    if (user.role === Role.CFO) {
      throw new ForbiddenException('CFO can authorize payments, not create invoices');
    }
    if (user.role === Role.DEPT_ADMIN) {
      throw new ForbiddenException('Department head can approve or reject, not create invoices');
    }
    if (user.role === Role.DEPT_USER && user.departmentId !== departmentId) {
      throw new ForbiddenException('Department users can only create invoices for their own department');
    }
  }
}
