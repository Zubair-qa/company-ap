import { Prisma } from '@prisma/client';
import { Role } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';
import { PatchInvoiceDto } from './dto/invoice.dto';
export declare class InvoicesService {
    private prisma;
    constructor(prisma: PrismaService);
    createFromUpload(file: Express.Multer.File, departmentId: string, submittedById: string): Promise<{
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
        amountPkr: Prisma.Decimal;
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
    private applyVendorMatch;
    patchInvoice(id: string, dto: PatchInvoiceDto, _user: {
        id: string;
        role: Role;
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
        amountPkr: Prisma.Decimal;
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
    submitForApproval(id: string, _user: {
        id: string;
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
        amountPkr: Prisma.Decimal;
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
    listForUser(user: {
        id: string;
        role: Role;
        departmentId: string | null;
    }): Promise<({
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
        amountPkr: Prisma.Decimal;
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
    })[]>;
    getOne(id: string, user: {
        id: string;
        role: Role;
        departmentId: string | null;
    }): Promise<{
        department: {
            id: string;
            name: string;
        };
        approvals: ({
            approver: {
                id: string;
                name: string;
                email: string;
            };
        } & {
            id: string;
            createdAt: Date;
            note: string | null;
            approved: boolean;
            invoiceId: string;
            approverId: string;
        })[];
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
        amountPkr: Prisma.Decimal;
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
    importFromPublishedCsvUrl(url: string, submittedById: string): Promise<{
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
        amountPkr: Prisma.Decimal;
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
    markPaidFromStripe(invoiceId: string, sessionId: string | null, piId: string | null): Promise<{
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
        amountPkr: Prisma.Decimal;
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
