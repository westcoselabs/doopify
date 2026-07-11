-- Corrective, additive session-hash rollout. Do not edit the earlier migration:
-- it may already be recorded in production migration history.
--
-- If the earlier migration ran, the old physical "token" column already holds
-- SHA-256 hashes; copy those into the new canonical column. If it did not run,
-- plaintext legacy tokens remain only in "token" for the maximum session
-- lifetime and are never copied into the new hash column.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;
ALTER TABLE "sessions" ALTER COLUMN "token" DROP NOT NULL;

UPDATE "sessions"
SET "tokenHash" = "token"
WHERE "tokenHash" IS NULL
  AND "token" ~ '^[a-f0-9]{64}$';

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_tokenHash_key" ON "sessions"("tokenHash");
CREATE INDEX IF NOT EXISTS "sessions_tokenHash_idx" ON "sessions"("tokenHash");
