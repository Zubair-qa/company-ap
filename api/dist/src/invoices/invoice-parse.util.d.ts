export type ExtractedInvoice = {
    vendorName?: string;
    vendorTaxNumber?: string;
    reference?: string;
    amountPkr?: number;
    dueDate?: string;
    description?: string;
    sheetPreview?: Record<string, string | number | null>[];
};
export declare function parseSpreadsheetBuffer(buf: Buffer): ExtractedInvoice;
