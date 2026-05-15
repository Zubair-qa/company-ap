import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
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
    handleStripeWebhook(req: RawBodyRequest<Request>, signature: string | undefined): Promise<{
        received: boolean;
    }>;
}
