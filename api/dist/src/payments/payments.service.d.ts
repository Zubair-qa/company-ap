import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
type SandboxPaymentDto = {
    cardNumber?: string;
    expiry?: string;
    cvc?: string;
};
export declare class PaymentsService {
    private config;
    private prisma;
    private invoices;
    private stripe;
    constructor(config: ConfigService, prisma: PrismaService, invoices: InvoicesService);
    createCheckoutSession(invoiceId: string): Promise<{
        url: string | null;
        sessionId: string;
    }>;
    completeSandboxPayment(invoiceId: string, dto: SandboxPaymentDto): Promise<{
        department: {
            id: string;
            name: string;
        };
        approvals: {
            id: string;
            createdAt: Date;
            note: string | null;
            approved: boolean;
            invoiceId: string;
            approverId: string;
        }[];
        vendor: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            taxNumber: string | null;
            displayName: string;
            legalName: string | null;
            kind: import(".prisma/client").$Enums.VendorKind;
            active: boolean;
        } | null;
        submittedBy: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        departmentId: string;
        createdAt: Date;
        updatedAt: Date;
        reference: string | null;
        amountPkr: import("@prisma/client/runtime/library").Decimal;
        taxFilerStatus: import(".prisma/client").$Enums.TaxFilerStatus;
        whtTax: import("@prisma/client/runtime/library").Decimal;
        salesTax: import("@prisma/client/runtime/library").Decimal;
        incomeTax: import("@prisma/client/runtime/library").Decimal;
        totalAmountPkr: import("@prisma/client/runtime/library").Decimal;
        dueDate: Date | null;
        description: string | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: import("@prisma/client/runtime/library").JsonValue | null;
        vendorId: string | null;
        submittedById: string;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
    }>;
    handleStripeWebhook(req: RawBodyRequest<Request>, signature: string | undefined): Promise<{
        received: boolean;
    }>;
    private createSandboxCheckoutSession;
    private isSandboxMode;
}
export {};
