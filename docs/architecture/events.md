# Event Architecture

How Doopify dispatches and handles internal lifecycle events.

---

## Design intent

Doopify uses a typed internal event dispatcher before any public plugin platform exists.

This lets first-party consumers (email, analytics, webhooks) react to commerce events without coupling service modules to each other. External integrations are handled through the outbound webhook delivery system.

---

## Internal event dispatcher

`enqueueCommerceEvent()` in `src/server/events/outbox.ts` writes a deduplicated `DISPATCH_INTERNAL_EVENT` job inside each order, payment-status, refund, return or fulfillment transaction. The job is visible only after that transaction commits.

The worker checks its ownership lease, calls persistence-only registry consumers with the same Prisma transaction and writes an `EventDispatchReceipt`. Failure rolls back fan-out and is retried by the existing job lifecycle. A retry after dispatch committed skips fan-out using the receipt. Provider network I/O runs in subsequent delivery jobs. Informational events outside these commerce producers still use the best-effort `emitInternalEvent()` path.

---

## Registered consumers

| Consumer | Listens to | Action |
|---|---|---|
| Logging consumer | All events | Structured log output |
| Order confirmation email | `order.paid` | Queues `EmailDelivery` job |
| Analytics fan-out | Commerce lifecycle events | Persists `AnalyticsEvent` records |
| Outbound webhook queue | Commerce lifecycle events | Creates `OutboundWebhookDelivery` records |

---

## Outbound webhook delivery

When an `order.paid` or other lifecycle event fires, `queueOutboundWebhooks()` creates delivery records for all developer-configured destinations subscribed to that event.

Background processing:
1. `processOutboundWebhook()` sends the signed HTTP delivery.
2. Deliveries are claimed before sending to reduce concurrent duplicate sends.
3. Failed deliveries back off and retry.
4. Exhausted deliveries are marked dead-letter and visible in the admin.

Delivery headers:
- `X-Doopify-Delivery` — unique delivery ID
- `X-Doopify-Event` — event type
- `X-Doopify-Timestamp` — Unix timestamp
- `X-Doopify-Signature` — `sha256=<hex>` HMAC over payload

---

## Analytics events

`AnalyticsEvent` records are persisted by the analytics consumer for:
- Checkout lifecycle (created, paid, failed, abandoned)
- Order lifecycle (created, refund issued, return created)
- Email lifecycle (sent, failed, bounced, complained)
- Webhook lifecycle (delivery success/failure)

For durable commerce events, analytics persistence is atomic with fan-out and its dispatch receipt. A failed write retries the event; the already committed commerce transaction remains intact.

---

## Background jobs

Side effects that should not block the request lifecycle run as background jobs.

`Job` records are created with a `PENDING` status. The job runner (`POST /api/jobs/run`) claims and processes due jobs. Each job has retry/backoff/exhaustion lifecycle.

Current job types:
- `DISPATCH_INTERNAL_EVENT` — fans out persisted commerce events transactionally
- `SEND_ORDER_CONFIRMATION_EMAIL` — sends tracked order confirmation email
- `SYNC_SHIPPING_TRACKING` — polls shipping provider for tracking updates
- `SEND_FULFILLMENT_EMAIL` — queued email for fulfillment events
- `SEND_OUTBOUND_WEBHOOK` — sends a persisted outbound delivery
- `RECORD_ANALYTICS_EVENT` — records typed analytics events

---

## Integration registry

`src/server/integrations/registry.ts` is the static integration registry. Integrations register their event subscriptions here before any plugin platform exists.

Developers define outbound destinations/events in `src/server/config/outbound-webhooks.ts` with separate environment secret references. Durable delivery records preserve destination snapshots and history.

---

## Files

| File | Purpose |
|---|---|
| `src/server/events/dispatcher.ts` | Typed event dispatcher |
| `src/server/integrations/registry.ts` | Static integration registry |
| `src/server/services/outbound-webhook.service.ts` | Outbound delivery queue and processing |
| `src/server/services/email-delivery.service.ts` | Email delivery tracking |
| `src/server/jobs/job.service.ts` | Background job lifecycle |

Outbox jobs and dispatch receipts must be retained together under a deliberate archival/replay policy. Internal deduplication does not guarantee exactly-once external delivery; uncertain email sends still require reconciliation. See [scaling rollout](../performance/scaling-hardening.md).
