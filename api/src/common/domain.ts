export const Role = {
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  AP_CLERK: 'AP_CLERK',
  DEPT_USER: 'DEPT_USER',
  DEPT_ADMIN: 'DEPT_ADMIN',
  CFO: 'CFO',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const VendorKind = {
  RECURRING: 'RECURRING',
  ONE_OFF: 'ONE_OFF',
} as const;

export type VendorKind = (typeof VendorKind)[keyof typeof VendorKind];

export const InvoiceStatus = {
  UPLOADED: 'UPLOADED',
  EXTRACTED: 'EXTRACTED',
  VENDOR_UNVERIFIED: 'VENDOR_UNVERIFIED',
  VENDOR_VERIFIED: 'VENDOR_VERIFIED',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAID: 'PAID',
} as const;

export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export function encodeJson(value: unknown) {
  return value == null ? null : JSON.stringify(value);
}

export function decodeJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
