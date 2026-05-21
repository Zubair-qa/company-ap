"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvoiceStatus = exports.VendorKind = exports.Role = void 0;
exports.encodeJson = encodeJson;
exports.decodeJson = decodeJson;
exports.Role = {
    COMPANY_ADMIN: 'COMPANY_ADMIN',
    AP_CLERK: 'AP_CLERK',
    DEPT_ADMIN: 'DEPT_ADMIN',
};
exports.VendorKind = {
    RECURRING: 'RECURRING',
    ONE_OFF: 'ONE_OFF',
};
exports.InvoiceStatus = {
    UPLOADED: 'UPLOADED',
    EXTRACTED: 'EXTRACTED',
    VENDOR_UNVERIFIED: 'VENDOR_UNVERIFIED',
    VENDOR_VERIFIED: 'VENDOR_VERIFIED',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    PAYMENT_INITIATED: 'PAYMENT_INITIATED',
    PAID: 'PAID',
};
function encodeJson(value) {
    return value == null ? null : JSON.stringify(value);
}
function decodeJson(value) {
    if (!value)
        return null;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
//# sourceMappingURL=domain.js.map