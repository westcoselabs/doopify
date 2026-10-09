CREATE TABLE "checkout_shipping_quotes" (
  "tokenHash" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_shipping_quotes_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "checkout_shipping_quotes_expiresAt_idx" ON "checkout_shipping_quotes"("expiresAt");
