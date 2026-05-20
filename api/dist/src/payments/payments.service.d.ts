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
        vendor: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            displayName: string;
            legalName: string | null;
            taxNumber: string | null;
            kind: import(".prisma/client").$Enums.VendorKind;
            active: boolean;
        } | null;
        department: {
            id: string;
            name: string;
        };
        submittedBy: {
            id: string;
            name: string;
            email: string;
        };
        approvals: {
            id: string;
            createdAt: Date;
            invoiceId: string;
            approverId: string;
            approved: boolean;
            note: string | null;
        }[];
    } & {
        id: string;
        reference: string | null;
        amountPkr: import("@prisma/client/runtime/library").Decimal;
        whtTax: import("@prisma/client/runtime/library").Decimal;
        salesTax: import("@prisma/client/runtime/library").Decimal;
        incomeTax: import("@prisma/client/runtime/library").Decimal;
        totalAmountPkr: import("@prisma/client/runtime/library").Decimal;
        taxFilerStatus: import(".prisma/client").$Enums.TaxFilerStatus;
        dueDate: Date | null;
        description: string | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: import("@prisma/client/runtime/library").JsonValue | null;
        vendorId: string | null;
        departmentId: string;
        submittedById: string;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    handleStripeWebhook(req: RawBodyRequest<Request>, signature: string | undefined): Promise<{
        received: boolean;
    }>;
    private createSandboxCheckoutSession;
    private isSandboxMode;
}
export {};
