import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export function PaymentSuccessPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  const invoiceId = params.get('invoice_id');
  const invoicePath = invoiceId ? `/invoices/${invoiceId}` : '/invoices';

  useEffect(() => {
    const timer = window.setTimeout(() => navigate(invoicePath), 2500);
    return () => window.clearTimeout(timer);
  }, [invoicePath, navigate]);

  return (
    <PaymentStatusShell
      eyebrow="Stripe Checkout"
      title="Payment is processing"
      description="Stripe has accepted the payment attempt. The invoice will update as soon as the webhook confirms the final status."
      tone="processing"
      sessionId={sessionId}
      invoicePath={invoicePath}
      actionLabel="Return to invoice"
    />
  );
}

export function PaymentCancelPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice_id');
  const invoicePath = invoiceId ? `/invoices/${invoiceId}` : '/invoices';

  useEffect(() => {
    const timer = window.setTimeout(() => navigate(invoicePath), 2500);
    return () => window.clearTimeout(timer);
  }, [invoicePath, navigate]);

  return (
    <PaymentStatusShell
      eyebrow="Stripe Checkout"
      title="Payment cancelled"
      description="No payment was captured. You can return to the invoice and start a new checkout when ready."
      tone="cancelled"
      invoicePath={invoicePath}
      actionLabel="Back to invoice"
    />
  );
}

function PaymentStatusShell({
  eyebrow,
  title,
  description,
  tone,
  sessionId,
  invoicePath,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  tone: 'processing' | 'cancelled';
  sessionId?: string | null;
  invoicePath: string;
  actionLabel: string;
}) {
  return (
    <section className="payment-status-page">
      <div className={`payment-status-card payment-status-${tone}`}>
        <div className="payment-status-icon" aria-hidden="true">
          {tone === 'processing' ? '✓' : '!'}
        </div>
        <div className="payment-status-content">
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          <p className="payment-status-description">{description}</p>
          {sessionId ? (
            <div className="payment-session">
              <span>Session</span>
              <code>{sessionId}</code>
            </div>
          ) : null}
          <div className="payment-status-actions">
            <Link to={invoicePath} className="btn btn-primary">
              {actionLabel}
            </Link>
            <span className="muted">Returning automatically...</span>
          </div>
        </div>
      </div>
    </section>
  );
}
