ALTER TABLE "PaymentTicket" ALTER COLUMN "paymentMethod" DROP DEFAULT;
ALTER TABLE "PaymentTicket" ALTER COLUMN "paymentMethod" DROP NOT NULL;
