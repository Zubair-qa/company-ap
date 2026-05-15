import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApprovalsService {
  constructor(private prisma: PrismaService) {}

  async decide(
    invoiceId: string,
    dto: { approved: boolean; note?: string },
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();
    if (inv.status !== InvoiceStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('Invoice is not awaiting approval');
    }

    if (user.role === Role.DEPT_ADMIN) {
      if (!user.departmentId || inv.departmentId !== user.departmentId) {
        throw new ForbiddenException('You can only approve invoices for your department');
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
      ? InvoiceStatus.APPROVED
      : InvoiceStatus.REJECTED;

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
}
