import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type InvoiceRow = {
  id: string;
  reference: string | null;
  amountPkr: string;
  status: string;
  department: { name: string };
  departmentId: string;
  vendor: { displayName: string } | null;
  ticket: { id: string; status: string } | null;
};

type LocationState = {
  notice?: string;
};

type Notice = {
  type: 'success' | 'error';
  message: string;
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

const departmentDeletableTicketStatuses = new Set([
  'NEW_REQUEST',
  'MISSING_DOCS',
  'REQUESTER_PINGED',
  'WAITING_FOR_DOCS',
]);

const departmentDeletableInvoiceStatuses = new Set([
  'UPLOADED',
  'EXTRACTED',
  'VENDOR_UNVERIFIED',
  'VENDOR_VERIFIED',
  'REJECTED',
]);

function apiErrorMessage(error: unknown) {
  const maybe = error as {
    message?: string;
    response?: { data?: { message?: string | string[]; error?: string } };
  };
  const message = maybe.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return message ?? maybe.response?.data?.error ?? maybe.message ?? 'Request failed.';
}

function canDeleteInvoice(user: ReturnType<typeof useAuth>['user'], invoice: InvoiceRow) {
  if (user?.role !== 'DEPT_USER' || user.departmentId !== invoice.departmentId) return false;
  if (invoice.ticket) return departmentDeletableTicketStatuses.has(invoice.ticket.status);
  return departmentDeletableInvoiceStatuses.has(invoice.status);
}

export function InvoicesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;
  const [notice, setNotice] = useState<Notice | null>(
    state?.notice ? { type: 'success', message: state.notice } : null,
  );
  const canUseInvoices = user?.role === 'DEPT_USER';
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    enabled: canUseInvoices,
    queryFn: async () => {
      const { data } = await api.get<InvoiceRow[]>('/api/invoices');
      return data;
    },
  });

  const deleteInvoice = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/invoices/${id}`);
    },
    onSuccess: async () => {
      setNotice({ type: 'success', message: 'Invoice deleted successfully.' });
      navigate('/invoices', { replace: true, state: null });
      await qc.invalidateQueries({ queryKey: ['invoices'] });
      await qc.invalidateQueries({ queryKey: ['tickets'] });
      await qc.invalidateQueries({ queryKey: ['ticket-board'] });
    },
    onError: (deleteError) => {
      setNotice({ type: 'error', message: apiErrorMessage(deleteError) });
    },
  });

  if (!user) return null;

  if (!canUseInvoices) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Invoice creation is department-owned</h2>
        <p className="muted">
          Finance and CFO users process approved AP tickets from the board. New invoice
          submissions are created only by department requesters.
        </p>
        <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Back to payment board
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Invoices</h2>
        <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          Create invoice
        </Link>
      </div>
      {notice ? (
        <div className={`notice notice-${notice.type}`} role="status">
          {notice.message}
        </div>
      ) : null}
      {isLoading ? <p className="muted">Loading…</p> : null}
      {error ? <p className="error">Failed to load invoices.</p> : null}
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Department</th>
              <th>Vendor</th>
              <th>Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((inv) => (
              <tr key={inv.id}>
                <td>{inv.reference || '—'}</td>
                <td>{inv.department.name}</td>
                <td>{inv.vendor?.displayName ?? '—'}</td>
                <td>{pkr.format(Number(inv.amountPkr))}</td>
                <td>
                  <span className="badge">{inv.status.replaceAll('_', ' ')}</span>
                </td>
                <td style={{ minWidth: 150 }}>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Link to={`/invoices/${inv.id}`}>Open</Link>
                    {canDeleteInvoice(user, inv) ? (
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
                            deleteInvoice.mutate(inv.id);
                          }
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
