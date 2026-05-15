import { VendorKind } from '@prisma/client';
export declare class CreateVendorDto {
    displayName: string;
    legalName?: string;
    taxNumber?: string;
    kind: VendorKind;
    active?: boolean;
}
