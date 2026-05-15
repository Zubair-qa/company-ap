import { Prisma, Role } from '@prisma/client';
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
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
        description: string | null;
        amountPkr: Prisma.Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: Prisma.JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
    }>;
}
