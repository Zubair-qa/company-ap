import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Department = { id: string; name: string };
type Vendor = { id: string; displayName: string; kind: string };
type Assignee = { id: string; name: string; email: string; role: string };

type TicketDetail = {
  id: string;
  title: string;
  status: string;
  priority: string;
  requesterName: string | null;
  requesterEmail: string | null;
  departmentId: string;
  department: Department;
  assignedToId: string | null;
  assignedTo: Assignee | null;
  vendorId: string | null;
  vendor: Vendor | null;
  vendorNameSnapshot: string | null;
  purchaseOrderNumber: string | null;
  purchaseOrderRequired: boolean;
  purchaseOrderVerified: boolean;
  invoiceNumber: string | null;
  internalReference: string | null;
  amountPkr: string;
  paymentMethod: string;
  vendorAccountNumber: string | null;
  invoiceAccountNumber: string | null;
  accountVerificationStatus: string;
  accountVerificationSource: string | null;
  documentStatus: string;
  missingDocuments: string[];
  submittedToFinanceAt: string | null;
  dueDate: string | null;
  expenseNature: string;
  billType: string;
  xeroSyncStatus: string;
  xeroContactId: string | null;
  xeroBillId: string | null;
  xeroBillNumber: string | null;
  xeroPaymentId: string | null;
  whtFilerStatus: string;
  whtRate: string | null;
  whtAmountPkr: string | null;
  netPayablePkr: string | null;
  voucherNumber: string | null;
  bankPaymentStatus: string;
  bankPortalReference: string | null;
  bankUploadedAt?: string | null;
  cfoSignedAt?: string | null;
  bankExecutedAt?: string | null;
  requesterNotifiedAt?: string | null;
  trelloCardId: string | null;
  trelloUrl: string | null;
  legacySheetRowId: string | null;
  legacySheetName: string | null;
  oldReference: string | null;
  parentTicketId: string | null;
  notes: string | null;
  childTickets: Array<{ id: string; title: string; amountPkr: string; status: string }>;
  paymentMilestone: {
    id: string;
    label: string;
    kind: string;
    status: string;
    amount: string;
    percent: string | null;
    releaseCondition: string | null;
    requiredDocuments: string[];
    paymentPlan: {
      id: string;
      planNumber: string;
      planType: string;
      status: string;
      totalAmount: string;
      paidAmount: string;
      remainingAmount: string;
      advancePercent: string | null;
      releaseCondition: string | null;
      requiredFinalDocuments: string[];
      aiVerificationStatus: string;
      aiVerificationScore: number;
      aiVerificationNotes: string | null;
      milestones: Array<{
        id: string;
        sequence: number;
        label: string;
        kind: string;
        status: string;
        amount: string;
        ticket: { id: string; title: string; status: string; amountPkr: string } | null;
      }>;
    };
  } | null;
  invoice: {
    id: string;
    reference: string | null;
    status: string;
    amountPkr: string;
    originalFilename: string | null;
  } | null;
  statusLabel?: string;
  availableTransitions?: string[];
  canAssign?: boolean;
  activities: Array<{
    id: string;
    type: string;
    message: string;
    createdAt: string;
    actor: { name: string; email: string } | null;
  }>;
};

type TicketAttachment = {
  id: string;
  ticketId: string | null;
  fileName: string;
  mimeType: string;
  fileSize: string;
  documentType: string;
  uploadedAt: string;
  uploadedBy: { id: string; name: string; email: string } | null;
};

type Meta = {
  departments: Department[];
  vendors: Vendor[];
  assignees: Assignee[];
  boardStatuses: string[];
  statusLabels?: Record<string, string>;
  canAssign?: boolean;
};

type Draft = {
  title: string;
  status: string;
  priority: string;
  requesterName: string;
  requesterEmail: string;
  departmentId: string;
  assignedToId: string;
  vendorId: string;
  vendorNameSnapshot: string;
  purchaseOrderNumber: string;
  purchaseOrderRequired: boolean;
  purchaseOrderVerified: boolean;
  invoiceNumber: string;
  internalReference: string;
  amountPkr: string;
  paymentMethod: string;
  vendorAccountNumber: string;
  invoiceAccountNumber: string;
  accountVerificationStatus: string;
  accountVerificationSource: string;
  documentStatus: string;
  missingDocuments: string;
  expenseNature: string;
  billType: string;
  xeroSyncStatus: string;
  xeroContactId: string;
  xeroBillId: string;
  xeroBillNumber: string;
  xeroPaymentId: string;
  whtFilerStatus: string;
  whtRate: string;
  voucherNumber: string;
  bankPaymentStatus: string;
  bankPortalReference: string;
  trelloCardId: string;
  trelloUrl: string;
  legacySheetRowId: string;
  legacySheetName: string;
  oldReference: string;
  parentTicketId: string;
  notes: string;
};

type Notice = {
  type: 'success' | 'error';
  message: string;
};

type WorkflowAgentResult = {
  decision: {
    summary: string;
    confidence: number;
    missingDocuments: string[];
    humanRequired: string | null;
    toStatus: string;
  };
  ticket: TicketDetail;
};

const priorityOptions = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const documentOptions = ['PENDING_REVIEW', 'COMPLETE', 'INCOMPLETE'];
const accountOptions = [
  'NOT_CHECKED',
  'MATCHED',
  'INVOICE_MISSING_VERIFIED_FROM_SHEET',
  'MISMATCH',
  'NEEDS_MANUAL_REVIEW',
];
const expenseOptions = [
  'REPAIR_MAINTENANCE',
  'UTILITIES',
  'OFFICE_SUPPLIES',
  'PROFESSIONAL_SERVICES',
  'SOFTWARE_CLOUD',
  'TRAVEL',
  'CAPEX',
  'OTHER',
];
const billOptions = [
  'STANDARD_INVOICE',
  'PROFORMA',
  'ADVANCE_PARTIAL',
  'FINAL_PARTIAL',
  'REIMBURSEMENT',
  'CASH_SLIP',
  'EMAIL_INVOICE',
];
const paymentOptions = ['BANK_PORTAL', 'CHEQUE', 'CASH'];
const xeroOptions = ['NOT_READY', 'READY_TO_SYNC', 'BILL_CREATED', 'SYNC_FAILED', 'PAID_MARKED'];
const bankOptions = ['NOT_READY', 'READY_FOR_UPLOAD', 'UPLOADED', 'CFO_SIGNED', 'EXECUTED', 'FAILED'];
const filerOptions = ['UNKNOWN', 'FILER', 'NON_FILER'];

const allTicketUpdateFields = [
  'title',
  'status',
  'priority',
  'requesterName',
  'requesterEmail',
  'departmentId',
  'assignedToId',
  'vendorId',
  'vendorNameSnapshot',
  'purchaseOrderNumber',
  'purchaseOrderRequired',
  'purchaseOrderVerified',
  'invoiceNumber',
  'internalReference',
  'amountPkr',
  'paymentMethod',
  'vendorAccountNumber',
  'invoiceAccountNumber',
  'accountVerificationStatus',
  'accountVerificationSource',
  'documentStatus',
  'missingDocuments',
  'expenseNature',
  'billType',
  'xeroSyncStatus',
  'xeroContactId',
  'xeroBillId',
  'xeroBillNumber',
  'xeroPaymentId',
  'whtFilerStatus',
  'whtRate',
  'voucherNumber',
  'bankPaymentStatus',
  'bankPortalReference',
  'trelloCardId',
  'trelloUrl',
  'legacySheetRowId',
  'legacySheetName',
  'oldReference',
  'parentTicketId',
  'invoiceId',
  'notes',
  'submittedToFinanceAt',
  'dueDate',
];

const apStageFields: Record<string, string[]> = {
  DOCS_REVIEW: ['assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  MISSING_DOCS: ['assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  REQUESTER_PINGED: ['assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  WAITING_FOR_DOCS: ['assignedToId', 'documentStatus', 'missingDocuments', 'notes'],
  VENDOR_PO_ACCOUNT_VERIFICATION: [
    'assignedToId',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'purchaseOrderRequired',
    'purchaseOrderVerified',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'expenseNature',
    'billType',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationStatus',
    'accountVerificationSource',
    'notes',
  ],
  WHT_CALCULATION: ['assignedToId', 'whtFilerStatus', 'whtRate', 'notes'],
  VOUCHER_GENERATION: ['assignedToId', 'voucherNumber', 'notes'],
  XERO_BILL_ENTRY: [
    'assignedToId',
    'xeroSyncStatus',
    'xeroContactId',
    'xeroBillId',
    'xeroBillNumber',
    'xeroPaymentId',
    'notes',
  ],
  PAYMENT_PREPARATION: [
    'assignedToId',
    'paymentMethod',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  BANK_UPLOAD: [
    'status',
    'assignedToId',
    'bankPaymentStatus',
    'bankPortalReference',
    'notes',
  ],
  CFO_SIGN_PENDING: ['status', 'assignedToId', 'notes'],
  BANK_EXECUTION_PENDING: ['status', 'bankPaymentStatus', 'bankPortalReference', 'notes'],
  BANK_EXECUTED: ['status', 'xeroSyncStatus', 'xeroPaymentId', 'notes'],
  MARKED_PAID_IN_XERO: ['status', 'notes'],
  REQUESTER_NOTIFIED: ['status', 'notes'],
};

const departmentStageFields: Record<string, string[]> = {
  NEW_REQUEST: [
    'title',
    'priority',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
  MISSING_DOCS: [
    'title',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
  REQUESTER_PINGED: [
    'title',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
  ADVANCE_PAID_REMAINING_PENDING: [
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'notes',
  ],
  WAITING_FOR_DOCS: [
    'title',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
    'notes',
  ],
};

const cfoStageFields: Record<string, string[]> = {
  CFO_SIGN_PENDING: ['status', 'bankPaymentStatus', 'bankPortalReference', 'notes'],
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

function human(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}

function displayPersonName(name: string | undefined | null) {
  return name === 'AP Clerk' ? 'AP Finance' : name ?? 'System';
}

function labelForStatus(status: string, meta?: Meta) {
  return meta?.statusLabels?.[status] ?? human(status);
}

function makeDraft(ticket: TicketDetail): Draft {
  return {
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    requesterName: ticket.requesterName ?? '',
    requesterEmail: ticket.requesterEmail ?? '',
    departmentId: ticket.departmentId,
    assignedToId: ticket.assignedToId ?? '',
    vendorId: ticket.vendorId ?? '',
    vendorNameSnapshot: ticket.vendorNameSnapshot ?? '',
    purchaseOrderNumber: ticket.purchaseOrderNumber ?? '',
    purchaseOrderRequired: ticket.purchaseOrderRequired,
    purchaseOrderVerified: ticket.purchaseOrderVerified,
    invoiceNumber: ticket.invoiceNumber ?? '',
    internalReference: ticket.internalReference ?? '',
    amountPkr: ticket.amountPkr,
    paymentMethod: ticket.paymentMethod,
    vendorAccountNumber: ticket.vendorAccountNumber ?? '',
    invoiceAccountNumber: ticket.invoiceAccountNumber ?? '',
    accountVerificationStatus: ticket.accountVerificationStatus,
    accountVerificationSource: ticket.accountVerificationSource ?? '',
    documentStatus: ticket.documentStatus,
    missingDocuments: ticket.missingDocuments.join('\n'),
    expenseNature: ticket.expenseNature,
    billType: ticket.billType,
    xeroSyncStatus: ticket.xeroSyncStatus,
    xeroContactId: ticket.xeroContactId ?? '',
    xeroBillId: ticket.xeroBillId ?? '',
    xeroBillNumber: ticket.xeroBillNumber ?? '',
    xeroPaymentId: ticket.xeroPaymentId ?? '',
    whtFilerStatus: ticket.whtFilerStatus,
    whtRate: ticket.whtRate ?? '',
    voucherNumber: ticket.voucherNumber ?? '',
    bankPaymentStatus: ticket.bankPaymentStatus,
    bankPortalReference: ticket.bankPortalReference ?? '',
    trelloCardId: ticket.trelloCardId ?? '',
    trelloUrl: ticket.trelloUrl ?? '',
    legacySheetRowId: ticket.legacySheetRowId ?? '',
    legacySheetName: ticket.legacySheetName ?? '',
    oldReference: ticket.oldReference ?? '',
    parentTicketId: ticket.parentTicketId ?? '',
    notes: ticket.notes ?? '',
  };
}

function money(value: string | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? pkr.format(amount) : 'PKR 0';
}

function fileSizeText(value: string) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateText(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleString('en-PK', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function apiErrorMessage(error: unknown) {
  const maybe = error as {
    message?: string;
    response?: { data?: { message?: string | string[]; error?: string } };
  };
  const message = maybe.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? maybe.response?.data?.error ?? maybe.message ?? 'Request failed.';
}

function attachmentExtension(attachment: TicketAttachment) {
  return attachment.fileName.toLowerCase().split('.').pop() ?? '';
}

function isImageAttachment(attachment: TicketAttachment) {
  return (
    attachment.mimeType.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(attachmentExtension(attachment))
  );
}

function isPdfAttachment(attachment: TicketAttachment) {
  return attachment.mimeType === 'application/pdf' || attachmentExtension(attachment) === 'pdf';
}

function isPlainTextAttachment(attachment: TicketAttachment) {
  return attachment.mimeType === 'text/plain' || attachmentExtension(attachment) === 'txt';
}

function isPreviewableAttachment(attachment: TicketAttachment) {
  return isImageAttachment(attachment) || isPdfAttachment(attachment) || isPlainTextAttachment(attachment);
}

const departmentAgentStatuses = [
  'NEW_REQUEST',
  'MISSING_DOCS',
  'REQUESTER_PINGED',
  'WAITING_FOR_DOCS',
  'ADVANCE_PAID_REMAINING_PENDING',
];
const agentOwnedStatuses = [
  'DOCS_REVIEW',
  'VENDOR_PO_ACCOUNT_VERIFICATION',
  'WHT_CALCULATION',
  'VOUCHER_GENERATION',
  'XERO_BILL_ENTRY',
  'PAYMENT_PREPARATION',
];

function editableFieldsFor(role: string | undefined, status: string) {
  if (status === 'PAYMENT_COMPLETE') return new Set<string>();
  if (role === 'COMPANY_ADMIN') return new Set(allTicketUpdateFields);
  if (role === 'AP_CLERK') return new Set(apStageFields[status] ?? []);
  if (role === 'DEPT_USER') return new Set(departmentStageFields[status] ?? []);
  if (role === 'DEPT_ADMIN') return new Set<string>();
  if (role === 'CFO') return new Set(cfoStageFields[status] ?? []);
  return new Set<string>();
}

function saveMessage(payload: Record<string, unknown>, updated?: TicketDetail) {
  if (updated?.status === 'BANK_UPLOAD' && payload.status === undefined) {
    return 'AI validation passed and released the ticket to AP Finance final review.';
  }
  if (updated?.status === 'WAITING_FOR_DOCS' && payload.status === undefined) {
    return 'AI validation saved the ticket in draft/rework with missing requirements.';
  }
  if (payload.status === 'BANK_EXECUTION_PENDING') return 'CFO sign recorded successfully.';
  if (payload.status === 'BANK_EXECUTED') return 'Bank execution recorded successfully.';
  if (payload.status === 'REQUESTER_NOTIFIED') return 'Requester notification recorded successfully.';
  if (payload.status === 'PAYMENT_COMPLETE') return 'Payment closed successfully.';
  if (payload.documentStatus === 'INCOMPLETE') return 'Missing documents saved successfully.';
  if (payload.documentStatus === 'COMPLETE') return 'Document review completed successfully.';
  return 'Ticket updated successfully.';
}

export function TicketDetailPage() {
  const { user } = useAuth();
  const { id } = useParams();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [comment, setComment] = useState('');
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const scopeKey = user?.id ?? 'anonymous';

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', id, scopeKey],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<TicketDetail>(`/api/tickets/${id}`);
      return data;
    },
  });

  const { data: meta } = useQuery({
    queryKey: ['tickets', 'meta', scopeKey],
    queryFn: async () => {
      const { data } = await api.get<Meta>('/api/tickets/meta');
      return data;
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ['ticket', id, 'attachments', scopeKey],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<TicketAttachment[]>(`/api/tickets/${id}/attachments`);
      return data;
    },
  });

  useEffect(() => {
    if (ticket) setDraft(makeDraft(ticket));
  }, [ticket]);

  const previewableAttachments = useMemo(
    () => attachments.filter(isPreviewableAttachment),
    [attachments],
  );
  const selectedPreviewAttachment = useMemo(() => {
    if (!previewableAttachments.length) return null;
    return (
      previewableAttachments.find((attachment) => attachment.id === selectedPreviewId) ??
      previewableAttachments.find((attachment) => attachment.documentType === 'INVOICE') ??
      previewableAttachments[0]
    );
  }, [previewableAttachments, selectedPreviewId]);

  useEffect(() => {
    if (!previewableAttachments.length) {
      setSelectedPreviewId(null);
      return;
    }
    if (
      !selectedPreviewId ||
      !previewableAttachments.some((attachment) => attachment.id === selectedPreviewId)
    ) {
      const invoiceAttachment =
        previewableAttachments.find((attachment) => attachment.documentType === 'INVOICE') ??
        previewableAttachments[0];
      setSelectedPreviewId(invoiceAttachment.id);
    }
  }, [previewableAttachments, selectedPreviewId]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setPreviewUrl(null);
    setPreviewError('');

    if (!id || !selectedPreviewAttachment) return undefined;

    api
      .get<Blob>(
        `/api/tickets/${id}/attachments/${selectedPreviewAttachment.id}/preview`,
        { responseType: 'blob' },
      )
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        setPreviewUrl(objectUrl);
      })
      .catch((previewLoadError) => {
        if (!active) return;
        setPreviewError(apiErrorMessage(previewLoadError));
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, selectedPreviewAttachment]);

  const update = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data } = await api.patch<TicketDetail>(`/api/tickets/${id}`, payload);
      return data;
    },
    onSuccess: (updated, payload) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.setQueryData(['ticket', id, scopeKey], updated);
      setDraft(makeDraft(updated));
      setNotice({ type: 'success', message: saveMessage(payload, updated) });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const submitToFinance = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<WorkflowAgentResult>(`/api/tickets/${id}/submit-finance`, {});
      return data;
    },
    onSuccess: ({ decision, ticket: updated }) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ap-ops'] });
      qc.setQueryData(['ticket', id, scopeKey], updated);
      setDraft(makeDraft(updated));
      setNotice({ type: 'success', message: decision.summary });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const syncXeroBill = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ ticket: TicketDetail }>(
        `/api/xero/tickets/${id}/sync-bill`,
        {},
      );
      return data.ticket;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.setQueryData(['ticket', id, scopeKey], updated);
      setDraft(makeDraft(updated));
      setNotice({ type: 'success', message: 'Xero bill created successfully.' });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const markPaidInXero = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ ticket: TicketDetail }>(
        `/api/xero/tickets/${id}/mark-paid`,
        {},
      );
      return data.ticket;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.setQueryData(['ticket', id, scopeKey], updated);
      setDraft(makeDraft(updated));
      setNotice({ type: 'success', message: 'Payment marked paid in Xero successfully.' });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const runTestBankAutomation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ ticket: TicketDetail }>(
        `/api/tickets/${id}/test-bank-auto-close`,
        {},
      );
      return data.ticket;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ap-ops'] });
      qc.setQueryData(['ticket', id, scopeKey], updated);
      setDraft(makeDraft(updated));
      setNotice({
        type: 'success',
        message: 'Test bank executed, Xero paid, requester notified, and ticket closed.',
      });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<TicketAttachment>(`/api/tickets/${id}/attachments`, fd);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['ap-ops'] });
      qc.invalidateQueries({ queryKey: ['ticket', id, scopeKey] });
      qc.invalidateQueries({ queryKey: ['ticket', id, 'attachments', scopeKey] });
      setAttachmentFile(null);
      setNotice({ type: 'success', message: 'Attachment uploaded successfully.' });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const addComment = useMutation({
    mutationFn: async (message: string) => {
      const { data } = await api.post<TicketDetail>(`/api/tickets/${id}/comments`, { message });
      return data;
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.setQueryData(['ticket', id, scopeKey], updated);
      setDraft(makeDraft(updated));
      setComment('');
      setNotice({ type: 'success', message: 'Comment added successfully.' });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  const totals = useMemo(() => {
    if (!ticket) return null;
    return [
      { label: 'Gross', value: money(ticket.amountPkr) },
      { label: 'WHT', value: money(ticket.whtAmountPkr) },
      { label: 'Net payable', value: money(ticket.netPayablePkr) },
    ];
  }, [ticket]);

  if (!id) return <p className="error">Missing ticket id.</p>;
  if (error) return <p className="error">Ticket could not be loaded.</p>;
  if (isLoading || !ticket || !draft) return <p className="muted">Loading ticket...</p>;

  function field(name: keyof Draft, value: string | boolean) {
    setDraft((current) => (current ? { ...current, [name]: value } : current));
  }

  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isAp = user?.role === 'AP_CLERK';
  const isCfo = user?.role === 'CFO';
  const isDepartmentRole = user?.role === 'DEPT_USER' || user?.role === 'DEPT_ADMIN';
  const isClosed = ticket.status === 'PAYMENT_COMPLETE';
  const editableFields = editableFieldsFor(user?.role, ticket.status);
  const canEdit = (fieldName: string) => editableFields.has(fieldName);
  const canEditSubmission = [
    'title',
    'priority',
    'requesterName',
    'requesterEmail',
    'vendorId',
    'vendorNameSnapshot',
    'purchaseOrderNumber',
    'invoiceNumber',
    'internalReference',
    'amountPkr',
    'paymentMethod',
    'vendorAccountNumber',
    'invoiceAccountNumber',
    'accountVerificationSource',
    'legacySheetRowId',
    'legacySheetName',
    'oldReference',
    'expenseNature',
    'billType',
  ].some(canEdit);
  const canEditCfoSign = Boolean(
    !isClosed &&
      (isCompanyAdmin ||
        (isCfo && ticket.status === 'CFO_SIGN_PENDING' && canEdit('bankPaymentStatus'))),
  );
  const canUseXeroActions = Boolean(!isClosed && (isCompanyAdmin || isAp));
  const canCreateXeroBill = Boolean(canUseXeroActions && ticket.status === 'XERO_BILL_ENTRY');
  const canMarkPaidInXero = Boolean(canUseXeroActions && ticket.status === 'BANK_EXECUTED');
  const canSaveTicket = Boolean(!isClosed && editableFields.size > 0);
  const canUploadAttachment = Boolean(
    !isClosed &&
      (isCompanyAdmin ||
        isAp ||
        (user?.role === 'DEPT_USER' &&
          [
            'NEW_REQUEST',
            'MISSING_DOCS',
            'REQUESTER_PINGED',
            'ADVANCE_PAID_REMAINING_PENDING',
            'WAITING_FOR_DOCS',
          ].includes(ticket.status)) ||
        (isCfo && ticket.status === 'CFO_SIGN_PENDING')),
  );
  const canSubmitRemainingProof = Boolean(
    user?.role === 'DEPT_USER' &&
      ticket.status === 'ADVANCE_PAID_REMAINING_PENDING',
  );
  const canApFinalReview = Boolean(!isClosed && (isAp || isCompanyAdmin) && ticket.status === 'BANK_UPLOAD');
  const isDepartmentAgentStage = departmentAgentStatuses.includes(ticket.status);
  const isAgentOwnedStage = agentOwnedStatuses.includes(ticket.status);
  const agentScopeMessage = isDepartmentAgentStage
    ? 'Save request details or upload proof. The validation agent checks completeness automatically and releases the ticket only when documents, vendor, PO, account evidence, and amount are ready.'
    : isAgentOwnedStage
      ? 'This stage is controlled by the validation agent. Manual status movement is disabled while document, account, WHT, voucher, Xero, and payment readiness checks complete.'
      : canApFinalReview
        ? 'AI checks are complete. AP Finance performs one final human review, requests proof in comments if needed, or sends the payment to CFO sign.'
        : null;

  function fullPayload() {
    return {
      title: draft.title,
      status: draft.status,
      priority: draft.priority,
      requesterName: draft.requesterName || null,
      requesterEmail: draft.requesterEmail || null,
      departmentId: draft.departmentId,
      assignedToId: draft.assignedToId || null,
      vendorId: draft.vendorId || null,
      vendorNameSnapshot: draft.vendorNameSnapshot || null,
      purchaseOrderNumber: draft.purchaseOrderNumber || null,
      purchaseOrderRequired: draft.purchaseOrderRequired,
      purchaseOrderVerified: draft.purchaseOrderVerified,
      invoiceNumber: draft.invoiceNumber || null,
      internalReference: draft.internalReference || null,
      amountPkr: Number(draft.amountPkr || 0),
      paymentMethod: draft.paymentMethod,
      vendorAccountNumber: draft.vendorAccountNumber || null,
      invoiceAccountNumber: draft.invoiceAccountNumber || null,
      accountVerificationStatus: draft.accountVerificationStatus,
      accountVerificationSource: draft.accountVerificationSource || null,
      documentStatus: draft.documentStatus,
      missingDocuments: draft.missingDocuments
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
      expenseNature: draft.expenseNature,
      billType: draft.billType,
      xeroSyncStatus: draft.xeroSyncStatus,
      xeroContactId: draft.xeroContactId || null,
      xeroBillId: draft.xeroBillId || null,
      xeroBillNumber: draft.xeroBillNumber || null,
      xeroPaymentId: draft.xeroPaymentId || null,
      whtFilerStatus: draft.whtFilerStatus,
      whtRate: draft.whtRate ? Number(draft.whtRate) : undefined,
      voucherNumber: draft.voucherNumber || null,
      bankPaymentStatus: draft.bankPaymentStatus,
      bankPortalReference: draft.bankPortalReference || null,
      trelloCardId: draft.trelloCardId || null,
      trelloUrl: draft.trelloUrl || null,
      legacySheetRowId: draft.legacySheetRowId || null,
      legacySheetName: draft.legacySheetName || null,
      oldReference: draft.oldReference || null,
      parentTicketId: draft.parentTicketId || null,
      notes: draft.notes || null,
    };
  }

  function scopedPayload(extra: Record<string, unknown> = {}) {
    const payload = { ...fullPayload(), ...extra };
    return Object.fromEntries(Object.entries(payload).filter(([key]) => editableFields.has(key)));
  }

  function moveTicketStatus(status: string, extra: Record<string, unknown> = {}) {
    setNotice(null);
    field('status', status);
    update.mutate(scopedPayload({ status, ...extra }));
  }

  function submitRemainingProof() {
    setNotice(null);
    submitToFinance.mutate();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    update.mutate(scopedPayload());
  }

  function syncBill() {
    setNotice(null);
    syncXeroBill.mutate();
  }

  function markPaid() {
    setNotice(null);
    markPaidInXero.mutate();
  }

  function runTestBank() {
    setNotice(null);
    runTestBankAutomation.mutate();
  }

  function attachFile(event: FormEvent) {
    event.preventDefault();
    if (!attachmentFile) return;
    setNotice(null);
    uploadAttachment.mutate(attachmentFile);
  }

  function submitComment(event: FormEvent) {
    event.preventDefault();
    const trimmed = comment.trim();
    if (!trimmed) return;
    setNotice(null);
    addComment.mutate(trimmed);
  }

  async function downloadAttachment(attachment: TicketAttachment) {
    try {
      setNotice(null);
      const { data } = await api.get<Blob>(
        `/api/tickets/${id}/attachments/${attachment.id}/download`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice({ type: 'success', message: 'Attachment download started.' });
    } catch (downloadError) {
      setNotice({ type: 'error', message: apiErrorMessage(downloadError) });
    }
  }

  const statusOptions = [
    draft.status,
    ...(ticket.availableTransitions ?? []).filter((status) => status !== draft.status),
  ];
  const assignees = ticket.assignedTo
    ? [
        ticket.assignedTo,
        ...(meta?.assignees ?? []).filter((assignee) => assignee.id !== ticket.assignedTo?.id),
      ]
    : (meta?.assignees ?? []);
  const canChangeStatus = Boolean(
    !isClosed && canEdit('status') && (ticket.availableTransitions ?? []).length > 0,
  );
  const canAssign = Boolean(!isClosed && ticket.canAssign && meta?.canAssign && canEdit('assignedToId'));
  return (
    <div className="ticket-detail-page">
      <p>
        <Link to="/">Back to board</Link>
      </p>
      <section className="ticket-detail-hero">
        <div>
          <p className="eyebrow">AP ticket</p>
          <h2>{ticket.title}</h2>
          <p className="muted">
            Finance received: {dateText(ticket.submittedToFinanceAt)} / Due: {dateText(ticket.dueDate)}
          </p>
        </div>
        <div className="ticket-summary-strip">
          {totals?.map((item) => (
            <span key={item.label}>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </span>
          ))}
        </div>
      </section>

      {notice ? (
        <div className={`notice notice-${notice.type}`} role="status">
          {notice.message}
        </div>
      ) : null}

      {isClosed ? (
        <div className="notice notice-info" role="status">
          Payment complete tickets are locked for audit. Create a linked ticket for any remaining
          or follow-up payment.
        </div>
      ) : null}

      {isDepartmentRole && !isClosed && !canSaveTicket ? (
        <div className="notice notice-info" role="status">
          Tracking view only. Department can follow this ticket here; edits reopen only when it
          returns to department draft/rework.
        </div>
      ) : null}

      {ticket.paymentMilestone ? (
        <section className="ticket-panel ticket-wide-panel">
          <div className="payment-plan-header">
            <div>
              <h3>Payment plan</h3>
              <p className="muted">
                {ticket.paymentMilestone.paymentPlan.planNumber} /{' '}
                {human(ticket.paymentMilestone.paymentPlan.planType)} /{' '}
                {human(ticket.paymentMilestone.paymentPlan.status)}
              </p>
            </div>
            <span className="badge badge-indigo">
              AI {human(ticket.paymentMilestone.paymentPlan.aiVerificationStatus)}{' '}
              {ticket.paymentMilestone.paymentPlan.aiVerificationScore}%
            </span>
          </div>
          <div className="payment-plan-totals">
            <span>
              <small>Total</small>
              <strong>{money(ticket.paymentMilestone.paymentPlan.totalAmount)}</strong>
            </span>
            <span>
              <small>Paid</small>
              <strong>{money(ticket.paymentMilestone.paymentPlan.paidAmount)}</strong>
            </span>
            <span>
              <small>Remaining</small>
              <strong>{money(ticket.paymentMilestone.paymentPlan.remainingAmount)}</strong>
            </span>
          </div>
          <div className="payment-milestone-list">
            {ticket.paymentMilestone.paymentPlan.milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={
                  milestone.id === ticket.paymentMilestone?.id
                    ? 'payment-milestone-row payment-milestone-active'
                    : 'payment-milestone-row'
                }
              >
                <span>
                  <strong>{milestone.label}</strong>
                  <small>
                    {human(milestone.kind)} / {human(milestone.status)}
                  </small>
                </span>
                <strong>{money(milestone.amount)}</strong>
                {milestone.ticket ? (
                  <Link to={`/tickets/${milestone.ticket.id}`}>
                    {human(milestone.ticket.status)}
                  </Link>
                ) : (
                  <small>No ticket yet</small>
                )}
              </div>
            ))}
          </div>
          {ticket.paymentMilestone.paymentPlan.aiVerificationNotes ? (
            <p className="muted">{ticket.paymentMilestone.paymentPlan.aiVerificationNotes}</p>
          ) : null}
        </section>
      ) : null}

      {canSubmitRemainingProof ? (
        <section className="ticket-panel ticket-cfo-panel">
          <div>
            <h3>Remaining payment proof</h3>
            <p className="muted">
              Advance payment is complete. Upload GRN, delivery note, receipt, or final invoice proof,
              then submit this remaining payment to AP finance.
            </p>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={submitToFinance.isPending}
              onClick={submitRemainingProof}
            >
              Submit remaining proof
            </button>
          </div>
        </section>
      ) : null}

      {agentScopeMessage ? (
        <section className="ticket-panel agent-scope-panel">
          <div>
            <p className="eyebrow">Agentic validation</p>
            <h3>
              {canApFinalReview
                ? 'AP Finance final review'
                : isDepartmentAgentStage
                  ? 'Department draft / rework'
                  : 'AI verification in progress'}
            </h3>
            <p className="muted">{agentScopeMessage}</p>
            {ticket.missingDocuments.length ? (
              <p className="missing-line">Missing: {ticket.missingDocuments.join(', ')}</p>
            ) : null}
          </div>
          {canApFinalReview ? (
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={update.isPending}
                onClick={() =>
                  moveTicketStatus('CFO_SIGN_PENDING', { bankPaymentStatus: 'UPLOADED' })
                }
              >
                Send to CFO sign
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={update.isPending}
                onClick={() =>
                  moveTicketStatus('WAITING_FOR_DOCS', {
                    documentStatus: 'INCOMPLETE',
                    missingDocuments: ['Additional proof requested in comments'],
                  })
                }
              >
                Request proof
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="ticket-role-scope">
        <article className={canEditSubmission ? 'scope-card scope-card-active' : 'scope-card'}>
          <strong>Department submission</strong>
          <span>Request details, PO reference, invoice basics, proof uploads, and rework.</span>
        </article>
        <article className={isAgentOwnedStage || isDepartmentAgentStage ? 'scope-card scope-card-active' : 'scope-card'}>
          <strong>AI validation agent</strong>
          <span>Document completeness, vendor, PO, account, WHT, voucher, Xero, and payment readiness.</span>
        </article>
        <article className={canApFinalReview ? 'scope-card scope-card-active' : 'scope-card'}>
          <strong>AP finance final review</strong>
          <span>One human check, proof request through comments, or send to CFO sign.</span>
        </article>
        <article className={canEditCfoSign ? 'scope-card scope-card-active' : 'scope-card'}>
          <strong>CFO authorization</strong>
          <span>Verify uploaded bank payment and sign it in the Meezan portal.</span>
        </article>
      </section>

      {ticket.status === 'CFO_SIGN_PENDING' || isCfo ? (
        <section className="ticket-panel ticket-cfo-panel">
          <div>
            <h3>CFO bank authorization</h3>
            <p className="muted">
              CFO opens the sign-pending ticket from the board, verifies the bank portal payment,
              signs it, then the ticket returns to AP for bank execution and Xero close.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              moveTicketStatus('BANK_EXECUTION_PENDING', { bankPaymentStatus: 'CFO_SIGNED' })
            }
            disabled={!canEditCfoSign || ticket.status !== 'CFO_SIGN_PENDING' || update.isPending}
          >
            Record CFO sign
          </button>
        </section>
      ) : null}

      {canUseXeroActions &&
      ['BANK_EXECUTION_PENDING', 'BANK_EXECUTED', 'MARKED_PAID_IN_XERO', 'REQUESTER_NOTIFIED'].includes(
        ticket.status,
      ) ? (
        <section className="ticket-panel ticket-cfo-panel">
          <div>
            <h3>AP payment close</h3>
            <p className="muted">
              After CFO signs, AP records bank execution, marks paid in Xero, notifies the
              requester, and closes the payment.
            </p>
          </div>
          {ticket.status === 'BANK_EXECUTION_PENDING' ? (
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={runTestBank}
                disabled={runTestBankAutomation.isPending}
              >
                Run test bank auto close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  moveTicketStatus('BANK_EXECUTED', { bankPaymentStatus: 'EXECUTED' })
                }
                disabled={!canEdit('status') || update.isPending}
              >
                Record bank execution
              </button>
            </div>
          ) : null}
          {ticket.status === 'BANK_EXECUTED' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={markPaid}
              disabled={!canMarkPaidInXero || markPaidInXero.isPending}
            >
              Mark paid in Xero
            </button>
          ) : null}
          {ticket.status === 'MARKED_PAID_IN_XERO' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => moveTicketStatus('REQUESTER_NOTIFIED')}
              disabled={!canEdit('status') || update.isPending}
            >
              Notify requester
            </button>
          ) : null}
          {ticket.status === 'REQUESTER_NOTIFIED' ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => moveTicketStatus('PAYMENT_COMPLETE')}
              disabled={!canEdit('status') || update.isPending}
            >
              Close payment
            </button>
          ) : null}
        </section>
      ) : null}

      <div className="ticket-review-layout">
        <div className="ticket-review-fields">
      <form className="ticket-edit-grid" onSubmit={onSubmit}>
        <section className="ticket-panel">
          <h3>Workflow</h3>
          <div className="field">
            <label>Status</label>
            <select
              value={draft.status}
              disabled={!canChangeStatus || statusOptions.length <= 1}
              onChange={(event) => field('status', event.target.value)}
            >
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {labelForStatus(status, meta)}
                </option>
              ))}
            </select>
            {!canChangeStatus || statusOptions.length <= 1 ? (
              <small className="muted">No permitted next movement for your role.</small>
            ) : null}
          </div>
          <SelectField
            label="Priority"
            value={draft.priority}
            options={priorityOptions}
            onChange={(value) => field('priority', value)}
            disabled={!canEdit('priority')}
          />
          <div className="field">
            <label>Assignee</label>
            <select
              value={draft.assignedToId}
              disabled={!canAssign}
              onChange={(event) => field('assignedToId', event.target.value)}
            >
              <option value="">Unassigned</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {displayPersonName(assignee.name)}
                </option>
              ))}
            </select>
            {!canAssign ? <small className="muted">Only AP and company admins can assign.</small> : null}
          </div>
          <SelectField
            label="Document status"
            value={draft.documentStatus}
            options={documentOptions}
            onChange={(value) => field('documentStatus', value)}
            disabled={!canEdit('documentStatus')}
          />
          <div className="field">
            <label>Missing documents</label>
            <textarea
              rows={4}
              value={draft.missingDocuments}
              disabled={!canEdit('missingDocuments')}
              onChange={(event) => field('missingDocuments', event.target.value)}
              placeholder="One missing document per line"
            />
          </div>
        </section>

        <section className="ticket-panel">
          <h3>Request</h3>
          <TextField
            label="Title"
            value={draft.title}
            onChange={(value) => field('title', value)}
            disabled={!canEdit('title')}
          />
          <TextField
            label="Requester"
            value={draft.requesterName}
            onChange={(value) => field('requesterName', value)}
            disabled={!canEdit('requesterName')}
          />
          <TextField
            label="Requester email"
            value={draft.requesterEmail}
            onChange={(value) => field('requesterEmail', value)}
            disabled={!canEdit('requesterEmail')}
          />
          <div className="field">
            <label>Department</label>
            <select
              value={draft.departmentId}
              disabled={!canEdit('departmentId')}
              onChange={(event) => field('departmentId', event.target.value)}
            >
              {(meta?.departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <SelectField
            label="Expense nature"
            value={draft.expenseNature}
            options={expenseOptions}
            onChange={(value) => field('expenseNature', value)}
            disabled={!canEdit('expenseNature')}
          />
          <SelectField
            label="Bill type"
            value={draft.billType}
            options={billOptions}
            onChange={(value) => field('billType', value)}
            disabled={!canEdit('billType')}
          />
        </section>

        <section className="ticket-panel">
          <h3>Vendor, PO, account</h3>
          <div className="field">
            <label>Vendor</label>
            <select
              value={draft.vendorId}
              disabled={!canEdit('vendorId')}
              onChange={(event) => field('vendorId', event.target.value)}
            >
              <option value="">Vendor pending</option>
              {(meta?.vendors ?? []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.displayName}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="Vendor name snapshot"
            value={draft.vendorNameSnapshot}
            onChange={(value) => field('vendorNameSnapshot', value)}
            disabled={!canEdit('vendorNameSnapshot')}
          />
          <TextField
            label="PO number"
            value={draft.purchaseOrderNumber}
            onChange={(value) => field('purchaseOrderNumber', value)}
            disabled={!canEdit('purchaseOrderNumber')}
          />
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.purchaseOrderRequired}
              disabled={!canEdit('purchaseOrderRequired')}
              onChange={(event) => field('purchaseOrderRequired', event.target.checked)}
            />
            PO required
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.purchaseOrderVerified}
              disabled={!canEdit('purchaseOrderVerified')}
              onChange={(event) => field('purchaseOrderVerified', event.target.checked)}
            />
            PO verified
          </label>
          <TextField
            label="Vendor account number"
            value={draft.vendorAccountNumber}
            onChange={(value) => field('vendorAccountNumber', value)}
            disabled={!canEdit('vendorAccountNumber')}
          />
          <TextField
            label="Invoice account number"
            value={draft.invoiceAccountNumber}
            onChange={(value) => field('invoiceAccountNumber', value)}
            disabled={!canEdit('invoiceAccountNumber')}
          />
          <SelectField
            label="Account verification"
            value={draft.accountVerificationStatus}
            options={accountOptions}
            onChange={(value) => field('accountVerificationStatus', value)}
            disabled={!canEdit('accountVerificationStatus')}
          />
          <TextField
            label="Verification source"
            value={draft.accountVerificationSource}
            onChange={(value) => field('accountVerificationSource', value)}
            disabled={!canEdit('accountVerificationSource')}
          />
        </section>

        <section className="ticket-panel">
          <h3>Amount and tax</h3>
          <TextField
            label="Invoice number"
            value={draft.invoiceNumber}
            onChange={(value) => field('invoiceNumber', value)}
            disabled={!canEdit('invoiceNumber')}
          />
          <TextField
            label="Internal reference"
            value={draft.internalReference}
            onChange={(value) => field('internalReference', value)}
            disabled={!canEdit('internalReference')}
          />
          <TextField
            label="Amount PKR"
            type="number"
            value={draft.amountPkr}
            onChange={(value) => field('amountPkr', value)}
            disabled={!canEdit('amountPkr')}
          />
          <SelectField
            label="Payment method"
            value={draft.paymentMethod}
            options={paymentOptions}
            onChange={(value) => field('paymentMethod', value)}
            disabled={!canEdit('paymentMethod')}
          />
          <SelectField
            label="WHT filer status"
            value={draft.whtFilerStatus}
            options={filerOptions}
            onChange={(value) => field('whtFilerStatus', value)}
            disabled={!canEdit('whtFilerStatus')}
          />
          <TextField
            label="WHT rate %"
            type="number"
            value={draft.whtRate}
            onChange={(value) => field('whtRate', value)}
            disabled={!canEdit('whtRate')}
          />
          <TextField
            label="Voucher number"
            value={draft.voucherNumber}
            onChange={(value) => field('voucherNumber', value)}
            disabled={!canEdit('voucherNumber')}
          />
        </section>

        <section className="ticket-panel">
          <h3>Xero and bank</h3>
          <SelectField
            label="Xero status"
            value={draft.xeroSyncStatus}
            options={xeroOptions}
            onChange={(value) => field('xeroSyncStatus', value)}
            disabled={!canEdit('xeroSyncStatus')}
          />
          <TextField
            label="Xero contact id"
            value={draft.xeroContactId}
            onChange={(value) => field('xeroContactId', value)}
            disabled={!canEdit('xeroContactId')}
          />
          <TextField
            label="Xero bill id"
            value={draft.xeroBillId}
            onChange={(value) => field('xeroBillId', value)}
            disabled={!canEdit('xeroBillId')}
          />
          <TextField
            label="Xero bill number"
            value={draft.xeroBillNumber}
            onChange={(value) => field('xeroBillNumber', value)}
            disabled={!canEdit('xeroBillNumber')}
          />
          <TextField
            label="Xero payment id"
            value={draft.xeroPaymentId}
            onChange={(value) => field('xeroPaymentId', value)}
            disabled={!canEdit('xeroPaymentId')}
          />
          <SelectField
            label="Bank status"
            value={draft.bankPaymentStatus}
            options={bankOptions}
            onChange={(value) => field('bankPaymentStatus', value)}
            disabled={!canEdit('bankPaymentStatus')}
          />
          <TextField
            label="Bank portal reference"
            value={draft.bankPortalReference}
            onChange={(value) => field('bankPortalReference', value)}
            disabled={!canEdit('bankPortalReference')}
          />
          {canCreateXeroBill || canMarkPaidInXero ? (
            <div className="row-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={syncBill}
              disabled={!canCreateXeroBill || syncXeroBill.isPending}
            >
              Create Xero bill
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={markPaid}
              disabled={!canMarkPaidInXero || markPaidInXero.isPending}
            >
              Mark paid in Xero
            </button>
            </div>
          ) : null}
          {syncXeroBill.isError ? <p className="error">{apiErrorMessage(syncXeroBill.error)}</p> : null}
          {markPaidInXero.isError ? <p className="error">{apiErrorMessage(markPaidInXero.error)}</p> : null}
        </section>

        <section className="ticket-panel">
          <h3>Legacy and links</h3>
          <TextField
            label="Trello card id"
            value={draft.trelloCardId}
            onChange={(value) => field('trelloCardId', value)}
            disabled={!canEdit('trelloCardId')}
          />
          <TextField
            label="Trello URL"
            value={draft.trelloUrl}
            onChange={(value) => field('trelloUrl', value)}
            disabled={!canEdit('trelloUrl')}
          />
          <TextField
            label="Legacy sheet"
            value={draft.legacySheetName}
            onChange={(value) => field('legacySheetName', value)}
            disabled={!canEdit('legacySheetName')}
          />
          <TextField
            label="Legacy row"
            value={draft.legacySheetRowId}
            onChange={(value) => field('legacySheetRowId', value)}
            disabled={!canEdit('legacySheetRowId')}
          />
          <TextField
            label="Old reference"
            value={draft.oldReference}
            onChange={(value) => field('oldReference', value)}
            disabled={!canEdit('oldReference')}
          />
          <TextField
            label="Parent ticket id"
            value={draft.parentTicketId}
            onChange={(value) => field('parentTicketId', value)}
            disabled={!canEdit('parentTicketId')}
          />
          <div className="field">
            <label>Notes</label>
            <textarea
              rows={4}
              value={draft.notes}
              disabled={!canEdit('notes')}
              onChange={(event) => field('notes', event.target.value)}
            />
          </div>
        </section>

        {canSaveTicket ? (
          <div className="ticket-save-bar">
          <button type="submit" className="btn btn-primary" disabled={update.isPending}>
            {update.isPending ? 'Saving...' : 'Save ticket'}
          </button>
          {update.isError ? <p className="error">{apiErrorMessage(update.error)}</p> : null}
          </div>
        ) : (
          <div className="ticket-save-bar">
            <span className="status-locked">Read-only for your role</span>
          </div>
        )}
      </form>
        </div>

        <InvoicePreviewPanel
          attachments={attachments}
          previewableAttachments={previewableAttachments}
          selectedAttachment={selectedPreviewAttachment}
          previewUrl={previewUrl}
          previewError={previewError}
          onSelect={setSelectedPreviewId}
          onDownload={downloadAttachment}
        />
      </div>

      <section className="ticket-panel ticket-wide-panel">
        <div className="attachment-header">
          <div>
            <h3>Attachments</h3>
            <p className="muted">
              Invoice scans, PO copies, bank confirmations, vouchers, and supporting documents.
            </p>
          </div>
          {canUploadAttachment ? (
            <form className="attachment-upload" onSubmit={attachFile}>
              <input
                type="file"
                onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
              />
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={!attachmentFile || uploadAttachment.isPending}
              >
                {uploadAttachment.isPending ? 'Uploading...' : 'Attach file'}
              </button>
            </form>
          ) : (
            <span className="status-locked">Attachments read-only for this stage</span>
          )}
        </div>
        {attachments.length ? (
          <div className="attachment-list">
            {attachments.map((attachment) => (
              <article className="attachment-row" key={attachment.id}>
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>
                    {human(attachment.documentType)} / {fileSizeText(attachment.fileSize)} /
                    uploaded by {displayPersonName(attachment.uploadedBy?.name)} on{' '}
                    {dateText(attachment.uploadedAt)}
                  </small>
                </span>
                <div className="row-actions">
                  {isPreviewableAttachment(attachment) ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setSelectedPreviewId(attachment.id)}
                    >
                      Preview
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => downloadAttachment(attachment)}
                  >
                    Download
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No attachments added yet.</p>
        )}
      </section>

      {ticket.childTickets.length ? (
        <section className="ticket-panel ticket-wide-panel">
          <h3>Linked partial payments</h3>
          <div className="linked-ticket-list">
            {ticket.childTickets.map((child) => (
              <Link key={child.id} to={`/tickets/${child.id}`}>
                <span>{child.title}</span>
                <strong>{money(child.amountPkr)}</strong>
                <small>{human(child.status)}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="ticket-panel ticket-wide-panel">
        <h3>Comments and activity</h3>
        <form className="comment-form" onSubmit={submitComment}>
          <div className="field">
            <label htmlFor="ticketComment">Comment</label>
            <textarea
              id="ticketComment"
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add proof, verification note, approval context, or follow-up detail"
            />
          </div>
          <div className="row-actions">
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={addComment.isPending || !comment.trim()}
            >
              {addComment.isPending ? 'Adding...' : 'Add comment'}
            </button>
          </div>
        </form>
        <div className="activity-list">
          {ticket.activities.length ? (
            ticket.activities.map((activity) => (
              <div
                key={activity.id}
                className={activity.type === 'comment' ? 'activity-row activity-comment' : 'activity-row'}
              >
                <span>{activity.message}</span>
                <small>
                  {activity.type === 'comment' ? 'Comment / ' : ''}
                  {displayPersonName(activity.actor?.name)} / {dateText(activity.createdAt)}
                </small>
              </div>
            ))
          ) : (
            <p className="empty-state">No comments or activity yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function InvoicePreviewPanel({
  attachments,
  previewableAttachments,
  selectedAttachment,
  previewUrl,
  previewError,
  onSelect,
  onDownload,
}: {
  attachments: TicketAttachment[];
  previewableAttachments: TicketAttachment[];
  selectedAttachment: TicketAttachment | null;
  previewUrl: string | null;
  previewError: string;
  onSelect: (id: string) => void;
  onDownload: (attachment: TicketAttachment) => void;
}) {
  const hasAttachments = attachments.length > 0;
  const isImage = selectedAttachment ? isImageAttachment(selectedAttachment) : false;
  const isPdf = selectedAttachment ? isPdfAttachment(selectedAttachment) : false;
  const isText = selectedAttachment ? isPlainTextAttachment(selectedAttachment) : false;

  return (
    <aside className="ticket-panel invoice-preview-panel">
      <div className="invoice-preview-header">
        <div>
          <p className="eyebrow">Uploaded invoice</p>
          <h3>Side-by-side validation</h3>
          <p className="muted">
            Keep the source invoice open while validating filled AP fields.
          </p>
        </div>
        {selectedAttachment ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onDownload(selectedAttachment)}
          >
            Download
          </button>
        ) : null}
      </div>

      {previewableAttachments.length ? (
        <div className="preview-selector" aria-label="Select attachment preview">
          {previewableAttachments.map((attachment) => (
            <button
              type="button"
              key={attachment.id}
              className={
                selectedAttachment?.id === attachment.id
                  ? 'preview-chip preview-chip-active'
                  : 'preview-chip'
              }
              onClick={() => onSelect(attachment.id)}
            >
              <span>{attachment.documentType.replaceAll('_', ' ').toLowerCase()}</span>
              <strong>{attachment.fileName}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className="invoice-preview-frame">
        {!hasAttachments ? (
          <p className="empty-state">No uploaded invoice or supporting file is attached yet.</p>
        ) : previewError ? (
          <p className="empty-state">{previewError}</p>
        ) : !selectedAttachment ? (
          <p className="empty-state">
            Image and PDF slips preview here. Spreadsheet uploads stay in attachments and do not auto-download.
          </p>
        ) : !previewUrl ? (
          <p className="empty-state">Loading preview...</p>
        ) : isImage ? (
          <img src={previewUrl} alt={selectedAttachment.fileName} />
        ) : isPdf || isText ? (
          <iframe title={selectedAttachment.fileName} src={previewUrl} />
        ) : (
          <p className="empty-state">
            Preview is not supported for this file type. Use download for this attachment.
          </p>
        )}
      </div>

      {selectedAttachment ? (
        <div className="invoice-preview-meta">
          <span>
            <small>File</small>
            <strong>{selectedAttachment.fileName}</strong>
          </span>
          <span>
            <small>Type</small>
            <strong>{human(selectedAttachment.documentType)}</strong>
          </span>
          <span>
            <small>Size</small>
            <strong>{fileSizeText(selectedAttachment.fileSize)}</strong>
          </span>
        </div>
      ) : null}
    </aside>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {human(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
