# Doopify Beta/V2 Worker Separation Plan (Phase E1)

Date: 2026-05-19  
Branch context: `beta/v2`  
Scope: planning only (no worker runtime changes)

## 1) Current Background/Side-Effect Architecture

- Request paths emit typed internal events via `emitInternalEvent` in `src/server/events/dispatcher.ts`.
- `integrationRegistry` handlers in `src/server/integrations/registry.ts` perform:
  - logging
  - analytics writes
  - queueing email jobs
  - queueing shipping-tracking jobs
- Outbound merchant webhooks are queued as durable DB rows (`OutboundWebhookDelivery`) and processed later.
- Inbound webhook processing is durability-first:
  - attempt logged
  - signature verified
  - verified payload stored
  - processed/failed state recorded
  - retry/replay supported
- Job-backed side effects use durable `Job` rows with claim/retry/exhaustion.

## 2) Current Protected Runner Endpoints

- `POST /api/jobs/run`
  - Auth: `JOB_RUNNER_SECRET` or fallback `WEBHOOK_RETRY_SECRET` (`src/server/jobs/auth.ts`)
  - Runs due `Job` records (`runDueJobs`)
- `POST /api/webhook-retries/run`
  - Auth: `WEBHOOK_RETRY_SECRET`
  - Retries inbound webhook deliveries + processes due outbound webhook deliveries
- `POST /api/abandoned-checkouts/send-due`
  - Auth: `ABANDONED_CHECKOUT_SECRET` or fallback `WEBHOOK_RETRY_SECRET`
  - Also allows admin-auth fallback for manual operation

## 3) What Must Stay Inline (Forever or For Now)

- Stripe raw body read + signature verification (`/api/webhooks/stripe`)
- Stripe webhook secret selection/runtime resolution
- Verified webhook event parsing boundary
- `payment_intent.succeeded` finalization semantics (workflow delegates to existing finalization service)
- Order/payment/inventory truth writes
- Checkout totals authority and checkout.create behavior

## 4) What Can Move to Worker First

Safest first candidates (already queue-shaped):

1. `Job` queue processing via dedicated worker loop calling `/api/jobs/run`
   - order confirmation email job
   - fulfillment email job
   - shipping tracking sync job
2. Outbound webhook retry processing via `/api/webhook-retries/run`
3. Abandoned checkout due-send pass via `/api/abandoned-checkouts/send-due`

These can move operationally first without changing business logic if worker calls the existing protected routes.

## 5) What Must Wait Until Idempotency/Claiming Hardening

- Standalone always-on worker that directly claims DB work should wait for:
  - stale `RUNNING` job lock recovery in `Job` processing
  - crash-safe retry claim lifecycle for inbound webhook retries
  - crash-safe retry claim lifecycle for outbound webhook deliveries

Current gaps:

- `Job` claims set `status='RUNNING'` + `lockedAt`, but there is no stale-lock reaper.
- Inbound retry claim moves to `RECEIVED`; crash before processed/failed mark can orphan delivery from due-retry query.
- Outbound claim path can leave rows in `RETRYING` with `nextRetryAt=null` if crash occurs mid-attempt.

## 6) Proposed Worker Folder Structure (Future)

```txt
src/worker/
  index.ts
  config.ts
  internal-api-client.ts
  loops/
    run-jobs-loop.ts
    run-webhook-retries-loop.ts
    run-abandoned-loop.ts
  health/
    heartbeat.ts
    metrics.ts
```

## 7) Proposed Worker Scripts (Future)

- `npm run worker:start` -> starts loop process
- `npm run worker:once` -> one-cycle run for smoke/debug
- `npm run worker:health` -> checks route auth + heartbeat visibility

Minimal behavior for first worker:
- call existing endpoints only
- do not claim DB records directly
- do not alter retry logic yet

## 8) Required Env Vars

Minimum:

- `NEXT_PUBLIC_STORE_URL` or explicit internal base URL for worker HTTP calls
- `JOB_RUNNER_SECRET` (or `WEBHOOK_RETRY_SECRET` fallback)
- `WEBHOOK_RETRY_SECRET`
- `ABANDONED_CHECKOUT_SECRET` (or fallback)

Recommended worker-only knobs (future):

- `DOOPIFY_WORKER_POLL_JOBS_MS` (default 60s)
- `DOOPIFY_WORKER_POLL_RETRIES_MS` (default 60s)
- `DOOPIFY_WORKER_POLL_ABANDONED_MS` (default 1800s)
- `DOOPIFY_WORKER_REQUEST_TIMEOUT_MS`
- `DOOPIFY_WORKER_NAME`

## 9) Deployment Options

1. Same VPS second process
   - app process + worker process side by side
   - worker calls protected internal routes
2. Cron worker once per minute
   - external scheduler invokes protected routes (already supported)
3. Separate Railway/Render/Fly process
   - dedicated worker container/service calling same protected routes

## 10) Health Checks

- Worker heartbeat:
  - continue using `JobRunnerHeartbeat` via `/api/jobs/run?runnerName=...`
- Queue lag:
  - oldest due `Job.runAt`
  - oldest `WebhookDelivery.nextRetryAt` in `RETRY_PENDING`
  - oldest `OutboundWebhookDelivery` pending/retrying window
- Oldest retry age:
  - age since earliest due retry timestamp
- Failure rate:
  - ratio of failed/exhausted over processed jobs/deliveries in rolling window

## 11) Concurrency / Job-Claiming Review

Current positives:

- Claim operations use conditional `updateMany` checks (good for multi-runner contention).
- Inbound and outbound retry flows have persisted status models and bounded attempts.

Current blockers for autonomous worker safety:

- No stale lock reclaim for `RUNNING` jobs.
- Retry claim states can be orphaned on process crash before final state write.
- Outbound `RETRYING + nextRetryAt=null` edge can escape due-delivery query.

Conclusion:

- Current model is safe for cron-triggered route execution with manual recovery support.
- It is not yet fully safe for high-availability standalone worker claim loops without hardening.

## 12) Rollback Plan

If worker rollout causes issues:

1. Stop worker process/scheduler only.
2. Keep app/API online; current request-time behavior is unchanged.
3. Continue manual/admin recovery:
   - `/api/jobs/[id]/retry`
   - `/api/outbound-webhook-deliveries/[id]/retry`
   - `/api/webhook-deliveries/[id]/replay`
4. Re-enable previous cron cadence after stabilization.

## 13) Smallest Safe Phase E2 Scope

Do not move business logic. Implement operational worker wrapper only:

1. Add a small worker script that periodically calls:
   - `/api/jobs/run`
   - `/api/webhook-retries/run`
   - `/api/abandoned-checkouts/send-due`
2. Add structured worker logs and failure counters.
3. Add runner naming conventions and heartbeat visibility.
4. No DB schema changes, no queue model changes, no Stripe/checkout/webhook logic changes.

## Do Next / Do Later / Avoid

### Do Next

1. Add claim-hardening tickets (stale job lock reclaim + retry-claim crash recovery).
2. Implement route-calling worker process (no direct DB claiming).
3. Add lightweight operational metrics dashboard/queries.

### Do Later

1. Move analytics fan-out to queued path if measured route latency requires it.
2. Move customer-note emails to queued job path for consistency.
3. Consider direct DB worker claim model only after hardening closes.

### Avoid For Now

1. Any change to checkout/webhook/payment truth behavior.
2. Any schema migration solely for worker rollout in this phase.
3. Introducing Redis or new queue infrastructure before claim/retry hardening.
