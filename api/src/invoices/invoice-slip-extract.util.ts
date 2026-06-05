export type ExtractedSlipFields = {
  invoiceNumber?: string;
  invoiceDate?: string;
  amountPkr?: number;
};

const invoiceNumberPatterns = [
  /\b(?:invoice|inv|bill|receipt|slip)\s*(?:number|no|num|#)\s*[.:#-]*\s*([A-Z0-9][A-Z0-9/_-]{1,39})\b/i,
  /\b(?:invoice|inv|bill|receipt|slip)\s*#\s*[.:#-]*\s*([A-Z0-9][A-Z0-9/_-]{1,39})\b/i,
];

const labelledDatePatterns = [
  /\b(?:invoice\s*date|bill\s*date|receipt\s*date|date)\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/i,
  /\b(?:invoice\s*date|bill\s*date|receipt\s*date|date)\s*[:#-]?\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/i,
];

const anyDatePatterns = [
  /\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/,
  /\b(\d{4}[./-]\d{1,2}[./-]\d{1,2})\b/,
];

const amountLineKeywords =
  /\b(grand\s*total|net\s*total|total\s*amount|invoice\s*amount|amount\s*due|balance\s*due|payable|net\s*payable|gross\s*amount|paid\s*amount|\btotal\b)\b/i;

const currencyAmountPattern =
  /\b(?:rs\.?|pkr)\s*[-:]?\s*([0-9][0-9,]*(?:\.\d{1,2})?)\b/gi;

const moneyTokenPattern = /\b[0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{1,2})?\b|\b[0-9]+(?:\.\d{1,2})?\b/g;

export function parseInvoiceFieldsFromText(rawText: string): ExtractedSlipFields {
  const text = normalizeOcrText(rawText);
  if (!text) return {};

  return {
    invoiceNumber: extractInvoiceNumber(text),
    invoiceDate: extractInvoiceDate(text),
    amountPkr: extractAmount(text),
  };
}

export function parseInvoiceFieldsFromOcrOutput(rawOutput: string): ExtractedSlipFields {
  const textFields = parseInvoiceFieldsFromText(rawOutput);
  const jsonFields = parseInvoiceFieldsFromJsonText(rawOutput);
  return mergeFields(textFields, jsonFields);
}

export function parseInvoiceFieldsFromObject(data: Record<string, unknown>): ExtractedSlipFields {
  const rawText = firstObjectString(data, ['rawText', 'text', 'ocrText', 'plainText', 'content']);
  const textFields = rawText ? parseInvoiceFieldsFromText(rawText) : {};
  const invoiceNumber = firstObjectString(data, [
    'invoiceNumber',
    'invoiceNo',
    'invoice_no',
    'invoice',
    'billNumber',
    'receiptNumber',
    'slipNumber',
  ]);
  const invoiceDate = normalizeObjectDate(
    firstObjectValue(data, [
      'invoiceDate',
      'invoice_date',
      'date',
      'billDate',
      'receiptDate',
      'transactionDate',
    ]),
  );
  const amountPkr = normalizeObjectAmount(
    firstObjectValue(data, [
      'amountPkr',
      'amount',
      'invoiceAmount',
      'totalAmount',
      'total',
      'grandTotal',
      'grossTotal',
      'payable',
      'payableAmount',
      'netPayable',
      'netAmount',
      'balanceDue',
      'dueAmount',
    ]),
  );

  return mergeFields(textFields, {
    invoiceNumber: invoiceNumber ?? undefined,
    invoiceDate: invoiceDate ?? undefined,
    amountPkr: amountPkr ?? undefined,
  });
}

export function normalizeInvoiceDate(value: string): string | null {
  const match = value.trim().match(/^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})$/);
  if (!match) return null;

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);
  let year: number;
  let month: number;
  let day: number;

  if (match[1].length === 4) {
    year = first;
    month = second;
    day = third;
  } else {
    day = first;
    month = second;
    year = match[3].length === 2 ? 2000 + third : third;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseInvoiceFieldsFromJsonText(rawOutput: string): ExtractedSlipFields {
  const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return {};

  try {
    const data = JSON.parse(jsonMatch[0]) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return parseInvoiceFieldsFromObject(data as Record<string, unknown>);
  } catch {
    return {};
  }
}

function mergeFields(
  fallback: ExtractedSlipFields,
  preferred: ExtractedSlipFields,
): ExtractedSlipFields {
  return {
    invoiceNumber: preferred.invoiceNumber ?? fallback.invoiceNumber,
    invoiceDate: preferred.invoiceDate ?? fallback.invoiceDate,
    amountPkr: preferred.amountPkr ?? fallback.amountPkr,
  };
}

function normalizeOcrText(rawText: string) {
  return rawText
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractInvoiceNumber(text: string): string | undefined {
  for (const pattern of invoiceNumberPatterns) {
    const match = text.match(pattern);
    const cleaned = match?.[1] ? cleanInvoiceNumber(match[1]) : null;
    if (cleaned) return cleaned;
  }
  return undefined;
}

function cleanInvoiceNumber(value: string) {
  const cleaned = value.replace(/[.,;:)]+$/g, '').trim();
  if (!cleaned) return null;
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(cleaned)) return null;
  return cleaned.slice(0, 40);
}

function extractInvoiceDate(text: string): string | undefined {
  for (const pattern of labelledDatePatterns) {
    const match = text.match(pattern);
    const normalized = match?.[1] ? normalizeInvoiceDate(match[1]) : null;
    if (normalized) return normalized;
  }

  for (const pattern of anyDatePatterns) {
    const match = text.match(pattern);
    const normalized = match?.[1] ? normalizeInvoiceDate(match[1]) : null;
    if (normalized) return normalized;
  }

  return undefined;
}

function extractAmount(text: string): number | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const payableLineIndex = lines.findIndex((line) =>
    /\b(payable|net\s*payable|amount\s*due)\b/i.test(line),
  );
  if (payableLineIndex >= 0) {
    const amounts = amountsFromWindow(lines, payableLineIndex);
    if (amounts.length) return amounts[amounts.length - 1];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!amountLineKeywords.test(line)) continue;
    const amounts = amountsFromWindow(lines, index);
    if (amounts.length) return amounts[amounts.length - 1];
  }

  const currencyAmounts = Array.from(text.matchAll(currencyAmountPattern))
    .map((match) => parseMoney(match[1]))
    .filter((amount): amount is number => amount != null);
  if (currencyAmounts.length) return currencyAmounts[currencyAmounts.length - 1];

  return undefined;
}

function amountsFromWindow(lines: string[], index: number) {
  const currentLineAmounts = amountsFromLine(lines[index]);
  if (currentLineAmounts.length) return currentLineAmounts;

  const windowText = lines.slice(index, index + 3).join(' ');
  return amountsFromLine(windowText);
}

function amountsFromLine(line: string) {
  return Array.from(line.matchAll(moneyTokenPattern))
    .map((match) => parseMoney(match[0]))
    .filter((amount): amount is number => amount != null && amount > 0);
}

function parseMoney(value: string): number | null {
  const cleaned = value.replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstObjectValue(data: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = data[key];
    if (value != null && String(value).trim() !== '') return value;
  }
  return null;
}

function firstObjectString(data: Record<string, unknown>, keys: string[]) {
  const value = firstObjectValue(data, keys);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeObjectDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const dateText = value.match(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/)?.[0] ?? value;
  return normalizeInvoiceDate(dateText);
}

function normalizeObjectAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return parseMoney(value);
  return null;
}
