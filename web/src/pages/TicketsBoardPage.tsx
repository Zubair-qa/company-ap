import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

type Department = { id: string; name: string };
type Vendor = { id: string; displayName: string; kind: string };
type Assignee = { id: string; name: string; email: string; role: string };

type Ticket = {
  id: string;
  title: string;
  status: string;
  priority: string;
  requesterName: string | null;
  department: Department;
  assignedTo: Assignee | null;
  vendor: Vendor | null;
  vendorNameSnapshot: string | null;
  invoiceNumber: string | null;
  internalReference: string | null;
  amountPkr: string;
  paymentMethod: string;
  documentStatus: string;
  missingDocuments: string[];
  dueDate: string | null;
  expenseNature: string;
  billType: string;
  xeroSyncStatus: string;
  bankPaymentStatus: string;
  whtFilerStatus: string;
  statusLabel?: string;
  availableTransitions?: string[];
};

type BoardColumn = {
  id: string;
  label: string;
  scope: string;
  statuses: string[];
  tickets: Ticket[];
};

type Meta = {
  departments: Department[];
  vendors: Vendor[];
  assignees: Assignee[];
  boardStatuses: string[];
  statusLabels?: Record<string, string>;
};

type Notice = {
  type: 'success' | 'error';
  message: string;
};

const statusLabels: Record<string, string> = {
  NEW_REQUEST: 'New request',
  DEPARTMENT_HEAD_APPROVAL: 'Department head approval',
  DOCS_REVIEW: 'Docs review',
  MISSING_DOCS: 'Missing docs',
  REQUESTER_PINGED: 'Requester pinged',
  WAITING_FOR_DOCS: 'Waiting docs',
  VENDOR_PO_ACCOUNT_VERIFICATION: 'Vendor / PO / account',
  WHT_CALCULATION: 'WHT calculation',
  VOUCHER_GENERATION: 'Voucher',
  XERO_BILL_ENTRY: 'Xero bill',
  PAYMENT_PREPARATION: 'Payment prep',
  BANK_UPLOAD: 'Bank upload',
  CFO_SIGN_PENDING: 'CFO sign',
  BANK_EXECUTION_PENDING: 'Bank execution',
  BANK_EXECUTED: 'Bank executed',
  MARKED_PAID_IN_XERO: 'Paid in Xero',
  REQUESTER_NOTIFIED: 'Requester notified',
  PAYMENT_COMPLETE: 'Complete',
};

const priorityLabels: Record<string, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  URGENT: 'Urgent',
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

const compactDate = new Intl.DateTimeFormat('en-PK', {
  day: '2-digit',
  month: 'short',
});

function human(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}

function money(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount) ? pkr.format(amount) : 'PKR 0';
}

function dueLabel(value: string | null) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';
  return compactDate.format(date);
}

function isOverdue(ticket: Ticket) {
  if (!ticket.dueDate || ticket.status === 'PAYMENT_COMPLETE') return false;
  return new Date(ticket.dueDate).getTime() < Date.now();
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

export function TicketsBoardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const scopeKey = user?.id ?? 'anonymous';

  const { data: board, isLoading, error } = useQuery({
    queryKey: ['tickets', 'board', scopeKey],
    queryFn: async () => {
      const { data } = await api.get<BoardColumn[]>('/api/tickets/board');
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

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data } = await api.patch<Ticket>(`/api/tickets/${id}`, { status });
      return data;
    },
    onSuccess: (_updated, variables) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      setNotice({
        type: 'success',
        message: `Ticket moved to ${labelForStatus(variables.status)} successfully.`,
      });
    },
    onError: (mutationError) => {
      setNotice({ type: 'error', message: apiErrorMessage(mutationError) });
    },
  });

  function labelForStatus(status: string) {
    return meta?.statusLabels?.[status] ?? statusLabels[status] ?? human(status);
  }

  const columns = useMemo(() => {
    const term = query.trim().toLowerCase();
    const source = board ?? [];
    if (!term) return source;
    return source.map((column) => ({
      ...column,
      tickets: column.tickets.filter((ticket) =>
        [
          ticket.title,
          ticket.department.name,
          ticket.vendor?.displayName,
          ticket.vendorNameSnapshot,
          ticket.invoiceNumber,
          ticket.internalReference,
          ticket.assignedTo?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term),
      ),
    }));
  }, [board, query]);

  if (!user) return null;

  return (
    <div className="tickets-page">
      <section className="board-hero">
        <div>
          <p className="eyebrow">Central AP workflow</p>
          <h2>Payment board</h2>
          <p className="muted">
            {user.role === 'CFO'
              ? 'Open CFO sign pending tickets, verify the bank portal payment, then hand execution back to AP.'
              : user.role === 'DEPT_ADMIN'
                ? 'Review department requests waiting for head approval. Open a card to approve or reject with a reason.'
              : 'Track every request from department submission to Xero, bank portal, and completion.'}
          </p>
        </div>
        <div className="board-toolbar">
          <input
            aria-label="Search tickets"
            placeholder="Search tickets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </section>

      {notice ? (
        <div className={`notice notice-${notice.type}`} role="status">
          {notice.message}
        </div>
      ) : null}

      {isLoading ? <p className="muted">Loading board...</p> : null}
      {error ? <p className="error">Failed to load payment board.</p> : null}

      <div className="kanban-board" aria-label="Payment ticket board">
        {columns.map((column) => (
          <section className="kanban-column" key={column.id}>
            <header>
              <span>
                <strong>{column.label}</strong>
                <small>{column.scope}</small>
              </span>
              <span>{column.tickets.length}</span>
            </header>
            <div className="kanban-list">
              {column.tickets.map((ticket) => (
                <article
                  className={`ticket-card ${isOverdue(ticket) ? 'ticket-card-overdue' : ''}`}
                  key={ticket.id}
                >
                  <div className="ticket-card-top">
                    <span className={`priority-pill priority-${ticket.priority.toLowerCase()}`}>
                      {priorityLabels[ticket.priority] ?? human(ticket.priority)}
                    </span>
                    <span className="ticket-due">{dueLabel(ticket.dueDate)}</span>
                  </div>
                  <Link to={`/tickets/${ticket.id}`} className="ticket-title">
                    {ticket.title}
                  </Link>
                  <p className="ticket-meta">
                    {ticket.department.name} /{' '}
                    {ticket.vendor?.displayName ?? ticket.vendorNameSnapshot ?? 'Vendor pending'}
                  </p>
                  <div className="ticket-card-grid">
                    <span>{money(ticket.amountPkr)}</span>
                    <span>{human(ticket.paymentMethod)}</span>
                    <span>{ticket.assignedTo?.name ?? 'Unassigned'}</span>
                    <span>{human(ticket.expenseNature)}</span>
                  </div>
                  <div className="ticket-badges">
                    <span className="badge badge-slate">
                      {ticket.statusLabel ?? labelForStatus(ticket.status)}
                    </span>
                    <span className={`badge doc-${ticket.documentStatus.toLowerCase()}`}>
                      {human(ticket.documentStatus)}
                    </span>
                    <span className="badge">{human(ticket.xeroSyncStatus)}</span>
                    <span className="badge">{human(ticket.bankPaymentStatus)}</span>
                    <span className="badge">{human(ticket.whtFilerStatus)}</span>
                  </div>
                  {ticket.missingDocuments.length ? (
                    <p className="missing-line">
                      Missing: {ticket.missingDocuments.slice(0, 2).join(', ')}
                    </p>
                  ) : null}
                  {(ticket.availableTransitions ?? []).length ? (
                    <select
                      className="status-move"
                      value=""
                      disabled={updateStatus.isPending}
                      onChange={(event) => {
                        if (event.target.value) {
                          setNotice(null);
                          updateStatus.mutate({ id: ticket.id, status: event.target.value });
                        }
                      }}
                    >
                      <option value="">Move to next scope step</option>
                      {(ticket.availableTransitions ?? []).map((status) => (
                        <option key={status} value={status}>
                          {labelForStatus(status)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="status-locked">No permitted move</span>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
