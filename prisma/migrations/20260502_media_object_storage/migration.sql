ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "storage_provider" TEXT NOT NULL DEFAULT 'postgres',
  ADD COLUMN IF NOT EXISTS "storage_key" TEXT,
  ADD COLUMN IF NOT EXISTS "storage_bucket" TEXT,
  ADD COLUMN IF NOT EXISTS "public_url" TEXT;

ALTER TABLE "media_assets"
  ALTER COLUMN "data" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "media_assets_storage_provider_idx" ON "media_assets"("storage_provider");
CREATE INDEX IF NOT EXISTS "media_assets_storage_key_idx" ON "media_assets"("storage_key");
