-- Add an idempotency key supplied by the initiating browser. Existing checkout
-- sessions remain valid and have a NULL attempt id during the transition.
ALTER TABLE "checkout_sessions" ADD COLUMN IF NOT EXISTS "checkoutAttemptId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "checkout_sessions_checkoutAttemptId_key"
  ON "checkout_sessions"("checkoutAttemptId");
