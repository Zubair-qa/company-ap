import { Role } from '../common/domain';
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
        extracted: unknown;
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
        vendorId: string | null;
        submittedById: string;
        stripeCheckoutSessionId: string | null;
        stripePaymentIntentId: string | null;
    }>;
}
