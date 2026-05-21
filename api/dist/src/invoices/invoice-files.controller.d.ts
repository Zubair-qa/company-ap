import { InvoicesService } from './invoices.service';
export declare class InvoiceFilesController {
    private invoices;
    constructor(invoices: InvoicesService);
    upload(file: Express.Multer.File, req: {
        user: {
            id: string;
        };
        body: {
            departmentId?: string;
        };
    }): Promise<{
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
            kind: string;
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
        dueDate: Date | null;
        description: string | null;
        status: string;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: string | null;
        vendorId: string | null;
        submittedById: string;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
    } & {
        extracted: unknown;
    }>;
}
