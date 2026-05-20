-- Product selling + availability foundation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductSalesMode') THEN
    CREATE TYPE "ProductSalesMode" AS ENUM ('STANDARD', 'COMING_SOON', 'PRESALE');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductFulfillmentType') THEN
    CREATE TYPE "ProductFulfillmentType" AS ENUM ('PHYSICAL', 'DIGITAL');
  END IF;
END $$;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "salesMode" "ProductSalesMode" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "presaleStartsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "presaleEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "availableForPurchaseAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expectedDeliveryText" TEXT,
  ADD COLUMN IF NOT EXISTS "availabilityMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "storefrontBadgeText" TEXT,
  ADD COLUMN IF NOT EXISTS "fulfillmentType" "ProductFulfillmentType" NOT NULL DEFAULT 'PHYSICAL';

ALTER TABLE "product_variants"
  ADD COLUMN IF NOT EXISTS "continueSellingWhenOutOfStock" BOOLEAN NOT NULL DEFAULT false;
