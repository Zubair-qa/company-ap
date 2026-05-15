import { Role } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { ApprovalDecisionDto } from './dto/approval-decision.dto';
export declare class ApprovalsController {
    private approvals;
    constructor(approvals: ApprovalsService);
    decide(invoiceId: string, dto: ApprovalDecisionDto, req: {
        user: {
            id: string;
            role: Role;
            departmentId: string | null;
        };
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
    } & {
        id: string;
        departmentId: string;
        createdAt: Date;
        updatedAt: Date;
        reference: string | null;
        description: string | null;
        amountPkr: import("@prisma/client/runtime/library").Decimal;
        vendorId: string | null;
        dueDate: Date | null;
        status: import(".prisma/client").$Enums.InvoiceStatus;
        fileRelPath: string | null;
        originalFilename: string | null;
        mimeType: string | null;
        extracted: import("@prisma/client/runtime/library").JsonValue | null;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
        submittedById: string;
    }>;
}
