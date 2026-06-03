import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Trend = 'increase' | 'decrease' | 'flat';
type Classification = 'OPEX' | 'CAPEX';

type FinanceDriver = {
  id: string;
  title: string;
  department: string;
  vendor: string;
  amount: number;
  status: string;
  statusLabel: string;
};

type FinanceVarianceRow = {
  key: string;
  label: string;
  classification?: Classification;
  currentAmount: number;
  previousAmount: number;
  varianceAmount: number;
  variancePercent: number;
  trend: Trend;
  drivers: FinanceDriver[];
};

type FinanceTreeNode = {
  id: string;
  label: string;
  level: 'classification' | 'group' | 'head' | 'item';
  classification?: Classification;
  currentAmount: number;
  previousAmount: number;
  varianceAmount: number;
  variancePercent: number;
  trend: Trend;
  children: FinanceTreeNode[];
};

type PeriodOption = {
  key: string;
  label: string;
};

type FinanceDashboard = {
  generatedAt: string;
  currentMonth: { key: string; label: string };
  previousMonth: { key: string; label: string };
  currentQuarter: { key: string; label: string };
  previousQuarter: { key: string; label: string };
  availableMonths: PeriodOption[];
  availableQuarters: PeriodOption[];
  summary: {
    totalSpend: number;
    previousSpend: number;
    varianceAmount: number;
    variancePercent: number;
    opex: number;
    capex: number;
    openExposure: number;
    paidAmount: number;
    ticketCount: number;
    currentMonthTicketCount: number;
  };
  opexCapex: FinanceVarianceRow[];
  monthlyComparison: FinanceVarianceRow[];
  quarterlyComparison: FinanceVarianceRow[];
  expenseTree: FinanceTreeNode[];
  topMovers: {
    increases: FinanceVarianceRow[];
    decreases: FinanceVarianceRow[];
  };
  insights: Array<{ title: string; severity: string; body: string }>;
};

type Tone = 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'slate';

const pkr = new Intl.NumberFormat('en-PK', {
  maximumFractionDigits: 0,
});

const compactPkr = new Intl.NumberFormat('en-PK', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const monthOptions = [
  { value: '01', label: 'Jan' },
  { value: '02', label: 'Feb' },
  { value: '03', label: 'Mar' },
  { value: '04', label: 'Apr' },
  { value: '05', label: 'May' },
  { value: '06', label: 'Jun' },
  { value: '07', label: 'Jul' },
  { value: '08', label: 'Aug' },
  { value: '09', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

const quarterOptions = [
  { value: 'Q1', label: 'Q1' },
  { value: 'Q2', label: 'Q2' },
  { value: 'Q3', label: 'Q3' },
  { value: 'Q4', label: 'Q4' },
];

function money(amount: number) {
  return `PKR ${pkr.format(Math.round(amount || 0))}`;
}

function compactMoney(amount: number) {
  return `PKR ${compactPkr.format(Math.round(amount || 0))}`;
}

function signedMoney(amount: number) {
  if (Math.abs(amount) < 1) return money(0);
  const sign = amount > 0 ? '+' : '-';
  return `${sign}${money(Math.abs(amount))}`;
}

function percent(value: number) {
  if (Math.abs(value) < 0.01) return '0%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function trendClass(trend: Trend) {
  if (trend === 'increase') return 'trend-up';
  if (trend === 'decrease') return 'trend-down';
  return 'trend-flat';
}

function roleLabel(role: string) {
  if (role === 'AP_CLERK') return 'AP Finance';
  return role.replaceAll('_', ' ');
}

function yearFromPeriodKey(key: string) {
  const year = Number(key.slice(0, 4));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function buildYearRange(data: FinanceDashboard) {
  const years = [
    ...data.availableMonths.map((item) => yearFromPeriodKey(item.key)),
    ...data.availableQuarters.map((item) => yearFromPeriodKey(item.key)),
    yearFromPeriodKey(data.currentMonth.key),
    yearFromPeriodKey(data.previousMonth.key),
    yearFromPeriodKey(data.currentQuarter.key),
    yearFromPeriodKey(data.previousQuarter.key),
    new Date().getFullYear(),
  ];
  const minYear = Math.min(...years) - 1;
  const maxYear = Math.max(...years) + 1;
  return Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);
}

function buildMonthYearOptions(data: FinanceDashboard): PeriodOption[] {
  return buildYearRange(data).flatMap((year) =>
    monthOptions
      .slice()
      .reverse()
      .map((month) => ({
        key: `${year}-${month.value}`,
        label: `${month.label} ${year}`,
      })),
  );
}

function buildQuarterYearOptions(data: FinanceDashboard): PeriodOption[] {
  return buildYearRange(data).flatMap((year) =>
    quarterOptions
      .slice()
      .reverse()
      .map((quarter) => ({
        key: `${year}-${quarter.value}`,
        label: `${quarter.label} ${year}`,
      })),
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState('');
  const [compareMonth, setCompareMonth] = useState('');
  const [quarter, setQuarter] = useState('');
  const [compareQuarter, setCompareQuarter] = useState('');
  const canViewDashboard = user?.role === 'AP_CLERK' || user?.role === 'CFO';
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  if (compareMonth) params.set('compareMonth', compareMonth);
  if (quarter) params.set('quarter', quarter);
  if (compareQuarter) params.set('compareQuarter', compareQuarter);
  const dashboardQuery = params.toString();
  const { data, isLoading, error } = useQuery({
    queryKey: ['finance-dashboard', month, compareMonth, quarter, compareQuarter],
    enabled: Boolean(canViewDashboard),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const url = dashboardQuery
        ? `/api/tickets/finance-dashboard?${dashboardQuery}`
        : '/api/tickets/finance-dashboard';
      const { data } = await api.get<FinanceDashboard>(url);
      return data;
    },
  });

  if (!user) return null;

  if (!canViewDashboard) {
    return (
      <div className="dashboard-page finance-dashboard">
        <section className="dashboard-hero finance-hero">
          <div>
            <p className="eyebrow">Restricted reporting</p>
            <h2>Finance dashboard</h2>
            <p className="dashboard-subtitle">
              This dashboard is available only to AP Finance and CFO users.
            </p>
          </div>
          <Link to="/" className="btn btn-secondary">
            Back to board
          </Link>
        </section>
      </div>
    );
  }

  if (isLoading) {
    return <p className="muted">Loading finance dashboard...</p>;
  }

  if (error || !data) {
    return <p className="error">Finance dashboard could not be loaded.</p>;
  }

  const splitTotal = Math.max(1, data.summary.opex + data.summary.capex);
  const opexShare = (data.summary.opex / splitTotal) * 100;
  const capexShare = (data.summary.capex / splitTotal) * 100;
  const selectedMonth = month || data.currentMonth.key;
  const selectedCompareMonth = compareMonth || data.previousMonth.key;
  const selectedQuarter = quarter || data.currentQuarter.key;
  const selectedCompareQuarter = compareQuarter || data.previousQuarter.key;
  const selectableMonths = buildMonthYearOptions(data);
  const selectableQuarters = buildQuarterYearOptions(data);
  const resetPeriods = () => {
    setMonth('');
    setCompareMonth('');
    setQuarter('');
    setCompareQuarter('');
  };

  return (
    <div className="dashboard-page finance-dashboard" data-testid="finance-dashboard">
      <section className="dashboard-hero finance-hero">
        <div>
          <p className="eyebrow">Finance analytics</p>
          <h2>Expense monitoring dashboard</h2>
          <p className="dashboard-subtitle">
            {roleLabel(user.role)} view for month-to-month, QTR variance, OPEX/CAPEX,
            and expense drill-downs.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <span className="scope-pill">{data.currentMonth.label}</span>
          <span className="scope-pill">{data.currentQuarter.label}</span>
          <span className="scope-pill">{data.summary.ticketCount} AP tickets</span>
        </div>
      </section>

      <section className="dashboard-panel finance-filter-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Period controls</p>
            <h3>Select reporting periods</h3>
          </div>
          <button type="button" className="btn btn-secondary" onClick={resetPeriods}>
            Reset current
          </button>
        </div>
        <div className="period-filter-grid">
          <PeriodSelect
            label="Month"
            value={selectedMonth}
            options={selectableMonths}
            onChange={setMonth}
          />
          <PeriodSelect
            label="Compare month"
            value={selectedCompareMonth}
            options={selectableMonths}
            onChange={setCompareMonth}
          />
          <PeriodSelect
            label="Quarter"
            value={selectedQuarter}
            options={selectableQuarters}
            onChange={setQuarter}
          />
          <PeriodSelect
            label="Compare quarter"
            value={selectedCompareQuarter}
            options={selectableQuarters}
            onChange={setCompareQuarter}
          />
        </div>
      </section>

      <section className="metric-grid" aria-label="Finance metrics">
        <MetricCard
          label="Current month spend"
          value={money(data.summary.totalSpend)}
          detail={`${signedMoney(data.summary.varianceAmount)} vs ${data.previousMonth.label}`}
          tone={data.summary.varianceAmount > 0 ? 'amber' : 'emerald'}
        />
        <MetricCard
          label="OPEX"
          value={money(data.summary.opex)}
          detail={`${opexShare.toFixed(0)}% of current month`}
          tone="cyan"
        />
        <MetricCard
          label="CAPEX"
          value={money(data.summary.capex)}
          detail={`${capexShare.toFixed(0)}% of current month`}
          tone="indigo"
        />
        <MetricCard
          label="Open exposure"
          value={money(data.summary.openExposure)}
          detail={`${money(data.summary.paidAmount)} paid/executed`}
          tone="rose"
        />
      </section>

      <div className="finance-dashboard-grid">
        <ComparisonPanel
          title="Month-to-month comparison"
          eyebrow={`${data.currentMonth.label} vs ${data.previousMonth.label}`}
          rows={data.monthlyComparison.slice(0, 8)}
          currentLabel={data.currentMonth.label}
          previousLabel={data.previousMonth.label}
        />
        <ComparisonPanel
          title="Quarter-to-quarter comparison"
          eyebrow={`${data.currentQuarter.label} vs ${data.previousQuarter.label}`}
          rows={data.quarterlyComparison.slice(0, 8)}
          currentLabel={data.currentQuarter.label}
          previousLabel={data.previousQuarter.label}
        />
      </div>

      <div className="finance-dashboard-grid finance-dashboard-grid-secondary">
        <section className="dashboard-panel finance-split-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OPEX and CAPEX</p>
              <h3>Expense classification</h3>
            </div>
          </div>
          <div className="split-bar" aria-label="OPEX and CAPEX split">
            <span className="split-opex" style={{ width: `${opexShare}%` }} />
            <span className="split-capex" style={{ width: `${capexShare}%` }} />
          </div>
          <div className="split-legend">
            {data.opexCapex.map((item) => (
              <div key={item.key} className="split-card">
                <span className={`classification-dot ${item.key.toLowerCase()}`} />
                <div>
                  <strong>{item.label}</strong>
                  <small>
                    {money(item.currentAmount)} / {signedMoney(item.varianceAmount)} (
                    {percent(item.variancePercent)})
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Variance reasoning</p>
              <h3>AI-ready finance insights</h3>
            </div>
          </div>
          {data.insights.length ? (
            <div className="insight-list">
              {data.insights.map((insight) => (
                <article className={`insight-card insight-${insight.severity}`} key={insight.title}>
                  <strong>{insight.title}</strong>
                  <p>{insight.body}</p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState message="No major variance insight yet." />
          )}
        </section>
      </div>

      <section className="dashboard-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Hierarchical drill-down</p>
            <h3>Expense tree by category, head, and ticket</h3>
          </div>
        </div>
        {data.expenseTree.length ? (
          <div className="expense-tree">
            {data.expenseTree.map((node) => (
              <ExpenseTreeNodeView key={node.id} node={node} />
            ))}
          </div>
        ) : (
          <EmptyState message="No expense tree data available for the selected periods." />
        )}
      </section>
    </div>
  );
}

function PeriodSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PeriodOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="period-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option value={option.key} key={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

function ComparisonPanel({
  title,
  eyebrow,
  rows,
  currentLabel,
  previousLabel,
}: {
  title: string;
  eyebrow: string;
  rows: FinanceVarianceRow[];
  currentLabel: string;
  previousLabel: string;
}) {
  const maxAmount = Math.max(
    1,
    ...rows.flatMap((row) => [row.currentAmount, row.previousAmount]),
  );

  return (
    <section className="dashboard-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
        </div>
      </div>
      {rows.length ? (
        <div className="variance-list">
          {rows.map((row) => (
            <article className="variance-row" key={`${title}-${row.key}`}>
              <div className="variance-row-main">
                <span>
                  <strong>{row.label}</strong>
                  <small>{row.classification ?? 'Expense head'}</small>
                </span>
                <span className={`variance-pill ${trendClass(row.trend)}`}>
                  {signedMoney(row.varianceAmount)} / {percent(row.variancePercent)}
                </span>
              </div>
              <div className="variance-bars" aria-hidden="true">
                <span
                  className="variance-current"
                  style={{ width: `${Math.max(3, (row.currentAmount / maxAmount) * 100)}%` }}
                />
                <span
                  className="variance-previous"
                  style={{ width: `${Math.max(3, (row.previousAmount / maxAmount) * 100)}%` }}
                />
              </div>
              <div className="variance-meta">
                <span>
                  {currentLabel}: <strong>{compactMoney(row.currentAmount)}</strong>
                </span>
                <span>
                  {previousLabel}: <strong>{compactMoney(row.previousAmount)}</strong>
                </span>
              </div>
              <DriverStrip drivers={row.drivers} />
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="No comparison data for this period yet." />
      )}
    </section>
  );
}

function DriverStrip({ drivers }: { drivers: FinanceDriver[] }) {
  if (!drivers.length) return null;
  return (
    <div className="driver-strip">
      {drivers.map((driver) => (
        <Link to={`/tickets/${driver.id}`} key={driver.id}>
          <strong>{driver.department}</strong>
          <span>
            {driver.vendor} / {compactMoney(driver.amount)}
          </span>
        </Link>
      ))}
    </div>
  );
}

function ExpenseTreeNodeView({ node }: { node: FinanceTreeNode }) {
  const ticketId = node.level === 'item' && node.id.startsWith('item-') ? node.id.slice(5) : null;
  const content = (
    <>
      <span className="tree-node-title">
        <strong>{node.label}</strong>
        <small>{node.classification ?? node.level}</small>
      </span>
      <span className="tree-node-values">
        <strong>{money(node.currentAmount)}</strong>
        <small className={trendClass(node.trend)}>
          {signedMoney(node.varianceAmount)} / {percent(node.variancePercent)}
        </small>
      </span>
    </>
  );

  if (node.level === 'item') {
    return ticketId ? (
      <Link className="tree-node tree-node-item" to={`/tickets/${ticketId}`}>
        {content}
      </Link>
    ) : (
      <div className="tree-node tree-node-item">{content}</div>
    );
  }

  return (
    <details className={`tree-node tree-node-${node.level}`} open={node.level === 'classification'}>
      <summary>{content}</summary>
      {node.children.length ? (
        <div className="tree-children">
          {node.children.map((child) => (
            <ExpenseTreeNodeView key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="empty-state">{message}</p>;
}
