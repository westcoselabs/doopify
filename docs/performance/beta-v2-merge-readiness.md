# Beta/V2 Merge Readiness Review (Phase F)

Date: 2026-05-19  
Branch context: `beta/v2`  
Review scope: merge-readiness only (no new features)

## 1) Executive Summary

### What beta/v2 improves

- **Performance/query hygiene** on admin-heavy APIs:
  - slimmer list selects for orders/discounts
  - pagination added or tightened for collections/integrations
  - smaller default admin context page sizes (`100 -> 25`)
- **Settings fetch optimization**:
  - `full` vs `lite` settings profile split
  - deferred settings tab fetches by active section
- **Route timing instrumentation**:
  - opt-in timing for key routes (`DOOPIFY_ROUTE_TIMING=1`)
  - no payload/secret logging
- **Admin order detail load-shaping**:
  - core detail payload first
  - lazy secondary reads for timeline + fulfillment/provider sections
- **Workflow readability wrappers**:
  - thin wrapper around `checkout.create`
  - thin wrapper around paid-order finalization path
- **Minimal safe worker process**:
  - route-caller only
  - no direct DB claiming

### What beta/v2 intentionally does not change

- No checkout totals authority changes (still server-owned).
- No checkout response-shape redesign.
- No Stripe signature/raw-body/webhook-secret flow changes.
- No order finalization truth-model changes.
- No inventory truth timing changes.
- No schema changes.
- No Redis or new queue infra.
- No direct DB-claim worker.

## 2) Files Changed by Category

### Performance/query

- `src/server/services/order.service.ts`
- `src/app/api/orders/route.ts`
- `src/app/api/discounts/route.ts`
- `src/app/api/collections/route.ts`
- `src/server/services/collection.service.ts`
- `src/app/api/settings/integrations/route.ts`
- `src/context/OrdersContext.js`
- `src/context/ProductsContext.js`
- `src/context/CustomersContext.js`
- `src/context/DiscountsContext.js`

### Settings/fetch

- `src/server/services/settings.service.ts`
- `src/app/api/settings/route.ts`
- `src/components/settings/SettingsWorkspace.js`
- `src/components/settings/IntegrationsPanel.js`
- `src/app/api/settings/shipping/route.ts`
- `src/app/api/settings/shipping/locations/validate/route.ts`

### Order detail (core/secondary split)

- `src/server/services/admin-order-detail.service.ts`
- `src/app/api/orders/[orderNumber]/detail/route.ts`
- `src/app/api/orders/[orderNumber]/detail/timeline/route.ts`
- `src/app/api/orders/[orderNumber]/detail/fulfillment/route.ts`
- `src/components/orders/OrderDetailView.jsx`

### Workflows

- `src/workflows/engine/types.ts`
- `src/workflows/engine/define-workflow.ts`
- `src/workflows/checkout/create-checkout.workflow.ts`
- `src/workflows/checkout/finalize-paid-order.workflow.ts`
- `src/app/api/checkout/create/route.ts`
- `src/server/services/stripe-webhook.service.ts`

### Worker

- `src/worker/route-runner.ts`
- `src/worker/index.ts`
- `docs/deployment/worker.md`
- `package.json` (worker scripts)
- `tsconfig.json` (`allowImportingTsExtensions`)

### Docs/tests/config

- `docs/performance/audit-beta-v2.md`
- `docs/performance/timing-review-beta-v2.md`
- `docs/performance/side-effect-classification-beta-v2.md`
- `docs/performance/worker-separation-plan-beta-v2.md`
- workflow/route/worker test additions and updates under `src/**/**.test.*`

## 3) Risk Review

### Checkout risk: **Low**

- `POST /api/checkout/create` now delegates to `runCreateCheckoutWorkflow`, which delegates to existing `createCheckoutPaymentIntent`.
- Wrapper is thin (named steps + pass-through result/error).
- No pricing authority move to browser.

### Stripe webhook risk: **Low**

- `POST /api/webhooks/stripe` still:
  - reads raw body via `req.text()`
  - verifies signature via existing `verifyStripeWebhookSignature`
  - selects webhook secret via existing `getStripeWebhookSecretSelection`
  - returns same status behavior (`400/500/503/200`) per same conditions
- Added timing wrapper/step markers only.

### Inventory risk: **Low**

- Paid-order workflow wrapper delegates to existing `completeCheckoutFromPaymentIntent`.
- Inventory decrement timing remains in existing service path.

### Worker risk: **Medium-Low (operational)**

- Worker is intentionally route-caller only (safe scope).
- No DB claim logic added.
- One route failure does not halt other route calls in the same pass.
- Remaining known limitations still apply (stale RUNNING recovery, crash-safe claim lifecycle hardening deferred).

### UI response-shape risk: **Medium**

- Some list endpoints changed to paginated/summary shapes.
- Calling UIs were updated to consume new shapes.
- Manual smoke is still required for admin list/detail surfaces.

### Deployment risk: **Medium-Low**

- New optional worker process requires environment variables and process orchestration.
- Existing protected routes remain available; rollback is straightforward (stop worker).

### tsconfig/package script risk: **Low**

- `tsconfig.json` adds `allowImportingTsExtensions: true`, required because worker runtime imports `./route-runner.ts` explicitly for Node strip-types execution.
- Worker scripts use `node --experimental-strip-types` and are compatible with current local runtime (Node `v24.11.1`).

## 4) Required Manual Smoke Test Checklist

### Admin

- [ ] Login
- [ ] Products list
- [ ] Customers list
- [ ] Discounts list
- [ ] Collections list pagination/search
- [ ] Orders list pagination/status
- [ ] Order detail default view
- [ ] Order detail timeline lazy load
- [ ] Order detail fulfillment lazy load
- [ ] Settings general
- [ ] Settings shipping
- [ ] Settings taxes
- [ ] Settings integrations manage drawer
- [ ] Delivery logs

### Storefront

- [ ] Homepage
- [ ] Shop page
- [ ] Collection page
- [ ] Product page
- [ ] Cart
- [ ] Checkout shipping rates
- [ ] Checkout create
- [ ] Stripe test payment
- [ ] Checkout success page

### Worker

- [ ] `npm run worker:once` against local app
- [ ] `npm run worker` in loop mode briefly
- [ ] Verify logs contain no secrets
- [ ] Verify one route failure does not stop all route calls

## 5) Automated Validation

Run in merge-readiness pass:

- `npm run lint`
- `npm run test`
- `npm run build`

Optional (if env available):

- `npm run test:integration`

## 6) Rollback Plan

### Disable worker

1. Stop worker process/scheduler.
2. Keep app routes unchanged.
3. Continue manual/admin runner paths as before.

### Ignore route timing

1. Unset `DOOPIFY_ROUTE_TIMING` (or set falsey).
2. No code rollback required.

### Revert beta/v2 entirely

1. Revert merge commit (or reset deployment target to pre-beta/v2 revision).
2. Re-deploy without worker process.

## 7) Known Follow-Ups After Merge

- Stale `RUNNING` job recovery.
- Crash-safe inbound retry claim lifecycle.
- Crash-safe outbound retry claim lifecycle.
- Customer note email queueing.
- Re-evaluate direct DB worker only after claim/idempotency hardening.
- Further timing-based optimization on measured bottlenecks.

## 8) Focused Code Review Findings

### tsconfig change necessity/safety

- `allowImportingTsExtensions` is necessary for `src/worker/index.ts` importing `./route-runner.ts`.
- Scope is narrow and does not alter runtime checkout/webhook behavior.

### Worker scripts/runtime compatibility

- Scripts:
  - `worker`: `node --experimental-strip-types src/worker/index.ts --loop`
  - `worker:once`: `node --experimental-strip-types src/worker/index.ts --once`
- Confirmed compatible with local Node runtime (`v24.11.1`).

### Secret logging check

- Worker structured logs include route, status, duration, success/failure.
- No secret values are logged.
- Worker tests assert secret strings are absent from logs.

### Route auth compatibility check

- Worker uses `Authorization: Bearer <secret>` per target route.
- Matches existing protected route auth checks for:
  - `/api/jobs/run`
  - `/api/webhook-retries/run`
  - `/api/abandoned-checkouts/send-due`

### Checkout/webhook workflow thin-wrapper check

- `create-checkout.workflow` delegates to `createCheckoutPaymentIntent`.
- `finalize-paid-order.workflow` delegates to `completeCheckoutFromPaymentIntent`.
- No rewrite of pricing/finalization internals.

### Order detail secondary endpoint exposure check

- New secondary endpoints are admin-protected and return data previously available via full detail payload sections.
- No newly exposed sensitive payment/webhook secrets.
- Payload shaping is split/lazy, not broader in privilege scope.

## 9) Merge Recommendation

**Ready after manual smoke test.**

No merge blocker was found in this review pass. Merge should wait for the manual checklist above, especially:
- order detail lazy panel behavior,
- checkout + Stripe test payment end-to-end,
- worker route-caller operation in once/loop modes.

## Smoke Test Fixes (Post-Review)

- Checkout email state fix:
  - Added frontend email normalization + validation before checkout create.
  - `Review Payment` is now blocked until email is present and valid.
  - Submit path now reads the latest form email value (covers browser autofill/state drift) before API call.
  - Backend email requirement remains unchanged.
- Admin product thumbnail fix:
  - Product summary media selection is now deterministic and product-local using `isFeatured desc`, then `position asc`, then `id asc`.
  - Summary response still returns a single lightweight thumbnail item when available, else empty/fallback.
- Validation:
  - Re-run `npm run lint`, `npm run test`, and `npm run build` after these fixes before merge.

## Second Smoke Test Fixes

- Variant weight persistence fix:
  - Preserved variant `weight` and `weightUnit` through `prepareProductForSave` even when option-based variant generation runs.
  - Added safe normalization for invalid/negative weight values (normalized to `null`) and fallback unit (`kg`).
  - Fixed product-detail hydrate mapping to keep legitimate `0` weight values on editor reopen (`??` instead of `||`).
- Variant table and SKU layout fix:
  - Enabled horizontal overflow on the matrix container for wide variant tables.
  - Added deterministic minimum row width for matrix header/rows.
  - Converted SKU/price/inventory/weight cells to vertical stacks so helper errors render below inputs without overlap.
  - Improved error text wrapping and spacing for long SKU validation messages.
- Validation:
  - Re-run `npm run lint`, `npm run test`, and `npm run build` after this second smoke fix pass.
