CREATE TABLE IF NOT EXISTS "promotion_applications" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "promotionId" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "typeSnapshot" "PromotionType" NOT NULL,
  "rewardTypeSnapshot" "PromotionRewardType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promotion_application_lines" (
  "id" TEXT NOT NULL,
  "promotionApplicationId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "variantId" TEXT,
  "quantityDiscounted" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_application_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promotion_applications_orderId_promotionId_key"
  ON "promotion_applications"("orderId", "promotionId");

CREATE INDEX IF NOT EXISTS "promotion_applications_orderId_idx"
  ON "promotion_applications"("orderId");
CREATE INDEX IF NOT EXISTS "promotion_applications_promotionId_idx"
  ON "promotion_applications"("promotionId");
CREATE INDEX IF NOT EXISTS "promotion_application_lines_promotionApplicationId_idx"
  ON "promotion_application_lines"("promotionApplicationId");
CREATE INDEX IF NOT EXISTS "promotion_application_lines_orderItemId_idx"
  ON "promotion_application_lines"("orderItemId");
CREATE INDEX IF NOT EXISTS "promotion_application_lines_variantId_idx"
  ON "promotion_application_lines"("variantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_applications_orderId_fkey'
      AND table_name = 'promotion_applications'
  ) THEN
    ALTER TABLE "promotion_applications"
      ADD CONSTRAINT "promotion_applications_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_applications_promotionId_fkey'
      AND table_name = 'promotion_applications'
  ) THEN
    ALTER TABLE "promotion_applications"
      ADD CONSTRAINT "promotion_applications_promotionId_fkey"
      FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_application_lines_promotionApplicationId_fkey'
      AND table_name = 'promotion_application_lines'
  ) THEN
    ALTER TABLE "promotion_application_lines"
      ADD CONSTRAINT "promotion_application_lines_promotionApplicationId_fkey"
      FOREIGN KEY ("promotionApplicationId") REFERENCES "promotion_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_application_lines_orderItemId_fkey'
      AND table_name = 'promotion_application_lines'
  ) THEN
    ALTER TABLE "promotion_application_lines"
      ADD CONSTRAINT "promotion_application_lines_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_application_lines_variantId_fkey'
      AND table_name = 'promotion_application_lines'
  ) THEN
    ALTER TABLE "promotion_application_lines"
      ADD CONSTRAINT "promotion_application_lines_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;
