-- Add a capability-token hash for the buyer-facing checkout-status endpoint.
-- The raw token is returned once during checkout creation and is never persisted.
ALTER TABLE "checkout_sessions" ADD COLUMN "statusTokenHash" TEXT;

CREATE UNIQUE INDEX "checkout_sessions_statusTokenHash_key" ON "checkout_sessions"("statusTokenHash");
