import { VendorKind } from '../../common/domain';
export declare class CreateVendorDto {
    displayName: string;
    legalName?: string;
    taxNumber?: string;
    kind: VendorKind;
    active?: boolean;
}
