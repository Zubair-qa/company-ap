import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import {
  ApOpsController,
  ApprovalMatrixController,
  AuditLogsController,
  NotificationsController,
  PaymentBatchesController,
  PurchaseOrdersController,
  QueriesController,
  ReconciliationsController,
  ReferenceDataController,
  SupportingDocumentsController,
  VerificationsController,
  XeroController,
} from './full-scope.controller';
import { FullScopeService } from './full-scope.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    ApOpsController,
    PurchaseOrdersController,
    SupportingDocumentsController,
    VerificationsController,
    QueriesController,
    ApprovalMatrixController,
    PaymentBatchesController,
    ReconciliationsController,
    ReferenceDataController,
    AuditLogsController,
    NotificationsController,
    XeroController,
  ],
  providers: [FullScopeService],
})
export class FullScopeModule {}
