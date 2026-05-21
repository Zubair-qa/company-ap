ALTER TABLE "SupportingDocument" ADD COLUMN "ticketId" TEXT;

CREATE INDEX "SupportingDocument_ticketId_idx" ON "SupportingDocument"("ticketId");

ALTER TABLE "SupportingDocument" ADD CONSTRAINT "SupportingDocument_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "PaymentTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
