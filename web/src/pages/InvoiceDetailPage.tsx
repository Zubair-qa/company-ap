import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Dept = { id: string; name: string };
type Vendor = { id: string; displayName: string; kind: string };

type InvoiceDetail = {
  id: string;
  reference: string | null;
  amountPkr: string;
  status: string;
  description: string | null;
  departmentId: string;
  vendorId: string | null;
  department: { name: string };
  vendor: Vendor | null;
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

export function InvoiceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const { data: inv, isLoading } = useQuery({
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const submitApproval = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<InvoiceDetail>(`/api/invoices/${id}/submit-approval`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoice', id] }),
  });

  const decide = useMutation({
    mutationFn: async (approved: boolean) => {
      const { data } = await api.post<InvoiceDetail>(`/api/approvals/${id}`, {
        approved,
        note: note || undefined,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const pay = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ url: string | null; sessionId?: string }>(
        `/api/payments/invoice/${id}/checkout`,
      );
      return data;
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const canEdit = user?.role === 'AP_CLERK' || user?.role === 'COMPANY_ADMIN';
  const canApprove =
    (user?.role === 'DEPT_ADMIN' || user?.role === 'COMPANY_ADMIN') &&
    inv?.status === 'AWAITING_APPROVAL';
  const canPay =
    (user?.role === 'AP_CLERK' || user?.role === 'COMPANY_ADMIN') &&
    inv?.status === 'APPROVED';

  const editForm = useMemo(() => {
    if (!inv) return null;
    return (
      <EditInvoiceForm
        invoice={inv}
        departments={departments ?? []}
        vendors={vendors ?? []}
        saving={patch.isPending}
        onSave={(body) => patch.mutate(body)}
      />
    );
  }, [inv, departments, vendors, patch]);

  if (!id) return <p className="error">Missing id</p>;
  if (isLoading || !inv) return <p className="muted">Loading…</p>;

  return (
    <div>
      <p>
        <Link to="/invoices">← Back</Link>
      </p>
      <h2 style={{ marginTop: 0 }}>Invoice</h2>
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
      </div>

      {canEdit ? editForm : null}

      {canEdit &&
      inv.status === 'VENDOR_VERIFIED' &&
      inv.vendorId &&
      Number(inv.amountPkr) > 0 ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Send for approval</h3>
          <p className="muted">Routes this invoice to the department admin for sign-off.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitApproval.isPending}
            onClick={() => submitApproval.mutate()}
          >
            Submit for approval
          </button>
        </div>
      ) : null}

      {canApprove ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Approval</h3>
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
            Opens Stripe Checkout in PKR.
          </p>
          <div className="payment-mode-panel">
            <strong>Payment mode: Stripe sandbox</strong>
            <span>
              Test card <code>4242 4242 4242 4242</code>
            </span>
            <small>Use any future expiry date and any CVC.</small>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pay.isPending}
            onClick={() => pay.mutate()}
          >
            Pay now
          </button>
          {pay.isError ? (
            <p className="error">Stripe not configured or invoice not payable.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function EditInvoiceForm({
  invoice,
  departments,
  vendors,
  saving,
  onSave,
}: {
  invoice: InvoiceDetail;
  departments: Dept[];
  vendors: Vendor[];
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [amountPkr, setAmount] = useState(invoice.amountPkr);
  const [reference, setRef] = useState(invoice.reference ?? '');
  const [description, setDesc] = useState(invoice.description ?? '');
  const [departmentId, setDept] = useState(invoice.departmentId);
  const [vendorId, setVendor] = useState(invoice.vendorId ?? '');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      amountPkr: Number(amountPkr),
      reference: reference || undefined,
      description: description || undefined,
      departmentId,
      vendorId: vendorId || undefined,
    });
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Edit invoice</h3>
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Amount (PKR)</label>
          <input
            type="number"
            min={0.01}
            step={0.01}
            value={amountPkr}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label>Reference</label>
          <input value={reference} onChange={(e) => setRef(e.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="field">
          <label>Department</label>
          <select value={departmentId} onChange={(e) => setDept(e.target.value)}>
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
            <option value="">Select vendor…</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayName} ({v.kind})
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
