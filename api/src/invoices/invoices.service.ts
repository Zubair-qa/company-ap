import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma, Role, Vendor } from '@prisma/client';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
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

const invoiceInclude = Prisma.validator<Prisma.InvoiceInclude>()({
  vendor: true,
  department: true,
  submittedBy: { select: { id: true, name: true, email: true } },
  approvals: { orderBy: { createdAt: 'desc' }, take: 3 },
});

@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  async createFromUpload(
    file: Express.Multer.File,
    departmentId: string,
    submittedById: string,
  ) {
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
        submittedById,
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

    if (status === InvoiceStatus.EXTRACTED) {
      return this.applyVendorMatch(inv.id);
    }

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: inv.id },
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
    _user: { id: string; role: Role },
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (
      inv.status === InvoiceStatus.PAID ||
      inv.status === InvoiceStatus.PAYMENT_INITIATED
    ) {
      throw new BadRequestException('Invoice is locked after payment');
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.amountPkr != null) data.amountPkr = new Prisma.Decimal(dto.amountPkr);
    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.departmentId) {
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

    const updated = await this.prisma.invoice.update({
      where: { id },
      data,
      include: invoiceInclude,
    });

    if (dto.vendorId) return updated;
    if (inv.vendorId && inv.status === InvoiceStatus.VENDOR_VERIFIED) return updated;

    return this.applyVendorMatch(id);
  }

  async submitForApproval(id: string, _user: { id: string }) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (inv.amountPkr.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (!inv.vendorId || inv.status !== InvoiceStatus.VENDOR_VERIFIED) {
      throw new BadRequestException(
        'Vendor must be verified before sending for approval',
      );
    }

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.AWAITING_APPROVAL },
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

    if (user.role === Role.DEPT_ADMIN) {
      if (!user.departmentId) return [];
      return this.prisma.invoice.findMany({
        ...args,
        where: { departmentId: user.departmentId },
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

    if (user.role === Role.DEPT_ADMIN) {
      if (inv.departmentId !== user.departmentId) {
        throw new ForbiddenException();
      }
    }

    return inv;
  }

  async importFromPublishedCsvUrl(url: string, submittedById: string) {
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
    const department = await this.prisma.department.findFirst({
      orderBy: { name: 'asc' },
    });
    if (!department) throw new BadRequestException('Create a department first');

    const inv = await this.prisma.invoice.create({
      data: {
        departmentId: department.id,
        submittedById,
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
    return this.applyVendorMatch(inv.id);
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
}
