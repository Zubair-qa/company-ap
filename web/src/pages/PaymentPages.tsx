import { Link } from 'react-router-dom';

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
