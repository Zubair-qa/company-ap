import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Overview = {
  invoices: number;
  openQueries: number;
  pendingVerifications: number;
  scheduledPayments: number;
  failedPayments: number;
  unreconciled: number;
  unreadNotifications: number;
};

type Department = { id: string; name: string };
type Vendor = { id: string; displayName: string };
type Meta = { departments: Department[]; vendors: Vendor[] };

type PurchaseOrder = {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: string;
  vendor: Vendor;
  department: Department;
};

type ApprovalRule = {
  id: string;
  minAmount: string;
  maxAmount: string;
  requiredRole: string;
  approvalLevel: number;
  department?: Department | null;
};

type Batch = {
  id: string;
  batchNumber: string;
  status: string;
  totalCount: number;
  totalAmount: string;
};

type QueryRow = {
  id: string;
  queryText: string;
  status: string;
  raisedAt: string;
  assignedToDepartment?: Department | null;
};

type XeroConnection = {
  id: string;
  tenantName: string | null;
  tenantId: string;
  active: boolean;
  expiresAt: string | null;
};

type TaxCode = { id: string; code: string; name: string; rate: string; type: string };
type GlAccount = { id: string; accountCode: string; accountName: string; accountType: string };

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

const scopeStages = [
  {
    label: 'Invoice / PO submission',
    owner: 'Department',
    roles: ['DEPT_USER', 'COMPANY_ADMIN'],
  },
  {
    label: 'Document verification',
    owner: 'AP finance',
    roles: ['AP_CLERK', 'COMPANY_ADMIN'],
  },
  {
    label: 'Data verification',
    owner: 'AP finance',
    roles: ['AP_CLERK', 'COMPANY_ADMIN'],
  },
  {
    label: 'WHT and voucher',
    owner: 'AP finance',
    roles: ['AP_CLERK', 'COMPANY_ADMIN'],
  },
  {
    label: 'Approval matrix',
    owner: 'Company admin',
    roles: ['COMPANY_ADMIN'],
  },
  {
    label: 'Payment disbursement',
    owner: 'AP and CFO',
    roles: ['AP_CLERK', 'CFO', 'COMPANY_ADMIN'],
  },
  {
    label: 'Xero and reconciliation',
    owner: 'AP and company admin',
    roles: ['AP_CLERK', 'COMPANY_ADMIN'],
  },
];

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? pkr.format(amount) : 'PKR 0';
}

function human(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
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

export function OperationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isCompanyAdmin = user?.role === 'COMPANY_ADMIN';
  const isAp = user?.role === 'AP_CLERK';
  const isDepartment = user?.role === 'DEPT_USER' || user?.role === 'DEPT_ADMIN';
  const isCfo = user?.role === 'CFO';
  const canCreatePo = Boolean(isCompanyAdmin || isDepartment);
  const canUsePaymentOps = Boolean(isCompanyAdmin || isAp);
  const canManageApprovalMatrix = Boolean(isCompanyAdmin);
  const canConnectXero = Boolean(isCompanyAdmin);
  const departmentId = isDepartment ? user?.departmentId ?? '' : '';
  const scopeKey = user?.id ?? 'anonymous';

  const [poForm, setPoForm] = useState({
    poNumber: '',
    vendorId: '',
    departmentId,
    description: '',
    quantity: '1',
    unitPrice: '',
  });
  const [ruleForm, setRuleForm] = useState({
    departmentId: '',
    minAmount: '0',
    maxAmount: '100000',
    requiredRole: 'DEPT_ADMIN',
    approvalLevel: '1',
  });
  const [exportedCsv, setExportedCsv] = useState('');
  const [xeroAuthUrl, setXeroAuthUrl] = useState('');

  const { data: overview } = useQuery({
    queryKey: ['ap-ops', 'overview', scopeKey],
    queryFn: async () => {
      const { data } = await api.get<Overview>('/api/ap-ops/overview');
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

  const departmentOptions = useMemo(() => {
    if (!isDepartment) return meta?.departments ?? [];
    return (meta?.departments ?? []).filter((department) => department.id === user?.departmentId);
  }, [isDepartment, meta?.departments, user?.departmentId]);

  const { data: purchaseOrders } = useQuery({
    queryKey: ['purchase-orders', scopeKey],
    queryFn: async () => {
      const { data } = await api.get<PurchaseOrder[]>('/api/purchase-orders');
      return data;
    },
  });

  const { data: rules } = useQuery({
    queryKey: ['approval-matrix', scopeKey],
    enabled: canManageApprovalMatrix,
    queryFn: async () => {
      const { data } = await api.get<ApprovalRule[]>('/api/approval-matrix');
      return data;
    },
  });

  const { data: batches } = useQuery({
    queryKey: ['payment-batches', scopeKey],
    enabled: canUsePaymentOps,
    queryFn: async () => {
      const { data } = await api.get<Batch[]>('/api/payment-batches');
      return data;
    },
  });

  const { data: queries } = useQuery({
    queryKey: ['queries', scopeKey],
    queryFn: async () => {
      const { data } = await api.get<QueryRow[]>('/api/queries');
      return data;
    },
  });

  const { data: taxCodes } = useQuery({
    queryKey: ['reference-data', 'tax-codes', scopeKey],
    enabled: canUsePaymentOps,
    queryFn: async () => {
      const { data } = await api.get<TaxCode[]>('/api/reference-data/tax-codes');
      return data;
    },
  });

  const { data: glAccounts } = useQuery({
    queryKey: ['reference-data', 'gl-accounts', scopeKey],
    enabled: canUsePaymentOps,
    queryFn: async () => {
      const { data } = await api.get<GlAccount[]>('/api/reference-data/gl-accounts');
      return data;
    },
  });

  const { data: xero } = useQuery({
    queryKey: ['xero', 'status', scopeKey],
    enabled: canUsePaymentOps,
    queryFn: async () => {
      const { data } = await api.get<XeroConnection[]>('/api/xero/status');
      return data;
    },
  });

  const createPo = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/purchase-orders', {
        poNumber: poForm.poNumber,
        vendorId: poForm.vendorId,
        departmentId: isDepartment ? user?.departmentId : poForm.departmentId,
        lineItems: [
          {
            description: poForm.description,
            quantity: Number(poForm.quantity || 1),
            unitPrice: Number(poForm.unitPrice || 0),
          },
        ],
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      setPoForm({
        poNumber: '',
        vendorId: '',
        departmentId,
        description: '',
        quantity: '1',
        unitPrice: '',
      });
    },
  });

  const createRule = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/approval-matrix', {
        departmentId: ruleForm.departmentId || undefined,
        minAmount: Number(ruleForm.minAmount),
        maxAmount: Number(ruleForm.maxAmount),
        requiredRole: ruleForm.requiredRole,
        approvalLevel: Number(ruleForm.approvalLevel),
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-matrix'] });
    },
  });

  const createBatch = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/api/payment-batches/from-approved', {});
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-batches'] });
      qc.invalidateQueries({ queryKey: ['ap-ops', 'overview'] });
    },
  });

  const exportBatch = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.get<{ csv: string; fileName: string }>(
        `/api/payment-batches/${id}/meezan-export`,
      );
      return data;
    },
    onSuccess: (data) => setExportedCsv(data.csv),
  });

  const getXeroAuthUrl = useMutation({
    mutationFn: async () => {
      const { data } = await api.get<{ url: string }>('/api/xero/auth-url');
      return data.url;
    },
    onSuccess: (url) => setXeroAuthUrl(url),
  });

  function setPoField(name: keyof typeof poForm, value: string) {
    setPoForm((current) => ({ ...current, [name]: value }));
  }

  function setRuleField(name: keyof typeof ruleForm, value: string) {
    setRuleForm((current) => ({ ...current, [name]: value }));
  }

  function submitPo(event: FormEvent) {
    event.preventDefault();
    createPo.mutate();
  }

  function submitRule(event: FormEvent) {
    event.preventDefault();
    createRule.mutate();
  }

  if (!user) return null;

  return (
    <div className="operations-page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">Role scoped operations</p>
          <h2>
            {isDepartment
              ? 'Department operations'
              : isCfo
                ? 'CFO payment signing'
                : 'AP operations'}
          </h2>
          <p className="muted">
            {isDepartment
              ? 'PO submission, document queries, and department-owned AP items.'
              : isCfo
                ? 'Review bank portal payments waiting for CFO authorization.'
              : 'Verification, WHT, payment batches, Xero, approval, and reconciliation controls.'}
          </p>
        </div>
      </section>

      <section className="ops-scope-strip">
        {scopeStages.map((stage) => (
          <article
            className={`ops-scope-step ${
              stage.roles.includes(user.role) ? 'ops-scope-active' : 'ops-scope-muted'
            }`}
            key={stage.label}
          >
            <strong>{stage.label}</strong>
            <span>{stage.owner}</span>
          </article>
        ))}
      </section>

      <section className="ops-metrics">
        <Metric label="Invoices in scope" value={overview?.invoices ?? 0} />
        <Metric label="Open queries" value={overview?.openQueries ?? 0} />
        <Metric label="Pending checks" value={overview?.pendingVerifications ?? 0} />
        {canUsePaymentOps ? (
          <>
            <Metric label="Scheduled pay" value={overview?.scheduledPayments ?? 0} />
            <Metric label="Failed pay" value={overview?.failedPayments ?? 0} />
          </>
        ) : null}
        <Metric label="Unread alerts" value={overview?.unreadNotifications ?? 0} />
      </section>

      <div className="ops-grid">
        <section className="ticket-panel">
          <SectionTitle
            title="Purchase orders"
            subtitle={canCreatePo ? 'Department submission scope' : 'Read-only verification scope'}
          />
          {canCreatePo ? (
            <form onSubmit={submitPo} className="ops-form">
              <input
                placeholder="PO number"
                value={poForm.poNumber}
                onChange={(event) => setPoField('poNumber', event.target.value)}
                required
              />
              <select
                value={isDepartment ? user.departmentId ?? '' : poForm.departmentId}
                onChange={(event) => setPoField('departmentId', event.target.value)}
                required
                disabled={isDepartment}
              >
                <option value="">Department</option>
                {departmentOptions.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <select
                value={poForm.vendorId}
                onChange={(event) => setPoField('vendorId', event.target.value)}
                required
              >
                <option value="">Vendor</option>
                {(meta?.vendors ?? []).map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.displayName}
                  </option>
                ))}
              </select>
              <input
                placeholder="Line description"
                value={poForm.description}
                onChange={(event) => setPoField('description', event.target.value)}
                required
              />
              <input
                type="number"
                min="0"
                step="0.001"
                placeholder="Qty"
                value={poForm.quantity}
                onChange={(event) => setPoField('quantity', event.target.value)}
                required
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit price"
                value={poForm.unitPrice}
                onChange={(event) => setPoField('unitPrice', event.target.value)}
                required
              />
              <button className="btn btn-secondary" disabled={createPo.isPending}>
                Create PO
              </button>
              {createPo.isError ? <p className="error">{apiErrorMessage(createPo.error)}</p> : null}
            </form>
          ) : (
            <p className="ops-note">AP can verify PO data but cannot create department POs.</p>
          )}
          <CompactList
            rows={(purchaseOrders ?? []).map((po) => ({
              id: po.id,
              title: po.poNumber,
              meta: `${po.department.name} / ${po.vendor.displayName}`,
              value: money(po.totalAmount),
            }))}
          />
        </section>

        <section className="ticket-panel">
          <SectionTitle
            title="Queries and exceptions"
            subtitle={isDepartment ? 'Department response scope' : 'Missing-doc escalation scope'}
          />
          <CompactList
            rows={(queries ?? []).map((query) => ({
              id: query.id,
              title: query.queryText,
              meta: query.assignedToDepartment?.name
                ? `${query.assignedToDepartment.name} / ${new Date(query.raisedAt).toLocaleString('en-PK')}`
                : new Date(query.raisedAt).toLocaleString('en-PK'),
              value: human(query.status),
            }))}
          />
        </section>

        {canUsePaymentOps ? (
          <section className="ticket-panel">
            <SectionTitle title="Meezan payment batches" subtitle="Payment disbursement scope" />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => createBatch.mutate()}
              disabled={createBatch.isPending}
            >
              Batch approved invoices
            </button>
            {createBatch.isError ? (
              <p className="error">{apiErrorMessage(createBatch.error)}</p>
            ) : null}
            <div className="ops-list ops-list-spaced">
              {(batches ?? []).map((batch) => (
                <div className="ops-row" key={batch.id}>
                  <span>
                    <strong>{batch.batchNumber}</strong>
                    <small>
                      {human(batch.status)} / {batch.totalCount} payments / {money(batch.totalAmount)}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => exportBatch.mutate(batch.id)}
                  >
                    Export CSV
                  </button>
                </div>
              ))}
            </div>
            {exportedCsv ? <pre className="csv-preview">{exportedCsv}</pre> : null}
          </section>
        ) : null}

        {canUsePaymentOps ? (
          <section className="ticket-panel">
            <SectionTitle title="Tax and GL reference" subtitle="WHT and bookkeeping scope" />
            <CompactList
              rows={(taxCodes ?? []).map((code) => ({
                id: code.id,
                title: `${code.code} / ${code.name}`,
                meta: human(code.type),
                value: `${Number(code.rate)}%`,
              }))}
            />
            <div className="ops-divider" />
            <CompactList
              rows={(glAccounts ?? []).map((account) => ({
                id: account.id,
                title: `${account.accountCode} / ${account.accountName}`,
                meta: account.accountType,
                value: 'GL',
              }))}
            />
          </section>
        ) : null}

        {canManageApprovalMatrix ? (
          <section className="ticket-panel">
            <SectionTitle title="Approval matrix" subtitle="Company authorization scope" />
            <form onSubmit={submitRule} className="ops-form">
              <select
                value={ruleForm.departmentId}
                onChange={(event) => setRuleField('departmentId', event.target.value)}
              >
                <option value="">Global rule</option>
                {(meta?.departments ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={ruleForm.minAmount}
                onChange={(event) => setRuleField('minAmount', event.target.value)}
              />
              <input
                type="number"
                value={ruleForm.maxAmount}
                onChange={(event) => setRuleField('maxAmount', event.target.value)}
              />
              <select
                value={ruleForm.requiredRole}
                onChange={(event) => setRuleField('requiredRole', event.target.value)}
              >
                <option value="DEPT_USER">Department user</option>
                <option value="DEPT_ADMIN">Department head</option>
                <option value="AP_CLERK">AP clerk</option>
                <option value="CFO">CFO</option>
                <option value="COMPANY_ADMIN">Company admin</option>
              </select>
              <input
                type="number"
                min="1"
                value={ruleForm.approvalLevel}
                onChange={(event) => setRuleField('approvalLevel', event.target.value)}
              />
              <button className="btn btn-secondary" disabled={createRule.isPending}>
                Add rule
              </button>
              {createRule.isError ? (
                <p className="error">{apiErrorMessage(createRule.error)}</p>
              ) : null}
            </form>
            <CompactList
              rows={(rules ?? []).map((rule) => ({
                id: rule.id,
                title: `${rule.department?.name ?? 'Global'} / Level ${rule.approvalLevel}`,
                meta: `${money(rule.minAmount)} to ${money(rule.maxAmount)}`,
                value: human(rule.requiredRole),
              }))}
            />
          </section>
        ) : null}

        {canUsePaymentOps ? (
          <section className="ticket-panel">
            <SectionTitle
              title="Xero connection"
              subtitle={canConnectXero ? 'Connection administration scope' : 'Bookkeeping sync scope'}
            />
            {canConnectXero ? (
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => getXeroAuthUrl.mutate()}
                  disabled={getXeroAuthUrl.isPending}
                >
                  Get Xero link
                </button>
                {xeroAuthUrl ? (
                  <a className="btn btn-primary" href={xeroAuthUrl}>
                    Open Xero authorization
                  </a>
                ) : null}
              </div>
            ) : null}
            {(xero ?? []).length ? (
              <CompactList
                rows={(xero ?? []).map((connection) => ({
                  id: connection.id,
                  title: connection.tenantName ?? connection.tenantId,
                  meta: connection.expiresAt
                    ? `Token expires ${new Date(connection.expiresAt).toLocaleString('en-PK')}`
                    : 'No token expiry saved',
                  value: connection.active ? 'active' : 'inactive',
                }))}
              />
            ) : (
              <p className="empty-state">No Xero tenant connected.</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>Current scope</small>
    </article>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="ops-section-title">
      <h3>{title}</h3>
      <span>{subtitle}</span>
    </div>
  );
}

function CompactList({
  rows,
}: {
  rows: Array<{ id: string; title: string; meta: string; value: string }>;
}) {
  if (!rows.length) return <p className="empty-state">No records yet.</p>;
  return (
    <div className="ops-list">
      {rows.map((row) => (
        <div className="ops-row" key={row.id}>
          <span>
            <strong>{row.title}</strong>
            <small>{row.meta}</small>
          </span>
          <em>{row.value}</em>
        </div>
      ))}
    </div>
  );
}
