# Doopify Beta/V2 Performance Audit (Phase A)

Date: 2026-05-18
Branch context: `beta/v2`
Scope: Audit only (no core behavior changes)

## Method

- Reviewed route handlers in `src/app/api/**`.
- Reviewed hot services in `src/server/services/**`, shipping modules, and event/side-effect dispatch.
- Checked for heavy `include` trees, `findMany` without pagination, large payload responses, and synchronous side effects in request paths.
- Reviewed admin/storefront client surfaces for high API fan-out on initial load.

## Top Suspected Slow Routes/Pages

1. `GET /api/orders` via `src/app/api/orders/route.ts`
2. `GET /api/orders/[orderNumber]/detail` via `src/app/api/orders/[orderNumber]/detail/route.ts`
3. `GET /api/settings` via `src/app/api/settings/route.ts`
4. `POST /api/checkout/create` via `src/app/api/checkout/create/route.ts`
5. `POST /api/webhooks/stripe` via `src/app/api/webhooks/stripe/route.ts`
6. `POST /api/checkout/shipping-rates` via `src/app/api/checkout/shipping-rates/route.ts`
7. `GET /api/settings/integrations` via `src/app/api/settings/integrations/route.ts`
8. `GET /api/collections` via `src/app/api/collections/route.ts`
9. `Shop page` via `src/app/(storefront)/shop/page.js`
10. `Settings workspace` via `src/components/settings/SettingsWorkspace.js`

## Route/Page Findings

### 1) Orders list API

- File path: `src/app/api/orders/route.ts` + `src/server/services/order.service.ts`
- What it fetches: Paged orders plus `customer`, `items`, `addresses`, `payments`, and `fulfillments.items` in one query.
- Over-fetching: Yes for list view. Includes objects usually needed for detail-level UI.
- Pagination: Yes (`page`, `pageSize`) but can still be heavy with large `pageSize` callers.
- Raw Prisma payloads: Partial. Service maps derived status, but still returns broad order relation payloads.
- Side effects inside request: None for GET.
- Estimated risk level: High (admin traffic hotspot).
- Recommended fix: Add a list DTO select profile for orders (summary-only fields), keep detail relations for detail route only.

### 2) Admin order detail API

- File path: `src/app/api/orders/[orderNumber]/detail/route.ts` + `src/server/services/admin-order-detail.service.ts`
- What it fetches: Full order graph (customer+addresses, items+product+variant, payments, fulfillments+labels, events, refunds, returns, discounts), then extra store/provider/runtime checks.
- Over-fetching: Potentially yes, depending on visible sections. Very large response shape.
- Pagination: No pagination for timeline/refund/return arrays.
- Raw Prisma payloads: No direct raw return, but mapped object is still very large.
- Side effects inside request: No write side effects, but extra provider/runtime reads in-path.
- Estimated risk level: High.
- Recommended fix: Keep API shape, but trim nested fields by explicit `select`, and optionally lazy-load secondary panels (timeline/labels/provider diagnostics) with separate endpoints.

### 3) Store settings API

- File path: `src/app/api/settings/route.ts` + `src/server/services/settings.service.ts`
- What it fetches: `getStoreSettings()` includes shipping packages, locations, manual rates, fallback rates, zones+rates, tax rules.
- Over-fetching: Yes for consumers that only need general/storefront settings.
- Pagination: Not applicable (single store), but relation arrays can grow large.
- Raw Prisma payloads: Mostly yes from settings GET path.
- Side effects inside request: None for GET.
- Estimated risk level: Medium-High.
- Recommended fix: Split read models: `getStoreSettingsFull()` for shipping/tax admin tabs, `getStoreSettingsLite()` for general and storefront-safe reads.

### 4) Checkout create API

- File path: `src/app/api/checkout/create/route.ts` + `src/server/services/checkout.service.ts`
- What it fetches: Variant/product resolution, store settings (large include), shipping quote resolution, discount lookup, Stripe PaymentIntent create, checkout session write, event dispatch.
- Over-fetching: Moderate via full `getStoreSettings()` when only pricing/shipping slices are needed.
- Pagination: Not applicable.
- Raw Prisma payloads: No.
- Side effects inside request: Yes (Stripe call + checkout create + `emitInternalEvent('checkout.created')`).
- Estimated risk level: High (checkout critical path).
- Recommended fix: Keep behavior; reduce settings read profile for checkout paths and instrument timings per step to identify dominant latency (DB vs provider vs Stripe).

### 5) Stripe webhook API

- File path: `src/app/api/webhooks/stripe/route.ts` + `src/server/services/stripe-webhook.service.ts`
- What it fetches: Runtime config + webhook secret selection; delivery logging records; webhook processing and order finalization path.
- Over-fetching: Not obvious.
- Pagination: Not applicable.
- Raw Prisma payloads: No.
- Side effects inside request: Yes by design (delivery attempt persistence, order finalization, status writes, failure handling).
- Estimated risk level: High (payment truth path).
- Recommended fix: No functional changes in Phase A. Add step timings and avoid additional synchronous non-critical work in this path.

### 6) Checkout shipping-rates API

- File path: `src/app/api/checkout/shipping-rates/route.ts` + `src/server/shipping/shipping-rate.service.ts`
- What it fetches: Store shipping config with multiple nested includes (packages, locations, manual/fallback rates, zones+rates), variant data for cart, optional provider live rates.
- Over-fetching: Moderate-to-high for manual-only stores.
- Pagination: Not applicable.
- Raw Prisma payloads: No.
- Side effects inside request: External provider calls for live rates.
- Estimated risk level: High under provider latency.
- Recommended fix: Use focused shipping config select profile for quote generation, and optional short-lived in-memory memo per request context for repeated store config fetches.

### 7) Integrations list API

- File path: `src/app/api/settings/integrations/route.ts`
- What it fetches: All integrations with all events and secret key metadata.
- Over-fetching: Moderate if many integrations/events.
- Pagination: Missing.
- Raw Prisma payloads: Yes (direct return of relation-heavy records).
- Side effects inside request: None.
- Estimated risk level: Medium.
- Recommended fix: Add pagination and summary DTO; fetch per-integration detail only on demand.

### 8) Collections admin list API

- File path: `src/app/api/collections/route.ts` + `src/server/services/collection.service.ts`
- What it fetches: Full collection summary list with `_count` and search filter; no page limit.
- Over-fetching: Moderate when collection count grows.
- Pagination: Missing.
- Raw Prisma payloads: No (mapped), but unbounded result set.
- Side effects inside request: None.
- Estimated risk level: Medium.
- Recommended fix: Add `page`/`pageSize` and cap defaults.

### 9) Discounts admin list API

- File path: `src/app/api/discounts/route.ts`
- What it fetches: Paged discounts using `findMany` without `select`.
- Over-fetching: Moderate (returns full discount columns for list).
- Pagination: Yes.
- Raw Prisma payloads: Yes (direct return).
- Side effects inside request: None.
- Estimated risk level: Medium.
- Recommended fix: Add list DTO `select` to return only list fields.

### 10) Customers list and export

- File path: `src/app/api/customers/route.ts`, `src/server/services/customer.service.ts`, `src/app/api/customers/[id]/export/route.ts`
- What it fetches: Customer list is paged; export loads deep order graph including items, addresses, payments, refunds.items, returns.items.
- Over-fetching: List moderate; export intentionally heavy.
- Pagination: List yes; export no (single customer export payload).
- Raw Prisma payloads: List mapped; export assembled from large relations.
- Side effects inside request: None.
- Estimated risk level: Medium.
- Recommended fix: Keep export behavior but add optional date-scoped export or chunking for very high-order customers (future phase).

### 11) Storefront products API + Shop page

- File path: `src/app/api/storefront/products/route.ts`, `src/server/services/product.service.ts`, `src/app/(storefront)/shop/page.js`
- What it fetches: Paged products include variants + up to 2 media; shop page loads products (`pageSize=50`) and collections in parallel.
- Over-fetching: Moderate for initial storefront payload, especially on mobile networks.
- Pagination: Yes in API; page currently asks for 50 at once.
- Raw Prisma payloads: No (mapped).
- Side effects inside request: None.
- Estimated risk level: Medium.
- Recommended fix: Reduce initial `pageSize` and progressively load more, or keep `pageSize` but cut fields for card-only rendering.

### 12) Settings workspace and delivery logs workspace

- File path: `src/components/settings/SettingsWorkspace.js`, `src/components/webhooks/WebhookDeliveriesWorkspace.js`
- What it fetches: Multiple independent fetches on mount and tab changes; webhooks page loads inbound/outbound/email logs plus runner status.
- Over-fetching: High API fan-out on initial admin load.
- Pagination: Individual APIs mostly paged, but concurrent fetch count is high.
- Raw Prisma payloads: Depends on endpoint; several endpoints return broad payloads.
- Side effects inside request: Mostly reads; some actions trigger retries/resends.
- Estimated risk level: Medium-High.
- Recommended fix: Stagger fetches per active tab and defer non-visible panel requests.

### 13) Admin contexts requesting large pages

- File path: `src/context/OrdersContext.js`, `src/context/ProductsContext.js`, `src/context/CustomersContext.js`, `src/context/DiscountsContext.js`
- What it fetches: Initial load calls list APIs with `pageSize=100`.
- Over-fetching: Yes for initial dashboard/admin loads.
- Pagination: API yes, client asks for large pages.
- Raw Prisma payloads: Depends on endpoint.
- Side effects inside request: None.
- Estimated risk level: Medium.
- Recommended fix: Lower default page size and load additional pages only where needed.

### 14) Event dispatch in synchronous request path

- File path: `src/server/events/dispatcher.ts`, `src/server/integrations/registry.ts`
- What it fetches/does: `emitInternalEvent` awaits all registered handlers, then queues outbound webhooks. Some handlers write analytics and queue email/tracking jobs.
- Over-fetching: N/A.
- Pagination: N/A.
- Raw Prisma payloads: N/A.
- Side effects inside request: Yes; synchronous awaits add latency to user-facing requests.
- Estimated risk level: High (cross-cutting).
- Recommended fix: Keep reliability semantics, but audit which handlers can safely defer to background jobs and which must remain inline.

## Quick Wins (Ranked by Impact + Safety)

1. Add summary `select` DTO for `GET /api/orders` list payload.
- Impact: High
- Safety: High

2. Add pagination to `GET /api/collections` and `GET /api/settings/integrations`.
- Impact: Medium-High
- Safety: High

3. Reduce admin context initial list `pageSize` from `100` to a lower default.
- Impact: Medium
- Safety: High

4. Split settings read profiles (`full` vs `lite`) and use lite in storefront/checkout paths where valid.
- Impact: Medium-High
- Safety: Medium-High

5. Convert discounts list to explicit list `select` (instead of full row payload).
- Impact: Medium
- Safety: High

6. Defer non-visible settings/webhook workspace fetches until tab/panel activation.
- Impact: Medium
- Safety: High

7. Add dev-only route timing instrumentation to identify top real latency buckets before changing logic.
- Impact: Medium
- Safety: High

## High-Risk Changes To Avoid (For Now)

- Any change to payment finalization truth in Stripe webhook flow.
- Any change letting client-own totals/shipping/tax/discount final amounts.
- Any checkout rewrite that mixes pricing authority with browser data.
- Any schema migration solely for performance before query/DTO cleanup.
- Any async detachment of critical inventory/order writes without explicit idempotency plan.
- Any Redis/queue infra introduction in this phase.

## Suggested Phase B/C Implementation Order

Phase B (safe query and payload hygiene)
1. Orders list DTO/select slimming and response payload trimming.
2. Add pagination to collections admin and integrations list APIs.
3. Reduce admin context default page sizes and verify UX impact.
4. Introduce lite settings read paths for storefront/checkout/status endpoints where possible.
5. Add page-level fetch deferral in Settings and delivery-log workspaces.

Phase C (careful request-path side-effect optimization)
1. Instrument request-path latency by route + sub-step in development/staging.
2. Review `emitInternalEvent` handlers and classify inline-critical vs deferrable.
3. Move only safe, non-critical handlers toward existing background job mechanisms.
4. Re-measure and cap heavy endpoints with explicit DTO contracts.

## Major Payment/Order/Inventory Issue Check

No major correctness issue found in this audit pass that requires emergency logic changes. Payment finalization remains webhook-verified and server-owned.

## Optional Instrumentation Note

A tiny reusable dev-only server timing helper is recommended next, but was not added in this audit-only pass to keep Phase A code-touch minimal.

## Phase B Implementation Notes

### What Was Optimized

- Slimmed `GET /api/orders` list query in `src/server/services/order.service.ts` from broad relation `include` usage to explicit summary `select` fields needed by current list consumers.
- Kept order detail-level relation depth in detail-focused routes/services only.
- Added page-size guardrails for order list (`max 100`) and normalized page/pageSize handling in service-level pagination.
- Added pagination support for admin collections list (`GET /api/collections`) with defaults/bounds: `page=1`, `pageSize=25`, `max pageSize=100`.
- Added pagination and list-summary DTO for integrations list (`GET /api/settings/integrations`) with per-row summary counts (`eventCount`, `secretCount`) instead of relation-heavy payloads.
- Added list DTO select for discounts list (`GET /api/discounts`) and enforced pagination max `pageSize=100`.
- Reduced admin context initial list fetch page sizes from `100` to `25` for orders/products/customers/discounts.
- Updated list-consuming admin UI compatibility points:
  - Collections workspace now handles paginated collections response shape.
  - Integrations panel now consumes paginated summary list and fetches detail by id when opening Manage.

### Intentionally Left For Later

- No checkout create refactor.
- No Stripe webhook flow changes.
- No event-dispatcher side-effect model changes.
- No schema changes.
- No background worker topology changes.
- No Redis or new dependencies.

### Estimated Reductions (Quick, Non-Benchmark)

- Orders list: removed full `customer` and deep relation payloads from list endpoint in favor of explicit field picks; expected response-size reduction is significant on larger order rows, especially where address/payment objects carry extra columns.
- Integrations list: removed per-row events/secrets relation arrays from list response; replaced with counts and summary fields for list view.
- Discounts list: replaced full discount row return with explicit list-select fields only.
- Admin initial load: four high-traffic contexts now request `25` rows instead of `100` on first fetch (75% fewer rows per initial request path).

## Phase C Implementation Notes

### What Changed

- Added split settings read profiles in `src/server/services/settings.service.ts`:
  - `getStoreSettingsFull()` keeps relation-heavy shipping/tax includes for checkout/shipping-critical consumers.
  - `getStoreSettingsLite()` reads store scalars only (no heavy relation includes).
  - `getStoreSettings()` remains a full-profile compatibility alias to avoid breaking existing critical paths.
- Switched safe consumers to lite profile:
  - `GET/PATCH /api/settings`
  - `getPublicStorefrontSettings()` and `GET /api/storefront/settings`
  - email/template and note-email composition reads
  - shipping location validation read (`/api/settings/shipping/locations/validate`)
- Deferred settings workspace non-visible fetches in `src/components/settings/SettingsWorkspace.js`:
  - Shipping section now loads only shipping profile + setup status.
  - Taxes section now loads only tax rules/settings + shipping-zone tax region data.
  - Removed eager setup diagnostics fetch for `payments/shipping/email`; setup diagnostics now load only on the Setup section.
- Added reusable dev/staging timing helper:
  - `src/server/observability/timing.ts`
  - opt-in via `DOOPIFY_ROUTE_TIMING=1`
  - suppressed in production-like environments by default
  - logs route, total duration, optional step durations, status code, and request id when available.
- Added route timing instrumentation to:
  - `GET /api/orders`
  - `GET /api/orders/[orderNumber]/detail`
  - `GET /api/settings`
  - `POST /api/checkout/create`
  - `POST /api/checkout/shipping-rates`
  - `POST /api/webhooks/stripe`

### Settings Consumers Using Lite vs Full

- Lite:
  - admin general settings reads (`/api/settings`)
  - storefront-safe settings reads (`getPublicStorefrontSettings`)
  - non-checkout email/store identity reads (template/note email composition, send-test)
  - shipping location pre-validation provider lookup
- Full:
  - checkout pricing and shipping quote generation paths
  - shipping label and shipping setup paths that rely on package/location/zone/rate/tax relations
  - abandoned checkout recovery pricing paths
  - any path still calling `getStoreSettings()` (compat alias to full)

### Fetch Deferrals Applied

- Settings workspace now avoids fetching tax/rules/zones data while user is on Shipping tab.
- Settings workspace now avoids fetching shipping setup/profile payloads while user is on Taxes tab.
- Setup diagnostics payload is no longer fetched when user opens Payments/Shipping/Email tabs.
- Webhook deliveries workspace already deferred detail payload fetches (diagnostics/retry detail) until row actions; no additional behavior change was required there in this phase.

### Timing Coverage Notes

- Timing is opt-in and response-shape-neutral.
- Logging includes step checkpoints only (no payload logging, no secrets).
- Production remains quiet by default unless explicitly changed in code/config.

### Remaining Unresolved Performance Items

- Checkout/create and shipping-rates still include external provider/Stripe latency by design.
- Stripe webhook processing remains synchronous and correctness-first; no side-effect offloading done in this phase.
- Delivery logs runner-status still loads on page entry because the panel is visible by default.
- Additional DTO tightening remains for some read-heavy endpoints beyond Phase B/C scope.

## Phase D1 Implementation Notes (Admin Order Detail Lazy Secondary Panels)

### Goal

- Speed up `/admin/orders/[orderNumber]` first load by returning a focused core DTO from `GET /api/orders/[orderNumber]/detail`.
- Move heavier secondary data to on-demand read endpoints without changing mutations or payment truth behavior.

### What Changed

- Added a **core detail** service path:
  - `getAdminOrderCoreByOrderNumber(orderNumber)`
  - Used by `GET /api/orders/[orderNumber]/detail`.
- Added lazy secondary read endpoints:
  - `GET /api/orders/[orderNumber]/detail/timeline`
  - `GET /api/orders/[orderNumber]/detail/fulfillment`
- Added service helpers consumed by these endpoints:
  - `getAdminOrderDetailTimelineByOrderNumber(orderNumber)`
  - `getAdminOrderDetailFulfillmentByOrderNumber(orderNumber)`
- Updated `OrderDetailView` to:
  - load core order first
  - fetch timeline and fulfillment/provider secondary sections asynchronously
  - merge secondary payloads into in-memory detail state
  - keep all existing actions and routes for notes, labels, manual fulfillment, status changes, refunds/returns untouched

### Safety Boundaries Preserved

- No changes to order creation flow.
- No changes to payment status mutation logic.
- No changes to fulfillment/refund/return mutation handlers.
- No changes to Stripe webhook verification/finalization path.
- No changes to inventory behavior.
- No schema changes.

### Test Coverage Added/Updated

- Updated `GET /api/orders/[orderNumber]/detail` route test to mock new core service call.
- Added route tests for:
  - `GET /api/orders/[orderNumber]/detail/timeline`
  - `GET /api/orders/[orderNumber]/detail/fulfillment`
- Coverage includes auth gating, safe invalid identifier behavior, 404 behavior on missing order, and success payload shape checks.

## Phase D2 Implementation Notes (Checkout Create Workflow Wrapper)

### Goal

- Add a tiny, explicit workflow wrapper around `POST /api/checkout/create` so the flow is easier to reason about and test without changing checkout truth behavior.

### What Was Wrapped

- Added minimal workflow engine primitives:
  - `src/workflows/engine/types.ts`
  - `src/workflows/engine/define-workflow.ts`
- Added checkout workflow module:
  - `src/workflows/checkout/create-checkout.workflow.ts`
- Switched route integration:
  - `src/app/api/checkout/create/route.ts` now calls `runCreateCheckoutWorkflow(...)` instead of calling the checkout service directly.

### Explicit Checkout Workflow Steps (Declarative)

- `validate_request_payload`
- `load_live_cart_items`
- `calculate_pricing`
- `resolve_shipping_selection`
- `create_or_update_checkout_session`
- `create_payment_intent`
- `emit_checkout_created_event`
- `build_response`

### Behavior Confirmed Unchanged

- Checkout totals logic is still server-owned and still executed by existing `createCheckoutPaymentIntent`.
- Browser-provided totals remain ignored as before.
- Variant/inventory validation failure paths still fail before Stripe PaymentIntent creation.
- Shipping selection revalidation still happens before PaymentIntent creation.
- `checkout.created` event emission behavior remains in the existing checkout service path.
- Route response status and body shape for successful checkout creation are unchanged.
- Stripe webhook/order finalization behavior was not touched.

### Timing

- Existing route timing wrapper remains active and unchanged.
- Added safe workflow timing checkpoints only (`workflow.checkout_create.start`, `workflow.checkout_create.complete`) through the existing route timing helper.
- No sensitive payload/secret/customer/card logging added.

### Tests Added/Updated

- Updated route test mocks to target the workflow wrapper entrypoint:
  - `src/app/api/checkout/create/route.test.ts`
- Added workflow wrapper tests:
  - `src/workflows/checkout/create-checkout.workflow.test.ts`
  - verifies named step list
  - verifies delegation to existing checkout service
  - verifies error passthrough behavior

### Future Workflow Candidates

- Next safe candidate: `POST /api/checkout/shipping-rates` wrapper with explicit step names while preserving existing shipping-service behavior.
- Keep Stripe webhook and paid-order finalization flows correctness-first and unchanged until dedicated hardening review.

## Phase D3 Implementation Notes (Paid-Order Finalization Workflow Wrapper)

### Goal

- Add a tiny, explicit workflow wrapper around paid-order finalization for `payment_intent.succeeded` while preserving exact webhook and checkout-truth behavior.

### What Was Wrapped

- Added paid-order finalization workflow:
  - `src/workflows/checkout/finalize-paid-order.workflow.ts`
- Updated webhook event processor:
  - `src/server/services/stripe-webhook.service.ts`
  - `payment_intent.succeeded` now calls `runFinalizePaidOrderWorkflow({ paymentIntent })`.

### What Stayed Unchanged

- Stripe signature verification remains in `POST /api/webhooks/stripe`.
- Raw webhook body handling remains `await req.text()` in route handler.
- Webhook secret selection remains via existing `getStripeWebhookSecretSelection()`.
- Duplicate/idempotent finalization remains owned by existing `completeCheckoutFromPaymentIntent`.
- Inventory decrement timing remains owned by existing paid-order finalization service path.
- Payment record behavior, discount usage behavior, and order lifecycle event behavior remain in existing service path.
- Webhook route response/status behavior remains unchanged (`200`/`400`/`500`/`503` behavior preserved).

### Intentionally Not Extracted

- No Stripe verification logic was moved into workflow.
- No raw request payload parsing/validation logic was moved into workflow.
- No idempotency logic was duplicated or reimplemented in workflow.
- No `completeCheckoutFromPaymentIntent` internals were rewritten.

### Why Signature Verification Stays Outside Workflow

- Signature verification must remain at the HTTP boundary before any event processing side effects.
- This preserves security invariants and keeps workflow scope limited to already-verified payment intent finalization context.
