import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type InvoiceRow = {
  id: string;
  reference: string | null;
  amountPkr: string;
  totalAmountPkr: string;
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
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await api.get<InvoiceRow[]>('/api/invoices');
      return data;
    },
  });

  if (!user) return null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Invoices</h2>
        {(user.role === 'AP_CLERK' || user.role === 'COMPANY_ADMIN') && (
          <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Upload invoice
          </Link>
        )}
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
              <th>Total amount</th>
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
                <td>{pkr.format(Number(inv.totalAmountPkr))}</td>
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
