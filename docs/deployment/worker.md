# Doopify Worker (Route-Runner)

This worker is the smallest safe E2 process: it calls existing protected runner routes only.

## What This Worker Does

- Calls `POST /api/jobs/run`
- Calls `POST /api/webhook-retries/run`
- Calls `POST /api/abandoned-checkouts/send-due`
- Keeps async transactional email jobs moving (`SEND_ORDER_CONFIRMATION_EMAIL`, `SEND_FULFILLMENT_EMAIL`) so delivery logs stay current
- Supports:
  - once mode (single pass)
  - loop mode (interval polling)
- Logs structured metadata:
  - worker name
  - route id
  - status code
  - duration
  - success/failure

## What This Worker Does Not Do

- Does not claim DB jobs directly.
- Does not change retry semantics.
- Does not change Stripe verification/finalization behavior.
- Does not change checkout/payment/order/inventory truth.
- Does not replace existing runner routes.

## Required Environment Variables

- `DOOPIFY_WORKER_BASE_URL`
  - Preferred base URL for runner calls, e.g. `http://127.0.0.1:3000`
  - Fallback: `NEXT_PUBLIC_STORE_URL`
- `WEBHOOK_RETRY_SECRET`
  - Required for `/api/webhook-retries/run`
- `JOB_RUNNER_SECRET` (optional if fallback is acceptable)
  - If not set, worker uses `WEBHOOK_RETRY_SECRET` for `/api/jobs/run`
- `ABANDONED_CHECKOUT_SECRET` (optional if fallback is acceptable)
  - If not set, worker uses `WEBHOOK_RETRY_SECRET` for `/api/abandoned-checkouts/send-due`

Optional worker controls:

- `DOOPIFY_WORKER_INTERVAL_MS` (default `60000`)
- `DOOPIFY_WORKER_NAME` (default `doopify-worker`)
- `DOOPIFY_WORKER_MODE` (`once` or `loop`, CLI flags still win)

## Local Run Instructions

1. Start app server:

```bash
npm run dev
```

2. Run worker once:

```bash
npm run worker:once
```

3. Run worker loop:

```bash
npm run worker
```

## Production Run Instructions

Use one of:

1. Separate long-running worker process (recommended for VPS/container)
2. External scheduler calling runner routes (already supported)

Worker loop process example:

```bash
NODE_ENV=production npm run worker
```

## Same-VPS Second Process Option

- Process A: Next.js app (`npm run start`)
- Process B: worker (`npm run worker`)
- Manage with `systemd`, `pm2`, Docker Compose, or platform supervisor.

## Cron Once-Per-Minute Option

If you prefer schedulers over a loop process, keep existing route-based approach:

- `POST /api/jobs/run`
- `POST /api/webhook-retries/run`
- `POST /api/abandoned-checkouts/send-due`

This is compatible with current auth model and does not require worker loop deployment.

## Rollback Plan

1. Stop worker process or disable scheduler.
2. Keep app and runner routes online.
3. Continue manual/admin recovery routes:
   - `/api/jobs/[id]/retry`
   - `/api/outbound-webhook-deliveries/[id]/retry`
   - `/api/webhook-deliveries/[id]/replay`

## Known Limitations

- Direct DB-claim worker remains deferred.
- Stale `RUNNING` job recovery is not implemented yet.
- Crash-safe retry-claim hardening for inbound/outbound retry paths is still future work.

## Email Backlog Visibility

- Delivery logs now include **Email job processing health** in Email mode.
- This health signal is observational only:
  - it does **not** change paid-order finalization
  - it does **not** block checkout success
  - it does **not** expose secrets
- If health is warning/critical:
  1. Refresh **Delivery logs** and **Background runners**.
  2. Confirm `/api/jobs/run` is being called by worker/cron.
  3. Retry failed email deliveries from Delivery logs when eligible.
