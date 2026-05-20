"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_1 = require("@prisma/client");
const stripe_1 = __importDefault(require("stripe"));
const prisma_service_1 = require("../prisma/prisma.service");
const invoices_service_1 = require("../invoices/invoices.service");
const STRIPE_API_VERSION = '2026-04-22.dahlia';
let PaymentsService = class PaymentsService {
    config;
    prisma;
    invoices;
    stripe;
    constructor(config, prisma, invoices) {
        this.config = config;
        this.prisma = prisma;
        this.invoices = invoices;
        const key = config.get('STRIPE_SECRET_KEY') ?? '';
        this.stripe = new stripe_1.default(key || 'sk_test_replace_me', {
            apiVersion: STRIPE_API_VERSION,
        });
    }
    async createCheckoutSession(invoiceId) {
        const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv)
            throw new common_1.NotFoundException();
        if (inv.status !== client_1.InvoiceStatus.APPROVED) {
            throw new common_1.BadRequestException('Invoice must be approved before payment');
        }
        const key = this.config.get('STRIPE_SECRET_KEY');
        if (!key || key.includes('replace_me')) {
            if (this.isSandboxMode()) {
                return this.createSandboxCheckoutSession(invoiceId);
            }
            throw new common_1.BadRequestException('Stripe is not configured. Set STRIPE_SECRET_KEY in api/.env or enable STRIPE_SANDBOX_MODE=true');
        }
        const rupees = Number(inv.totalAmountPkr);
        if (!Number.isFinite(rupees) || rupees <= 0) {
            throw new common_1.BadRequestException('Invalid invoice amount');
        }
        const unitAmount = Math.round(rupees);
        const frontend = this.config.get('FRONTEND_URL') || 'http://localhost:5173';
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
                status: client_1.InvoiceStatus.PAYMENT_INITIATED,
                stripeCheckoutSessionId: session.id,
            },
        });
        return { url: session.url, sessionId: session.id };
    }
    async completeSandboxPayment(invoiceId, dto) {
        if (!this.isSandboxMode()) {
            throw new common_1.BadRequestException('Stripe sandbox mode is not enabled');
        }
        const cardNumber = (dto.cardNumber ?? '').replace(/\D/g, '');
        if (cardNumber !== '4242424242424242') {
            throw new common_1.BadRequestException('Use Stripe test card 4242 4242 4242 4242');
        }
        if (!dto.expiry || !dto.cvc) {
            throw new common_1.BadRequestException('Expiry and CVC are required for sandbox payment');
        }
        const inv = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!inv)
            throw new common_1.NotFoundException();
        if (inv.status !== client_1.InvoiceStatus.PAYMENT_INITIATED) {
            throw new common_1.BadRequestException('Invoice payment has not been initiated');
        }
        return this.invoices.markPaidFromStripe(invoiceId, inv.stripeCheckoutSessionId || `cs_test_sandbox_${invoiceId}`, `pi_test_sandbox_${Date.now()}`);
    }
    async handleStripeWebhook(req, signature) {
        const secret = this.config.get('STRIPE_WEBHOOK_SECRET');
        if (!secret) {
            throw new common_1.BadRequestException('STRIPE_WEBHOOK_SECRET is not set');
        }
        if (!signature) {
            throw new common_1.BadRequestException('Missing stripe-signature header');
        }
        const raw = req.rawBody;
        if (!raw) {
            throw new common_1.BadRequestException('Missing raw body for webhook verification');
        }
        let event;
        try {
            event = this.stripe.webhooks.constructEvent(raw, signature, secret);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Invalid payload';
            throw new common_1.BadRequestException(`Webhook signature verification failed: ${message}`);
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const invoiceId = session.metadata?.invoiceId;
            if (invoiceId) {
                const pi = typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null;
                await this.invoices.markPaidFromStripe(invoiceId, session.id, pi);
            }
        }
        return { received: true };
    }
    async createSandboxCheckoutSession(invoiceId) {
        const sessionId = `cs_test_sandbox_${Date.now()}`;
        const frontend = this.config.get('FRONTEND_URL') || 'http://localhost:5173';
        await this.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
                status: client_1.InvoiceStatus.PAYMENT_INITIATED,
                stripeCheckoutSessionId: sessionId,
            },
        });
        const url = new URL('/payments/sandbox', frontend);
        url.searchParams.set('invoice_id', invoiceId);
        url.searchParams.set('session_id', sessionId);
        return { url: url.toString(), sessionId };
    }
    isSandboxMode() {
        return this.config.get('STRIPE_SANDBOX_MODE') === 'true';
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService,
        invoices_service_1.InvoicesService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map