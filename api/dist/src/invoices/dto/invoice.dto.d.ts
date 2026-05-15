import { VendorKind } from '@prisma/client';
export declare class CreateVendorBodyDto {
    displayName: string;
    legalName?: string;
    taxNumber?: string;
    kind: VendorKind;
    active?: boolean;
}
export declare class PatchInvoiceDto {
    reference?: string;
    description?: string;
    amountPkr?: number;
    departmentId?: string;
    vendorId?: string;
    dueDate?: string;
}
export declare class GoogleCsvDto {
    url: string;
}
