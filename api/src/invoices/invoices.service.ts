import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountVerificationStatus,
  BankPaymentStatus,
  BillType,
  DocumentType,
  DocumentStatus,
  ExpenseNature,
  InvoiceStatus,
  PaymentMilestoneKind,
  PaymentMilestoneStatus,
  PaymentMethod,
  PaymentPlanStatus,
  PaymentPlanType,
  Prisma,
  PurchaseOrderStatus,
  Role,
  TicketPriority,
  TicketStatus,
  VerificationStatus,
  Vendor,
  VendorKind,
  XeroSyncStatus,
} from '@prisma/client';
import { readFile, unlink } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { calculateFinanceDueDate, TicketsService } from '../tickets/tickets.service';
import { PatchInvoiceDto } from './dto/invoice.dto';
import { parseSpreadsheetBuffer } from './invoice-parse.util';
import {
  ExtractedGrnFields,
  ExtractedPurchaseOrderFields,
  ExtractedSlipFields,
  parseGrnFieldsFromObject,
  parseGrnFieldsFromOcrOutput,
  parseGrnFieldsFromText,
  parseInvoiceFieldsFromObject,
  parseInvoiceFieldsFromOcrOutput,
  parseInvoiceFieldsFromText,
  parsePurchaseOrderFieldsFromObject,
  parsePurchaseOrderFieldsFromOcrOutput,
  parsePurchaseOrderFieldsFromText,
} from './invoice-slip-extract.util';

const SPREADSHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const KARACHI_OFFSET_MS = 5 * 60 * 60 * 1000;
type ProcurementMode = 'PURCHASE_ORDER' | 'NON_PURCHASE_ORDER';
type ExtractionKind = 'invoice' | 'purchase_order' | 'grn';
type ExtractedDocumentFields = ExtractedSlipFields &
  ExtractedPurchaseOrderFields &
  ExtractedGrnFields;
type UploadedInvoicePackFiles = {
  invoice: Express.Multer.File;
  purchaseOrder?: Express.Multer.File;
  grn?: Express.Multer.File;
};

function uploadRoot() {
  return process.env.UPLOAD_DIR || './uploads';
}

function dateFromIso(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function karachiDateKey(date = new Date()) {
  const local = new Date(date.getTime() + KARACHI_OFFSET_MS);
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, '0'),
    String(local.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function currentKarachiReceivedDate(now = new Date()) {
  return dateFromIso(karachiDateKey(now)) ?? now;
}

function automaticInvoiceDates(now = new Date()) {
  return {
    receivedDate: currentKarachiReceivedDate(now),
    dueDate: calculateFinanceDueDate(now),
  };
}

function nullableString(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function extractedRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function extractedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractedOptionalString(value: unknown) {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function invoiceAccountFields(extracted: Prisma.JsonValue | null | undefined) {
  const data = extractedRecord(extracted);
  const accountSync =
    data.accountSync && typeof data.accountSync === 'object' && !Array.isArray(data.accountSync)
      ? (data.accountSync as Record<string, unknown>)
      : null;
  const vendorAccountNumber = accountSync
    ? extractedOptionalString(accountSync.vendorAccountNumber)
    : undefined;
  const invoiceAccountNumber = accountSync
    ? extractedOptionalString(accountSync.invoiceAccountNumber)
    : undefined;
  const accountVerificationSource = accountSync
    ? extractedOptionalString(accountSync.accountVerificationSource)
    : undefined;
  return {
    hasExplicitAccountSync: Boolean(accountSync),
    vendorAccountNumber:
      vendorAccountNumber !== undefined
        ? vendorAccountNumber
        : extractedString(data.vendorAccountNumber),
    invoiceAccountNumber:
      invoiceAccountNumber !== undefined
        ? invoiceAccountNumber
        : extractedString(data.invoiceAccountNumber),
    accountVerificationSource:
      accountVerificationSource !== undefined
        ? accountVerificationSource
        : extractedString(data.accountVerificationSource),
  };
}

function normalizedInvoiceNumber(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function hasExtractedSlipFields(fields: ExtractedSlipFields) {
  return Boolean(fields.invoiceNumber || fields.invoiceDate || fields.amountPkr != null);
}

function hasExtractedPurchaseOrderFields(fields: ExtractedPurchaseOrderFields) {
  return Boolean(fields.poNumber || fields.poDate || fields.poAmountPkr != null);
}

function hasExtractedGrnFields(fields: ExtractedGrnFields) {
  return Boolean(fields.poNumber || fields.invoiceNumber);
}

function missingSlipFields(fields: ExtractedSlipFields) {
  return [
    fields.invoiceNumber ? null : 'invoiceNumber',
    fields.invoiceDate ? null : 'invoiceDate',
    fields.amountPkr != null ? null : 'amountPkr',
  ].filter((field): field is string => Boolean(field));
}

function missingPurchaseOrderFields(fields: ExtractedPurchaseOrderFields) {
  return [
    fields.poNumber ? null : 'poNumber',
    fields.poDate ? null : 'poDate',
    fields.poAmountPkr != null ? null : 'poAmountPkr',
  ].filter((field): field is string => Boolean(field));
}

function missingGrnFields(fields: ExtractedGrnFields) {
  return [
    fields.poNumber ? null : 'poNumber',
    fields.invoiceNumber ? null : 'invoiceNumber',
  ].filter((field): field is string => Boolean(field));
}

function purchaseOrderRequiredFromExtracted(extracted: Prisma.JsonValue | null | undefined) {
  const data = extractedRecord(extracted);
  if (typeof data.purchaseOrderRequired === 'boolean') return data.purchaseOrderRequired;
  if (data.procurementMode === 'NON_PURCHASE_ORDER') return false;
  return true;
}

function normalizeReference(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? null;
}

function documentFileMeta(
  file: Express.Multer.File,
  documentType: DocumentType,
): Record<string, unknown> {
  return {
    documentType,
    fileName: file.originalname,
    filePath: file.filename,
    mimeType: file.mimetype || 'application/octet-stream',
    fileSize: file.size ?? 0,
  };
}

function mergeSlipFields(
  primary: ExtractedSlipFields,
  fallback: ExtractedSlipFields,
): ExtractedSlipFields {
  return {
    invoiceNumber: primary.invoiceNumber ?? fallback.invoiceNumber,
    invoiceDate: primary.invoiceDate ?? fallback.invoiceDate,
    amountPkr: primary.amountPkr ?? fallback.amountPkr,
  };
}

function mergePurchaseOrderFields(
  primary: ExtractedPurchaseOrderFields,
  fallback: ExtractedPurchaseOrderFields,
): ExtractedPurchaseOrderFields {
  return {
    poNumber: primary.poNumber ?? fallback.poNumber,
    poDate: primary.poDate ?? fallback.poDate,
    poAmountPkr: primary.poAmountPkr ?? fallback.poAmountPkr,
  };
}

function mergeGrnFields(
  primary: ExtractedGrnFields,
  fallback: ExtractedGrnFields,
): ExtractedGrnFields {
  return {
    poNumber: primary.poNumber ?? fallback.poNumber,
    invoiceNumber: primary.invoiceNumber ?? fallback.invoiceNumber,
  };
}

function textFromOcrPayload(payload: unknown): string | null {
  if (typeof payload === 'string') return payload.trim() || null;
  if (Array.isArray(payload)) {
    const text = payload
      .map((item) => textFromOcrPayload(item))
      .filter(Boolean)
      .join('\n');
    return text.trim() || null;
  }
  if (!payload || typeof payload !== 'object') return null;

  const data = payload as Record<string, unknown>;
  for (const key of ['text', 'ocrText', 'plainText', 'content', 'rawText', 'output_text']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  const lines = data.lines;
  if (Array.isArray(lines)) {
    const text = lines
      .map((line) => (typeof line === 'string' ? line : textFromOcrPayload(line)))
      .filter(Boolean)
      .join('\n');
    if (text.trim()) return text.trim();
  }

  for (const key of [
    'output',
    'message',
    'messages',
    'content',
    'choices',
    'candidates',
    'parts',
    'data',
    'result',
    'results',
  ]) {
    const text = textFromOcrPayload(data[key]);
    if (text) return text;
  }

  return null;
}

const DEFAULT_REMAINING_DOCUMENTS = ['GRN', 'DELIVERY_NOTE', 'RECEIPT'];

const DEPARTMENT_DELETABLE_TICKET_STATUSES = new Set<TicketStatus>([
  TicketStatus.NEW_REQUEST,
  TicketStatus.MISSING_DOCS,
  TicketStatus.REQUESTER_PINGED,
  TicketStatus.WAITING_FOR_DOCS,
]);

const DEPARTMENT_DELETABLE_INVOICE_STATUSES = new Set<InvoiceStatus>([
  InvoiceStatus.UPLOADED,
  InvoiceStatus.EXTRACTED,
  InvoiceStatus.VENDOR_UNVERIFIED,
  InvoiceStatus.VENDOR_VERIFIED,
  InvoiceStatus.REJECTED,
]);

const invoiceInclude = Prisma.validator<Prisma.InvoiceInclude>()({
  vendor: true,
  department: true,
  ticket: { select: { id: true, status: true } },
  purchaseOrder: {
    include: {
      vendor: true,
      department: true,
      lineItems: true,
    },
  },
  paymentPlan: {
    include: {
      milestones: {
        orderBy: { sequence: 'asc' },
        include: { ticket: { select: { id: true, title: true, status: true, amountPkr: true } } },
      },
    },
  },
  submittedBy: { select: { id: true, name: true, email: true } },
  approvals: { orderBy: { createdAt: 'desc' }, take: 3 },
});

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private tickets: TicketsService,
  ) {}

  private async assertUniqueInvoiceNumber(
    invoiceNumber: string | null | undefined,
    currentInvoiceId?: string,
  ) {
    const normalized = normalizedInvoiceNumber(invoiceNumber);
    if (!normalized) return null;

    const duplicate = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: { equals: normalized, mode: Prisma.QueryMode.insensitive },
        ...(currentInvoiceId ? { id: { not: currentInvoiceId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        `Invoice number ${normalized} already exists. Duplicate invoices are not allowed.`,
      );
    }
    return normalized;
  }

  private async extractInvoiceSlipFields(file: Express.Multer.File): Promise<{
    fields: ExtractedSlipFields;
    source: string;
    missing: string[];
    error?: string;
  }> {
    return this.extractDocumentFields(file, 'invoice') as Promise<{
      fields: ExtractedSlipFields;
      source: string;
      missing: string[];
      error?: string;
    }>;
  }

  private async extractPurchaseOrderSlipFields(file: Express.Multer.File): Promise<{
    fields: ExtractedPurchaseOrderFields;
    source: string;
    missing: string[];
    error?: string;
  }> {
    return this.extractDocumentFields(file, 'purchase_order') as Promise<{
      fields: ExtractedPurchaseOrderFields;
      source: string;
      missing: string[];
      error?: string;
    }>;
  }

  private async extractGrnSlipFields(file: Express.Multer.File): Promise<{
    fields: ExtractedGrnFields;
    source: string;
    missing: string[];
    error?: string;
  }> {
    return this.extractDocumentFields(file, 'grn') as Promise<{
      fields: ExtractedGrnFields;
      source: string;
      missing: string[];
      error?: string;
    }>;
  }

  private async extractDocumentFields(
    file: Express.Multer.File,
    kind: ExtractionKind,
  ): Promise<{
    fields: ExtractedDocumentFields;
    source: string;
    missing: string[];
    error?: string;
  }> {
    const uploadedPath = join(uploadRoot(), file.filename);
    const textLike =
      /^text\//i.test(file.mimetype) || /\.(txt|text|log)$/i.test(file.originalname);

    if (textLike) {
      try {
        const text = await readFile(uploadedPath, 'utf8');
        const fields = this.parseFieldsFromText(text, kind);
        return {
          fields,
          source: 'uploaded_text',
          missing: this.missingFieldsForKind(fields, kind),
        };
      } catch (error) {
        const fields: ExtractedDocumentFields = {};
        return {
          fields,
          source: 'uploaded_text',
          missing: this.missingFieldsForKind(fields, kind),
          error: error instanceof Error ? error.message : 'Could not read uploaded text',
        };
      }
    }

    const providerResults: Array<{
      fields: ExtractedDocumentFields;
      source: string;
      missing: string[];
      error?: string;
    }> = [];
    let mergedFields: ExtractedDocumentFields = {};
    const addProviderResult = (
      result: {
        fields: ExtractedDocumentFields;
        source: string;
        missing: string[];
        error?: string;
      } | null,
    ) => {
      if (!result) return false;
      providerResults.push(result);
      mergedFields = this.mergeFieldsForKind(mergedFields, result.fields, kind);
      return this.missingFieldsForKind(mergedFields, kind).length === 0;
    };

    if (addProviderResult(await this.extractWithGroqVision(file, uploadedPath, kind))) {
      return {
        fields: mergedFields,
        source: providerResults.map((result) => result.source).join('+'),
        missing: [],
      };
    }

    if (addProviderResult(await this.extractWithGeminiVision(file, uploadedPath, kind))) {
      return {
        fields: mergedFields,
        source: providerResults.map((result) => result.source).join('+'),
        missing: [],
      };
    }

    if (addProviderResult(await this.extractWithOpenAiVision(file, uploadedPath, kind))) {
      return {
        fields: mergedFields,
        source: providerResults.map((result) => result.source).join('+'),
        missing: [],
        error: providerResults
          .map((result) => result.error)
          .filter((error): error is string => Boolean(error))
          .join('; ') || undefined,
      };
    }

    addProviderResult(await this.extractWithConfiguredOcr(file, uploadedPath, kind));

    if (providerResults.length) {
      const sources = providerResults.map((result) => result.source).join('+');
      const errors = providerResults
        .map((result) => result.error)
        .filter((error): error is string => Boolean(error));
      return {
        fields: mergedFields,
        source: sources,
        missing: this.missingFieldsForKind(mergedFields, kind),
        error: errors.length ? errors.join('; ') : undefined,
      };
    }

    const fields: ExtractedDocumentFields = {};
    return {
      fields,
      source: 'manual_no_ocr_provider',
      missing: this.missingFieldsForKind(fields, kind),
    };
  }

  private async extractWithGroqVision(
    file: Express.Multer.File,
    uploadedPath: string,
    kind: ExtractionKind,
  ): Promise<{
    fields: ExtractedDocumentFields;
    source: string;
    missing: string[];
    error?: string;
  } | null> {
    const apiKey = (process.env.GROQ_API_KEY || process.env.INVOICE_GROQ_API_KEY)?.trim();
    if (!apiKey) return null;

    try {
      const payload = await this.postImageForGroqOcr(file, uploadedPath, apiKey, kind);
      const fields = this.fieldsFromOcrPayload(payload, kind);
      return {
        fields,
        source: 'groq_vision',
        missing: this.missingFieldsForKind(fields, kind),
      };
    } catch (error) {
      const fields: ExtractedDocumentFields = {};
      return {
        fields,
        source: 'groq_vision',
        missing: this.missingFieldsForKind(fields, kind),
        error: error instanceof Error ? error.message : 'Groq vision OCR failed',
      };
    }
  }

  private async extractWithGeminiVision(
    file: Express.Multer.File,
    uploadedPath: string,
    kind: ExtractionKind,
  ): Promise<{
    fields: ExtractedDocumentFields;
    source: string;
    missing: string[];
    error?: string;
  } | null> {
    const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY)?.trim();
    if (!apiKey) return null;

    try {
      const payload = await this.postImageForGeminiOcr(file, uploadedPath, apiKey, kind);
      const fields = this.fieldsFromOcrPayload(payload, kind);
      return {
        fields,
        source: 'gemini_vision',
        missing: this.missingFieldsForKind(fields, kind),
      };
    } catch (error) {
      const fields: ExtractedDocumentFields = {};
      return {
        fields,
        source: 'gemini_vision',
        missing: this.missingFieldsForKind(fields, kind),
        error: error instanceof Error ? error.message : 'Gemini vision OCR failed',
      };
    }
  }

  private async extractWithConfiguredOcr(
    file: Express.Multer.File,
    uploadedPath: string,
    kind: ExtractionKind,
  ): Promise<{
    fields: ExtractedDocumentFields;
    source: string;
    missing: string[];
    error?: string;
  } | null> {
    const ocrUrl = process.env.OCR_API_URL || process.env.INVOICE_OCR_URL;
    if (!ocrUrl) return null;

    try {
      const payload = await this.postImageForOcr(ocrUrl, file, uploadedPath, {
        apiKey: process.env.OCR_API_KEY || process.env.INVOICE_OCR_API_KEY,
      });
      const fields = this.fieldsFromOcrPayload(payload, kind);
      return {
        fields,
        source: 'ocr_provider',
        missing: this.missingFieldsForKind(fields, kind),
      };
    } catch (error) {
      const fields: ExtractedDocumentFields = {};
      return {
        fields,
        source: 'ocr_provider',
        missing: this.missingFieldsForKind(fields, kind),
        error: error instanceof Error ? error.message : 'OCR provider failed',
      };
    }
  }

  private async extractWithOpenAiVision(
    file: Express.Multer.File,
    uploadedPath: string,
    kind: ExtractionKind,
  ): Promise<{
    fields: ExtractedDocumentFields;
    source: string;
    missing: string[];
    error?: string;
  } | null> {
    const apiKey = (process.env.OPENAI_API_KEY || process.env.INVOICE_OPENAI_API_KEY)?.trim();
    if (!apiKey) return null;

    try {
      const payload = await this.postImageForOpenAiOcr(file, uploadedPath, apiKey, kind);
      const fields = this.fieldsFromOcrPayload(payload, kind);
      return {
        fields,
        source: 'openai_vision',
        missing: this.missingFieldsForKind(fields, kind),
      };
    } catch (error) {
      const fields: ExtractedDocumentFields = {};
      return {
        fields,
        source: 'openai_vision',
        missing: this.missingFieldsForKind(fields, kind),
        error: error instanceof Error ? error.message : 'OpenAI vision OCR failed',
      };
    }
  }

  private async postImageForOcr(
    ocrUrl: string,
    file: Express.Multer.File,
    uploadedPath: string,
    options: { apiKey?: string },
  ) {
    const fileBuffer = await readFile(uploadedPath);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.apiKey) headers.authorization = `Bearer ${options.apiKey}`;

    const response = await fetch(ocrUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fileName: file.originalname,
        mimeType: file.mimetype,
        base64: fileBuffer.toString('base64'),
      }),
    });

    if (!response.ok) {
      throw new Error(`OCR provider returned ${response.status}`);
    }

    return this.parseOcrResponseBody(response);
  }

  private async postImageForOpenAiOcr(
    file: Express.Multer.File,
    uploadedPath: string,
    apiKey: string,
    kind: ExtractionKind,
  ) {
    const fileBuffer = await readFile(uploadedPath);
    const imageUrl = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;
    const prompt = this.ocrPromptForKind(kind);
    const model = process.env.OPENAI_OCR_MODEL || process.env.INVOICE_OCR_MODEL || 'gpt-4.1-mini';
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_output_tokens: 350,
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: prompt,
              },
              {
                type: 'input_image',
                image_url: imageUrl,
                detail: 'high',
              },
            ],
          },
        ],
      }),
    });

    if (response.ok) {
      return this.parseOcrResponseBody(response);
    }

    const fallbackModel = process.env.OPENAI_OCR_FALLBACK_MODEL || 'gpt-4o-mini';
    const fallback = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: fallbackModel,
        temperature: 0,
        max_tokens: 350,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageUrl, detail: 'high' },
              },
            ],
          },
        ],
      }),
    });

    if (!fallback.ok) {
      throw new Error(
        `OpenAI vision returned ${response.status}; fallback returned ${fallback.status}`,
      );
    }

    return this.parseOcrResponseBody(fallback);
  }

  private async postImageForGroqOcr(
    file: Express.Multer.File,
    uploadedPath: string,
    apiKey: string,
    kind: ExtractionKind,
  ) {
    const fileBuffer = await readFile(uploadedPath);
    const imageUrl = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;
    const prompt = this.ocrPromptForKind(kind);
    const baseUrl = process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1';
    const model =
      process.env.GROQ_OCR_MODEL ||
      process.env.INVOICE_GROQ_MODEL ||
      'meta-llama/llama-4-scout-17b-16e-instruct';

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq vision returned ${response.status}`);
    }

    return this.parseOcrResponseBody(response);
  }

  private async postImageForGeminiOcr(
    file: Express.Multer.File,
    uploadedPath: string,
    apiKey: string,
    kind: ExtractionKind,
  ) {
    const fileBuffer = await readFile(uploadedPath);
    const baseUrl =
      process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    const model = process.env.GEMINI_OCR_MODEL || process.env.INVOICE_GEMINI_MODEL || 'gemini-2.5-flash';
    const modelPath = model.startsWith('models/') ? model : `models/${model}`;
    const encodedModelPath = modelPath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    const prompt = this.ocrPromptForKind(kind);

    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/${encodedModelPath}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: file.mimetype,
                    data: fileBuffer.toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              properties: {
                invoiceNumber: { type: ['string', 'null'] },
                invoiceDate: { type: ['string', 'null'] },
                amountPkr: { type: ['number', 'null'] },
                poNumber: { type: ['string', 'null'] },
                poDate: { type: ['string', 'null'] },
                poAmountPkr: { type: ['number', 'null'] },
                rawText: { type: ['string', 'null'] },
                confidence: { type: 'number' },
              },
              required: [
                'invoiceNumber',
                'invoiceDate',
                'amountPkr',
                'poNumber',
                'poDate',
                'poAmountPkr',
                'rawText',
                'confidence',
              ],
            },
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini vision returned ${response.status}`);
    }

    return this.parseOcrResponseBody(response);
  }

  private async parseOcrResponseBody(response: Response) {
    const bodyText = await response.text();
    try {
      return JSON.parse(bodyText) as unknown;
    } catch {
      return bodyText;
    }
  }

  private fieldsFromOcrPayload(payload: unknown, kind: ExtractionKind): ExtractedDocumentFields {
    let directFields: ExtractedDocumentFields = {};
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      directFields = this.parseFieldsFromObject(payload as Record<string, unknown>, kind);
    }

    const ocrText = textFromOcrPayload(payload);
    const textFields = ocrText ? this.parseFieldsFromOcrOutput(ocrText, kind) : {};
    return this.mergeFieldsForKind(directFields, textFields, kind);
  }

  private parseFieldsFromText(rawText: string, kind: ExtractionKind): ExtractedDocumentFields {
    if (kind === 'purchase_order') return parsePurchaseOrderFieldsFromText(rawText);
    if (kind === 'grn') return parseGrnFieldsFromText(rawText);
    return parseInvoiceFieldsFromText(rawText);
  }

  private parseFieldsFromOcrOutput(rawOutput: string, kind: ExtractionKind): ExtractedDocumentFields {
    if (kind === 'purchase_order') return parsePurchaseOrderFieldsFromOcrOutput(rawOutput);
    if (kind === 'grn') return parseGrnFieldsFromOcrOutput(rawOutput);
    return parseInvoiceFieldsFromOcrOutput(rawOutput);
  }

  private parseFieldsFromObject(data: Record<string, unknown>, kind: ExtractionKind): ExtractedDocumentFields {
    if (kind === 'purchase_order') return parsePurchaseOrderFieldsFromObject(data);
    if (kind === 'grn') return parseGrnFieldsFromObject(data);
    return parseInvoiceFieldsFromObject(data);
  }

  private mergeFieldsForKind(
    primary: ExtractedDocumentFields,
    fallback: ExtractedDocumentFields,
    kind: ExtractionKind,
  ): ExtractedDocumentFields {
    if (kind === 'purchase_order') return mergePurchaseOrderFields(primary, fallback);
    if (kind === 'grn') return mergeGrnFields(primary, fallback);
    return mergeSlipFields(primary, fallback);
  }

  private missingFieldsForKind(fields: ExtractedDocumentFields, kind: ExtractionKind) {
    if (kind === 'purchase_order') return missingPurchaseOrderFields(fields);
    if (kind === 'grn') return missingGrnFields(fields);
    return missingSlipFields(fields);
  }

  private ocrPromptForKind(kind: ExtractionKind) {
    if (kind === 'purchase_order') {
      return 'You are an accounts payable OCR agent. Read this purchase order image and return only JSON with keys poNumber, poDate, poAmountPkr, rawText, confidence. poDate must be YYYY-MM-DD or null. poAmountPkr must be the final purchase order total when visible. Prefer PO Total, Purchase Order Total, Order Total, Grand Total, Net Total, or Total Amount over line item prices, rates, subtotal, or tax. If a field is not visible, use null. confidence must be 0 to 1.';
    }
    if (kind === 'grn') {
      return 'You are an accounts payable OCR agent. Read this GRN/goods received note image and return only JSON with keys poNumber, invoiceNumber, rawText, confidence. Extract the purchase order number and invoice number from the GRN when visible. If a field is not visible, use null. confidence must be 0 to 1.';
    }
    return 'You are an accounts payable invoice OCR agent. Read this invoice or receipt image and return only JSON with keys invoiceNumber, invoiceDate, amountPkr, rawText, confidence. invoiceDate must be YYYY-MM-DD or null. amountPkr must be the final payable amount when visible. Prefer Payable, Net Payable, Amount Due, Total Amount, Grand Total, or Net Total over item prices, subtotal, tax, MRP, or rate. If the payable value is visible, use that exact value. If a field is not visible, use null. confidence must be 0 to 1.';
  }

  async createFromUploadPack(
    files: UploadedInvoicePackFiles,
    departmentId: string,
    submittedBy: { id: string; role: Role; departmentId: string | null },
    procurementMode: ProcurementMode,
  ) {
    if (procurementMode === 'NON_PURCHASE_ORDER') {
      return this.createFromUpload(files.invoice, departmentId, submittedBy, {
        purchaseOrderRequired: false,
      });
    }

    if (!files.purchaseOrder || !files.grn) {
      throw new BadRequestException('Purchase order, GRN, and invoice slips are required for PO invoices');
    }

    this.assertDepartmentCanCreateInvoice(departmentId, submittedBy);
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new BadRequestException('Invalid department');

    const [invoiceSlipExtraction, poSlipExtraction, grnSlipExtraction] = await Promise.all([
      this.extractInvoiceSlipFields(files.invoice),
      this.extractPurchaseOrderSlipFields(files.purchaseOrder),
      this.extractGrnSlipFields(files.grn),
    ]);

    const invoiceFields = invoiceSlipExtraction.fields;
    const poFields = poSlipExtraction.fields;
    const grnFields = grnSlipExtraction.fields;
    const invoiceNumber = await this.assertUniqueInvoiceNumber(invoiceFields.invoiceNumber ?? null);
    const amountPkr =
      invoiceFields.amountPkr != null
        ? new Prisma.Decimal(invoiceFields.amountPkr)
        : new Prisma.Decimal(0);
    const autoDates = automaticInvoiceDates();
    const poNumberMatch =
      Boolean(poFields.poNumber && grnFields.poNumber) &&
      normalizeReference(poFields.poNumber) === normalizeReference(grnFields.poNumber);
    const invoiceNumberMatch =
      Boolean(invoiceNumber && grnFields.invoiceNumber) &&
      normalizeReference(invoiceNumber) === normalizeReference(grnFields.invoiceNumber);

    const extracted: Record<string, unknown> = {
      procurementMode,
      purchaseOrderRequired: true,
      invoiceNumber: invoiceNumber ?? null,
      invoiceDate: invoiceFields.invoiceDate ?? null,
      amountPkr: invoiceFields.amountPkr ?? null,
      poNumber: poFields.poNumber ?? null,
      poDate: poFields.poDate ?? null,
      poAmountPkr: poFields.poAmountPkr ?? null,
      grnPoNumber: grnFields.poNumber ?? null,
      grnInvoiceNumber: grnFields.invoiceNumber ?? null,
      invoiceSlipExtraction: {
        status: hasExtractedSlipFields(invoiceFields)
          ? invoiceSlipExtraction.missing.length
            ? 'PARTIAL'
            : 'COMPLETE'
          : 'MANUAL_REQUIRED',
        source: invoiceSlipExtraction.source,
        missingFields: invoiceSlipExtraction.missing,
        error: invoiceSlipExtraction.error ?? null,
      },
      purchaseOrderSlipExtraction: {
        status: hasExtractedPurchaseOrderFields(poFields)
          ? poSlipExtraction.missing.length
            ? 'PARTIAL'
            : 'COMPLETE'
          : 'MANUAL_REQUIRED',
        source: poSlipExtraction.source,
        missingFields: poSlipExtraction.missing,
        error: poSlipExtraction.error ?? null,
      },
      grnSlipExtraction: {
        status: hasExtractedGrnFields(grnFields)
          ? grnSlipExtraction.missing.length
            ? 'PARTIAL'
            : 'COMPLETE'
          : 'MANUAL_REQUIRED',
        source: grnSlipExtraction.source,
        missingFields: grnSlipExtraction.missing,
        error: grnSlipExtraction.error ?? null,
      },
      documentSync: {
        poNumberMatch,
        invoiceNumberMatch,
        poNumberMismatch:
          Boolean(poFields.poNumber && grnFields.poNumber) && !poNumberMatch,
        invoiceNumberMismatch:
          Boolean(invoiceNumber && grnFields.invoiceNumber) && !invoiceNumberMatch,
      },
      documentFiles: [
        documentFileMeta(files.invoice, DocumentType.INVOICE),
        documentFileMeta(files.purchaseOrder, DocumentType.PO),
        documentFileMeta(files.grn, DocumentType.GRN),
      ],
      needsManualEntry:
        invoiceSlipExtraction.missing.length > 0 ||
        poSlipExtraction.missing.length > 0 ||
        grnSlipExtraction.missing.length > 0,
      hint: 'PO invoice packs require matching invoice, purchase order, and GRN details before AP finance release.',
    };

    const inv = await this.prisma.invoice.create({
      data: {
        departmentId,
        submittedById: submittedBy.id,
        fileRelPath: files.invoice.filename,
        originalFilename: files.invoice.originalname,
        mimeType: files.invoice.mimetype,
        extracted: extracted as Prisma.InputJsonValue,
        amountPkr,
        invoiceNumber,
        invoiceDate: dateFromIso(invoiceFields.invoiceDate) ?? undefined,
        receivedDate: autoDates.receivedDate,
        dueDate: autoDates.dueDate,
        reference: invoiceNumber ?? poFields.poNumber ?? null,
        description: `PO invoice pack: ${files.invoice.originalname}`,
        subtotal: amountPkr,
        totalAmount: amountPkr,
        balanceDue: amountPkr,
        status: InvoiceStatus.EXTRACTED,
      },
    });

    const invoice = await this.applyVendorMatch(inv.id);
    await this.ensureInvoicePurchaseOrder(inv.id, submittedBy.id);
    await this.upsertPaymentPlanFromInvoice(inv.id, submittedBy.id);
    await this.upsertDepartmentTicketFromInvoice(inv.id, submittedBy.id);
    await this.runTicketAgentForInvoice(inv.id, submittedBy);

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: invoiceInclude,
    });
  }

  async createFromUpload(
    file: Express.Multer.File,
    departmentId: string,
    submittedBy: { id: string; role: Role; departmentId: string | null },
    options: { purchaseOrderRequired?: boolean } = {},
  ) {
    this.assertDepartmentCanCreateInvoice(departmentId, submittedBy);
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!dept) throw new BadRequestException('Invalid department');

    const relPath = file.filename;
    let extracted: Record<string, unknown> | null = null;
    let amountPkr = new Prisma.Decimal(0);
    let invoiceNumber: string | null = null;
    let invoiceDate: Date | null = null;
    let reference: string | null = null;
    let description: string | null = null;
    let status: InvoiceStatus = InvoiceStatus.UPLOADED;
    const purchaseOrderRequired = options.purchaseOrderRequired ?? true;
    const procurementMode: ProcurementMode = purchaseOrderRequired
      ? 'PURCHASE_ORDER'
      : 'NON_PURCHASE_ORDER';

    const looksSpreadsheet =
      SPREADSHEET_MIMES.has(file.mimetype) ||
      /\.(xlsx|xls|csv)$/i.test(file.originalname);

    if (looksSpreadsheet) {
      const buf = await readFile(join(uploadRoot(), file.filename));
      const parsed = parseSpreadsheetBuffer(buf);
      extracted = {
        ...(parsed as unknown as Record<string, unknown>),
        procurementMode,
        purchaseOrderRequired,
        documentFiles: [documentFileMeta(file, DocumentType.INVOICE)],
      };
      amountPkr = new Prisma.Decimal(parsed.amountPkr ?? 0);
      invoiceNumber = parsed.invoiceNumber ?? parsed.reference ?? null;
      invoiceDate = dateFromIso(parsed.invoiceDate);
      reference = parsed.reference ?? invoiceNumber;
      description = parsed.description ?? null;
      status = InvoiceStatus.EXTRACTED;
    } else if (IMAGE_MIMES.has(file.mimetype) || /^image\//i.test(file.mimetype)) {
      const slipExtraction = await this.extractInvoiceSlipFields(file);
      invoiceNumber = slipExtraction.fields.invoiceNumber ?? null;
      invoiceDate = dateFromIso(slipExtraction.fields.invoiceDate);
      reference = invoiceNumber;
      if (slipExtraction.fields.amountPkr != null) {
        amountPkr = new Prisma.Decimal(slipExtraction.fields.amountPkr);
      }
      extracted = {
        procurementMode,
        purchaseOrderRequired,
        invoiceNumber: slipExtraction.fields.invoiceNumber ?? null,
        invoiceDate: slipExtraction.fields.invoiceDate ?? null,
        amountPkr: slipExtraction.fields.amountPkr ?? null,
        invoiceSlipExtraction: {
          status: hasExtractedSlipFields(slipExtraction.fields)
            ? slipExtraction.missing.length
              ? 'PARTIAL'
              : 'COMPLETE'
            : 'MANUAL_REQUIRED',
          source: slipExtraction.source,
          missingFields: slipExtraction.missing,
          error: slipExtraction.error ?? null,
        },
        documentFiles: [documentFileMeta(file, DocumentType.INVOICE)],
        needsManualEntry: slipExtraction.missing.length > 0,
        hint: 'Missing slip values can be filled manually by the department.',
      };
      status = InvoiceStatus.EXTRACTED;
    } else {
      const slipExtraction = await this.extractInvoiceSlipFields(file);
      invoiceNumber = slipExtraction.fields.invoiceNumber ?? null;
      invoiceDate = dateFromIso(slipExtraction.fields.invoiceDate);
      reference = invoiceNumber;
      if (slipExtraction.fields.amountPkr != null) {
        amountPkr = new Prisma.Decimal(slipExtraction.fields.amountPkr);
      }
      extracted = {
        procurementMode,
        purchaseOrderRequired,
        invoiceNumber: slipExtraction.fields.invoiceNumber ?? null,
        invoiceDate: slipExtraction.fields.invoiceDate ?? null,
        amountPkr: slipExtraction.fields.amountPkr ?? null,
        invoiceSlipExtraction: {
          status: hasExtractedSlipFields(slipExtraction.fields)
            ? slipExtraction.missing.length
              ? 'PARTIAL'
              : 'COMPLETE'
            : 'MANUAL_REQUIRED',
          source: slipExtraction.source,
          missingFields: slipExtraction.missing,
          error: slipExtraction.error ?? null,
        },
        documentFiles: [documentFileMeta(file, DocumentType.INVOICE)],
        note: 'No automatic line-item extraction for this file type; use Edit to complete the invoice.',
      };
      status = InvoiceStatus.EXTRACTED;
    }

    invoiceNumber = await this.assertUniqueInvoiceNumber(invoiceNumber);
    const autoDates = automaticInvoiceDates();

    const inv = await this.prisma.invoice.create({
      data: {
        departmentId,
        submittedById: submittedBy.id,
        fileRelPath: relPath,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        extracted: extracted as Prisma.InputJsonValue,
        amountPkr,
        invoiceNumber,
        invoiceDate: invoiceDate ?? undefined,
        receivedDate: autoDates.receivedDate,
        dueDate: autoDates.dueDate,
        reference,
        description,
        subtotal: amountPkr,
        totalAmount: amountPkr,
        balanceDue: amountPkr,
        status,
      },
    });

    const invoice =
      status === InvoiceStatus.EXTRACTED
        ? await this.applyVendorMatch(inv.id)
        : await this.prisma.invoice.findUniqueOrThrow({
            where: { id: inv.id },
            include: invoiceInclude,
          });

    if (purchaseOrderRequired) {
      await this.ensureInvoicePurchaseOrder(inv.id, submittedBy.id);
    }
    await this.upsertPaymentPlanFromInvoice(inv.id, submittedBy.id);
    await this.upsertDepartmentTicketFromInvoice(inv.id, submittedBy.id);
    await this.runTicketAgentForInvoice(inv.id, submittedBy);

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: invoiceInclude,
    });
  }

  private async upsertDepartmentTicketFromInvoice(invoiceId: string, submittedById: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) return;
    const existing = await this.prisma.paymentTicket.findUnique({ where: { invoiceId } });
    const firstMilestone = this.firstPayableMilestone(inv.paymentPlan);
    const accountFields = invoiceAccountFields(inv.extracted);
    const purchaseOrderRequired = purchaseOrderRequiredFromExtracted(inv.extracted);
    const extracted = extractedRecord(inv.extracted);
    const internalReference = inv.reference ?? `AP-${invoiceId.slice(0, 8).toUpperCase()}`;
    const title =
      inv.invoiceNumber ??
      inv.reference ??
      inv.description ??
      `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`;
    const ticketTitle =
      firstMilestone?.kind === PaymentMilestoneKind.ADVANCE
        ? `${title} - advance payment`
        : title;
    const ticketAmount = firstMilestone?.amount ?? inv.amountPkr;
    const billType = firstMilestone
      ? this.billTypeForMilestone(firstMilestone.kind, inv.mimeType)
      : inv.mimeType?.startsWith('image/')
        ? BillType.CASH_SLIP
        : BillType.STANDARD_INVOICE;
    const data = {
      title: ticketTitle,
      status: TicketStatus.NEW_REQUEST,
      priority: TicketPriority.NORMAL,
      department: { connect: { id: inv.departmentId } },
      createdBy: { connect: { id: submittedById } },
      submittedToFinanceAt: null,
      dueDate: inv.dueDate,
      expenseNature: ExpenseNature.OTHER,
      billType,
      vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
      vendorNameSnapshot: inv.vendor?.displayName ?? null,
      purchaseOrderNumber:
        purchaseOrderRequired ? inv.purchaseOrder?.poNumber ?? extractedString(extracted.poNumber) : null,
      purchaseOrderRequired,
      purchaseOrderVerified: false,
      invoiceNumber: inv.invoiceNumber ?? inv.reference,
      internalReference,
      amountPkr: ticketAmount,
      paymentMethod: PaymentMethod.BANK_PORTAL,
      vendorAccountNumber: accountFields.vendorAccountNumber,
      invoiceAccountNumber: accountFields.invoiceAccountNumber,
      accountVerificationSource: accountFields.accountVerificationSource,
      accountVerificationStatus: AccountVerificationStatus.NOT_CHECKED,
      documentStatus: DocumentStatus.PENDING_REVIEW,
      missingDocuments: [],
      xeroSyncStatus: XeroSyncStatus.NOT_READY,
      bankPaymentStatus: BankPaymentStatus.NOT_READY,
      invoice: { connect: { id: invoiceId } },
      notes: inv.description ?? `Created from invoice upload: ${inv.originalFilename ?? invoiceId}`,
    } satisfies Prisma.PaymentTicketCreateInput;

    if (existing) {
      if (firstMilestone && !firstMilestone.ticketId) {
        await this.prisma.paymentMilestone.update({
          where: { id: firstMilestone.id },
          data: { ticket: { connect: { id: existing.id } } },
        });
      }
      if (existing.status !== TicketStatus.NEW_REQUEST) {
        await this.ensureInvoiceSupportingDocuments(invoiceId, existing.id, submittedById);
        return;
      }
      await this.prisma.paymentTicket.update({
        where: { id: existing.id },
        data: {
          title: ticketTitle,
          status: TicketStatus.NEW_REQUEST,
          dueDate: inv.dueDate,
          vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : { disconnect: true },
          vendorNameSnapshot: inv.vendor?.displayName ?? null,
          purchaseOrderNumber:
            purchaseOrderRequired ? inv.purchaseOrder?.poNumber ?? extractedString(extracted.poNumber) : null,
          purchaseOrderRequired,
          invoiceNumber: inv.invoiceNumber ?? inv.reference,
          internalReference,
          billType,
          amountPkr: ticketAmount,
          vendorAccountNumber: accountFields.vendorAccountNumber,
          invoiceAccountNumber: accountFields.invoiceAccountNumber,
          accountVerificationSource: accountFields.accountVerificationSource,
          notes: inv.description ?? existing.notes,
        },
      });
      if (firstMilestone) {
        await this.prisma.paymentMilestone.update({
          where: { id: firstMilestone.id },
          data: { ticket: { connect: { id: existing.id } } },
        });
      }
      await this.ensureInvoiceSupportingDocuments(invoiceId, existing.id, submittedById);
      return;
    }

    const ticket = await this.prisma.paymentTicket.create({
      data: {
        ...data,
        activities: {
          create: {
            actor: { connect: { id: submittedById } },
            type: 'invoice_uploaded',
            message: 'Department invoice and synced PO draft created',
            toStatus: TicketStatus.NEW_REQUEST,
          },
        },
      },
    });

    await this.ensureInvoiceSupportingDocuments(invoiceId, ticket.id, submittedById);

    if (firstMilestone && !firstMilestone.ticketId) {
      await this.prisma.paymentMilestone.update({
        where: { id: firstMilestone.id },
        data: { ticket: { connect: { id: ticket.id } } },
      });
    }
  }

  private async ensureInvoiceSupportingDocuments(
    invoiceId: string,
    ticketId: string,
    uploadedByUserId: string,
  ) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        poId: true,
        fileRelPath: true,
        originalFilename: true,
        mimeType: true,
        extracted: true,
      },
    });
    if (!inv) return;

    const extracted = extractedRecord(inv.extracted);
    const rawDocumentFiles = Array.isArray(extracted.documentFiles)
      ? extracted.documentFiles
      : [];
    const files = rawDocumentFiles
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const data = item as Record<string, unknown>;
        const documentTypeText = extractedString(data.documentType);
        const documentType =
          documentTypeText && documentTypeText in DocumentType
            ? (documentTypeText as DocumentType)
            : DocumentType.INVOICE;
        const filePath = extractedString(data.filePath);
        const fileName = extractedString(data.fileName) ?? filePath;
        if (!filePath || !fileName) return null;
        return {
          documentType,
          filePath,
          fileName,
          mimeType: extractedString(data.mimeType) ?? 'application/octet-stream',
          fileSize:
            typeof data.fileSize === 'number' && Number.isFinite(data.fileSize)
              ? BigInt(data.fileSize)
              : BigInt(0),
        };
      })
      .filter((file): file is {
        documentType: DocumentType;
        filePath: string;
        fileName: string;
        mimeType: string;
        fileSize: bigint;
      } => Boolean(file));

    if (!files.length && inv.fileRelPath && inv.originalFilename) {
      files.push({
        documentType: DocumentType.INVOICE,
        filePath: inv.fileRelPath,
        fileName: inv.originalFilename,
        mimeType: inv.mimeType ?? 'application/octet-stream',
        fileSize: BigInt(0),
      });
    }

    for (const file of files) {
      const existing = await this.prisma.supportingDocument.findFirst({
        where: {
          invoiceId,
          ticketId,
          filePath: file.filePath,
          documentType: file.documentType,
        },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.supportingDocument.create({
        data: {
          invoice: { connect: { id: invoiceId } },
          ticket: { connect: { id: ticketId } },
          purchaseOrder:
            file.documentType === DocumentType.PO && inv.poId
              ? { connect: { id: inv.poId } }
              : undefined,
          documentType: file.documentType,
          fileName: file.fileName,
          filePath: file.filePath,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          uploadedBy: { connect: { id: uploadedByUserId } },
        },
      });
    }
  }

  private async runTicketAgentForInvoice(
    invoiceId: string,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const ticket = await this.prisma.paymentTicket.findUnique({
      where: { invoiceId },
      select: { id: true, status: true },
    });
    if (!ticket) return;

    try {
      await this.tickets.runWorkflowAgent(ticket.id, user);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invoice ticket agent validation could not complete.';
      await this.prisma.ticketActivity.create({
        data: {
          ticket: { connect: { id: ticket.id } },
          actor: { connect: { id: user.id } },
          type: 'agent_auto_skipped',
          message: `Invoice ticket agent did not move the ticket: ${message}`,
          toStatus: ticket.status,
        },
      });
    }
  }

  private async createTicketFromInvoice(invoiceId: string, submittedById: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) return;

    const existing = await this.prisma.paymentTicket.findUnique({
      where: { invoiceId },
    });

    const extracted =
      inv.extracted && typeof inv.extracted === 'object'
        ? (inv.extracted as Record<string, unknown>)
        : {};
    const purchaseOrderRequired = purchaseOrderRequiredFromExtracted(inv.extracted);
    const submittedToFinanceAt = new Date();
    const vendorName =
      inv.vendor?.displayName ??
      (typeof extracted.vendorName === 'string' ? extracted.vendorName : null);
    const needsVendorReview = inv.status === InvoiceStatus.VENDOR_UNVERIFIED;
    const firstMilestone = this.firstPayableMilestone(inv.paymentPlan);
    const ticketAmount = firstMilestone?.amount ?? inv.amountPkr;
    const billType = firstMilestone
      ? this.billTypeForMilestone(firstMilestone.kind, inv.mimeType)
      : inv.mimeType?.startsWith('image/')
        ? BillType.CASH_SLIP
        : BillType.STANDARD_INVOICE;
    const titleSuffix =
      firstMilestone?.kind === PaymentMilestoneKind.ADVANCE ? ' - advance payment' : '';

    if (existing) {
      await this.prisma.paymentTicket.update({
        where: { id: existing.id },
        data: {
          title:
            (inv.invoiceNumber ??
              inv.reference ??
              inv.description ??
              `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`) + titleSuffix,
          status: needsVendorReview
            ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
            : TicketStatus.DOCS_REVIEW,
          submittedToFinanceAt,
          dueDate: calculateFinanceDueDate(submittedToFinanceAt),
          vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
          vendorNameSnapshot: vendorName,
          purchaseOrderNumber:
            purchaseOrderRequired ? inv.purchaseOrder?.poNumber ?? extractedString(extracted.poNumber) : null,
          purchaseOrderRequired,
          purchaseOrderVerified: purchaseOrderRequired,
          invoiceNumber: inv.invoiceNumber ?? inv.reference,
          billType,
          amountPkr: ticketAmount,
          accountVerificationSource: needsVendorReview
            ? 'Auto-created from invoice upload; verify vendor account from master sheet'
            : 'Agent verified invoice and synced PO before finance release',
          notes: inv.description ?? existing.notes,
          activities: {
            create: {
              actor: { connect: { id: submittedById } },
              type: 'released_to_finance',
              message: 'Agent validation passed; ticket released to finance',
              fromStatus: existing.status,
              toStatus: needsVendorReview
                ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
                : TicketStatus.DOCS_REVIEW,
            },
          },
        },
      });
      if (firstMilestone) {
        await this.prisma.paymentMilestone.update({
          where: { id: firstMilestone.id },
          data: {
            status: PaymentMilestoneStatus.IN_FINANCE,
            releasedAt: new Date(),
            ticket: { connect: { id: existing.id } },
          },
        });
      }
      await this.ensureInvoiceSupportingDocuments(invoiceId, existing.id, submittedById);
      return;
    }

    const ticket = await this.prisma.paymentTicket.create({
      data: {
        title:
          (inv.reference ??
            inv.description ??
            `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`) + titleSuffix,
        status: needsVendorReview
          ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
          : TicketStatus.DOCS_REVIEW,
        priority: TicketPriority.NORMAL,
        department: { connect: { id: inv.departmentId } },
        createdBy: { connect: { id: submittedById } },
        submittedToFinanceAt,
        dueDate: calculateFinanceDueDate(submittedToFinanceAt),
        expenseNature: ExpenseNature.OTHER,
        billType,
        vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
        vendorNameSnapshot: vendorName,
        purchaseOrderNumber:
          purchaseOrderRequired ? inv.purchaseOrder?.poNumber ?? extractedString(extracted.poNumber) : null,
        purchaseOrderRequired,
        purchaseOrderVerified: purchaseOrderRequired,
        invoiceNumber: inv.invoiceNumber ?? inv.reference,
        internalReference: `AP-${invoiceId.slice(0, 8).toUpperCase()}`,
        amountPkr: ticketAmount,
        paymentMethod: PaymentMethod.BANK_PORTAL,
        accountVerificationStatus: needsVendorReview
          ? AccountVerificationStatus.NEEDS_MANUAL_REVIEW
          : AccountVerificationStatus.NOT_CHECKED,
        accountVerificationSource: needsVendorReview
          ? 'Auto-created from invoice upload; verify vendor account from master sheet'
          : 'Agent verified invoice and synced PO before finance release',
        documentStatus: needsVendorReview
          ? DocumentStatus.INCOMPLETE
          : DocumentStatus.PENDING_REVIEW,
        missingDocuments: needsVendorReview
          ? [
              'Vendor verification',
              'Vendor account proof',
              ...(purchaseOrderRequired ? ['Purchase order'] : []),
            ]
          : [],
        xeroSyncStatus: XeroSyncStatus.NOT_READY,
        bankPaymentStatus: BankPaymentStatus.NOT_READY,
        invoice: { connect: { id: invoiceId } },
        notes: inv.originalFilename
          ? `Created automatically from upload: ${inv.originalFilename}`
          : 'Created automatically from invoice import',
        activities: {
          create: {
            actor: { connect: { id: submittedById } },
            type: 'invoice_uploaded',
            message: 'AP ticket created automatically from invoice upload/import',
            toStatus: needsVendorReview
              ? TicketStatus.VENDOR_PO_ACCOUNT_VERIFICATION
              : TicketStatus.DOCS_REVIEW,
          },
        },
      },
    });

    await this.ensureInvoiceSupportingDocuments(invoiceId, ticket.id, submittedById);
  }

  private async ensureInvoicePurchaseOrder(invoiceId: string, requestedById: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) throw new NotFoundException();
    if (!purchaseOrderRequiredFromExtracted(inv.extracted)) {
      return null;
    }

    const vendorId = inv.vendorId ?? (await this.ensurePendingVendor(inv.departmentId, inv.department.name));
    const extracted = extractedRecord(inv.extracted);
    const extractedPoAmount =
      typeof extracted.poAmountPkr === 'number' && Number.isFinite(extracted.poAmountPkr)
        ? new Prisma.Decimal(extracted.poAmountPkr)
        : null;
    const amount = extractedPoAmount ?? (inv.totalAmount.gt(0) ? inv.totalAmount : inv.amountPkr);
    const subtotal = inv.subtotal.gt(0) ? inv.subtotal : amount;
    const poNumber = await this.uniquePurchaseOrderNumber(
      extractedString(extracted.poNumber) ?? `PO-${inv.id.slice(0, 8).toUpperCase()}`,
      inv.id,
      inv.poId,
    );
    const poDate = dateFromIso(extractedString(extracted.poDate) ?? undefined) ?? inv.invoiceDate ?? inv.receivedDate ?? new Date();
    const expectedDeliveryDate = inv.dueDate ?? undefined;
    const notes =
      inv.description ??
      inv.reference ??
      inv.originalFilename ??
      `Synced PO for invoice ${inv.id.slice(0, 8)}`;
    const lineDescription = inv.description ?? inv.reference ?? inv.originalFilename ?? poNumber;

    const po = inv.poId
      ? await this.prisma.purchaseOrder.update({
          where: { id: inv.poId },
          data: {
            vendor: { connect: { id: vendorId } },
            department: { connect: { id: inv.departmentId } },
            poDate,
            expectedDeliveryDate,
            currency: inv.currency,
            subtotal,
            taxAmount: inv.taxAmount,
            totalAmount: amount,
            notes,
          },
        })
      : await this.prisma.purchaseOrder.create({
          data: {
            poNumber,
            vendor: { connect: { id: vendorId } },
            department: { connect: { id: inv.departmentId } },
            requestedBy: { connect: { id: requestedById } },
            poDate,
            expectedDeliveryDate,
            currency: inv.currency,
            subtotal,
            taxAmount: inv.taxAmount,
            totalAmount: amount,
            notes,
          },
        });

    await this.prisma.poLineItem.deleteMany({ where: { poId: po.id } });
    await this.prisma.poLineItem.create({
      data: {
        poId: po.id,
        lineNo: 1,
        description: lineDescription,
        quantity: new Prisma.Decimal(1),
        unit: 'item',
        unitPrice: amount,
        lineTotal: amount,
      },
    });

    if (!inv.poId) {
      await this.prisma.invoice.update({
        where: { id: inv.id },
        data: { poId: po.id },
      });
    }

    return po;
  }

  private async uniquePurchaseOrderNumber(
    preferred: string,
    invoiceId: string,
    currentPoId: string | null,
  ) {
    const cleaned = preferred.trim() || `PO-${invoiceId.slice(0, 8).toUpperCase()}`;
    const existing = await this.prisma.purchaseOrder.findUnique({
      where: { poNumber: cleaned },
      select: { id: true },
    });
    if (!existing || existing.id === currentPoId) return cleaned;

    const fallback = `${cleaned}-${invoiceId.slice(0, 4).toUpperCase()}`;
    const fallbackExisting = await this.prisma.purchaseOrder.findUnique({
      where: { poNumber: fallback },
      select: { id: true },
    });
    if (!fallbackExisting || fallbackExisting.id === currentPoId) return fallback;
    return `PO-${invoiceId.slice(0, 8).toUpperCase()}`;
  }

  private async upsertPaymentPlanFromInvoice(
    invoiceId: string,
    actorId: string,
    dto?: Pick<
      PatchInvoiceDto,
      'paymentPlanType' | 'advancePercent' | 'releaseCondition' | 'requiredFinalDocuments'
    >,
  ) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) throw new NotFoundException();

    const purchaseOrderRequired = purchaseOrderRequiredFromExtracted(inv.extracted);
    const totalAmount = inv.totalAmount.gt(0) ? inv.totalAmount : inv.amountPkr;
    const existing = inv.paymentPlan;
    const planType = dto?.paymentPlanType ?? existing?.planType ?? PaymentPlanType.FULL_PAYMENT;
    const advancePercent =
      planType === PaymentPlanType.ADVANCE_REMAINING
        ? new Prisma.Decimal(dto?.advancePercent ?? existing?.advancePercent ?? 50)
        : null;
    const requiredFinalDocuments =
      dto?.requiredFinalDocuments?.length
        ? dto.requiredFinalDocuments
        : existing?.requiredFinalDocuments?.length
          ? existing.requiredFinalDocuments
          : DEFAULT_REMAINING_DOCUMENTS;
    const releaseCondition =
      dto?.releaseCondition ??
      existing?.releaseCondition ??
      'Products/services received and GRN or delivery proof attached';

    const plan = existing
      ? await this.prisma.paymentPlan.update({
          where: { id: existing.id },
          data: {
            planType,
            purchaseOrder: inv.poId ? { connect: { id: inv.poId } } : { disconnect: true },
            department: { connect: { id: inv.departmentId } },
            vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : { disconnect: true },
            totalAmount,
            remainingAmount: totalAmount.minus(existing.paidAmount),
            advancePercent,
            releaseCondition,
            requiredFinalDocuments,
            aiVerificationStatus: VerificationStatus.PENDING,
            aiVerificationScore: 0,
            aiVerificationNotes: null,
          },
        })
      : await this.prisma.paymentPlan.create({
          data: {
            planNumber: `PP-${invoiceId.slice(0, 8).toUpperCase()}`,
            planType,
            status: PaymentPlanStatus.DRAFT,
            invoice: { connect: { id: invoiceId } },
            purchaseOrder: inv.poId ? { connect: { id: inv.poId } } : undefined,
            department: { connect: { id: inv.departmentId } },
            vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
            createdBy: { connect: { id: actorId } },
            totalAmount,
            paidAmount: new Prisma.Decimal(0),
            remainingAmount: totalAmount,
            advancePercent,
            releaseCondition,
            requiredFinalDocuments,
          },
        });

    if (planType === PaymentPlanType.ADVANCE_REMAINING) {
      const percent = advancePercent ?? new Prisma.Decimal(50);
      const advanceAmount = totalAmount.mul(percent).div(100);
      const remainingAmount = totalAmount.minus(advanceAmount);

      await this.upsertMilestone(plan.id, {
        sequence: 1,
        label: `Advance ${percent.toFixed(0)}% payment`,
        kind: PaymentMilestoneKind.ADVANCE,
        amount: advanceAmount,
        percent,
        status: PaymentMilestoneStatus.DRAFT,
        requiredDocuments: purchaseOrderRequired ? ['INVOICE', 'PO', 'GRN'] : ['INVOICE'],
      });
      await this.upsertMilestone(plan.id, {
        sequence: 2,
        label: 'Remaining payment after receiving proof',
        kind: PaymentMilestoneKind.REMAINING,
        amount: remainingAmount,
        percent: new Prisma.Decimal(100).minus(percent),
        status: PaymentMilestoneStatus.BLOCKED,
        releaseCondition,
        requiredDocuments: requiredFinalDocuments,
      });
      await this.prisma.paymentMilestone.deleteMany({
        where: { paymentPlanId: plan.id, sequence: { gt: 2 }, status: { not: PaymentMilestoneStatus.PAID } },
      });
    } else {
      await this.upsertMilestone(plan.id, {
        sequence: 1,
        label: 'Full payment',
        kind: PaymentMilestoneKind.FULL,
        amount: totalAmount,
        percent: new Prisma.Decimal(100),
        status: PaymentMilestoneStatus.DRAFT,
        requiredDocuments: purchaseOrderRequired ? ['INVOICE', 'PO', 'GRN'] : ['INVOICE'],
      });
      await this.prisma.paymentMilestone.deleteMany({
        where: { paymentPlanId: plan.id, sequence: { gt: 1 }, status: { not: PaymentMilestoneStatus.PAID } },
      });
    }

    return this.prisma.paymentPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: {
        milestones: {
          orderBy: { sequence: 'asc' },
          include: { ticket: { select: { id: true, title: true, status: true, amountPkr: true } } },
        },
      },
    });
  }

  private async upsertMilestone(
    paymentPlanId: string,
    data: {
      sequence: number;
      label: string;
      kind: PaymentMilestoneKind;
      amount: Prisma.Decimal;
      percent?: Prisma.Decimal | null;
      status: PaymentMilestoneStatus;
      releaseCondition?: string | null;
      requiredDocuments: string[];
    },
  ) {
    const existing = await this.prisma.paymentMilestone.findUnique({
      where: {
        paymentPlanId_sequence: {
          paymentPlanId,
          sequence: data.sequence,
        },
      },
    });
    const nextData = {
      label: data.label,
      kind: data.kind,
      amount: data.amount,
      percent: data.percent ?? null,
      releaseCondition: data.releaseCondition ?? null,
      requiredDocuments: data.requiredDocuments,
      status: existing?.status === PaymentMilestoneStatus.PAID ? existing.status : data.status,
    };
    return existing
      ? this.prisma.paymentMilestone.update({ where: { id: existing.id }, data: nextData })
      : this.prisma.paymentMilestone.create({
          data: {
            paymentPlan: { connect: { id: paymentPlanId } },
            sequence: data.sequence,
            ...nextData,
          },
        });
  }

  private firstPayableMilestone(
    plan:
      | (Prisma.PaymentPlanGetPayload<{
          include: { milestones: { orderBy: { sequence: 'asc' } } };
        }>)
      | null,
  ) {
    const firstKinds: PaymentMilestoneKind[] = [
      PaymentMilestoneKind.FULL,
      PaymentMilestoneKind.ADVANCE,
    ];
    return plan?.milestones.find((milestone) =>
      firstKinds.includes(milestone.kind),
    );
  }

  private billTypeForMilestone(kind: PaymentMilestoneKind, mimeType?: string | null) {
    if (kind === PaymentMilestoneKind.ADVANCE) return BillType.ADVANCE_PARTIAL;
    if (kind === PaymentMilestoneKind.REMAINING || kind === PaymentMilestoneKind.FINAL) {
      return BillType.FINAL_PARTIAL;
    }
    return mimeType?.startsWith('image/') ? BillType.CASH_SLIP : BillType.STANDARD_INVOICE;
  }

  private async ensurePendingVendor(departmentId: string, departmentName: string) {
    const vendorCode = `PENDING-${departmentId.slice(0, 18)}`;
    const existing = await this.prisma.vendor.findFirst({
      where: { vendorCode },
    });
    if (existing) return existing.id;
    const vendor = await this.prisma.vendor.create({
      data: {
        vendorCode,
        displayName: `Vendor pending - ${departmentName}`,
        kind: VendorKind.ONE_OFF,
        active: true,
      },
    });
    return vendor.id;
  }

  private async runAgentVerification(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) throw new NotFoundException();

    const errors: string[] = [];
    const warnings: string[] = [];
    const invoiceTotal = inv.totalAmount.gt(0) ? inv.totalAmount : inv.amountPkr;

    if (!inv.invoiceNumber && !inv.reference) errors.push('Invoice number or reference is required');
    if (invoiceTotal.lte(0)) errors.push('Invoice amount must be greater than zero');
    if (!inv.vendorId || inv.vendor?.displayName.startsWith('Vendor pending')) {
      errors.push('Vendor must be selected before finance release');
    }
    if (!inv.poId || !inv.purchaseOrder) {
      errors.push('Synced purchase order is required');
    } else {
      if (inv.purchaseOrder.departmentId !== inv.departmentId) {
        errors.push('Purchase order department must match invoice department');
      }
      if (inv.vendorId && inv.purchaseOrder.vendorId !== inv.vendorId) {
        errors.push('Purchase order vendor must match invoice vendor');
      }
      if (!inv.purchaseOrder.totalAmount.equals(invoiceTotal)) {
        errors.push('Purchase order total must match invoice total');
      }
    }
    if (!inv.dueDate) warnings.push('Due date is not provided');
    if (!inv.description) warnings.push('Description is not provided');
    if (!inv.paymentPlan) {
      errors.push('Payment plan is required');
    } else {
      const milestoneTotal = inv.paymentPlan.milestones.reduce(
        (sum, milestone) => sum.plus(milestone.amount),
        new Prisma.Decimal(0),
      );
      if (!milestoneTotal.equals(invoiceTotal)) {
        errors.push('Payment milestone total must match invoice/PO total');
      }
      if (inv.paymentPlan.planType === PaymentPlanType.ADVANCE_REMAINING) {
        if (!inv.paymentPlan.advancePercent || inv.paymentPlan.advancePercent.lte(0)) {
          errors.push('Advance percent must be configured');
        }
        if (!inv.paymentPlan.milestones.some((m) => m.kind === PaymentMilestoneKind.ADVANCE)) {
          errors.push('Advance milestone is required');
        }
        if (!inv.paymentPlan.milestones.some((m) => m.kind === PaymentMilestoneKind.REMAINING)) {
          errors.push('Remaining milestone is required');
        }
        if (!inv.paymentPlan.requiredFinalDocuments.length) {
          warnings.push('Remaining payment proof requirements are not configured');
        }
      }
    }

    const extracted =
      inv.extracted && typeof inv.extracted === 'object' && !Array.isArray(inv.extracted)
        ? (inv.extracted as Prisma.JsonObject)
        : {};

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        extracted: {
          ...extracted,
          agentVerification: {
            status: errors.length ? 'FAILED' : 'PASSED',
            checkedAt: new Date().toISOString(),
            errors,
            warnings,
          },
        },
      },
    });

    if (errors.length) {
      throw new BadRequestException(`Agent verification failed: ${errors.join('; ')}`);
    }

    return { errors, warnings };
  }

  async releaseApprovedInvoiceToFinance(invoiceId: string, actorId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();
    if (inv.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException('Invoice must be agent-approved before finance release');
    }
    if (inv.poId) {
      await this.prisma.purchaseOrder.update({
        where: { id: inv.poId },
        data: { status: PurchaseOrderStatus.APPROVED },
      });
    }
    await this.upsertPaymentPlanFromInvoice(invoiceId, actorId);
    await this.createTicketFromInvoice(invoiceId, actorId);
    await this.prisma.paymentPlan.updateMany({
      where: { invoiceId, status: PaymentPlanStatus.DRAFT },
      data: { status: PaymentPlanStatus.ACTIVE },
    });
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
  }

  async returnRejectedInvoiceToDepartment(invoiceId: string, actorId: string, reason?: string) {
    await this.prisma.paymentTicket.updateMany({
      where: { invoiceId },
      data: {
        status: TicketStatus.NEW_REQUEST,
        documentStatus: DocumentStatus.INCOMPLETE,
        missingDocuments: reason
          ? [`Returned by reviewer: ${reason}`]
          : ['Returned by reviewer'],
        notes: reason ? `Returned by reviewer: ${reason}` : 'Returned by reviewer',
      },
    });

    const ticket = await this.prisma.paymentTicket.findUnique({ where: { invoiceId } });
    if (ticket) {
      await this.prisma.ticketActivity.create({
        data: {
          ticket: { connect: { id: ticket.id } },
          actor: { connect: { id: actorId } },
          type: 'reviewer_returned',
          message: reason ? `Returned by reviewer: ${reason}` : 'Returned by reviewer',
          fromStatus: TicketStatus.DOCS_REVIEW,
          toStatus: TicketStatus.NEW_REQUEST,
        },
      });
    }

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: invoiceInclude,
    });
  }

  private async applyVendorMatch(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();

    if (inv.vendorId && inv.status === InvoiceStatus.VENDOR_VERIFIED) {
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: invoiceInclude,
      });
    }

    if (!inv.extracted || typeof inv.extracted !== 'object') {
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: invoiceInclude,
      });
    }

    const e = inv.extracted as Record<string, unknown>;
    let vendor: Vendor | null = null;

    if (e.vendorTaxNumber) {
      vendor = await this.prisma.vendor.findFirst({
        where: { taxNumber: String(e.vendorTaxNumber), active: true },
      });
    }
    if (!vendor && e.vendorName) {
      const name = String(e.vendorName).toLowerCase();
      const list = await this.prisma.vendor.findMany({ where: { active: true } });
      vendor =
        list.find(
          (v) =>
            v.displayName.toLowerCase().includes(name) ||
            name.includes(v.displayName.toLowerCase()),
        ) ?? null;
    }

    if (vendor) {
      return this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          vendorId: vendor.id,
          status: InvoiceStatus.VENDOR_VERIFIED,
        },
        include: invoiceInclude,
      });
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: InvoiceStatus.VENDOR_UNVERIFIED },
      include: invoiceInclude,
    });
  }

  async patchInvoice(
    id: string,
    dto: PatchInvoiceDto,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (user.role === Role.DEPT_USER) {
      if (inv.departmentId !== user.departmentId) {
        throw new ForbiddenException('Invoice is outside your department scope');
      }
      if (
        dto.subtotal !== undefined ||
        dto.taxAmount !== undefined ||
        dto.withholdingTax !== undefined ||
        dto.totalAmount !== undefined
      ) {
        throw new ForbiddenException('Subtotal, tax, withholding, and total fields are finance-only');
      }
      if (
        !([
          InvoiceStatus.UPLOADED,
          InvoiceStatus.EXTRACTED,
          InvoiceStatus.VENDOR_UNVERIFIED,
          InvoiceStatus.VENDOR_VERIFIED,
          InvoiceStatus.REJECTED,
        ] as InvoiceStatus[]).includes(inv.status)
      ) {
        throw new ForbiddenException(
          'Department can only complete invoice details before head or finance processing starts',
        );
      }
    }
    if (user.role === Role.DEPT_ADMIN) {
      throw new ForbiddenException('Department head can review, approve, or reject, not edit invoice details');
    }
    if (
      inv.status === InvoiceStatus.PAID ||
      inv.status === InvoiceStatus.PAYMENT_INITIATED
    ) {
      throw new BadRequestException('Invoice is locked after payment');
    }

    const data: Prisma.InvoiceUpdateInput = {};
    if (dto.amountPkr != null) {
      const grossAmount = new Prisma.Decimal(dto.amountPkr);
      data.amountPkr = grossAmount;
      if (user.role === Role.DEPT_USER) {
        data.subtotal = grossAmount;
        data.totalAmount = grossAmount;
      }
    }
    if (dto.invoiceNumber !== undefined) {
      data.invoiceNumber = await this.assertUniqueInvoiceNumber(dto.invoiceNumber, id);
    }
    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.departmentId) {
      if (user.role === Role.DEPT_USER && dto.departmentId !== user.departmentId) {
        throw new ForbiddenException('Department users cannot move invoices to another department');
      }
      const d = await this.prisma.department.findUnique({
        where: { id: dto.departmentId },
      });
      if (!d) throw new BadRequestException('Invalid department');
      data.department = { connect: { id: dto.departmentId } };
    }
    if (dto.vendorId) {
      const v = await this.prisma.vendor.findUnique({ where: { id: dto.vendorId } });
      if (!v) throw new BadRequestException('Invalid vendor');
      data.vendor = { connect: { id: dto.vendorId } };
      data.status = InvoiceStatus.VENDOR_VERIFIED;
    }
    if (dto.invoiceDate) data.invoiceDate = new Date(dto.invoiceDate);
    const autoDates = automaticInvoiceDates();
    data.receivedDate = autoDates.receivedDate;
    data.dueDate = autoDates.dueDate;
    if (dto.currency) data.currency = dto.currency;
    if (
      dto.vendorAccountNumber !== undefined ||
      dto.invoiceAccountNumber !== undefined ||
      dto.accountVerificationSource !== undefined
    ) {
      const existingExtracted = extractedRecord(inv.extracted);
      const existingAccountSync =
        existingExtracted.accountSync &&
        typeof existingExtracted.accountSync === 'object' &&
        !Array.isArray(existingExtracted.accountSync)
          ? (existingExtracted.accountSync as Record<string, unknown>)
          : {};
      const nextAccountSync = {
        ...existingAccountSync,
        ...(dto.vendorAccountNumber !== undefined
          ? { vendorAccountNumber: nullableString(dto.vendorAccountNumber) }
          : {}),
        ...(dto.invoiceAccountNumber !== undefined
          ? { invoiceAccountNumber: nullableString(dto.invoiceAccountNumber) }
          : {}),
        ...(dto.accountVerificationSource !== undefined
          ? { accountVerificationSource: nullableString(dto.accountVerificationSource) }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      data.extracted = {
        ...existingExtracted,
        vendorAccountNumber: nextAccountSync.vendorAccountNumber ?? null,
        invoiceAccountNumber: nextAccountSync.invoiceAccountNumber ?? null,
        accountVerificationSource: nextAccountSync.accountVerificationSource ?? null,
        accountSync: nextAccountSync,
      } as Prisma.InputJsonValue;
    }
    if (dto.subtotal != null) data.subtotal = new Prisma.Decimal(dto.subtotal);
    if (dto.taxAmount != null) data.taxAmount = new Prisma.Decimal(dto.taxAmount);
    if (dto.withholdingTax != null) {
      data.withholdingTax = new Prisma.Decimal(dto.withholdingTax);
    }
    if (dto.totalAmount != null) data.totalAmount = new Prisma.Decimal(dto.totalAmount);

    const updated = await this.prisma.invoice.update({
      where: { id },
      data,
      include: invoiceInclude,
    });

    if (dto.vendorId) {
      await this.ensureInvoicePurchaseOrder(updated.id, user.id);
      await this.upsertPaymentPlanFromInvoice(updated.id, user.id, dto);
      await this.upsertDepartmentTicketFromInvoice(updated.id, user.id);
      await this.syncTicketFromInvoice(updated.id);
      await this.runTicketAgentForInvoice(updated.id, user);
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: updated.id },
        include: invoiceInclude,
      });
    }
    if (inv.vendorId && inv.status === InvoiceStatus.VENDOR_VERIFIED) {
      await this.ensureInvoicePurchaseOrder(updated.id, user.id);
      await this.upsertPaymentPlanFromInvoice(updated.id, user.id, dto);
      await this.upsertDepartmentTicketFromInvoice(updated.id, user.id);
      await this.syncTicketFromInvoice(updated.id);
      await this.runTicketAgentForInvoice(updated.id, user);
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: updated.id },
        include: invoiceInclude,
      });
    }

    const matched = await this.applyVendorMatch(id);
    await this.ensureInvoicePurchaseOrder(id, user.id);
    await this.upsertPaymentPlanFromInvoice(id, user.id, dto);
    await this.upsertDepartmentTicketFromInvoice(id, user.id);
    await this.syncTicketFromInvoice(id);
    await this.runTicketAgentForInvoice(id, user);
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: matched.id },
      include: invoiceInclude,
    });
  }

  private async syncTicketFromInvoice(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        department: true,
        purchaseOrder: true,
        paymentPlan: { include: { milestones: { orderBy: { sequence: 'asc' } } } },
      },
    });
    if (!inv) return;

    const ticket = await this.prisma.paymentTicket.findUnique({
      where: { invoiceId },
    });
    if (!ticket) return;

    const title =
      inv.invoiceNumber ??
      inv.reference ??
      inv.description ??
      `${inv.department.name} invoice ${invoiceId.slice(0, 8)}`;
    const firstMilestone = this.firstPayableMilestone(inv.paymentPlan);
    const titleSuffix =
      firstMilestone?.kind === PaymentMilestoneKind.ADVANCE ? ' - advance payment' : '';
    const accountFields = invoiceAccountFields(inv.extracted);
    const purchaseOrderRequired = purchaseOrderRequiredFromExtracted(inv.extracted);
    const extracted = extractedRecord(inv.extracted);
    const internalReference = inv.reference ?? ticket.internalReference;
    const accountSyncData = accountFields.hasExplicitAccountSync
      ? {
          vendorAccountNumber: accountFields.vendorAccountNumber,
          invoiceAccountNumber: accountFields.invoiceAccountNumber,
          accountVerificationSource: accountFields.accountVerificationSource,
        }
      : {
          vendorAccountNumber: accountFields.vendorAccountNumber ?? ticket.vendorAccountNumber,
          invoiceAccountNumber: accountFields.invoiceAccountNumber ?? ticket.invoiceAccountNumber,
          accountVerificationSource:
            accountFields.accountVerificationSource ?? ticket.accountVerificationSource,
        };

    await this.prisma.paymentTicket.update({
      where: { id: ticket.id },
      data: {
        title: `${title}${titleSuffix}`,
        invoiceNumber: inv.invoiceNumber ?? inv.reference,
        internalReference,
        purchaseOrderRequired,
        purchaseOrderNumber:
          purchaseOrderRequired ? inv.purchaseOrder?.poNumber ?? extractedString(extracted.poNumber) : null,
        billType: firstMilestone
          ? this.billTypeForMilestone(firstMilestone.kind)
          : ticket.billType,
        amountPkr: firstMilestone?.amount ?? inv.amountPkr,
        dueDate: inv.dueDate ?? ticket.dueDate,
        vendor: inv.vendorId ? { connect: { id: inv.vendorId } } : undefined,
        vendorNameSnapshot:
          inv.vendor?.displayName ??
          ticket.vendorNameSnapshot ??
          null,
        ...accountSyncData,
        notes: inv.description ?? ticket.notes,
      },
    });
  }

  async submitForApproval(
    id: string,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException();
    if (user.role === Role.DEPT_USER) {
      throw new ForbiddenException(
        'Department submission is handled by the AI validation agent from the ticket workflow',
      );
    }
    if (user.role === Role.DEPT_ADMIN) {
      throw new ForbiddenException('Department admins are not part of the AP submission scope');
    }
    if (inv.amountPkr.lte(0)) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (!inv.vendorId || inv.status !== InvoiceStatus.VENDOR_VERIFIED) {
      throw new BadRequestException(
        'Vendor must be verified before sending for approval',
      );
    }
    await this.ensureInvoicePurchaseOrder(id, user.id);
    await this.upsertPaymentPlanFromInvoice(id, user.id);
    await this.runAgentVerification(id);
    await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.APPROVED },
    });
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (invoice?.poId) {
      await this.prisma.purchaseOrder.update({
        where: { id: invoice.poId },
        data: { status: PurchaseOrderStatus.APPROVED },
      });
    }
    await this.createTicketFromInvoice(id, user.id);
    await this.prisma.paymentPlan.updateMany({
      where: { invoiceId: id, status: PaymentPlanStatus.DRAFT },
      data: { status: PaymentPlanStatus.ACTIVE },
    });

    return this.prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: invoiceInclude,
    });
  }

  async listForUser(user: {
    id: string;
    role: Role;
    departmentId: string | null;
  }) {
    const args = {
      include: invoiceInclude,
      orderBy: { createdAt: 'desc' as const },
    };

    if (user.role === Role.COMPANY_ADMIN || user.role === Role.AP_CLERK) {
      return this.prisma.invoice.findMany(args);
    }

    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      if (!user.departmentId) return [];
      return this.prisma.invoice.findMany({
        ...args,
        where: {
          departmentId: user.departmentId,
        },
      });
    }

    return [];
  }

  async getOne(
    id: string,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        ...invoiceInclude,
        approvals: {
          include: { approver: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!inv) throw new NotFoundException();

    if (user.role === Role.DEPT_USER || user.role === Role.DEPT_ADMIN) {
      if (inv.departmentId !== user.departmentId) {
        throw new ForbiddenException();
      }
    }

    return inv;
  }

  async deleteDepartmentInvoice(
    id: string,
    user: { id: string; role: Role; departmentId: string | null },
  ) {
    if (user.role !== Role.DEPT_USER) {
      throw new ForbiddenException('Only department users can delete draft department invoices');
    }

    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        ticket: {
          select: {
            id: true,
            status: true,
            parentTicketId: true,
            childTickets: { select: { id: true }, take: 1 },
            paymentMilestone: { select: { id: true, paymentPlanId: true } },
          },
        },
        paymentPlan: { select: { id: true } },
        purchaseOrder: { select: { id: true } },
        paymentRecords: { select: { id: true }, take: 1 },
        supportingDocuments: { select: { filePath: true } },
      },
    });
    if (!inv) throw new NotFoundException();
    if (!user.departmentId || inv.departmentId !== user.departmentId) {
      throw new ForbiddenException('Invoice is outside your department scope');
    }
    if (inv.paymentRecords.length) {
      throw new BadRequestException('Invoice already has payment records and cannot be deleted');
    }

    const ticket = inv.ticket;
    if (ticket) {
      if (!DEPARTMENT_DELETABLE_TICKET_STATUSES.has(ticket.status)) {
        throw new BadRequestException(
          'Invoice cannot be deleted after it has moved to finance processing',
        );
      }
      if (ticket.parentTicketId || ticket.childTickets.length) {
        throw new BadRequestException('Partial-payment tickets cannot be hard deleted');
      }
    } else if (!DEPARTMENT_DELETABLE_INVOICE_STATUSES.has(inv.status)) {
      throw new BadRequestException(
        'Invoice cannot be deleted after it has moved beyond department draft/rework',
      );
    }

    const linkedTicketDocuments = ticket
      ? await this.prisma.supportingDocument.findMany({
          where: { ticketId: ticket.id },
          select: { filePath: true },
        })
      : [];
    const filePaths = [
      inv.fileRelPath,
      ...inv.supportingDocuments.map((doc) => doc.filePath),
      ...linkedTicketDocuments.map((doc) => doc.filePath),
    ];
    const purchaseOrderId = inv.purchaseOrder?.id ?? null;
    const paymentPlanId = inv.paymentPlan?.id ?? null;
    const ticketId = ticket?.id ?? null;

    await this.prisma.$transaction(async (tx) => {
      if (paymentPlanId) {
        await tx.paymentPlan.delete({ where: { id: paymentPlanId } });
      }

      if (ticketId) {
        if (
          ticket?.paymentMilestone &&
          ticket.paymentMilestone.paymentPlanId !== paymentPlanId
        ) {
          await tx.paymentMilestone.update({
            where: { id: ticket.paymentMilestone.id },
            data: { ticket: { disconnect: true } },
          });
        }
        await tx.paymentTicket.delete({ where: { id: ticketId } });
        await tx.notification.deleteMany({
          where: {
            OR: [{ link: `/tickets/${ticketId}` }, { link: `/invoices/${id}` }],
          },
        });
        await tx.auditLog.deleteMany({
          where: { entityId: { in: [ticketId, id] } },
        });
      } else {
        await tx.notification.deleteMany({ where: { link: `/invoices/${id}` } });
        await tx.auditLog.deleteMany({ where: { entityId: id } });
      }

      await tx.invoice.delete({ where: { id } });

      if (purchaseOrderId) {
        const [remainingInvoices, remainingPlans] = await Promise.all([
          tx.invoice.count({ where: { poId: purchaseOrderId } }),
          tx.paymentPlan.count({ where: { purchaseOrderId } }),
        ]);
        if (!remainingInvoices && !remainingPlans) {
          await tx.purchaseOrder.delete({ where: { id: purchaseOrderId } });
          await tx.auditLog.deleteMany({ where: { entityId: purchaseOrderId } });
        }
      }
    });

    await this.deleteUploadedFiles(filePaths);

    return { id, deleted: true };
  }

  async importFromPublishedCsvUrl(
    url: string,
    departmentId: string,
    submittedBy: { id: string; role: Role; departmentId: string | null },
  ) {
    this.assertDepartmentCanCreateInvoice(departmentId, submittedBy);
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Only HTTPS URLs are allowed');
    }

    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new BadRequestException('Could not download file');
    const buf = Buffer.from(await res.arrayBuffer());
    const extracted = parseSpreadsheetBuffer(buf);
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) throw new BadRequestException('Invalid department');
    const amountPkr = new Prisma.Decimal(extracted.amountPkr ?? 0);
    const invoiceNumber = await this.assertUniqueInvoiceNumber(
      extracted.invoiceNumber ?? extracted.reference ?? null,
    );
    const invoiceDate = dateFromIso(extracted.invoiceDate);
    const autoDates = automaticInvoiceDates();

    const inv = await this.prisma.invoice.create({
      data: {
        departmentId: department.id,
        submittedById: submittedBy.id,
        extracted: extracted as Prisma.InputJsonValue,
        amountPkr,
        invoiceNumber,
        invoiceDate: invoiceDate ?? undefined,
        receivedDate: autoDates.receivedDate,
        dueDate: autoDates.dueDate,
        reference: extracted.reference ?? invoiceNumber,
        description:
          extracted.description ?? 'Imported from published spreadsheet (CSV) URL',
        subtotal: amountPkr,
        totalAmount: amountPkr,
        balanceDue: amountPkr,
        mimeType: 'text/csv',
        originalFilename: 'import.csv',
        status: InvoiceStatus.EXTRACTED,
      },
    });
    const invoice = await this.applyVendorMatch(inv.id);
    await this.ensureInvoicePurchaseOrder(inv.id, submittedBy.id);
    await this.upsertPaymentPlanFromInvoice(inv.id, submittedBy.id);
    await this.upsertDepartmentTicketFromInvoice(inv.id, submittedBy.id);
    await this.runTicketAgentForInvoice(inv.id, submittedBy);
    return this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: invoiceInclude,
    });
  }

  async markPaidFromStripe(
    invoiceId: string,
    sessionId: string | null,
    piId: string | null,
  ) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();

    if (inv.status === InvoiceStatus.PAID) {
      return this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        include: invoiceInclude,
      });
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: piId,
      },
      include: invoiceInclude,
    });
  }

  private assertDepartmentCanCreateInvoice(
    departmentId: string,
    user: { role: Role; departmentId: string | null },
  ) {
    if (user.role === Role.AP_CLERK) {
      throw new ForbiddenException('Departments create invoices; AP reviews them after submission');
    }
    if (user.role === Role.CFO) {
      throw new ForbiddenException('CFO can authorize payments, not create invoices');
    }
    if (user.role === Role.DEPT_ADMIN) {
      throw new ForbiddenException('Department head can approve or reject, not create invoices');
    }
    if (user.role === Role.DEPT_USER && user.departmentId !== departmentId) {
      throw new ForbiddenException('Department users can only create invoices for their own department');
    }
  }

  private async deleteUploadedFiles(filePaths: Array<string | null | undefined>) {
    const root = resolve(uploadRoot());
    const uniquePaths = [...new Set(filePaths.filter((path): path is string => Boolean(path)))];

    await Promise.all(
      uniquePaths.map(async (filePath) => {
        const absolutePath = resolve(root, filePath);
        if (
          absolutePath !== root &&
          !absolutePath.startsWith(`${root}\\`) &&
          !absolutePath.startsWith(`${root}/`)
        ) {
          return;
        }
        try {
          await unlink(absolutePath);
        } catch {
          // Database cleanup is authoritative; missing files should not fail the delete request.
        }
      }),
    );
  }
}
