import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import Stripe from 'stripe';
import { InvoiceStatus } from '../common/domain';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';

const STRIPE_API_VERSION = '2026-04-22.dahlia' as const;

type StripeClient = InstanceType<typeof Stripe>;

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
    if (inv.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException('Invoice must be approved before payment');
    }

    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!key || key.includes('replace_me')) {
      throw new BadRequestException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY in api/.env',
      );
    }

    const rupees = Number(inv.amountPkr);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      throw new BadRequestException('Invalid invoice amount');
    }

    const unitAmount = Math.round(rupees);
    const frontend = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      currency: 'pkr',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'pkr',
            unit_amount: unitAmount,
            product_data: {
              name: `Vendor payment — ${inv.reference || invoiceId.slice(0, 8)}`,
              metadata: { invoiceId },
            },
          },
        },
      ],
      metadata: { invoiceId },
      success_url: `${frontend}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/payments/cancel`,
    });

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAYMENT_INITIATED,
        stripeCheckoutSessionId: session.id,
      },
    });

    return { url: session.url, sessionId: session.id };
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

    let event;
    try {
      event = this.stripe.webhooks.constructEvent(raw, signature, secret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid payload';
      throw new BadRequestException(`Webhook signature verification failed: ${message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id: string;
        metadata?: { invoiceId?: string } | null;
        payment_intent?: string | { id: string } | null;
      };
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId) {
        const pi =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        await this.invoices.markPaidFromStripe(invoiceId, session.id, pi);
      }
    }

    return { received: true };
  }
}
