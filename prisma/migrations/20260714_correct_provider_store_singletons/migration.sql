-- Corrective singleton migration. Do not edit 20260711_provider_and_store_singletons:
-- it may already be recorded in a deployed Prisma migration history.
--
-- Deployments that still have 20260711 pending and duplicate provider rows must
-- follow the migration preflight/runbook and mark that unsafe migration applied
-- before this additive corrective migration is deployed.

ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "singletonKey" TEXT;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "providerKey" TEXT;

-- Prisma may execute migration statements in separate transactions, so an
-- ON COMMIT DROP temporary table disappears before the following UPDATE.
-- Use short-lived schema tables and remove them at the end instead.
DROP TABLE IF EXISTS "_doopify_ranked_stores";
CREATE TABLE "_doopify_ranked_stores" AS
SELECT
  store."id",
  row_number() OVER (ORDER BY store."createdAt" ASC, store."id" ASC) AS rank
FROM "stores" store;

-- Clear first so a canonical row can change without transient unique-index
-- conflicts. Demoted records remain available during the rollback window.
UPDATE "stores" SET "singletonKey" = NULL WHERE "singletonKey" IS NOT NULL;

UPDATE "stores" store
SET "singletonKey" = 'PRIMARY'
FROM "_doopify_ranked_stores" ranked
WHERE store."id" = ranked."id"
  AND ranked.rank = 1;

DROP TABLE IF EXISTS "_doopify_ranked_provider_integrations";
CREATE TABLE "_doopify_ranked_provider_integrations" AS
WITH provider_rows AS (
  SELECT
    integration."id",
    CASE integration."type"
      WHEN 'PAYMENT_STRIPE' THEN 'STRIPE'
      WHEN 'SHIPPING_SHIPPO' THEN 'SHIPPO'
      WHEN 'SHIPPING_EASYPOST' THEN 'EASYPOST'
      WHEN 'EMAIL_RESEND' THEN 'RESEND'
      WHEN 'EMAIL_SMTP' THEN 'SMTP'
    END AS provider_key,
    integration."providerKey",
    integration."status",
    integration."updatedAt",
    integration."createdAt",
    count(secret."id") FILTER (
      WHERE (integration."type" = 'PAYMENT_STRIPE' AND secret."key" IN ('PUBLISHABLE_KEY', 'SECRET_KEY'))
         OR (integration."type" IN ('SHIPPING_SHIPPO', 'SHIPPING_EASYPOST', 'EMAIL_RESEND') AND secret."key" = 'API_KEY')
         OR (integration."type" = 'EMAIL_SMTP' AND secret."key" IN ('HOST', 'PORT', 'USERNAME', 'PASSWORD'))
    ) AS credential_parts,
    count(secret."id") FILTER (WHERE secret."key" = 'META_LAST_VERIFIED_AT') AS verification_parts
  FROM "integrations" integration
  LEFT JOIN "integration_secrets" secret ON secret."integrationId" = integration."id"
  WHERE integration."type" IN ('PAYMENT_STRIPE', 'SHIPPING_SHIPPO', 'SHIPPING_EASYPOST', 'EMAIL_RESEND', 'EMAIL_SMTP')
  GROUP BY integration."id", integration."type", integration."providerKey", integration."status", integration."updatedAt", integration."createdAt"
)
SELECT
  "id",
  provider_key,
  row_number() OVER (
    PARTITION BY provider_key
    ORDER BY
      ("providerKey" = provider_key) DESC,
      ("status" = 'ACTIVE') DESC,
      credential_parts DESC,
      verification_parts DESC,
      "updatedAt" DESC,
      "createdAt" DESC,
      "id" DESC
  ) AS rank
FROM provider_rows;

-- Clear all built-in provider keys before assigning the winner. This avoids a
-- transient uniqueness conflict when the legacy canonical row changes.
UPDATE "integrations"
SET "providerKey" = NULL
WHERE "type" IN ('PAYMENT_STRIPE', 'SHIPPING_SHIPPO', 'SHIPPING_EASYPOST', 'EMAIL_RESEND', 'EMAIL_SMTP');

UPDATE "integrations" integration
SET "providerKey" = ranked.provider_key
FROM "_doopify_ranked_provider_integrations" ranked
WHERE integration."id" = ranked."id"
  AND ranked.rank = 1;

UPDATE "integrations" integration
SET "status" = 'INACTIVE'::"IntegrationStatus"
FROM "_doopify_ranked_provider_integrations" ranked
WHERE integration."id" = ranked."id"
  AND ranked.rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "stores_singletonKey_key" ON "stores"("singletonKey");
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_providerKey_key" ON "integrations"("providerKey");

DROP TABLE "_doopify_ranked_provider_integrations";
DROP TABLE "_doopify_ranked_stores";
