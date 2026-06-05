import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus } from '@prisma/client';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import {
  hasUsableStripeSecret,
  toStripeMinorUnits,
} from './stripe-amount.util';

const STRIPE_API_VERSION = '2026-04-22.dahlia' as const;
const CHECKOUT_CURRENCY = 'pkr';

type StripeClient = InstanceType<typeof Stripe>;
type CheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['retrieve']>
>;
type CheckoutSessionCreateParams = Parameters<
  StripeClient['checkout']['sessions']['create']
>[0];
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

@Injectable()
export class PaymentsService {
  private stripe: StripeClient;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private invoices: InvoicesService,
  ) {
    const key = config.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.stripe = new Stripe(key || 'sk_test_replace_me', {
      apiVersion: STRIPE_API_VERSION,
    });
  }

  async createCheckoutSession(invoiceId: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!inv) throw new NotFoundException();

    if (inv.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already paid');
    }
    if (
      inv.status !== InvoiceStatus.APPROVED &&
      inv.status !== InvoiceStatus.PAYMENT_INITIATED &&
      inv.status !== InvoiceStatus.PAYMENT_FAILED &&
      inv.status !== InvoiceStatus.PAYMENT_EXPIRED
    ) {
      throw new BadRequestException('Invoice must be approved before payment');
    }

    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!hasUsableStripeSecret(key)) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY in api/.env',
      );
    }

    if (inv.stripeCheckoutSessionId) {
      const existing = await this.retrieveCheckoutSession(
        inv.stripeCheckoutSessionId,
      );
      if (existing?.status === 'open' && existing.url) {
        return {
          url: existing.url,
          sessionId: existing.id,
          status: existing.status,
        };
      }
      if (existing?.status === 'complete') {
        await this.markCompletedSession(existing);
        return { url: null, sessionId: existing.id, status: existing.status };
      }
      if (existing?.status === 'expired') {
        await this.markSessionFailed(
          invoiceId,
          existing.id,
          InvoiceStatus.PAYMENT_EXPIRED,
        );
      }
    }

    let unitAmount: number;
    try {
      unitAmount = toStripeMinorUnits(inv.amountPkr, CHECKOUT_CURRENCY);
    } catch {
      throw new BadRequestException('Invalid invoice amount');
    }

    const frontend = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    const sessionParams: CheckoutSessionCreateParams = {
      mode: 'payment',
      currency: CHECKOUT_CURRENCY,
      client_reference_id: invoiceId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CHECKOUT_CURRENCY,
            unit_amount: unitAmount,
            product_data: {
              name: `Vendor payment - ${inv.reference || invoiceId.slice(0, 8)}`,
              metadata: { invoiceId },
            },
          },
        },
      ],
      metadata: { invoiceId },
      payment_intent_data: {
        metadata: { invoiceId },
      },
      success_url: `${frontend}/payments/success?invoice_id=${invoiceId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/payments/cancel?invoice_id=${invoiceId}`,
    };

    let session: CheckoutSession;
    try {
      session = await this.stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey: `invoice-checkout-${invoiceId}-${inv.updatedAt.getTime()}`,
      });
    } catch (err) {
      throw this.mapStripeCheckoutError(err);
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAYMENT_INITIATED,
        stripeCheckoutSessionId: session.id,
      },
    });

    return { url: session.url, sessionId: session.id, status: session.status };
  }

  async handleStripeWebhook(req: RawBodyRequest<Request>, signature: string | undefined) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not set');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw body for webhook verification');
    }

    let event: StripeEvent;
    try {
      event = this.stripe.webhooks.constructEvent(raw, signature, secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid payload';
      throw new BadRequestException(`Webhook signature verification failed: ${message}`);
    }

    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      await this.markCompletedSession(event.data.object as CheckoutSession);
    }

    if (
      event.type === 'checkout.session.expired' ||
      event.type === 'checkout.session.async_payment_failed'
    ) {
      const session = event.data.object as CheckoutSession;
      const invoiceId = this.getInvoiceId(session);
      if (invoiceId) {
        const status =
          event.type === 'checkout.session.expired'
            ? InvoiceStatus.PAYMENT_EXPIRED
            : InvoiceStatus.PAYMENT_FAILED;
        await this.markSessionFailed(invoiceId, session.id, status);
      }
    }

    return { received: true };
  }

  private async retrieveCheckoutSession(sessionId: string) {
    try {
      return await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return null;
    }
  }

  private mapStripeCheckoutError(err: unknown) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError) {
      const message = err.message.toLowerCase();
      if (
        err.code === 'amount_too_small' ||
        message.includes('at least 50 cents') ||
        message.includes('minimum')
      ) {
        return new BadRequestException(
          "This invoice amount is below Stripe's minimum payment amount. Increase the invoice amount or use another payment method.",
        );
      }
    }

    if (err instanceof Error) {
      return new BadRequestException(err.message);
    }

    return new BadRequestException('Could not start Stripe Checkout.');
  }

  private async markCompletedSession(session: CheckoutSession) {
    const invoiceId = this.getInvoiceId(session);
    if (!invoiceId) return;

    const pi =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.invoices.markPaidFromStripe(invoiceId, session.id, pi);
  }

  private getInvoiceId(session: CheckoutSession) {
    return session.metadata?.invoiceId ?? session.client_reference_id ?? null;
  }

  private async markSessionFailed(
    invoiceId: string,
    sessionId: string,
    status: InvoiceStatus,
  ) {
    await this.prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        status: { in: [InvoiceStatus.PAYMENT_INITIATED, status] },
        stripeCheckoutSessionId: sessionId,
      },
      data: {
        status,
        stripeCheckoutSessionId: null,
      },
    });
  }
}
