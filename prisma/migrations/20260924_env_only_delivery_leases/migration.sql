-- Expand only. Legacy provider tables and store columns remain available for
-- rollback until the operator runs the guarded contract after validation.
ALTER TABLE "jobs" ADD COLUMN "claimToken" TEXT, ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "webhook_deliveries" ADD COLUMN "claimToken" TEXT, ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "outbound_webhook_deliveries" ADD COLUMN "claimToken" TEXT, ADD COLUMN "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "destinationName" TEXT, ADD COLUMN "destinationUrl" TEXT;
ALTER TABLE "email_deliveries" ADD COLUMN "sendStartedAt" TIMESTAMP(3);

UPDATE "outbound_webhook_deliveries" AS delivery
SET "destinationName" = integration."name", "destinationUrl" = integration."webhookUrl"
FROM "integrations" AS integration WHERE integration."id" = delivery."integrationId";

-- Delivery identity/history must survive retirement of the old configuration.
ALTER TABLE "outbound_webhook_deliveries" DROP CONSTRAINT IF EXISTS "outbound_webhook_deliveries_integrationId_fkey";
CREATE INDEX "jobs_status_leaseExpiresAt_idx" ON "jobs"("status", "leaseExpiresAt");
CREATE INDEX "webhook_deliveries_status_leaseExpiresAt_idx" ON "webhook_deliveries"("status", "leaseExpiresAt");
CREATE INDEX "outbound_webhook_deliveries_status_leaseExpiresAt_idx" ON "outbound_webhook_deliveries"("status", "leaseExpiresAt");
