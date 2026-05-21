import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type InvoiceRow = {
  id: string;
  reference: string | null;
  amountPkr: string;
  status: string;
  createdAt?: string;
  dueDate?: string | null;
  description?: string | null;
  department: { name: string };
  vendor: { displayName: string } | null;
};

type Tone = 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';

type DepartmentBucket = {
  name: string;
  amount: number;
  count: number;
  pending: number;
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

const compactPkr = new Intl.NumberFormat('en-PK', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const statusMeta: Array<{ key: string; label: string; tone: Tone }> = [
  { key: 'UPLOADED', label: 'Uploaded', tone: 'slate' },
  { key: 'EXTRACTED', label: 'Extracted', tone: 'indigo' },
  { key: 'VENDOR_UNVERIFIED', label: 'Vendor review', tone: 'amber' },
  { key: 'VENDOR_VERIFIED', label: 'Vendor verified', tone: 'cyan' },
  { key: 'AWAITING_APPROVAL', label: 'Awaiting approval', tone: 'amber' },
  { key: 'APPROVED', label: 'Approved', tone: 'emerald' },
  { key: 'REJECTED', label: 'Rejected', tone: 'rose' },
  { key: 'PAYMENT_INITIATED', label: 'Payment started', tone: 'indigo' },
  { key: 'PAID', label: 'Paid', tone: 'emerald' },
];

const payableStatuses = new Set(['APPROVED', 'PAYMENT_INITIATED']);
const pendingStatuses = new Set([
  'UPLOADED',
  'EXTRACTED',
  'VENDOR_UNVERIFIED',
  'VENDOR_VERIFIED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'PAYMENT_INITIATED',
]);

function amountOf(invoice: InvoiceRow) {
  const amount = Number(invoice.amountPkr);
  return Number.isFinite(amount) ? amount : 0;
}

function money(amount: number) {
  return pkr.format(amount);
}

function statusLabel(status: string) {
  return statusMeta.find((item) => item.key === status)?.label ?? status.replaceAll('_', ' ');
}

function statusTone(status: string): Tone {
  return statusMeta.find((item) => item.key === status)?.tone ?? 'slate';
}

function formatDate(value?: string | null) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short' });
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data } = await api.get<InvoiceRow[]>('/api/invoices');
      return data;
    },
  });

  const invoices = useMemo(() => data ?? [], [data]);

  const dashboard = useMemo(() => {
    const totalAmount = invoices.reduce((sum, inv) => sum + amountOf(inv), 0);
    const pendingAmount = invoices
      .filter((inv) => pendingStatuses.has(inv.status))
      .reduce((sum, inv) => sum + amountOf(inv), 0);
    const payableAmount = invoices
      .filter((inv) => payableStatuses.has(inv.status))
      .reduce((sum, inv) => sum + amountOf(inv), 0);
    const paidAmount = invoices
      .filter((inv) => inv.status === 'PAID')
      .reduce((sum, inv) => sum + amountOf(inv), 0);
    const awaitingCount = invoices.filter((inv) => inv.status === 'AWAITING_APPROVAL').length;
    const reviewCount = invoices.filter((inv) =>
      ['EXTRACTED', 'VENDOR_UNVERIFIED', 'VENDOR_VERIFIED'].includes(inv.status),
    ).length;

    const departmentTotals = Array.from(
      invoices
        .reduce((map, inv) => {
          const key = inv.department.name;
          const existing = map.get(key) ?? {
            name: key,
            amount: 0,
            count: 0,
            pending: 0,
          };
          existing.amount += amountOf(inv);
          existing.count += 1;
          if (pendingStatuses.has(inv.status)) existing.pending += amountOf(inv);
          map.set(key, existing);
          return map;
        }, new Map<string, DepartmentBucket>())
        .values(),
    ).sort((a, b) => b.amount - a.amount);

    const statusTotals = statusMeta.map((meta) => {
      const matches = invoices.filter((inv) => inv.status === meta.key);
      return {
        ...meta,
        count: matches.length,
        amount: matches.reduce((sum, inv) => sum + amountOf(inv), 0),
      };
    });

    return {
      totalAmount,
      pendingAmount,
      payableAmount,
      paidAmount,
      awaitingCount,
      reviewCount,
      departmentTotals,
      statusTotals,
    };
  }, [invoices]);

  const actionInvoices = useMemo(() => {
    const statuses =
      user?.role === 'DEPT_ADMIN'
        ? ['AWAITING_APPROVAL']
        : user?.role === 'DEPT_USER'
          ? ['REJECTED', 'EXTRACTED', 'VENDOR_UNVERIFIED', 'VENDOR_VERIFIED']
        : ['VENDOR_UNVERIFIED', 'EXTRACTED', 'VENDOR_VERIFIED', 'APPROVED'];
    return invoices.filter((inv) => statuses.includes(inv.status)).slice(0, 6);
  }, [invoices, user?.role]);

  if (!user) return null;

  const canUpload = ['AP_CLERK', 'DEPT_USER', 'COMPANY_ADMIN'].includes(user.role);
  const roleName = user.role.replaceAll('_', ' ');
  const largestDepartment = Math.max(
    1,
    ...dashboard.departmentTotals.map((dept) => dept.amount),
  );
  const largestStatus = Math.max(1, ...dashboard.statusTotals.map((item) => item.count));
  const recentInvoices = invoices.slice(0, 5);

  return (
    <div className="dashboard-page" data-testid="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">AP command center</p>
          <h2>Dashboard</h2>
          <p className="dashboard-subtitle">
            {user.departmentId ? `${user.name} · ${roleName}` : roleName}
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <span className="scope-pill">{invoices.length} invoices</span>
          {canUpload ? (
            <Link to="/upload" className="btn btn-primary">
              Create invoice
            </Link>
          ) : null}
        </div>
      </section>

      {isLoading ? <p className="muted">Loading dashboard...</p> : null}
      {error ? <p className="error">Failed to load dashboard.</p> : null}

      <section className="metric-grid" aria-label="Invoice metrics">
        <MetricCard
          label="Total tracked"
          value={money(dashboard.totalAmount)}
          detail={`${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
          tone="cyan"
        />
        <MetricCard
          label="Open exposure"
          value={money(dashboard.pendingAmount)}
          detail="Not rejected or paid"
          tone="amber"
        />
        <MetricCard
          label="Ready to pay"
          value={money(dashboard.payableAmount)}
          detail={`${dashboard.awaitingCount} awaiting approval`}
          tone="emerald"
        />
        <MetricCard
          label="Paid"
          value={money(dashboard.paidAmount)}
          detail={`${dashboard.reviewCount} need AP review`}
          tone="indigo"
        />
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Cost centers</p>
              <h3>Department spend</h3>
            </div>
            <Link to="/invoices">View all</Link>
          </div>
          {dashboard.departmentTotals.length ? (
            <div className="bar-list">
              {dashboard.departmentTotals.map((dept) => (
                <div className="bar-row" key={dept.name}>
                  <div className="bar-row-header">
                    <strong>{dept.name}</strong>
                    <span>{compactPkr.format(dept.amount)} PKR</span>
                  </div>
                  <div className="bar-track" aria-hidden="true">
                    <span
                      className="bar-fill"
                      style={{ width: `${Math.max(4, (dept.amount / largestDepartment) * 100)}%` }}
                    />
                  </div>
                  <div className="bar-row-meta">
                    <span>{dept.count} invoices</span>
                    <span>{money(dept.pending)} open</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="No invoice spend yet." />
          )}
        </section>

        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Workflow</p>
              <h3>Status pipeline</h3>
            </div>
          </div>
          <div className="status-stack">
            {dashboard.statusTotals.map((item) => (
              <div className="status-row" key={item.key}>
                <span className={`status-dot tone-${item.tone}`} />
                <span>{item.label}</span>
                <div className="mini-track" aria-hidden="true">
                  <span
                    className={`mini-fill tone-${item.tone}`}
                    style={{ width: `${Math.max(2, (item.count / largestStatus) * 100)}%` }}
                  />
                </div>
                <strong>{item.count}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-secondary">
        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Queue</p>
              <h3>
                {user.role === 'DEPT_ADMIN'
                  ? 'Head approvals'
                  : user.role === 'DEPT_USER'
                    ? 'Department actions'
                    : 'AP actions'}
              </h3>
            </div>
          </div>
          {actionInvoices.length ? (
            <div className="queue-list">
              {actionInvoices.map((invoice) => (
                <Link className="queue-item" to={`/invoices/${invoice.id}`} key={invoice.id}>
                  <span>
                    <strong>{invoice.reference || invoice.vendor?.displayName || 'Invoice'}</strong>
                    <small>{invoice.department.name}</small>
                  </span>
                  <span className={`badge badge-${statusTone(invoice.status)}`}>
                    {statusLabel(invoice.status)}
                  </span>
                  <strong>{money(amountOf(invoice))}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="Nothing needs attention right now." />
          )}
        </section>

        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Latest</p>
              <h3>Recent invoices</h3>
            </div>
          </div>
          {recentInvoices.length ? (
            <div className="recent-list">
              {recentInvoices.map((invoice) => (
                <Link className="recent-row" to={`/invoices/${invoice.id}`} key={invoice.id}>
                  <span>
                    <strong>{invoice.reference || invoice.description || 'Untitled invoice'}</strong>
                    <small>
                      {invoice.vendor?.displayName ?? 'Vendor pending'} · {formatDate(invoice.createdAt)}
                    </small>
                  </span>
                  <span>{money(amountOf(invoice))}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState message="No invoices have been uploaded yet." />
          )}
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="empty-state">{message}</p>;
}
