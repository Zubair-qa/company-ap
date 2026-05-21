export declare const Role: {
    readonly COMPANY_ADMIN: "COMPANY_ADMIN";
    readonly AP_CLERK: "AP_CLERK";
    readonly DEPT_ADMIN: "DEPT_ADMIN";
};
export type Role = (typeof Role)[keyof typeof Role];
export declare const VendorKind: {
    readonly RECURRING: "RECURRING";
    readonly ONE_OFF: "ONE_OFF";
};
export type VendorKind = (typeof VendorKind)[keyof typeof VendorKind];
export declare const InvoiceStatus: {
    readonly UPLOADED: "UPLOADED";
    readonly EXTRACTED: "EXTRACTED";
    readonly VENDOR_UNVERIFIED: "VENDOR_UNVERIFIED";
    readonly VENDOR_VERIFIED: "VENDOR_VERIFIED";
    readonly AWAITING_APPROVAL: "AWAITING_APPROVAL";
    readonly APPROVED: "APPROVED";
    readonly REJECTED: "REJECTED";
    readonly PAYMENT_INITIATED: "PAYMENT_INITIATED";
    readonly PAID: "PAID";
};
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];
export declare function encodeJson(value: unknown): string | null;
export declare function decodeJson(value: string | null): unknown;
