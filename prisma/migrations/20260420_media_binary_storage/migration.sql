-- Add binary storage columns
ALTER TABLE "media_assets"
  ADD COLUMN IF NOT EXISTS "filename" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "data"     BYTEA;

-- Back-fill so NOT NULL can be applied
UPDATE "media_assets" SET "data" = '\x' WHERE "data" IS NULL;
ALTER TABLE "media_assets" ALTER COLUMN "data" SET NOT NULL;
ALTER TABLE "media_assets" ALTER COLUMN "mime_type" SET DEFAULT 'application/octet-stream';

-- Drop Cloudinary-specific columns
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "url";
ALTER TABLE "media_assets" DROP COLUMN IF EXISTS "storage_key";
