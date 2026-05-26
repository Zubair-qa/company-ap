import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Dept = { id: string; name: string };
type Vendor = { id: string; displayName: string; kind: string };
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
  purchaseOrder: PurchaseOrderSummary | null;
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
const departmentEditableStatuses = new Set([
  'UPLOADED',
  'EXTRACTED',
  'VENDOR_UNVERIFIED',
  'VENDOR_VERIFIED',
  'REJECTED',
]);
export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
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
        text: 'Agent verification passed. Request sent to department head.',
      });
      await qc.invalidateQueries({ queryKey: ['invoice', id] });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: (error: unknown) => {
      setNotice({ type: 'error', text: errorMessage(error, 'Agent verification failed.') });
    },
  });

  const decide = useMutation({
    mutationFn: async (approved: boolean) => {
      const { data } = await api.post<InvoiceDetail>(`/api/approvals/${id}`, {
        approved,
        note: note || undefined,
      });
      return data;
    },
    onSuccess: (_, approved) => {
      setNotice({
        type: 'success',
        text: approved
          ? 'Department head approved. Request released to finance AP board.'
          : 'Request rejected and returned to department.',
      });
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['ticket-board'] });
    },
    onError: () => {
      setNotice({ type: 'error', text: 'Approval action could not be completed.' });
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

  const isDepartmentOwner =
    user?.role === 'DEPT_USER' && !!inv && user.departmentId === inv.departmentId;
  const canFinanceEdit =
    (user?.role === 'AP_CLERK' || user?.role === 'COMPANY_ADMIN') &&
    !lockedStatuses.has(inv?.status ?? '');
  const canEdit =
    canFinanceEdit ||
    (isDepartmentOwner && !!inv?.status && departmentEditableStatuses.has(inv.status));
  const canApprove =
    (user?.role === 'DEPT_ADMIN' || user?.role === 'COMPANY_ADMIN') &&
    inv?.status === 'AWAITING_APPROVAL';
  const canSubmitApproval =
    ((user?.role === 'DEPT_USER' && isDepartmentOwner) || user?.role === 'COMPANY_ADMIN') &&
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
          <span className="badge">{inv.status.replaceAll('_', ' ')}</span>
        </p>
        <p>
          <strong>Department:</strong> {inv.department.name}
        </p>
        <p>
          <strong>Vendor:</strong> {inv.vendor?.displayName ?? 'Not linked'}
        </p>
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
        <details style={{ marginTop: '0.75rem' }}>
          <summary>Extracted JSON</summary>
          <pre style={{ fontSize: 12, overflow: 'auto' }}>
            {JSON.stringify(inv.extracted, null, 2)}
          </pre>
        </details>
      </div>

      {canEdit ? editForm : null}
      {!canEdit && isDepartmentOwner ? (
        <div className="notice notice-info" style={{ marginBottom: '1rem' }}>
          Invoice is no longer editable from department side after finance processing starts.
        </div>
      ) : null}

      {canSubmitApproval ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Submit to department head</h3>
          <p className="muted">
            Agent verification runs first, then the request moves to department head approval.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitApproval.isPending}
            onClick={() => submitApproval.mutate()}
          >
            {submitApproval.isPending ? 'Verifying...' : 'Submit to head'}
          </button>
        </div>
      ) : null}

      {canApprove ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Approval</h3>
          <p className="muted">
            Department head decision. Approval releases the synced invoice and PO to finance.
          </p>
          <div className="field">
            <label htmlFor="note">Note (optional)</label>
            <textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={decide.isPending}
              onClick={() => decide.mutate(true)}
            >
              Approve
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={decide.isPending}
              onClick={() => decide.mutate(false)}
            >
              Reject
            </button>
          </div>
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
  title,
  onSave,
}: {
  invoice: InvoiceDetail;
  departments: Dept[];
  vendors: Vendor[];
  saving: boolean;
  lockDepartment: boolean;
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

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      amountPkr: Number(amountPkr),
      invoiceNumber: invoiceNumber || undefined,
      reference: reference || undefined,
      description: description || undefined,
      departmentId,
      vendorId: vendorId || undefined,
      invoiceDate: invoiceDate || undefined,
      receivedDate: receivedDate || undefined,
      dueDate: dueDate || undefined,
      currency,
      subtotal: Number(subtotal || 0),
      taxAmount: Number(taxAmount || 0),
      withholdingTax: Number(withholdingTax || 0),
      totalAmount: Number(totalAmount || amountPkr || 0),
    });
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
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
            <select value={vendorId} onChange={(e) => setVendor(e.target.value)}>
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.displayName} ({v.kind})
                </option>
              ))}
            </select>
          </div>
          <div className="field ticket-wide-field">
            <label>Description / PO notes / expense detail</label>
            <textarea rows={3} value={description} onChange={(e) => setDesc(e.target.value)} />
          </div>
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
