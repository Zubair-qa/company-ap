-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('NEW_REQUEST', 'DOCS_REVIEW', 'MISSING_DOCS', 'REQUESTER_PINGED', 'WAITING_FOR_DOCS', 'VENDOR_PO_ACCOUNT_VERIFICATION', 'WHT_CALCULATION', 'VOUCHER_GENERATION', 'XERO_BILL_ENTRY', 'PAYMENT_PREPARATION', 'BANK_UPLOAD', 'CFO_SIGN_PENDING', 'BANK_EXECUTION_PENDING', 'BANK_EXECUTED', 'MARKED_PAID_IN_XERO', 'REQUESTER_NOTIFIED', 'PAYMENT_COMPLETE');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ExpenseNature" AS ENUM ('REPAIR_MAINTENANCE', 'UTILITIES', 'OFFICE_SUPPLIES', 'PROFESSIONAL_SERVICES', 'SOFTWARE_CLOUD', 'TRAVEL', 'CAPEX', 'OTHER');

-- CreateEnum
CREATE TYPE "BillType" AS ENUM ('STANDARD_INVOICE', 'PROFORMA', 'ADVANCE_PARTIAL', 'FINAL_PARTIAL', 'REIMBURSEMENT', 'CASH_SLIP', 'EMAIL_INVOICE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_PORTAL', 'CHEQUE', 'CASH');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING_REVIEW', 'COMPLETE', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "AccountVerificationStatus" AS ENUM ('NOT_CHECKED', 'MATCHED', 'INVOICE_MISSING_VERIFIED_FROM_SHEET', 'MISMATCH', 'NEEDS_MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "XeroSyncStatus" AS ENUM ('NOT_READY', 'READY_TO_SYNC', 'BILL_CREATED', 'SYNC_FAILED', 'PAID_MARKED');

-- CreateEnum
CREATE TYPE "BankPaymentStatus" AS ENUM ('NOT_READY', 'READY_FOR_UPLOAD', 'UPLOADED', 'CFO_SIGNED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "FilerStatus" AS ENUM ('FILER', 'NON_FILER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "PaymentTicket" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'NEW_REQUEST',
    "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "departmentId" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "submittedToFinanceAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "expenseNature" "ExpenseNature" NOT NULL DEFAULT 'OTHER',
    "billType" "BillType" NOT NULL DEFAULT 'STANDARD_INVOICE',
    "vendorId" TEXT,
    "vendorNameSnapshot" TEXT,
    "purchaseOrderNumber" TEXT,
    "purchaseOrderRequired" BOOLEAN NOT NULL DEFAULT true,
    "purchaseOrderVerified" BOOLEAN NOT NULL DEFAULT false,
    "invoiceNumber" TEXT,
    "internalReference" TEXT,
    "amountPkr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK_PORTAL',
    "vendorAccountNumber" TEXT,
    "invoiceAccountNumber" TEXT,
    "accountVerificationStatus" "AccountVerificationStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "accountVerificationSource" TEXT,
    "documentStatus" "DocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "missingDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "xeroSyncStatus" "XeroSyncStatus" NOT NULL DEFAULT 'NOT_READY',
    "xeroContactId" TEXT,
    "xeroBillId" TEXT,
    "xeroBillNumber" TEXT,
    "xeroPaymentId" TEXT,
    "xeroLastSyncedAt" TIMESTAMP(3),
    "xeroError" TEXT,
    "whtFilerStatus" "FilerStatus" NOT NULL DEFAULT 'UNKNOWN',
    "whtRate" DECIMAL(5,2),
    "whtAmountPkr" DECIMAL(14,2),
    "netPayablePkr" DECIMAL(14,2),
    "voucherNumber" TEXT,
    "voucherGeneratedAt" TIMESTAMP(3),
    "bankPaymentStatus" "BankPaymentStatus" NOT NULL DEFAULT 'NOT_READY',
    "bankPortalReference" TEXT,
    "bankUploadedAt" TIMESTAMP(3),
    "cfoSignedAt" TIMESTAMP(3),
    "bankExecutedAt" TIMESTAMP(3),
    "requesterNotifiedAt" TIMESTAMP(3),
    "trelloCardId" TEXT,
    "trelloUrl" TEXT,
    "legacySheetRowId" TEXT,
    "legacySheetName" TEXT,
    "oldReference" TEXT,
    "parentTicketId" TEXT,
    "invoiceId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketActivity" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fromStatus" "TicketStatus",
    "toStatus" "TicketStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTicket_invoiceId_key" ON "PaymentTicket"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentTicket_status_priority_idx" ON "PaymentTicket"("status", "priority");

-- CreateIndex
CREATE INDEX "PaymentTicket_departmentId_idx" ON "PaymentTicket"("departmentId");

-- CreateIndex
CREATE INDEX "PaymentTicket_assignedToId_idx" ON "PaymentTicket"("assignedToId");

-- CreateIndex
CREATE INDEX "PaymentTicket_dueDate_idx" ON "PaymentTicket"("dueDate");

-- CreateIndex
CREATE INDEX "PaymentTicket_vendorId_idx" ON "PaymentTicket"("vendorId");

-- CreateIndex
CREATE INDEX "TicketActivity_ticketId_createdAt_idx" ON "TicketActivity"("ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentTicket" ADD CONSTRAINT "PaymentTicket_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTicket" ADD CONSTRAINT "PaymentTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTicket" ADD CONSTRAINT "PaymentTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTicket" ADD CONSTRAINT "PaymentTicket_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTicket" ADD CONSTRAINT "PaymentTicket_parentTicketId_fkey" FOREIGN KEY ("parentTicketId") REFERENCES "PaymentTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTicket" ADD CONSTRAINT "PaymentTicket_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PaymentTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketActivity" ADD CONSTRAINT "TicketActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
