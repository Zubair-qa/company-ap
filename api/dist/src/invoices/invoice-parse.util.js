"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSpreadsheetBuffer = parseSpreadsheetBuffer;
const XLSX = __importStar(require("xlsx"));
function normalizeKey(k) {
    return k.trim().toLowerCase().replace(/\s+/g, '_');
}
function rowToObject(row) {
    const out = {};
    for (let i = 0; i < row.length; i++) {
        const v = row[i];
        if (v === undefined || v === null || v === '')
            continue;
        out[`col_${i}`] = typeof v === 'number' ? v : String(v);
    }
    return out;
}
function parseSpreadsheetBuffer(buf) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
    });
    const preview = rows.slice(0, 5).map((r) => rowToObject(r));
    if (!rows.length)
        return { sheetPreview: preview };
    const headerRow = rows[0].map((c) => (c == null ? '' : String(c)));
    const isHeader = headerRow.some((h) => /vendor|supplier|amount|total|ntn|tax|invoice|date|description/i.test(h));
    if (isHeader) {
        const keys = headerRow.map(normalizeKey);
        const dataRow = rows[1] ?? [];
        const map = {};
        keys.forEach((k, i) => {
            if (!k)
                return;
            map[k] = dataRow[i] ?? null;
        });
        const vendorName = firstString(map, ['vendor', 'vendor_name', 'supplier', 'supplier_name']) ??
            undefined;
        const vendorTaxNumber = firstString(map, ['tax', 'tax_number', 'ntn', 'ntn_strn', 'strn']) ?? undefined;
        const reference = firstString(map, ['invoice', 'invoice_no', 'reference', 'bill_no']) ?? undefined;
        const amountPkr = firstAmount(map, [
            'amount',
            'total',
            'amount_pkr',
            'grand_total',
            'net_payable',
        ]);
        const dueDate = firstString(map, ['due_date', 'duedate', 'due']) ?? undefined;
        const description = firstString(map, ['description', 'details', 'memo']) ?? undefined;
        return {
            vendorName,
            vendorTaxNumber,
            reference,
            amountPkr: amountPkr ?? undefined,
            dueDate,
            description,
            sheetPreview: preview,
        };
    }
    const flat = rows.flat().filter((c) => c != null && c !== '');
    const amountPkr = flat
        .map((c) => (typeof c === 'number' ? c : parseMoney(String(c))))
        .find((n) => n != null && !Number.isNaN(n));
    return {
        amountPkr: amountPkr ?? undefined,
        sheetPreview: preview,
    };
}
function firstString(map, keys) {
    for (const k of keys) {
        const v = map[k];
        if (v != null && String(v).trim())
            return String(v).trim();
    }
    return null;
}
function firstAmount(map, keys) {
    for (const k of keys) {
        const v = map[k];
        if (typeof v === 'number' && !Number.isNaN(v))
            return v;
        if (typeof v === 'string') {
            const n = parseMoney(v);
            if (n != null)
                return n;
        }
    }
    return null;
}
function parseMoney(s) {
    const cleaned = s.replace(/,/g, '').replace(/[^\d.-]/g, '');
    if (!cleaned)
        return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}
//# sourceMappingURL=invoice-parse.util.js.map