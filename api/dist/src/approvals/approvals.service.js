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
exports.ApprovalsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let ApprovalsService = class ApprovalsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async decide(invoiceId, dto, user) {
        const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv)
            throw new common_1.NotFoundException();
        if (inv.status !== client_1.InvoiceStatus.AWAITING_APPROVAL) {
            throw new common_1.BadRequestException('Invoice is not awaiting approval');
        }
        if (user.role === client_1.Role.DEPT_ADMIN) {
            if (!user.departmentId || inv.departmentId !== user.departmentId) {
                throw new common_1.ForbiddenException('You can only approve invoices for your department');
            }
        }
        await this.prisma.approval.create({
            data: {
                invoiceId,
                approverId: user.id,
                approved: dto.approved,
                note: dto.note,
            },
        });
        const nextStatus = dto.approved
            ? client_1.InvoiceStatus.APPROVED
            : client_1.InvoiceStatus.REJECTED;
        return this.prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: nextStatus },
            include: {
                vendor: true,
                department: true,
                approvals: {
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                    include: { approver: { select: { id: true, name: true, email: true } } },
                },
            },
        });
    }
};
exports.ApprovalsService = ApprovalsService;
exports.ApprovalsService = ApprovalsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ApprovalsService);
//# sourceMappingURL=approvals.service.js.map