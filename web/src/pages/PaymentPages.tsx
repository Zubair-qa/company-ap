import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { api } from '../api/client';

const TEST_CARD_NUMBER = '4242 4242 4242 4242';

type PaymentInvoice = {
  id: string;
  reference: string | null;
  amountPkr: string;
  status: string;
  vendor: { displayName: string } | null;
};

const pkr = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  maximumFractionDigits: 0,
});

export function PaymentSandboxPage() {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice_id') ?? '';
  const sessionId = params.get('session_id') ?? '';
  const navigate = useNavigate();
  const [cardNumber, setCardNumber] = useState(TEST_CARD_NUMBER);
  const [expiry, setExpiry] = useState('12/34');
  const [cvc, setCvc] = useState('123');
  const [error, setError] = useState('');

  const invoice = useQuery({
    queryKey: ['sandbox-payment-invoice', invoiceId],
    enabled: !!invoiceId,
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<PaymentInvoice>(`/api/invoices/${invoiceId}`);
      return data;
    },
  });

  const complete = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/api/payments/invoice/${invoiceId}/sandbox-complete`, {
        cardNumber,
        expiry,
        cvc,
      });
      return data;
    },
    onSuccess: () => {
      navigate(`/payments/success?session_id=${encodeURIComponent(sessionId)}`);
    },
    onError: (err) => {
      setError(readApiError(err) || 'Sandbox payment failed.');
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    complete.mutate();
  }

  if (!invoiceId) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stripe sandbox payment</h2>
        <p className="error">Missing invoice id.</p>
        <Link to="/invoices">Back to invoices</Link>
      </div>
    );
  }

  if (invoice.isLoading) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stripe sandbox payment</h2>
        <p className="muted">Loading invoice...</p>
      </div>
    );
  }

  if (invoice.isError || !invoice.data) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Stripe sandbox payment</h2>
        <p className="error">
          This sandbox link is not attached to a valid invoice. Start from an approved invoice and
          click Pay now again.
        </p>
        <Link to="/invoices">Back to invoices</Link>
      </div>
    );
  }

  const canComplete = invoice.data.status === 'PAYMENT_INITIATED';

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Stripe sandbox payment</h2>
      <p>
        <strong>Invoice:</strong> {invoice.data.reference ?? invoice.data.id.slice(0, 8)}{' '}
        <span className="badge">{invoice.data.status.replaceAll('_', ' ')}</span>
      </p>
      <p>
        <strong>Vendor:</strong> {invoice.data.vendor?.displayName ?? 'Not linked'}
      </p>
      <p>
        <strong>Amount:</strong> {pkr.format(Number(invoice.data.amountPkr))}
      </p>
      <p className="muted">
        Test card <code>{TEST_CARD_NUMBER}</code>, any future expiry, any CVC.
      </p>
      {!canComplete ? (
        <p className="error">
          This invoice is not in payment checkout. Return to the invoice and click Pay now first.
        </p>
      ) : null}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="card-number">Card number</label>
          <input
            id="card-number"
            inputMode="numeric"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="card-expiry">Expiry</label>
          <input
            id="card-expiry"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="card-cvc">CVC</label>
          <input
            id="card-cvc"
            inputMode="numeric"
            value={cvc}
            onChange={(e) => setCvc(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={complete.isPending || !canComplete}
        >
          {complete.isPending ? 'Processing...' : 'Complete test payment'}
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <p className="auth-switch">
        <Link to={`/invoices/${invoiceId}`}>Back to invoice</Link>
      </p>
    </div>
  );
}

function readApiError(err: unknown) {
  if (!axios.isAxiosError(err)) return '';
  const data = err.response?.data as { message?: string | string[] } | undefined;
  if (Array.isArray(data?.message)) return data.message.join(' ');
  return data?.message ?? '';
}

export function PaymentSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Payment started or completed</h2>
      <p className="muted">
        Stripe session: <code>{sessionId ?? '—'}</code>
      </p>
      <p>
        If webhooks are configured, the invoice status updates to <strong>PAID</strong>{' '}
        automatically.
      </p>
      <Link to="/">Back to invoices</Link>
    </div>
  );
}

export function PaymentCancelPage() {
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Payment cancelled</h2>
      <Link to="/">Back to invoices</Link>
    </div>
  );
}
