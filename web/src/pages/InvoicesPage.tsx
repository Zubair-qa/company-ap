import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type InvoiceRow = {
  id: string;
  reference: string | null;
  amountPkr: string;
  status: string;
  department: { name: string };
  vendor: { displayName: string } | null;
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

export function InvoicesPage() {
  const { user } = useAuth();
  const canUseInvoices = user?.role === 'DEPT_USER';
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    enabled: canUseInvoices,
    queryFn: async () => {
      const { data } = await api.get<InvoiceRow[]>('/api/invoices');
      return data;
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
                <td>
                  <Link to={`/invoices/${inv.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
