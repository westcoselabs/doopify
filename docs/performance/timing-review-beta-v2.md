# Doopify Beta/V2 Timing Review (Phase D0)

Date: 2026-05-18
Branch context: `beta/v2`
Scope: analysis + measurement plan only (no commerce workflow changes)

## 1) Run timing locally

```bash
DOOPIFY_ROUTE_TIMING=1 npm run dev
```

Notes:
- Timing logs are emitted only when `DOOPIFY_ROUTE_TIMING` is truthy (`1|true|yes|on`).
- `src/server/observability/timing.ts` suppresses timing logs in production-like environments.

## 2) Routes currently instrumented

From `withRouteTiming(...)` usage in `src/app/api/**`:

1. `GET /api/orders`
2. `GET /api/orders/[orderNumber]/detail`
3. `GET /api/settings`
4. `POST /api/checkout/create`
5. `POST /api/checkout/shipping-rates`
6. `POST /api/webhooks/stripe`

## 3) What timing output means

Each request logs one line:

```txt
[route-timing] {"route":"...","totalDurationMs":123,"statusCode":200,"requestId":"...","steps":[...]}
```

Field meaning:
- `route`: logical route label passed to `withRouteTiming`.
- `totalDurationMs`: total wall-clock duration for the route handler.
- `statusCode`: final response status.
- `requestId`: first available value from `x-request-id`, `x-vercel-id`, or `cf-ray`.
- `steps`: ordered checkpoints; each `durationMs` is elapsed time since the previous checkpoint (delta timing, not cumulative).

Current per-route steps:
- `GET /api/orders`: `auth`, `query`
- `GET /api/orders/[orderNumber]/detail`: `auth`, `resolve_order`, `load_detail`
- `GET /api/settings`: `auth`, `load_settings`
- `POST /api/checkout/create`: `parse_body`, `validate`, `create_payment_intent`
- `POST /api/checkout/shipping-rates`: `parse_body`, `validate`, `load_rates`
- `POST /api/webhooks/stripe`: `record_delivery`, `resolve_runtime`, `verify_signature`, `store_payload`, `process_event`

## 4) Manual test script

Run dev server with timing enabled, then execute this sequence:

1. Open `/admin/orders`
- Confirm `GET /api/orders` timing logs are emitted.

2. Open one order detail page (`/admin/orders/{orderNumber}`)
- Confirm `GET /api/orders/[orderNumber]/detail` timing logs are emitted.

3. Open `/admin/settings`
- Confirm `GET /api/settings` timing logs are emitted.

4. Open storefront shop (`/shop`)
- Observe storefront behavior and note that `/api/storefront/products` and `/api/storefront/collections` are currently not instrumented.

5. Run checkout shipping-rate quote
- Trigger `POST /api/checkout/shipping-rates` from checkout UI, or send a representative API request.

6. Run checkout create
- Trigger `POST /api/checkout/create` from checkout UI, or send a representative API request.

7. Trigger/test Stripe webhook (if available)
- Use Stripe CLI or existing webhook replay tooling to send `payment_intent.succeeded` and/or `payment_intent.payment_failed` events.
- Confirm `POST /api/webhooks/stripe` timing logs are emitted.

## 5) Sub-steps that should be measured next (by critical route)

### `GET /api/orders`
Current steps are sufficient for Phase D0 triage:
- `auth`
- `query`

Optional deeper split (later):
- `build_filters`
- `query_orders`
- `query_count`
- `derive_fulfillment_status`

### `GET /api/orders/[orderNumber]/detail`
Current steps:
- `auth`
- `resolve_order`
- `load_detail`

High-value deeper split (next measurement iteration):
- `query_order_graph` (main Prisma `order.findUnique`)
- `query_provider_statuses` (carrier connection checks)
- `query_email_runtime`
- `map_response`

### `GET /api/settings`
Current steps:
- `auth`
- `load_settings`

Optional deeper split:
- `serialize_settings_payload`

### `POST /api/checkout/create`
Current steps:
- `parse_body`
- `validate`
- `create_payment_intent` (coarse bucket containing most work)

High-value deeper split (service-level timing only, no behavior changes):
- `load_store_settings`
- `resolve_line_items`
- `resolve_discount`
- `resolve_shipping_quote`
- `pricing_compute`
- `stripe_runtime_lookup`
- `stripe_create_payment_intent`
- `checkout_session_persist`
- `emit_checkout_created`

### `POST /api/checkout/shipping-rates`
Current steps:
- `parse_body`
- `validate`
- `load_rates` (coarse bucket)

High-value deeper split:
- `load_store_settings`
- `resolve_line_items`
- `provider_or_manual_rate_resolution`
- `response_map`

### `POST /api/webhooks/stripe`
Current steps already useful and safe:
- `record_delivery`
- `resolve_runtime`
- `verify_signature`
- `store_payload`
- `process_event`

Optional deeper split inside event processing (later, still read-only timing):
- `process_payment_intent_succeeded`
- `process_payment_intent_failed`

## 6) Gaps in current instrumentation

1. Coarse heavy-step buckets remain in checkout routes:
- `create_payment_intent` and `load_rates` each aggregate multiple DB + provider operations.

2. Order detail aggregation is opaque:
- `load_detail` combines deep Prisma graph read, provider status checks, runtime status checks, and mapping.

3. Storefront load path is not timed:
- `/api/storefront/products` and `/api/storefront/collections` are currently uninstrumented.

4. No instrumentation on internal event dispatcher latency:
- `emitInternalEvent` is synchronous (`Promise.allSettled` + outbound queueing), but route logs currently do not isolate handler vs outbound-queue cost.

5. No built-in percentile rollups:
- logs are line-by-line; p50/p95 must be computed externally from captured logs.

## 7) Recommended next implementation phase

Primary next phase: **Order detail slimming + lazy panel loading** (Option 1).

Why this should be first:
- It is the largest non-payment, admin-facing payload path still returning a very broad graph in one request.
- `admin-order-detail.service.ts` currently fetches a deep include tree plus provider/runtime checks in the same path.
- `OrderDetailView` renders many sections from one initial detail payload (timeline, shipments, notes, discounts, refunds/returns context), making it a high-impact UI latency target.
- It improves perceived admin performance without touching payment truth or checkout finalization invariants.

Exact files to touch in that phase:
- `src/server/services/admin-order-detail.service.ts`
- `src/app/api/orders/[orderNumber]/detail/route.ts`
- `src/components/orders/OrderDetailClientPage.js`
- `src/components/orders/OrderDetailView.jsx`
- `src/components/orders/OrderAdjustmentsCard.js`
- (if splitting panels into dedicated endpoints) new focused routes under `src/app/api/orders/[orderNumber]/...`

Behavior that must not change in that phase:
- No changes to checkout totals/pricing authority.
- No changes to Stripe webhook verification/finalization path.
- No changes to payment/order/inventory truth.
- No schema changes.
- No event-dispatch behavior changes.
- No sensitive data leakage in logs.

## 8) Do next / do later / avoid

### Do next
1. Capture baseline timing logs with current instrumentation for the manual script flows.
2. Prioritize order-detail payload slimming + lazy panel fetches while keeping route contracts stable.
3. Add only safe, read-only timing checkpoints to break down `load_detail` and checkout heavy buckets.

### Do later
1. Checkout create sub-step timing at service boundaries (still behavior-neutral).
2. Shipping-rate quote sub-step timing (provider vs DB split).
3. Side-effect deferral and worker separation planning after measured route bottlenecks are confirmed and admin payload wins are shipped.

### Avoid (this phase)
1. Any checkout math or totals behavior changes.
2. Any Stripe webhook finalization path changes.
3. Any payment/inventory/order truth changes.
4. Schema migrations for performance alone.
5. New worker infrastructure or workflow refactors.

## 9) Remaining unresolved Phase A findings

Still unresolved after Phase B/C:
1. Order detail endpoint remains broad and relation-heavy; lacks panel-level lazy loading.
2. Checkout create still has a single coarse heavy timing bucket and includes external Stripe latency.
3. Checkout shipping-rates still has a single coarse heavy timing bucket and includes provider latency.
4. Synchronous event-dispatch overhead in request paths remains unisolated in current timing logs.
5. Storefront shop still requests large initial product payload (`pageSize=50`) and storefront APIs are not timing-instrumented.

Partially addressed/monitor:
- Orders list payload was slimmed, but should still be tracked under real merchant data volume.
- Settings tab deferral is in place; monitor tab-open fan-out cost under production-like datasets.
