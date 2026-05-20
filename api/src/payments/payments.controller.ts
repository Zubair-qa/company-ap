import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../common/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  @Public()
  @Post('stripe/webhook')
  stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.payments.handleStripeWebhook(req, signature);
  }

  @Post('invoice/:invoiceId/checkout')
  @UseGuards(RolesGuard)
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  createCheckout(@Param('invoiceId') invoiceId: string) {
    return this.payments.createCheckoutSession(invoiceId);
  }

  @Post('invoice/:invoiceId/sandbox-complete')
  @UseGuards(RolesGuard)
  @Roles(Role.COMPANY_ADMIN, Role.AP_CLERK)
  completeSandboxPayment(
    @Param('invoiceId') invoiceId: string,
    @Body() body: { cardNumber?: string; expiry?: string; cvc?: string },
  ) {
    return this.payments.completeSandboxPayment(invoiceId, body);
  }
}
