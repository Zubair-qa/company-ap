-- Advance / remaining payment plans and milestone tracking.

ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ADVANCE_PAID_REMAINING_PENDING';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentPlanType') THEN
    CREATE TYPE "PaymentPlanType" AS ENUM ('FULL_PAYMENT', 'ADVANCE_REMAINING', 'MILESTONE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentPlanStatus') THEN
    CREATE TYPE "PaymentPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ADVANCE_PAID', 'WAITING_FOR_REMAINING_DOCS', 'COMPLETED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMilestoneKind') THEN
    CREATE TYPE "PaymentMilestoneKind" AS ENUM ('FULL', 'ADVANCE', 'REMAINING', 'FINAL', 'CUSTOM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentMilestoneStatus') THEN
    CREATE TYPE "PaymentMilestoneStatus" AS ENUM ('DRAFT', 'READY_FOR_FINANCE', 'IN_FINANCE', 'PAID', 'BLOCKED', 'CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PaymentPlan" (
  "id" TEXT NOT NULL,
  "planNumber" TEXT NOT NULL,
  "planType" "PaymentPlanType" NOT NULL DEFAULT 'FULL_PAYMENT',
  "status" "PaymentPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "invoiceId" TEXT,
  "purchaseOrderId" TEXT,
  "departmentId" TEXT NOT NULL,
  "vendorId" TEXT,
  "createdById" TEXT,
  "totalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "remainingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "advancePercent" DECIMAL(5,2),
  "releaseCondition" TEXT,
  "requiredFinalDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "aiVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
  "aiVerificationScore" INTEGER NOT NULL DEFAULT 0,
  "aiVerificationNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PaymentMilestone" (
  "id" TEXT NOT NULL,
  "paymentPlanId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "kind" "PaymentMilestoneKind" NOT NULL,
  "status" "PaymentMilestoneStatus" NOT NULL DEFAULT 'DRAFT',
  "amount" DECIMAL(18,2) NOT NULL,
  "percent" DECIMAL(5,2),
  "releaseCondition" TEXT,
  "requiredDocuments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ticketId" TEXT,
  "releasedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentPlan_planNumber_key" ON "PaymentPlan"("planNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentPlan_invoiceId_key" ON "PaymentPlan"("invoiceId");
CREATE INDEX IF NOT EXISTS "PaymentPlan_status_idx" ON "PaymentPlan"("status");
CREATE INDEX IF NOT EXISTS "PaymentPlan_departmentId_idx" ON "PaymentPlan"("departmentId");
CREATE INDEX IF NOT EXISTS "PaymentPlan_vendorId_idx" ON "PaymentPlan"("vendorId");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMilestone_ticketId_key" ON "PaymentMilestone"("ticketId");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentMilestone_paymentPlanId_sequence_key" ON "PaymentMilestone"("paymentPlanId", "sequence");
CREATE INDEX IF NOT EXISTS "PaymentMilestone_status_idx" ON "PaymentMilestone"("status");
CREATE INDEX IF NOT EXISTS "PaymentMilestone_kind_idx" ON "PaymentMilestone"("kind");

ALTER TABLE "PaymentPlan"
  ADD CONSTRAINT "PaymentPlan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentPlan_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentPlan_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentPlan_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentMilestone"
  ADD CONSTRAINT "PaymentMilestone_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentMilestone_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PaymentTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "PaymentTicket"
SET "status" = 'DOCS_REVIEW',
    "submittedToFinanceAt" = COALESCE("submittedToFinanceAt", CURRENT_TIMESTAMP),
    "notes" = COALESCE("notes", 'Head approval removed; released to finance review')
WHERE "status" = 'DEPARTMENT_HEAD_APPROVAL';

UPDATE "Invoice"
SET "status" = 'APPROVED'
WHERE "status" = 'AWAITING_APPROVAL';
