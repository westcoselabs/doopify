ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "storageProvider" TEXT NOT NULL DEFAULT 'postgres',
  ADD COLUMN IF NOT EXISTS "storageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "storageBucket" TEXT,
  ADD COLUMN IF NOT EXISTS "publicUrl" TEXT;

ALTER TABLE "media_assets"
  ALTER COLUMN "data" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "media_assets_storageProvider_idx" ON "media_assets"("storageProvider");
CREATE INDEX IF NOT EXISTS "media_assets_storageKey_idx" ON "media_assets"("storageKey");
