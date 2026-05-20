"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoicesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const prisma_service_1 = require("../prisma/prisma.service");
const invoice_parse_util_1 = require("./invoice-parse.util");
const SPREADSHEET_MIMES = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
]);
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
function uploadRoot() {
    return process.env.UPLOAD_DIR || './uploads';
}
function decimal(value) {
    return new client_1.Prisma.Decimal(value);
}
function calculateTotalAmountPkr(amountPkr, whtTax, salesTax, incomeTax) {
    const amount = decimal(amountPkr);
    const taxPercent = decimal(whtTax).plus(salesTax).plus(incomeTax);
    return amount.plus(amount.mul(taxPercent).div(100)).toDecimalPlaces(2);
}
const invoiceInclude = client_1.Prisma.validator()({
    vendor: true,
    department: true,
    submittedBy: { select: { id: true, name: true, email: true } },
    approvals: { orderBy: { createdAt: 'desc' }, take: 3 },
});
let InvoicesService = class InvoicesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createFromUpload(file, departmentId, submittedById) {
        const dept = await this.prisma.department.findUnique({
            where: { id: departmentId },
        });
        if (!dept)
            throw new common_1.BadRequestException('Invalid department');
        const relPath = file.filename;
        let extracted = null;
        let amountPkr = new client_1.Prisma.Decimal(0);
        let reference = null;
        let description = null;
        let status = client_1.InvoiceStatus.UPLOADED;
        const looksSpreadsheet = SPREADSHEET_MIMES.has(file.mimetype) ||
            /\.(xlsx|xls|csv)$/i.test(file.originalname);
        if (looksSpreadsheet) {
            const buf = await (0, promises_1.readFile)((0, path_1.join)(uploadRoot(), file.filename));
            const parsed = (0, invoice_parse_util_1.parseSpreadsheetBuffer)(buf);
            extracted = parsed;
            amountPkr = new client_1.Prisma.Decimal(parsed.amountPkr ?? 0);
            reference = parsed.reference ?? null;
            description = parsed.description ?? null;
            status = client_1.InvoiceStatus.EXTRACTED;
        }
        else if (IMAGE_MIMES.has(file.mimetype) || /^image\//i.test(file.mimetype)) {
            extracted = {
                needsManualEntry: true,
                hint: 'Enter amount, reference, and link a vendor manually (OCR can be added later).',
            };
            status = client_1.InvoiceStatus.EXTRACTED;
        }
        else {
            extracted = {
                note: 'No automatic line-item extraction for this file type; use Edit to complete the invoice.',
            };
            status = client_1.InvoiceStatus.EXTRACTED;
        }
        const inv = await this.prisma.invoice.create({
            data: {
                departmentId,
                submittedById,
                fileRelPath: relPath,
                originalFilename: file.originalname,
                mimeType: file.mimetype,
                extracted: extracted,
                amountPkr,
                totalAmountPkr: calculateTotalAmountPkr(amountPkr, 0, 0, 0),
                reference,
                description,
                status,
            },
        });
        if (status === client_1.InvoiceStatus.EXTRACTED) {
            return this.applyVendorMatch(inv.id);
        }
        return this.prisma.invoice.findUniqueOrThrow({
            where: { id: inv.id },
            include: invoiceInclude,
        });
    }
    async applyVendorMatch(invoiceId) {
        const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv)
            throw new common_1.NotFoundException();
        if (inv.vendorId && inv.status === client_1.InvoiceStatus.VENDOR_VERIFIED) {
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
        const e = inv.extracted;
        let vendor = null;
        if (e.vendorTaxNumber) {
            vendor = await this.prisma.vendor.findFirst({
                where: { taxNumber: String(e.vendorTaxNumber), active: true },
            });
        }
        if (!vendor && e.vendorName) {
            const name = String(e.vendorName).toLowerCase();
            const list = await this.prisma.vendor.findMany({ where: { active: true } });
            vendor =
                list.find((v) => v.displayName.toLowerCase().includes(name) ||
                    name.includes(v.displayName.toLowerCase())) ?? null;
        }
        if (vendor) {
            return this.prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                    vendorId: vendor.id,
                    status: client_1.InvoiceStatus.VENDOR_VERIFIED,
                },
                include: invoiceInclude,
            });
        }
        return this.prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: client_1.InvoiceStatus.VENDOR_UNVERIFIED },
            include: invoiceInclude,
        });
    }
    async patchInvoice(id, dto, _user) {
        const inv = await this.prisma.invoice.findUnique({ where: { id } });
        if (!inv)
            throw new common_1.NotFoundException();
        if (inv.status === client_1.InvoiceStatus.PAID ||
            inv.status === client_1.InvoiceStatus.PAYMENT_INITIATED) {
            throw new common_1.BadRequestException('Invoice is locked after payment');
        }
        const data = {};
        if (dto.amountPkr != null)
            data.amountPkr = new client_1.Prisma.Decimal(dto.amountPkr);
        if (dto.taxFilerStatus != null)
            data.taxFilerStatus = dto.taxFilerStatus;
        if (dto.whtTax != null)
            data.whtTax = new client_1.Prisma.Decimal(dto.whtTax);
        if (dto.salesTax != null)
            data.salesTax = new client_1.Prisma.Decimal(dto.salesTax);
        if (dto.incomeTax != null)
            data.incomeTax = new client_1.Prisma.Decimal(dto.incomeTax);
        if (dto.amountPkr != null ||
            dto.whtTax != null ||
            dto.salesTax != null ||
            dto.incomeTax != null) {
            data.totalAmountPkr = calculateTotalAmountPkr(dto.amountPkr ?? inv.amountPkr, dto.whtTax ?? inv.whtTax, dto.salesTax ?? inv.salesTax, dto.incomeTax ?? inv.incomeTax);
        }
        if (dto.reference !== undefined)
            data.reference = dto.reference;
        if (dto.description !== undefined)
            data.description = dto.description;
        if (dto.departmentId) {
            const d = await this.prisma.department.findUnique({
                where: { id: dto.departmentId },
            });
            if (!d)
                throw new common_1.BadRequestException('Invalid department');
            data.department = { connect: { id: dto.departmentId } };
        }
        if (dto.vendorId) {
            const v = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
            if (!v)
                throw new common_1.BadRequestException('Invalid vendor');
            data.vendor = { connect: { id: dto.vendorId } };
            data.status = client_1.InvoiceStatus.VENDOR_VERIFIED;
        }
        if (dto.dueDate)
            data.dueDate = new Date(dto.dueDate);
        const updated = await this.prisma.invoice.update({
            where: { id },
            data,
            include: invoiceInclude,
        });
        if (dto.vendorId)
            return updated;
        if (inv.vendorId && inv.status === client_1.InvoiceStatus.VENDOR_VERIFIED)
            return updated;
        return this.applyVendorMatch(id);
    }
    async submitForApproval(id, _user) {
        const inv = await this.prisma.invoice.findUnique({ where: { id } });
        if (!inv)
            throw new common_1.NotFoundException();
        if (inv.amountPkr.lte(0)) {
            throw new common_1.BadRequestException('Amount must be greater than zero');
        }
        if (!inv.vendorId || inv.status !== client_1.InvoiceStatus.VENDOR_VERIFIED) {
            throw new common_1.BadRequestException('Vendor must be verified before sending for approval');
        }
        return this.prisma.invoice.update({
            where: { id },
            data: { status: client_1.InvoiceStatus.AWAITING_APPROVAL },
            include: invoiceInclude,
        });
    }
    async listForUser(user) {
        const args = {
            include: invoiceInclude,
            orderBy: { createdAt: 'desc' },
        };
        if (user.role === client_1.Role.COMPANY_ADMIN || user.role === client_1.Role.AP_CLERK) {
            return this.prisma.invoice.findMany(args);
        }
        if (user.role === client_1.Role.DEPT_ADMIN) {
            if (!user.departmentId)
                return [];
            return this.prisma.invoice.findMany({
                ...args,
                where: { departmentId: user.departmentId },
            });
        }
        return [];
    }
    async getOne(id, user) {
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
        if (!inv)
            throw new common_1.NotFoundException();
        if (user.role === client_1.Role.DEPT_ADMIN) {
            if (inv.departmentId !== user.departmentId) {
                throw new common_1.ForbiddenException();
            }
        }
        return inv;
    }
    async importFromPublishedCsvUrl(url, submittedById) {
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        }
        catch {
            throw new common_1.BadRequestException('Invalid URL');
        }
        if (parsedUrl.protocol !== 'https:') {
            throw new common_1.BadRequestException('Only HTTPS URLs are allowed');
        }
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok)
            throw new common_1.BadRequestException('Could not download file');
        const buf = Buffer.from(await res.arrayBuffer());
        const extracted = (0, invoice_parse_util_1.parseSpreadsheetBuffer)(buf);
        const department = await this.prisma.department.findFirst({
            orderBy: { name: 'asc' },
        });
        if (!department)
            throw new common_1.BadRequestException('Create a department first');
        const inv = await this.prisma.invoice.create({
            data: {
                departmentId: department.id,
                submittedById,
                extracted: extracted,
                amountPkr: new client_1.Prisma.Decimal(extracted.amountPkr ?? 0),
                totalAmountPkr: calculateTotalAmountPkr(extracted.amountPkr ?? 0, 0, 0, 0),
                reference: extracted.reference ?? null,
                description: extracted.description ?? 'Imported from published spreadsheet (CSV) URL',
                mimeType: 'text/csv',
                originalFilename: 'import.csv',
                status: client_1.InvoiceStatus.EXTRACTED,
            },
        });
        return this.applyVendorMatch(inv.id);
    }
    async markPaidFromStripe(invoiceId, sessionId, piId) {
        return this.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                status: client_1.InvoiceStatus.PAID,
                stripeCheckoutSessionId: sessionId,
                stripePaymentIntentId: piId,
            },
            include: invoiceInclude,
        });
    }
};
exports.InvoicesService = InvoicesService;
exports.InvoicesService = InvoicesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InvoicesService);
//# sourceMappingURL=invoices.service.js.map