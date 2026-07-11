-- Add stable singleton keys without rewriting existing provider or store rows.
-- Built-in provider duplicates are retained for rollback, but only the
-- deterministically selected canonical row remains ACTIVE.
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "singletonKey" TEXT;
ALTER TABLE "integrations" ADD COLUMN IF NOT EXISTS "providerKey" TEXT;

WITH ranked_stores AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS rank
  FROM "stores"
)
UPDATE "stores" AS store
SET "singletonKey" = 'PRIMARY'
FROM ranked_stores
WHERE store."id" = ranked_stores."id"
  AND ranked_stores.rank = 1
  AND store."singletonKey" IS NULL;

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
  GROUP BY integration."id", integration."type", integration."status", integration."updatedAt", integration."createdAt"
), ranked_providers AS (
  SELECT
    "id",
    provider_key,
    row_number() OVER (
      PARTITION BY provider_key
      ORDER BY
        ("status" = 'ACTIVE') DESC,
        credential_parts DESC,
        verification_parts DESC,
        "updatedAt" DESC,
        "createdAt" DESC,
        "id" DESC
    ) AS rank
  FROM provider_rows
)
UPDATE "integrations" integration
SET
  "providerKey" = ranked.provider_key,
  "status" = CASE WHEN ranked.rank = 1 THEN integration."status" ELSE 'INACTIVE'::"IntegrationStatus" END
FROM ranked_providers ranked
WHERE integration."id" = ranked."id";

CREATE UNIQUE INDEX IF NOT EXISTS "stores_singletonKey_key" ON "stores"("singletonKey");
CREATE UNIQUE INDEX IF NOT EXISTS "integrations_providerKey_key" ON "integrations"("providerKey");
