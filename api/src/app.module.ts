import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { DepartmentsModule } from './departments/departments.module';
import { VendorsModule } from './vendors/vendors.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { PaymentsModule } from './payments/payments.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { TicketsModule } from './tickets/tickets.module';
import { FullScopeModule } from './full-scope/full-scope.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DepartmentsModule,
    VendorsModule,
    InvoicesModule,
    TicketsModule,
    ApprovalsModule,
    PaymentsModule,
    FullScopeModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
