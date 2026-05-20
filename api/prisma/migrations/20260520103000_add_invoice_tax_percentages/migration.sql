CREATE TYPE "TaxFilerStatus" AS ENUM ('FILER', 'NON_FILER');

ALTER TABLE "Invoice"
ADD COLUMN "taxFilerStatus" "TaxFilerStatus" NOT NULL DEFAULT 'FILER',
ADD COLUMN "whtTax" DECIMAL(7, 2) NOT NULL DEFAULT 0,
ADD COLUMN "salesTax" DECIMAL(7, 2) NOT NULL DEFAULT 0,
ADD COLUMN "incomeTax" DECIMAL(7, 2) NOT NULL DEFAULT 0,
ADD COLUMN "totalAmountPkr" DECIMAL(14, 2) NOT NULL DEFAULT 0;

UPDATE "Invoice"
SET "totalAmountPkr" = ROUND(
  "amountPkr" + ("amountPkr" * ("whtTax" + "salesTax" + "incomeTax") / 100),
  2
);
