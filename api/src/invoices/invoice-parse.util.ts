import * as XLSX from 'xlsx';
import {
  normalizeInvoiceDate,
  parseInvoiceFieldsFromText,
} from './invoice-slip-extract.util';

export type ExtractedInvoice = {
  vendorName?: string;
  vendorTaxNumber?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  reference?: string;
  amountPkr?: number;
  dueDate?: string;
  description?: string;
  sheetPreview?: Record<string, string | number | null>[];
};

function normalizeKey(k: string) {
  return k
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function rowToObject(row: unknown[]): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (let i = 0; i < row.length; i++) {
    const v = row[i];
    if (v === undefined || v === null || v === '') continue;
    out[`col_${i}`] = typeof v === 'number' ? v : String(v);
  }
  return out;
}

export function parseSpreadsheetBuffer(buf: Buffer): ExtractedInvoice {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  }) as (string | number | null)[][];

  const preview = rows.slice(0, 5).map((r) => rowToObject(r));

  if (!rows.length) return { sheetPreview: preview };

  const headerRow = rows[0].map((c) => (c == null ? '' : String(c)));
  const isHeader = headerRow.some((h) =>
    /vendor|supplier|amount|total|ntn|tax|invoice|date|description/i.test(h),
  );

  if (isHeader) {
    const keys = headerRow.map(normalizeKey);
    const dataRow = rows[1] ?? [];
    const map: Record<string, string | number | null> = {};
    keys.forEach((k, i) => {
      if (!k) return;
      map[k] = dataRow[i] ?? null;
    });
    const vendorName =
      firstString(map, ['vendor', 'vendor_name', 'supplier', 'supplier_name']) ??
      undefined;
    const vendorTaxNumber =
      firstString(map, ['tax', 'tax_number', 'ntn', 'ntn_strn', 'strn']) ?? undefined;
    const reference =
      firstString(map, [
        'invoice',
        'invoice_no',
        'invoice_number',
        'reference',
        'ref',
        'bill_no',
        'bill_number',
      ]) ?? undefined;
    const invoiceDate =
      firstDate(map, [
        'invoice_date',
        'invoice_dt',
        'bill_date',
        'receipt_date',
        'date',
      ]) ?? undefined;
    const amountPkr = firstAmount(map, [
      'amount',
      'total',
      'amount_pkr',
      'amountpkr',
      'grand_total',
      'invoice_amount',
      'net_payable',
      'payable_amount',
    ]);
    const dueDate = firstDate(map, ['due_date', 'duedate', 'due']) ?? undefined;
    const description =
      firstString(map, ['description', 'details', 'memo']) ?? undefined;
    return {
      vendorName,
      vendorTaxNumber,
      invoiceNumber: reference,
      invoiceDate,
      reference,
      amountPkr: amountPkr ?? undefined,
      dueDate,
      description,
      sheetPreview: preview,
    };
  }

  const flat = rows.flat().filter((c) => c != null && c !== '');
  const textFields = parseInvoiceFieldsFromText(flat.map((c) => String(c)).join('\n'));
  const amountPkr = flat
    .map((c) => (typeof c === 'number' ? c : parseMoney(String(c))))
    .find((n) => n != null && !Number.isNaN(n));

  return {
    invoiceNumber: textFields.invoiceNumber,
    invoiceDate: textFields.invoiceDate,
    reference: textFields.invoiceNumber,
    amountPkr: textFields.amountPkr ?? amountPkr ?? undefined,
    sheetPreview: preview,
  };
}

function firstString(
  map: Record<string, string | number | null>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = map[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return null;
}

function firstAmount(
  map: Record<string, string | number | null>,
  keys: string[],
): number | null {
  for (const k of keys) {
    const v = map[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const n = parseMoney(v);
      if (n != null) return n;
    }
  }
  return null;
}

function firstDate(
  map: Record<string, string | number | null>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = map[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const parsed = XLSX.SSF.parse_date_code(v);
      if (!parsed) continue;
      const normalized = normalizeInvoiceDate(`${parsed.d}/${parsed.m}/${parsed.y}`);
      if (normalized) return normalized;
    }
    if (typeof v === 'string') {
      const normalized = normalizeInvoiceDate(v);
      if (normalized) return normalized;
    }
  }
  return null;
}

function parseMoney(s: string): number | null {
  const cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
