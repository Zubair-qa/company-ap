import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Dept = { id: string; name: string };
type Vendor = {
  id: string;
  displayName: string;
  kind: string;
  vendorCode?: string | null;
  legalName?: string | null;
  taxNumber?: string | null;
  ntn?: string | null;
  strn?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccountTitle?: string | null;
  bankAccountNumber?: string | null;
  iban?: string | null;
  swiftCode?: string | null;
  currency?: string | null;
  paymentTermsDays?: number | null;
  withholdingTaxRate?: string | null;
};
type Notice = { type: 'success' | 'error'; text: string } | null;

type PurchaseOrderSummary = {
  id: string;
  poNumber: string;
  status: string;
  poDate: string | null;
  expectedDeliveryDate: string | null;
  currency: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  notes: string | null;
  vendor: Vendor | null;
};

type InvoiceDetail = {
  id: string;
  invoiceNumber: string | null;
  reference: string | null;
  amountPkr: string;
  status: string;
  description: string | null;
  invoiceDate: string | null;
  receivedDate: string | null;
  dueDate: string | null;
  currency: string;
  subtotal: string;
  taxAmount: string;
  withholdingTax: string;
  totalAmount: string;
  extracted: unknown;
  departmentId: string;
  vendorId: string | null;
  department: { name: string };
  vendor: Vendor | null;
  ticket: { id: string; status: string } | null;
  purchaseOrder: PurchaseOrderSummary | null;
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
    milestones: Array<{
      id: string;
      sequence: number;
      label: string;
      kind: string;
      status: string;
      amount: string;
      percent: string | null;
      ticket: { id: string; title: string; status: string; amountPkr: string } | null;
    }>;
  } | null;
};

type ApiError = {
  message?: string | string[];
};

type CheckoutResponse = {
  url: string | null;
  sessionId: string;
  status: string | null;
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

const lockedStatuses = new Set(['PAYMENT_INITIATED', 'PAID']);
const payableStatuses = new Set([
  'APPROVED',
  'PAYMENT_INITIATED',
  'PAYMENT_FAILED',
  'PAYMENT_EXPIRED',
]);

function badgeTone(value: string | null | undefined) {
  const normalized = (value ?? '').toUpperCase();
  if (normalized === 'UNKNOWN' || normalized === 'NOT_READY') return 'badge badge-rose';
  if (normalized === 'FAILED' || normalized === 'MISMATCH' || normalized === 'INCOMPLETE') {
    return 'badge badge-rose';
  }
  if (normalized === 'PAID' || normalized === 'APPROVED' || normalized === 'COMPLETE') {
    return 'badge badge-emerald';
  }
  return 'badge';
}
const departmentEditableStatuses = new Set([
  'UPLOADED',
  'EXTRACTED',
  'VENDOR_UNVERIFIED',
  'VENDOR_VERIFIED',
  'REJECTED',
]);
const departmentDeletableTicketStatuses = new Set([
  'NEW_REQUEST',
  'MISSING_DOCS',
  'REQUESTER_PINGED',
  'WAITING_FOR_DOCS',
]);

function extractedText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function invoiceAccountDefaults(extracted: unknown) {
  if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
    return {
      vendorAccountNumber: '',
      invoiceAccountNumber: '',
      accountVerificationSource: '',
    };
  }
  const data = extracted as Record<string, unknown>;
  const sync =
    data.accountSync && typeof data.accountSync === 'object' && !Array.isArray(data.accountSync)
      ? (data.accountSync as Record<string, unknown>)
      : {};
  return {
    vendorAccountNumber:
      extractedText(sync.vendorAccountNumber) || extractedText(data.vendorAccountNumber),
    invoiceAccountNumber:
      extractedText(sync.invoiceAccountNumber) || extractedText(data.invoiceAccountNumber),
    accountVerificationSource:
      extractedText(sync.accountVerificationSource) ||
      extractedText(data.accountVerificationSource),
  };
}
export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<Notice>(null);

  const { data: inv, isError, isLoading } = useQuery({
    queryKey: ['invoice', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<InvoiceDetail>(`/api/invoices/${id}`);
      return data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await api.get<Dept[]>('/api/departments');
      return data;
    },
  });

  const { data: vendors } = useQuery({
    queryKey: ['vendors'],
    queryFn: async () => {
      const { data } = await api.get<Vendor[]>('/api/vendors');
      return data;
    },
  });

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const { data } = await api.patch<InvoiceDetail>(`/api/invoices/${id}`, body);
      return data;
    },
    onSuccess: async () => {
      setNotice({ type: 'success', text: 'Invoice details saved successfully.' });
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['ticket-board'] });
    },
    onError: () => {
      setNotice({
        type: 'error',
        text: 'Invoice details could not be saved. Check required fields and role access.',
      });
    },
  });

  const submitApproval = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<InvoiceDetail>(`/api/invoices/${id}/submit-approval`);
      return data;
    },
    onSuccess: async () => {
      setNotice({
        type: 'success',
        text: 'Agent verification passed. Request released to AP finance.',
      });
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: unknown) => {
      setNotice({ type: 'error', text: errorMessage(error, 'Agent verification failed.') });
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<CheckoutResponse>(
        `/api/payments/invoice/${id}/checkout`,
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
      else qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: async () => {
      await api.delete(`/api/invoices/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      await qc.invalidateQueries({ queryKey: ['ticket-board'] });
      navigate('/invoices', {
        state: { notice: 'Invoice deleted successfully.' },
        replace: true,
      });
    },
    onError: (error: unknown) => {
      setNotice({
        type: 'error',
        text: errorMessage(error, 'Invoice could not be deleted.'),
      });
    },
  });

  const isDepartmentOwner =
    user?.role === 'DEPT_USER' && !!inv && user.departmentId === inv.departmentId;
  const canFinanceEdit =
    (user?.role === 'AP_CLERK' || user?.role === 'COMPANY_ADMIN') &&
    !lockedStatuses.has(inv?.status ?? '');
  const canEdit =
    canFinanceEdit ||
    (isDepartmentOwner && !!inv?.status && departmentEditableStatuses.has(inv.status));
  const canDeleteInvoice =
    isDepartmentOwner &&
    !!inv &&
    (inv.ticket
      ? departmentDeletableTicketStatuses.has(inv.ticket.status)
      : departmentEditableStatuses.has(inv.status));
  const canSubmitApproval =
    user?.role === 'COMPANY_ADMIN' &&
    inv?.status === 'VENDOR_VERIFIED' &&
    !!inv.vendorId &&
    Number(inv.amountPkr) > 0;
  const canPay =
    (user?.role === 'AP_CLERK' || user?.role === 'COMPANY_ADMIN') &&
    payableStatuses.has(inv?.status ?? '');

  const editForm = useMemo(() => {
    if (!inv) return null;
    return (
      <EditInvoiceForm
        invoice={inv}
        departments={departments ?? []}
        vendors={vendors ?? []}
        saving={patch.isPending}
        lockDepartment={user?.role === 'DEPT_USER'}
        lockFinanceFields={user?.role === 'DEPT_USER'}
        title={
          user?.role === 'DEPT_USER'
            ? 'Complete invoice details'
            : 'Edit invoice review details'
        }
        onSave={(body) => patch.mutate(body)}
      />
    );
  }, [inv, departments, vendors, patch, user?.role]);

  if (!id) return <p className="error">Missing id</p>;
  const paymentError = getApiErrorMessage(pay.error);
  if (isLoading) return <p className="muted">Loading...</p>;
  if (isError || !inv) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invoice could not be loaded</h2>
        <p className="muted">
          The invoice was not found or your role does not have access to it.
        </p>
        <Link to="/invoices" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Back to invoices
        </Link>
      </div>
    );
  }
  return (
    <div>
      <p>
        <Link to="/invoices">Back</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>Invoice</h2>
      {notice ? (
        <div className={`notice notice-${notice.type}`} style={{ marginBottom: '1rem' }}>
          {notice.text}
        </div>
      ) : null}

      <div className="card">
        <p>
          <strong>Amount:</strong> {pkr.format(Number(inv.amountPkr))}{' '}
          <span className={badgeTone(inv.status)}>{inv.status.replaceAll('_', ' ')}</span>
        </p>
        <p>
          <strong>Department:</strong> {inv.department.name}
        </p>
        <p>
          <strong>Vendor:</strong> {inv.vendor?.displayName ?? 'Not linked'}
        </p>
        <VendorDetails vendor={inv.vendor} amountPkr={inv.amountPkr} />
        {inv.invoiceNumber ? (
          <p>
            <strong>Invoice number:</strong> {inv.invoiceNumber}
          </p>
        ) : null}
        {inv.reference ? (
          <p>
            <strong>Reference:</strong> {inv.reference}
          </p>
        ) : null}
        {inv.description ? (
          <p>
            <strong>Description:</strong> {inv.description}
          </p>
        ) : null}
        {inv.purchaseOrder ? (
          <p>
            <strong>Purchase order:</strong> {inv.purchaseOrder.poNumber}{' '}
            <span className="badge">{inv.purchaseOrder.status.replaceAll('_', ' ')}</span>
          </p>
        ) : null}
        <AgentVerification extracted={inv.extracted} />
        <PaymentPlanSummary invoice={inv} />
        <details style={{ marginTop: '0.75rem' }}>
          <summary>Extracted JSON</summary>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(inv.extracted, null, 2)}
          </pre>
        </details>
      </div>

      {canDeleteInvoice ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Delete draft invoice</h3>
          <p className="muted">
            This invoice is still in department draft/rework. Deleting it will also remove the
            linked department ticket, synced PO/payment plan draft, and uploaded draft documents.
          </p>
          <button
            type="button"
            className="btn btn-danger"
            disabled={deleteInvoice.isPending}
            onClick={() => {
              if (
                window.confirm(
                  'Delete this draft invoice and its linked department ticket completely?',
                )
              ) {
                setNotice(null);
                deleteInvoice.mutate();
              }
            }}
          >
            {deleteInvoice.isPending ? 'Deleting...' : 'Delete invoice'}
          </button>
        </div>
      ) : null}

      {canEdit ? editForm : null}
      {!canEdit && isDepartmentOwner ? (
        <div className="notice notice-info" style={{ marginBottom: '1rem' }}>
          Invoice is no longer editable from department side after finance processing starts.
        </div>
      ) : null}

      {canSubmitApproval ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Submit to AP finance</h3>
          <p className="muted">
            Agent verification runs first. If invoice, PO, vendor, and payment plan are valid,
            the request moves directly to AP finance.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitApproval.isPending}
            onClick={() => submitApproval.mutate()}
          >
            {submitApproval.isPending ? 'Verifying...' : 'Submit to finance'}
          </button>
        </div>
      ) : null}

      {canPay ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Pay with Stripe</h3>
          <p className="muted">
            You will be redirected to Stripe Checkout to complete this payment in PKR.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pay.isPending}
            onClick={() => pay.mutate()}
          >
            {pay.isPending
              ? 'Opening Stripe...'
              : inv.status === 'PAYMENT_INITIATED'
                ? 'Resume payment'
                : inv.status === 'PAYMENT_FAILED' ||
                    inv.status === 'PAYMENT_EXPIRED'
                  ? 'Retry payment'
                : 'Pay now'}
          </button>
          {paymentError ? <p className="error">{paymentError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function getApiErrorMessage(error: unknown) {
  if (!error) return null;
  const axiosError = error as AxiosError<ApiError>;
  const message = axiosError.response?.data?.message;
  const text = Array.isArray(message) ? message.join(' ') : message;
  if (text?.includes('Stripe is not configured')) {
    return 'Payments are not configured for this environment.';
  }
  if (text) return text;
  if (error instanceof Error) return error.message;
  return 'Could not start Stripe Checkout.';
}

function EditInvoiceForm({
  invoice,
  departments,
  vendors,
  saving,
  lockDepartment,
  lockFinanceFields,
  title,
  onSave,
}: {
  invoice: InvoiceDetail;
  departments: Dept[];
  vendors: Vendor[];
  saving: boolean;
  lockDepartment: boolean;
  lockFinanceFields: boolean;
  title: string;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [amountPkr, setAmount] = useState(invoice.amountPkr);
  const [invoiceNumber, setInvoiceNumber] = useState(invoice.invoiceNumber ?? '');
  const [reference, setRef] = useState(invoice.reference ?? '');
  const [description, setDesc] = useState(invoice.description ?? '');
  const [departmentId, setDept] = useState(invoice.departmentId);
  const [vendorId, setVendor] = useState(invoice.vendorId ?? '');
  const [invoiceDate, setInvoiceDate] = useState(toDateInput(invoice.invoiceDate));
  const [receivedDate, setReceivedDate] = useState(toDateInput(invoice.receivedDate));
  const [dueDate, setDueDate] = useState(toDateInput(invoice.dueDate));
  const [currency, setCurrency] = useState(invoice.currency ?? 'PKR');
  const [subtotal, setSubtotal] = useState(invoice.subtotal ?? invoice.amountPkr ?? '0');
  const [taxAmount, setTaxAmount] = useState(invoice.taxAmount ?? '0');
  const [withholdingTax, setWithholdingTax] = useState(invoice.withholdingTax ?? '0');
  const [totalAmount, setTotalAmount] = useState(invoice.totalAmount ?? invoice.amountPkr ?? '0');
  const [paymentPlanType, setPaymentPlanType] = useState(
    invoice.paymentPlan?.planType ?? 'FULL_PAYMENT',
  );
  const [advancePercent, setAdvancePercent] = useState(
    invoice.paymentPlan?.advancePercent ?? '50',
  );
  const [releaseCondition, setReleaseCondition] = useState(
    invoice.paymentPlan?.releaseCondition ??
      'Products/services received and GRN or delivery proof attached',
  );
  const [requiredFinalDocuments, setRequiredFinalDocuments] = useState(
    invoice.paymentPlan?.requiredFinalDocuments?.length
      ? invoice.paymentPlan.requiredFinalDocuments.join('\n')
      : 'GRN\nDELIVERY_NOTE\nRECEIPT',
  );
  const accountDefaults = invoiceAccountDefaults(invoice.extracted);
  const [vendorAccountNumber, setVendorAccountNumber] = useState(
    accountDefaults.vendorAccountNumber || invoice.vendor?.bankAccountNumber || '',
  );
  const [invoiceAccountNumber, setInvoiceAccountNumber] = useState(
    accountDefaults.invoiceAccountNumber,
  );
  const [accountVerificationSource, setAccountVerificationSource] = useState(
    accountDefaults.accountVerificationSource,
  );
  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId) ?? invoice.vendor;

  useEffect(() => {
    setReceivedDate(toDateInput(invoice.receivedDate));
    setDueDate(toDateInput(invoice.dueDate));
  }, [invoice.id, invoice.receivedDate, invoice.dueDate]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      amountPkr: Number(amountPkr),
      invoiceNumber: invoiceNumber || undefined,
      reference: reference || undefined,
      description: description || undefined,
      departmentId,
      vendorId: vendorId || undefined,
      invoiceDate: invoiceDate || undefined,
      currency,
      vendorAccountNumber,
      invoiceAccountNumber,
      accountVerificationSource,
      paymentPlanType,
      advancePercent:
        paymentPlanType === 'ADVANCE_REMAINING' ? Number(advancePercent || 50) : undefined,
      releaseCondition:
        paymentPlanType === 'ADVANCE_REMAINING' ? releaseCondition || undefined : undefined,
      requiredFinalDocuments:
        paymentPlanType === 'ADVANCE_REMAINING'
          ? requiredFinalDocuments
              .split('\n')
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined,
    };

    if (!lockFinanceFields) {
      body.subtotal = Number(subtotal || 0);
      body.taxAmount = Number(taxAmount || 0);
      body.withholdingTax = Number(withholdingTax || 0);
      body.totalAmount = Number(totalAmount || amountPkr || 0);
    }

    onSave(body);
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted">
        Fill the invoice fields after upload. These values also update the AP board ticket so
        finance receives a complete request.
      </p>
      <form onSubmit={onSubmit}>
        <div className="ticket-edit-grid">
          <div className="field">
            <label>Invoice number</label>
            <input
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2026-001"
              required
            />
          </div>
          <div className="field">
            <label>Reference / slip number</label>
            <input
              value={reference}
              onChange={(e) => setRef(e.target.value)}
              placeholder="Vendor invoice or internal reference"
            />
          </div>
          <div className="field">
            <label>Amount (PKR)</label>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={amountPkr}
              onChange={(e) => {
                setAmount(e.target.value);
                setTotalAmount(e.target.value);
              }}
              required
            />
          </div>
          <div className="field">
            <label>Invoice date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Received date</label>
            <input
              type="date"
              value={receivedDate}
              disabled
            />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" value={dueDate} disabled />
          </div>
          <div className="field">
            <label>PO number</label>
            <input value={invoice.purchaseOrder?.poNumber ?? 'Auto generated'} disabled />
          </div>
          <div className="field">
            <label>PO status</label>
            <input value={invoice.purchaseOrder?.status.replaceAll('_', ' ') ?? 'DRAFT'} disabled />
          </div>
          <div className="field">
            <label>PO expected date</label>
            <input type="date" value={dueDate} disabled />
          </div>
          <div className="field">
            <label>Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="PKR">PKR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div className="field">
            <label>Invoice / PO subtotal</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              disabled={lockFinanceFields}
            />
          </div>
          <div className="field">
            <label>Invoice / PO tax amount</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
              disabled={lockFinanceFields}
            />
          </div>
          <div className="field">
            <label>Withholding tax</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={withholdingTax}
              onChange={(e) => setWithholdingTax(e.target.value)}
              disabled={lockFinanceFields}
            />
          </div>
          <div className="field">
            <label>Invoice / PO total amount</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              disabled={lockFinanceFields}
            />
          </div>
          <div className="field">
            <label>Department</label>
            <select
              value={departmentId}
              disabled={lockDepartment}
              onChange={(e) => setDept(e.target.value)}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Vendor</label>
            <select
              value={vendorId}
              onChange={(e) => {
                const nextVendorId = e.target.value;
                const nextVendor = vendors.find((vendor) => vendor.id === nextVendorId);
                setVendor(nextVendorId);
                if (!vendorAccountNumber && nextVendor?.bankAccountNumber) {
                  setVendorAccountNumber(nextVendor.bankAccountNumber);
                }
                if (!accountVerificationSource && nextVendor?.bankAccountNumber) {
                  setAccountVerificationSource('Vendor master account selected on invoice detail');
                }
              }}
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName} ({v.kind})
                </option>
              ))}
            </select>
          </div>
          <VendorDetails vendor={selectedVendor} amountPkr={amountPkr} compact />
          <div className="field">
            <label>Vendor account number</label>
            <input
              value={vendorAccountNumber}
              onChange={(e) => setVendorAccountNumber(e.target.value)}
              placeholder="Vendor master/bank account number"
            />
          </div>
          <div className="field">
            <label>Invoice account number</label>
            <input
              value={invoiceAccountNumber}
              onChange={(e) => setInvoiceAccountNumber(e.target.value)}
              placeholder="Account number visible on invoice or manually verified"
            />
          </div>
          <div className="field ticket-wide-field">
            <label>Account verification proof/source</label>
            <input
              value={accountVerificationSource}
              onChange={(e) => setAccountVerificationSource(e.target.value)}
              placeholder="Legacy sheet row, vendor master, email proof, or manual verification note"
            />
          </div>
          <div className="field ticket-wide-field">
            <label>Description / PO notes / expense detail</label>
            <textarea rows={3} value={description} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field">
            <label>Payment structure</label>
            <select
              value={paymentPlanType}
              onChange={(e) => setPaymentPlanType(e.target.value)}
            >
              <option value="FULL_PAYMENT">Full payment</option>
              <option value="ADVANCE_REMAINING">Advance + remaining</option>
            </select>
          </div>
          {paymentPlanType === 'ADVANCE_REMAINING' ? (
            <>
              <div className="field">
                <label>Advance percent</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={advancePercent}
                  onChange={(e) => setAdvancePercent(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Advance amount</label>
                <input
                  value={pkr.format((Number(totalAmount || 0) * Number(advancePercent || 0)) / 100)}
                  disabled
                />
              </div>
              <div className="field">
                <label>Remaining amount</label>
                <input
                  value={pkr.format(
                    Number(totalAmount || 0) -
                      (Number(totalAmount || 0) * Number(advancePercent || 0)) / 100,
                  )}
                  disabled
                />
              </div>
              <div className="field ticket-wide-field">
                <label>Remaining release condition</label>
                <input
                  value={releaseCondition}
                  onChange={(e) => setReleaseCondition(e.target.value)}
                />
              </div>
              <div className="field ticket-wide-field">
                <label>Required final proof documents</label>
                <textarea
                  rows={3}
                  value={requiredFinalDocuments}
                  onChange={(e) => setRequiredFinalDocuments(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
        <button type="submit" className="btn btn-secondary" disabled={saving}>
          {saving ? 'Saving...' : 'Save invoice details'}
        </button>
      </form>
    </div>
  );
}

function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  return value.slice(0, 10);
}

function VendorDetails({
  vendor,
  amountPkr,
  compact = false,
}: {
  vendor: Vendor | null;
  amountPkr: string;
  compact?: boolean;
}) {
  if (!vendor) {
    return (
      <div className={compact ? 'vendor-details vendor-details-compact ticket-wide-field' : 'vendor-details'}>
        <strong>Vendor details</strong>
        <span className="muted">Vendor is not linked yet. Select a vendor to show bank, tax, and contact details.</span>
      </div>
    );
  }

  const rows = [
    ['Vendor code', vendor.vendorCode],
    ['Legal name', vendor.legalName],
    ['Kind', vendor.kind?.replaceAll('_', ' ').toLowerCase()],
    ['Tax number', vendor.taxNumber],
    ['NTN', vendor.ntn],
    ['STRN', vendor.strn],
    ['Bank', vendor.bankName],
    ['Account title', vendor.bankAccountTitle],
    ['Account number', vendor.bankAccountNumber],
    ['IBAN', vendor.iban],
    ['SWIFT', vendor.swiftCode],
    ['Contact', vendor.contactPerson],
    ['Phone', vendor.phone],
    ['Email', vendor.email],
    ['City', vendor.city],
    ['Terms', vendor.paymentTermsDays != null ? `${vendor.paymentTermsDays} days` : null],
    ['WHT rate', vendor.withholdingTaxRate ? `${vendor.withholdingTaxRate}%` : null],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className={compact ? 'vendor-details vendor-details-compact ticket-wide-field' : 'vendor-details'}>
      <div className="vendor-details-header">
        <strong>{vendor.displayName}</strong>
        <span>{pkr.format(Number(amountPkr || 0))}</span>
      </div>
      <div className="vendor-details-grid">
        {rows.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      {vendor.address ? <p className="muted">{vendor.address}</p> : null}
    </div>
  );
}

function PaymentPlanSummary({ invoice }: { invoice: InvoiceDetail }) {
  const plan = invoice.paymentPlan;
  if (!plan) return null;
  return (
    <div className="payment-plan-summary">
      <div className="payment-plan-header">
        <div>
          <strong>{plan.planNumber}</strong>
          <small>
            {plan.planType.replaceAll('_', ' ').toLowerCase()} /{' '}
            {plan.status.replaceAll('_', ' ').toLowerCase()}
          </small>
        </div>
        <span className={badgeTone(plan.aiVerificationStatus)}>
          AI {plan.aiVerificationStatus.replaceAll('_', ' ').toLowerCase()} {plan.aiVerificationScore}%
        </span>
      </div>
      <div className="payment-plan-totals">
        <span>
          <small>Total</small>
          <strong>{pkr.format(Number(plan.totalAmount))}</strong>
        </span>
        <span>
          <small>Paid</small>
          <strong>{pkr.format(Number(plan.paidAmount))}</strong>
        </span>
        <span>
          <small>Remaining</small>
          <strong>{pkr.format(Number(plan.remainingAmount))}</strong>
        </span>
      </div>
      <div className="payment-milestone-list">
        {plan.milestones.map((milestone) => (
          <div className="payment-milestone-row" key={milestone.id}>
            <span>
              <strong>{milestone.label}</strong>
              <small>
                {milestone.kind.replaceAll('_', ' ').toLowerCase()} /{' '}
                {milestone.status.replaceAll('_', ' ').toLowerCase()}
              </small>
            </span>
            <strong>{pkr.format(Number(milestone.amount))}</strong>
            {milestone.ticket ? (
              <Link to={`/tickets/${milestone.ticket.id}`}>
                {milestone.ticket.status.replaceAll('_', ' ').toLowerCase()}
              </Link>
            ) : (
              <small>No ticket yet</small>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentVerification({ extracted }: { extracted: unknown }) {
  const source =
    extracted && typeof extracted === 'object'
      ? (extracted as Record<string, unknown>)
      : null;
  const verification =
    source && typeof source.agentVerification === 'object' && source.agentVerification
      ? (source.agentVerification as {
          status?: string;
          errors?: string[];
          warnings?: string[];
          checkedAt?: string;
        })
      : null;

  if (!verification) return null;

  return (
    <div
      className={`notice ${
        verification.status === 'PASSED' ? 'notice-success' : 'notice-error'
      }`}
      style={{ marginTop: '0.85rem' }}
    >
      Agent verification: {verification.status ?? 'PENDING'}
      {verification.errors?.length ? (
        <div className="muted">{verification.errors.join(', ')}</div>
      ) : null}
      {verification.warnings?.length ? (
        <div className="muted">{verification.warnings.join(', ')}</div>
      ) : null}
    </div>
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data
  ) {
    const message = error.response.data.message;
    if (typeof message === 'string') return message;
  }
  return fallback;
}
