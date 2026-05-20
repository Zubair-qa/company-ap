-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('GOODS_SERVICES', 'PO_RECEIPTS', 'ACCURACY', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "QueryStatus" AS ENUM ('OPEN', 'RESPONDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PaymentBatchStatus" AS ENUM ('DRAFT', 'EXPORTED', 'UPLOADED_TO_BANK', 'PROCESSED', 'FAILED', 'PARTIALLY_PROCESSED');

-- CreateEnum
CREATE TYPE "PaymentRecordStatus" AS ENUM ('SCHEDULED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED', 'DISCREPANCY', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TaxCodeType" AS ENUM ('SALES_TAX', 'WITHHOLDING');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'GRN', 'DELIVERY_NOTE', 'CONTRACT', 'RECEIPT', 'PO', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'EXPORT', 'IMPORT', 'APPROVE', 'REJECT', 'RETURN', 'SYNC');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPROVAL_PENDING', 'QUERY_RAISED', 'QUERY_RESPONDED', 'PAYMENT_FAILED', 'PAYMENT_COMPLETED', 'MISSING_DOCUMENTS', 'OVERDUE', 'XERO_SYNC_FAILED');

-- AlterTable
ALTER TABLE "Department"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "code" TEXT,
ADD COLUMN "headUserId" TEXT;

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Vendor"
ADD COLUMN "address" TEXT,
ADD COLUMN "bankAccountNumber" TEXT,
ADD COLUMN "bankAccountTitle" TEXT,
ADD COLUMN "bankName" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "contactPerson" TEXT,
ADD COLUMN "country" TEXT DEFAULT 'PK',
ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
ADD COLUMN "email" TEXT,
ADD COLUMN "iban" TEXT,
ADD COLUMN "ntn" TEXT,
ADD COLUMN "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "phone" TEXT,
ADD COLUMN "strn" TEXT,
ADD COLUMN "swiftCode" TEXT,
ADD COLUMN "vendorCode" TEXT,
ADD COLUMN "withholdingTaxRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "balanceDue" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
ADD COLUMN "currentStage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "internalRef" TEXT,
ADD COLUMN "invoiceDate" TIMESTAMP(3),
ADD COLUMN "invoiceNumber" TEXT,
ADD COLUMN "poId" TEXT,
ADD COLUMN "receivedDate" TIMESTAMP(3),
ADD COLUMN "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "withholdingTax" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Approval"
ADD COLUMN "action" "ApprovalAction",
ADD COLUMN "approvalLevel" INTEGER,
ADD COLUMN "ipAddress" TEXT;

-- CreateTable
CREATE TABLE "TaxCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "type" "TaxCodeType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TaxCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlAccount" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "parentAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GlAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "poDate" TIMESTAMP(3) NOT NULL,
    "expectedDeliveryDate" TIMESTAMP(3),
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoLineItem" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxCodeId" TEXT,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "glAccountCode" TEXT,

    CONSTRAINT "PoLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "poLineItemId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxCodeId" TEXT,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "glAccountCode" TEXT,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportingDocument" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "poId" TEXT,
    "documentType" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "verifiedByUserId" TEXT NOT NULL,
    "verificationType" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterdepartmentalQuery" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "raisedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "assignedToDepartmentId" TEXT,
    "queryText" TEXT NOT NULL,
    "responseText" TEXT,
    "status" "QueryStatus" NOT NULL DEFAULT 'OPEN',
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "InterdepartmentalQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalMatrix" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "minAmount" DECIMAL(18,2) NOT NULL,
    "maxAmount" DECIMAL(18,2) NOT NULL,
    "requiredRole" "Role" NOT NULL,
    "requiredUserId" TEXT,
    "approvalLevel" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApprovalMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "batchDate" TIMESTAMP(3) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "PaymentBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "exportedFilePath" TEXT,
    "exportedByUserId" TEXT,
    "exportedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "paymentRef" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "batchId" TEXT,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "withholdingTaxDeducted" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'PKR',
    "meezanTransactionRef" TEXT,
    "status" "PaymentRecordStatus" NOT NULL DEFAULT 'SCHEDULED',
    "bankResponseCode" TEXT,
    "bankResponseMessage" TEXT,
    "initiatedByUserId" TEXT NOT NULL,
    "authorizedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "bankStatementRef" TEXT,
    "statementDate" TIMESTAMP(3) NOT NULL,
    "reconciledAmount" DECIMAL(18,2) NOT NULL,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'MATCHED',
    "discrepancyNotes" TEXT,
    "reconciledByUserId" TEXT NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "performedByUserId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XeroConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantName" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "XeroConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_vendorCode_key" ON "Vendor"("vendorCode");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_internalRef_key" ON "Invoice"("internalRef");

-- CreateIndex
CREATE INDEX "Invoice_vendorId_invoiceNumber_idx" ON "Invoice"("vendorId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_status_currentStage_idx" ON "Invoice"("status", "currentStage");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCode_code_key" ON "TaxCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GlAccount_accountCode_key" ON "GlAccount"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_key" ON "PurchaseOrder"("poNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_departmentId_idx" ON "PurchaseOrder"("departmentId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PoLineItem_poId_lineNo_key" ON "PoLineItem"("poId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineItem_invoiceId_lineNo_key" ON "InvoiceLineItem"("invoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "SupportingDocument_invoiceId_idx" ON "SupportingDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "SupportingDocument_poId_idx" ON "SupportingDocument"("poId");

-- CreateIndex
CREATE INDEX "Verification_invoiceId_idx" ON "Verification"("invoiceId");

-- CreateIndex
CREATE INDEX "InterdepartmentalQuery_invoiceId_status_idx" ON "InterdepartmentalQuery"("invoiceId", "status");

-- CreateIndex
CREATE INDEX "ApprovalMatrix_departmentId_active_idx" ON "ApprovalMatrix"("departmentId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentBatch_batchNumber_key" ON "PaymentBatch"("batchNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRecord_paymentRef_key" ON "PaymentRecord"("paymentRef");

-- CreateIndex
CREATE INDEX "PaymentRecord_invoiceId_idx" ON "PaymentRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentRecord_batchId_idx" ON "PaymentRecord"("batchId");

-- CreateIndex
CREATE INDEX "PaymentRecord_status_idx" ON "PaymentRecord"("status");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "XeroConnection_tenantId_key" ON "XeroConnection"("tenantId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headUserId_fkey" FOREIGN KEY ("headUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlAccount" ADD CONSTRAINT "GlAccount_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "GlAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoLineItem" ADD CONSTRAINT "PoLineItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoLineItem" ADD CONSTRAINT "PoLineItem_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_poLineItemId_fkey" FOREIGN KEY ("poLineItemId") REFERENCES "PoLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportingDocument" ADD CONSTRAINT "SupportingDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportingDocument" ADD CONSTRAINT "SupportingDocument_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportingDocument" ADD CONSTRAINT "SupportingDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verification" ADD CONSTRAINT "Verification_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterdepartmentalQuery" ADD CONSTRAINT "InterdepartmentalQuery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterdepartmentalQuery" ADD CONSTRAINT "InterdepartmentalQuery_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterdepartmentalQuery" ADD CONSTRAINT "InterdepartmentalQuery_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterdepartmentalQuery" ADD CONSTRAINT "InterdepartmentalQuery_assignedToDepartmentId_fkey" FOREIGN KEY ("assignedToDepartmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalMatrix" ADD CONSTRAINT "ApprovalMatrix_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalMatrix" ADD CONSTRAINT "ApprovalMatrix_requiredUserId_fkey" FOREIGN KEY ("requiredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentBatch" ADD CONSTRAINT "PaymentBatch_exportedByUserId_fkey" FOREIGN KEY ("exportedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PaymentBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_authorizedByUserId_fkey" FOREIGN KEY ("authorizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PaymentRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_reconciledByUserId_fkey" FOREIGN KEY ("reconciledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
