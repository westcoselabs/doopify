DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionStatus') THEN
    CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionType') THEN
    CREATE TYPE "PromotionType" AS ENUM ('PRODUCT_GROUP_DISCOUNT', 'BUY_X_GET_Y', 'FREE_GIFT');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionRewardType') THEN
    CREATE TYPE "PromotionRewardType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "promotions" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "type" "PromotionType" NOT NULL,
  "rewardType" "PromotionRewardType" NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "usageLimit" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promotion_qualifiers" (
  "id" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "requiredQuantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_qualifiers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "promotion_rewards" (
  "id" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "rewardQuantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "promotion_rewards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "promotion_qualifiers_promotionId_variantId_key"
  ON "promotion_qualifiers"("promotionId", "variantId");
CREATE UNIQUE INDEX IF NOT EXISTS "promotion_rewards_promotionId_variantId_key"
  ON "promotion_rewards"("promotionId", "variantId");

CREATE INDEX IF NOT EXISTS "promotions_status_priority_createdAt_idx"
  ON "promotions"("status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "promotions_type_status_idx"
  ON "promotions"("type", "status");
CREATE INDEX IF NOT EXISTS "promotion_qualifiers_promotionId_idx"
  ON "promotion_qualifiers"("promotionId");
CREATE INDEX IF NOT EXISTS "promotion_qualifiers_productId_idx"
  ON "promotion_qualifiers"("productId");
CREATE INDEX IF NOT EXISTS "promotion_qualifiers_variantId_idx"
  ON "promotion_qualifiers"("variantId");
CREATE INDEX IF NOT EXISTS "promotion_rewards_promotionId_idx"
  ON "promotion_rewards"("promotionId");
CREATE INDEX IF NOT EXISTS "promotion_rewards_productId_idx"
  ON "promotion_rewards"("productId");
CREATE INDEX IF NOT EXISTS "promotion_rewards_variantId_idx"
  ON "promotion_rewards"("variantId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_qualifiers_promotionId_fkey'
      AND table_name = 'promotion_qualifiers'
  ) THEN
    ALTER TABLE "promotion_qualifiers"
      ADD CONSTRAINT "promotion_qualifiers_promotionId_fkey"
      FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_qualifiers_productId_fkey'
      AND table_name = 'promotion_qualifiers'
  ) THEN
    ALTER TABLE "promotion_qualifiers"
      ADD CONSTRAINT "promotion_qualifiers_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_qualifiers_variantId_fkey'
      AND table_name = 'promotion_qualifiers'
  ) THEN
    ALTER TABLE "promotion_qualifiers"
      ADD CONSTRAINT "promotion_qualifiers_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_rewards_promotionId_fkey'
      AND table_name = 'promotion_rewards'
  ) THEN
    ALTER TABLE "promotion_rewards"
      ADD CONSTRAINT "promotion_rewards_promotionId_fkey"
      FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_rewards_productId_fkey'
      AND table_name = 'promotion_rewards'
  ) THEN
    ALTER TABLE "promotion_rewards"
      ADD CONSTRAINT "promotion_rewards_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'promotion_rewards_variantId_fkey'
      AND table_name = 'promotion_rewards'
  ) THEN
    ALTER TABLE "promotion_rewards"
      ADD CONSTRAINT "promotion_rewards_variantId_fkey"
      FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
