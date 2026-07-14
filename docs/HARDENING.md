# Doopify Hardening Status

> Security, correctness, and operational readiness for the commerce loop.
>
> Documentation refresh: May 5, 2026
> Last repo verification recorded in active docs: May 5, 2026
> Companion to `STATUS.md` and `features-roadmap.md`.

## Why Hardening Matters

Doopify is now a real commerce app. The most important risks are payment correctness, inventory correctness, auth/session integrity, safe public data exposure, and operational debuggability.

Phase 4 adds merchant lifecycle and integration risks: refunds, returns, outbound webhook delivery, integration secrets, transactional email recovery, and setup automation must be safe, observable, and retryable without duplicating commerce side effects or leaking secrets.

## Closed In This Pass

### First-Run Bootstrap And Owner Security

- No permanent default admin credentials exist in production
- `POST /api/bootstrap/owner` checks atomically (inside a transaction) that no active OWNER exists before creating one; returns 409 if an owner already exists
- Optional `SETUP_TOKEN` env var: if configured, token must be provided to bootstrap; if absent, bootstrap is open but still gated by the active-owner check
- Bootstrap route is a public prefix so it works before any session exists; it closes permanently after first use because subsequent calls always fail the active-owner check
- `/create-owner` page checks `/api/bootstrap/owner` on load and redirects to login if bootstrap is no longer available
- Owner is signed in immediately after creation, eliminating any credential-sharing window

### Team Account Security

- Invite tokens are 64 hex characters (32 random bytes), stored only as bcrypt hashes in `UserInvite`; the raw token is never persisted
- Invites are single-use (deleted atomically on acceptance inside a transaction), expire in 7 days, and are independently revocable
- Disabling a user immediately deletes all their sessions; `verifyToken` also independently checks `user.isActive`, so disabled users cannot use stale JWTs
- The last-owner invariant is enforced in service code: disable and role-demote operations fail if the target is the only active OWNER
- Only OWNER can access team management APIs; ADMIN, STAFF, and VIEWER are blocked by `requireOwner`
- API responses never include `passwordHash` or raw `tokenHash` fields

### Owner MFA Baseline

- OWNER accounts can enroll TOTP MFA and receive one-time recovery codes.
- OWNER login now supports explicit MFA challenge verification before session issuance when MFA is enabled.
- MFA recovery code usage is audited and consumed exactly once.
- Owner grace-period tracking exists for staged enforcement planning without weakening current auth/session guards.

### Auth And Session Integrity

- `src/lib/env.ts` validates critical environment variables up front
- JWT validation checks the backing `Session` record, so logout and session revocation are real
- New session records store a SHA-256 hash of the bearer JWT. During the staged additive rollout, legacy plaintext rows remain readable only through `SESSION_LEGACY_TOKEN_CUTOFF`; they are not revoked solely because the rollout starts. The historical destructive session migration is never permitted on an existing schema; use `npm run db:deploy:safe` and `docs/SESSION_TOKEN_MIGRATION_RUNBOOK.md`.
- login is rate-limited by IP plus email
- shared cookie parsing lives in `src/lib/cookies.ts` instead of ad hoc regexes

### Route Protection

- `src/proxy.ts` uses boundary-safe public-prefix matching
- admin and private API protection is running through the active Next.js 16 proxy hook
- Sensitive API routes use route-level authorization helpers in addition to `src/proxy.ts`. Proxy protection is the outer gate; route-level helpers are the route's own authorization guard.
- route-level auth helpers in `src/server/auth/require-auth.ts` provide a second authorization layer for sensitive API handlers
- ADMIN role added to UserRole enum; `requireAdmin` now accepts OWNER, ADMIN, and STAFF; `requireOwner` remains OWNER-only; team and payment credential APIs require OWNER
- product and variant creation routes now call `requireAdmin(req)` before mutation work
- the old idea of adding `src/middleware.ts` was intentionally not kept because the repo should not maintain both proxy and middleware flows

### Media And Public Data Safety

- SVG uploads are no longer accepted
- upload MIME is verified from file bytes instead of trusting the browser-reported type
- upload linking verifies the target product before attaching media
- media storage now supports production-safe S3-compatible object storage (Cloudflare R2/AWS S3) with Postgres fallback preserved for local/dev defaults
- storefront product APIs return explicit public DTOs instead of raw Prisma payloads
- public storefront settings are exposed through a safe read-only endpoint
- storefront collection APIs split summary and detail payloads so list surfaces avoid nested product overfetching
- unpublished collections are excluded from storefront collection reads

### Order And Checkout Correctness

- order totals are recomputed server-side
- persisted money fields now store integer minor units at rest to eliminate floating-point drift in database truth
- checkout pricing flows through `src/server/checkout/pricing.ts`
- checkout validates live variant pricing and inventory before creating the payment intent
- checkout Stripe runtime now prefers verified DB credentials and safely falls back to env credentials when no verified DB Stripe connection exists
- orders are created only from verified Stripe webhook success
- duplicate webhook deliveries are handled idempotently through the payment-intent path
- checkout failure state is persisted and surfaced on the success-page polling flow
- buyer-facing checkout status polling requires an unguessable capability token; only its hash is persisted with the checkout session, so a payment-intent ID alone cannot expose order or digital-download details
- checkout-native code discounts are calculated through the server pricing authority
- checkout pricing applies persisted shipping-zone/rate and jurisdiction tax-rule configuration from admin-managed settings
- checkout shipping options now load through `POST /api/checkout/shipping-rates`, and selected shipping quotes are revalidated server-side before payment-intent amounts are created
- checkout payload snapshots persist shipping/tax resolution decisions for historical accuracy after config changes
- discount applications and usage counts are persisted only after verified paid order creation succeeds
- manual fulfillment now uses an admin-only API (`POST /api/orders/[orderNumber]/manual-fulfillment`) with order-item ownership checks, over-fulfillment rejection, and paid-order gating
- shipping label rates and purchases now use admin-only order APIs (`POST /api/orders/[orderNumber]/shipping-rates`, `POST /api/orders/[orderNumber]/shipping-labels`) with provider-rate revalidation against fresh server-fetched rates
- shipping label purchase persists a separate `ShippingLabel.labelAmountCents` value and must not mutate checkout/order totals or payment status
- checkout shipping-rate mode selection (`LIVE_RATES` / `MANUAL` / `HYBRID`) is persisted server-side and enforced in the shipping-rate service using persisted provider/package/location/manual/fallback configuration
- checkout rate selection and label purchase remain decoupled: manual checkout rates do not imply a label exists, and connected label providers remain available for post-order label buying even when checkout used a manual rate
- shipping provider intent remains explicit: active-rate-provider and label-provider settings can diverge, and fallback behavior (`SHOW_FALLBACK` / `HIDE_SHIPPING` / `MANUAL_QUOTE`) must be enforced by server-owned shipping rate resolution
- fulfillment lifecycle jobs now run through the shared job system: `SYNC_SHIPPING_TRACKING` for safe tracking-field sync plus provider polling-driven `deliveredAt` updates, and `SEND_FULFILLMENT_EMAIL` for tracked shipping-update delivery attempts
- shipping provider webhook ingestion now supports `POST /api/webhooks/shipping-provider?provider=EASYPOST|SHIPPO` with signature verification and tracked fulfillment/shipping-label updates
- inbound Stripe webhook deliveries are durably logged with provider event id, type, status, attempts, processed timestamp, last error, payload hash, verified local payload storage, and retry metadata
- inbound Stripe webhook signature verification now prefers verified DB webhook secret and falls back to env webhook secret only when verified DB webhook secret is unavailable
- inbound webhook replay uses verified local payloads instead of refetching from Stripe
- inbound webhook retry/support diagnostics are available through admin API/UI
- fast automated tests cover checkout pricing, discount-code math and invalid states, checkout creation, checkout payload validation failures, checkout inventory-exhaustion rejection, duplicate payment-intent completion, invalid webhook signature rejection, verified webhook payload capture, retry scheduling/exhaustion, cron retry authorization, local-payload replay, and support diagnostics
- gated real-DB integration specs cover paid checkout inventory decrement, duplicate payment-intent idempotency, competing duplicate completions, insufficient-stock consistency, paid-only/idempotent discount usage, concurrent checkout creation near stock-out, conflicting success/failure webhook delivery for one payment intent, paid-order finalization while email delivery fails, concurrent discount usage-cap enforcement, late payment-success webhook delivery against expired sessions, and stored-payload webhook retry idempotency

### Refund And Return Correctness

- refund service persists a `PENDING` refund before calling Stripe
- Stripe refund calls use deterministic idempotency keys
- Stripe refund failure records a failed refund without changing order/payment/inventory state
- issued refunds update payment and order payment status
- item-level refund validation checks order ownership, variant match, amount, and quantity bounds
- inventory restocking only happens after Stripe refund success
- returns validate order-owned items
- returns follow an explicit state machine
- received returns can close with a linked refund
- close-with-refund validates refund quantities and variants against actual return items
- admin order detail now exposes refund, return creation, return workflow, and close-with-refund controls
- admin order detail notes now flow through a dedicated admin route (`PATCH /api/orders/[orderNumber]/notes`) with timeline event writes and optional tracked customer-note email sends that remain isolated from payment/inventory/refund/return durability
- refund creation and failed Stripe refund attempts now emit best-effort audit events with actor, order id/number, payment id, refund id, amountCents, currency, status, reason, restockItems, and item count, while excluding card data, raw Stripe responses, provider secrets, free-text notes, and Stripe identifiers
- return creation/status transitions now emit best-effort audit events with actor/resource context and safe transition snapshots for `created`, `approved`, `declined`, `in_transit`, `received`, `closed`, and `closed_with_refund`
- refund flow durability is defended against audit-emission failures so commerce truth and downstream internal events still proceed when audit persistence misbehaves
- fast and gated integration coverage exists for representative refund/return lifecycle behavior

### Outbound Merchant Webhook Hardening

- outbound merchant webhooks are queued from typed internal events through `queueOutboundWebhooks()` instead of ad hoc route logic
- outbound webhook delivery records are persisted in `OutboundWebhookDelivery`
- delivery payloads include event metadata and creation timestamp
- outbound deliveries use timestamped HMAC signatures in `sha256=<hex>` format
- delivery requests include `X-Doopify-Delivery`, `X-Doopify-Event`, `X-Doopify-Timestamp`, and `X-Doopify-Signature`
- custom outbound headers can be stored as encrypted `IntegrationSecret` rows using `HEADER_`-prefixed keys
- integration edits preserve existing signing secrets unless explicitly cleared
- integration event subscriptions are deduplicated and constrained unique by integration/event
- outbound delivery processing now claims a delivery before sending to reduce duplicate sends from overlapping retry workers
- manual outbound retry returns clean not-retryable behavior for missing or successful deliveries
- responses record status code, truncated response body, attempts, last error, retry timestamps, and processed timestamps
- failed deliveries retry with backoff and then move to an exhausted/dead-letter state
- due outbound deliveries are processed through the existing cron-compatible retry runner
- manual retry is available through `POST /api/outbound-webhook-deliveries/[id]/retry`
- `/admin/webhooks` shows inbound and outbound delivery visibility with outbound retry controls
- `/admin/webhooks` is user-labeled as **System -> Delivery logs** to separate monitoring/debugging from setup workflows
- settings integration UI supports webhook URL, selected events, active/inactive status, signing secret, explicit signing-secret clear, and encrypted custom headers
- fast tests cover outbound queueing, signing, delivery success, retry/exhaustion, due processing, manual retry, claim behavior, listing, and retry route behavior

### Transactional Email Observability (Current Slice)

- private email delivery list/detail/resend APIs now exist at `GET /api/email-deliveries`, `GET /api/email-deliveries/[id]`, and `POST /api/email-deliveries/[id]/resend`
- safe resend eligibility is limited to failed, bounced, and complained deliveries
- resend reuses order-confirmation template rendering and creates a new tracked delivery attempt instead of mutating order/payment/inventory/refund/return/webhook state
- `/admin/webhooks` now includes an email delivery observability surface with filters, detail inspection, and resend controls
- setup remains in Settings (`Settings -> Webhooks`, `Payments`, `Email`, and `Shipping`) while `/admin/webhooks` stays observability-only
- provider webhook ingestion now exists at `POST /api/webhooks/email-provider` with Svix signature verification and bounced/complained status transitions
- fast tests now cover email delivery API routes, resend eligibility behavior, and provider webhook signature/path handling
- `DATABASE_URL_TEST`-gated integration specs now cover safe resend audit-trail behavior and provider bounce/complaint state transitions

### Background Runner Observability

- runner executions now record durable heartbeat state in `JobRunnerHeartbeat`
- tracked runner fields include runner name, last start, last success, last failure, last error summary, and last run duration
- heartbeat status is exposed through admin-safe `GET /api/jobs/runner-status`
- `/admin/webhooks` now surfaces runner heartbeat visibility alongside delivery monitoring
- heartbeat writes are best-effort and must not block `POST /api/jobs/run` job processing when heartbeat persistence fails
- runner visibility is scheduler-agnostic and supports Vercel Cron or external workers calling `POST /api/jobs/run`

### Legal And Disclosure Baseline

- Public legal pages now exist at `/privacy` and `/terms`.
- A disclosure channel is published at `/.well-known/security.txt`.
- Store contact details used on legal surfaces are sourced from persisted store settings.

### Internal Extensibility Without Premature Plugin Complexity

- typed internal events are in place
- event handlers execute through a static registry instead of a runtime filesystem loader
- order confirmation email is driven from the `order.paid` event
- outbound merchant webhooks are built on the same typed event dispatcher instead of a plugin marketplace abstraction
- analytics lifecycle fan-out now runs through the same typed dispatcher with durable `AnalyticsEvent` persistence

## Verified

Validated locally by the maintainer on April 28, 2026 after the Phase 4 transactional email observability and real-DB confidence pass:

```bash
npm run test:integration
npm run test
npm run build
```

Recommended full verification before release claims:

```bash
npm run db:generate
npx tsc --noEmit
npm run test
npm run build
```

`npm run test:integration` should be run with a disposable Postgres database/schema before making release claims about real-DB behavior.

## Production Readiness Foundation

- push and pull request CI verification is now codified in `.github/workflows/ci.yml`
- optional integration workflow exists in `.github/workflows/integration.yml` and runs when `DATABASE_URL_TEST` secret is configured
- production runbook docs now cover:
  - deployment checklist
  - environment variable reference
  - webhook/provider configuration
  - Neon setup
  - Stripe setup
  - Resend setup
  - backup/restore
  - admin account recovery

## Remaining Hardening Work

### High Priority

- Run the full local verification gate after the latest correctness patches
- keep production runbooks synchronized with actual behavior as setup/deploy flows evolve
- Keep transactional email observability decoupled from order/payment/inventory/refund/return durability as provider/event coverage expands
- Expand route-level auth helper coverage across remaining high-risk mutations: refunds, returns, fulfillments, settings, integrations, media uploads, webhook replay/retry, and email resend routes
- Expand real-DB lifecycle coverage for new consumers and race/idempotency paths as Phase 4 evolves
- Keep the centralized pricing authority on the server as lifecycle flows evolve
- Continue proving payment, inventory, refund, return, webhook, email, and setup behavior through real-DB tests where transaction behavior matters

### Medium Priority

- Extract the remaining business logic that still lives in route handlers, especially analytics, discounts, and media administration paths
- Keep collection assignment and merchandising APIs admin-only while storefront collection reads stay public and read-only
- Expand audit logging around integration changes, email resends, and webhook retries (refund creation/failed attempts and return lifecycle transitions now emit best-effort audit events; remaining gaps are email resends and webhook retries)
- Keep Settings -> Setup guidance aligned with the shipped setup status service/API and `doopify doctor` as setup automation expands

### Later

- migrate legacy Postgres-backed media bytes to object storage and optionally null historical `MediaAsset.data` after rollout validation
- Add customer-auth hardening when the customer account system exists
- Add broader CSP and response-header hardening once external integrations and asset origins are finalized

## Payment And Checkout Invariants

These invariants should not be broken by future work:

- the browser may start checkout
- the server recalculates checkout totals
- the server validates live variant pricing and inventory
- the server creates and persists the checkout session
- Stripe webhook success finalizes order creation
- browser redirect success does not create the order
- duplicate Stripe events do not create duplicate orders
- checkout customer creation is idempotent when duplicate payment-intent completions race
- conflicting Stripe success/failure deliveries for one payment intent must not downgrade paid checkout state
- inventory decrement happens only after verified payment success
- discount applications and usage increments happen only after verified paid-order creation
- capped discount usage is enforced safely under concurrent paid-order finalization
- late payment-success webhook delivery can finalize an expired checkout session exactly once
- order/payment/inventory commits remain durable even when order confirmation email delivery fails
- failed checkout state is persisted and visible to the user
- persisted money is stored in integer minor units (`*Cents` fields for USD)
- Stripe `amount` values must use the same stored integer cents values directly
- dollar display formatting belongs only at API/UI boundaries, never in persistence math
- checkout shipping charges must be server-calculated and revalidated from server-owned shipping configuration
- label-purchase cost and checkout shipping charge are separate values and must never be conflated
- buying labels must never mutate order totals or payment status
- checkout rates decide what customers pay; label providers create postage after order placement
- manual shipping and manual fulfillment paths must remain available without live carrier credentials
- shipping setup wizard/status/test-rate admin routes must remain admin-authorized and must not expose provider credentials
- shipping provider connect/disconnect/test routes must remain owner-authorized, store credentials only in encrypted `IntegrationSecret` rows, and never return credential values
- owner-only provider settings gateway routes must remain masked-response only, never return raw credential values, and persist provider credentials in encrypted `IntegrationSecret` rows
- Settings -> Payments keeps provider credential entry inside slide-over drawers; the main page should remain status-only and must not render raw provider secrets
- Stripe runtime status and checkout config routes must never expose raw Stripe secret key or webhook secret; publishable key exposure must remain explicit and source-labeled
- provider verification failures should be represented as provider status `ERROR` (normal setup state) rather than treated as app-level exceptions
- retryable provider failures must retain the last verified credential/runtime state and record the new attempt separately; only definitive credential failures may invalidate prior verification
- Playwright mutation suites must require `DATABASE_URL_TEST` on a dedicated non-public schema and must never read `.env` to obtain a normal development database URL
- manual, EasyPost, and Shippo shipping quotes should flow through a normalized internal quote shape before checkout/admin consumers use rate data

## Refund And Return Invariants

- the app must persist enough state to reconcile Stripe refund success/failure
- a Stripe refund should use an idempotency key derived from local refund identity
- order/payment status must not change unless the refund is issued
- inventory restocking must not happen unless the refund is issued and restocking is requested
- refund items must belong to the order and stay within refundable quantity bounds
- returns must move only through allowed state transitions
- closing a return with a refund must link the return to the refund record
- close-with-refund item quantities must not exceed the quantities actually received in the return

## Outbound Webhook Invariants

- outbound webhook subscriptions must be explicit by integration and event
- integration/event subscriptions must be unique
- delivery records must be durable before delivery is attempted
- signing secrets and custom header secrets must be encrypted at rest
- editing an integration must not clear signing secrets unless explicitly requested
- outbound payload signing must include a timestamp to reduce replay risk
- non-2xx responses should be recorded and retried according to policy
- due delivery processing must claim a delivery before sending to reduce duplicate sends from overlapping workers
- exhausted deliveries must remain visible to the admin as a dead-letter state
- manual retries must not erase the history needed to debug earlier failures
- typed internal events remain the source of outbound delivery creation

## Background Job Invariants

- Background side effects are persisted as jobs and processed with claiming, retries, backoff, and exhaustion.
- Core commerce truth such as payment success, order creation, inventory decrement, refunds, returns, and discount usage must not depend on background job success.
- Abandoned checkout recovery can send recovery emails and rebuild checkout intent, but it must never create orders, mark payments paid, decrement inventory, or trust saved/client totals. Verified Stripe webhook success remains the only paid-order finalization path.
- Brand Kit public payloads must expose only safe branding fields. Brand Kit changes must not affect checkout/payment/order correctness.
- For private beta, storefront and checkout readability must not depend on admin theme values; frontend-owned checkout tokens and Stripe appearance settings are the active safety baseline.

## Transactional Email Hardening Target

See `TRANSACTIONAL_EMAIL_OBSERVABILITY_PLAN.md` for the implementation plan.

The first email hardening milestone is complete when:

- order confirmation email delivery creates durable delivery records
- successful sends are marked sent with provider message id and timestamp
- provider failures are visible without rolling back order/payment/inventory work
- bounce and complaint states can be recorded when provider webhooks are wired
- failed/bounced deliveries can be resent from admin without duplicate commerce side effects
- admin list/detail APIs expose safe metadata only
- tests prove email failure and resend behavior do not duplicate orders, payments, inventory changes, refunds, returns, webhooks, or analytics events

## Setup And CLI Hardening Target

See `SETUP_AND_CLI_PLAN.md` for the planned implementation sequence.

The first setup hardening milestone is complete when:

- `doopify doctor` can run read-only setup diagnostics locally
- setup status is available through a safe server service and owner-only `/api/setup/status` access
- Settings -> Setup shows setup health and next actions without running shell commands from the browser
- `doopify setup` can write env files, run Prisma setup, and bootstrap owner/store from a local trusted environment
- secrets are redacted from logs and never exposed through setup-status APIs
- broad Vercel, Neon, Stripe, or email-provider account tokens are not stored long term inside the app unless a scoped token lifecycle exists

## Pricing Hardening Target

As discounts, shipping, and tax evolve, preserve one pricing authority.

Recommended ownership:

```txt
src/server/checkout/pricing.ts
```

The pricing service should own:

- line validation
- variant/product availability checks
- subtotal
- discount calculation
- shipping calculation
- tax calculation
- total
- currency
- rounding
- checkout snapshot shape
- zone/rate resolution precedence
- jurisdiction override precedence

Rules:

- use integer minor units for money
- never trust client-submitted totals
- persist enough snapshot data to keep historical order truth accurate
- persist shipping/tax resolution decisions with checkout snapshots
- keep browser display logic separate from server pricing authority
- keep the core checkout pricing API cents-only; dashboard and storefront dollar values must be converted at route/API boundaries before service logic runs
- do not guess whether a number is dollars or cents based on size
- `Discount.value` is a percentage for `PERCENTAGE` discounts and integer cents for `FIXED_AMOUNT` discounts until the discount model is split into explicit percentage/value fields

## Inventory Hardening Target

Inventory changes should be transaction-safe.

The service should prove:

- successful payment can decrement inventory
- duplicate webhook delivery does not double-decrement
- competing purchases cannot push stock negative
- concurrent checkout creation near stock-out still keeps paid-order inventory deterministic
- insufficient stock fails clearly
- order/payment state remains consistent if inventory mutation fails
- refund restocking never corrupts inventory when Stripe refund creation fails

## Webhook Hardening Target

Webhook operations should stay observable and replayable.

Inbound provider webhook tracking includes:

- provider
- provider event id
- event type
- status
- attempts
- processed timestamp
- last error
- payload hash
- verified local payload storage
- next retry timestamp
- last retry timestamp

Outbound merchant webhook tracking includes:

- integration
- event
- payload
- status
- attempts
- status code
- truncated response body
- processed timestamp
- last error
- next retry timestamp
- last retry timestamp

This enables:

- duplicate-delivery debugging
- deterministic retry behavior
- safe local-payload replay for inbound provider events
- safe retry/dead-letter handling for outbound merchant deliveries
- failed-email debugging once email observability is added
- support/admin visibility without direct database inspection

## Explicit Non-Goals

These ideas are intentionally rejected for this phase:

- creating Stripe PaymentIntents from `order.created`
- exposing Stripe under `/app/api/stripe/webhook/route.ts`
- adding a root-level `fs` plus `require()` plugin loader
- replacing the current admin with fully generated CRUD screens
- treating payment redirects as order finalization
- marketing a public plugin marketplace before the typed integration model matures
- running local shell commands from the browser Setup tab

## Operational Notes

- The correct public Stripe webhook endpoint is `POST /api/webhooks/stripe`
- The retry runner endpoint is `POST /api/webhook-retries/run` and must be called with `Authorization: Bearer WEBHOOK_RETRY_SECRET` or `x-webhook-retry-secret`
- The background jobs runner endpoint is `POST /api/jobs/run`; runner heartbeat visibility supports Vercel Cron and external worker schedulers through `GET /api/jobs/runner-status`
- The browser may start checkout, but only Stripe webhook success finalizes order creation
- Internal event handlers are allowed to fail without corrupting already-committed order or payment data
- Outbound merchant webhook failures should become delivery records, not uncaught lifecycle errors
- Setup automation should start with read-only diagnostics and status checks before mutating user environments
- Postgres-backed media remains an intentional local/dev fallback, while production should use object storage: `MEDIA_STORAGE_PROVIDER=vercel-blob` with `BLOB_READ_WRITE_TOKEN` on Vercel, or `MEDIA_STORAGE_PROVIDER=s3` with `MEDIA_S3_*` configuration for S3/R2

## Exit Criteria For The Next Hardening Pass

The next hardening milestone is complete when:

- transactional email delivery records, status transitions, bounce/complaint handling, and safe resend tooling remain stable as coverage expands
- email failure/resend, outbound retry/idempotency, and integration secret-preservation behavior remain green in real-DB runs
- analytics fan-out behavior remains covered with side-effect safety checks as lifecycle flows expand
- setup diagnostics are implemented in a way that redacts secrets and reuses checks between CLI and admin Setup tab
- provider onboarding UX is split by domain: Setup (foundation only), Payments (payment providers), Shipping (carrier/manual-live mode), Email (email providers), Webhooks (outbound merchant webhooks)
- operational logging is good enough to debug a missing email, duplicate delivery, stuck retry, exhausted outbound webhook, or broken setup without inspecting the database manually
