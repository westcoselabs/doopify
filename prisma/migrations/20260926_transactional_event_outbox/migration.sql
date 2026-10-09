ALTER TABLE "jobs" ADD COLUMN "deduplicationKey" TEXT;
CREATE UNIQUE INDEX "jobs_deduplicationKey_key" ON "jobs"("deduplicationKey");
CREATE TABLE "event_dispatch_receipts" (
  "eventId" TEXT NOT NULL,
  "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_dispatch_receipts_pkey" PRIMARY KEY ("eventId")
);
