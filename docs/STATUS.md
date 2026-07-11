# Doopify Status

> Canonical status snapshot for developers, maintainers, and AI agents.
>
> Documentation refresh: July 10, 2026
> Last repo verification recorded in active docs: May 5, 2026
> Current active phase: **Phase 26 - Production Security And Compliance Baseline (in progress)**

## Why This File Exists

This file prevents context loss when someone returns to the repo later.

Doopify previously had multiple planning files with conflicting status. The active state is consolidated here, while product sequencing lives in `features-roadmap.md` and security/operational work lives in `HARDENING.md`.

## Product Identity

Doopify is a developer-first, self-hostable commerce engine with:

- a real protected admin
- a real storefront
- Prisma as the commerce source of truth
- PostgreSQL persistence
- Stripe-backed checkout architecture
- verified webhook order finalization
- typed server-side extension seams
- a static integration registry before any public plugin platform

## Current Repo Truth

Doopify is a real DB-backed commerce app, not a prototype.

The repo currently includes:

- Prisma/Postgres commerce schema for products, variants, media, customers, orders, discounts, settings, sessions, payments, fulfillments, refunds, returns, integrations, inbound webhook deliveries, outbound webhook deliveries, and email deliveries
- persisted commerce money fields now use integer minor units (cents) at rest with server-side conversion boundaries
- Next.js App Router admin, storefront, and API surface
- protected admin auth with session-backed JWT validation and hashed persisted bearer-token records
- owner MFA foundation with TOTP enrollment, recovery codes, and login challenge verification
- private route protection through `src/proxy.ts`
- production security-header foundation with shared header builder, proxy-applied baseline headers, HSTS in production, Referrer-Policy, X-Content-Type-Options, and CSP frame-ancestors coverage with report-only mode defaults
- route-level authorization helpers (`requireAuth`, `requireAdmin`, `requireOwner`, `requireRole`) applied across sensitive admin mutation and observability APIs as an inner authorization guard
- public storefront routes for homepage, shop, product detail, collections, and collection detail
- legal storefront pages at `/privacy` and `/terms` with configurable store contact fields
- `/.well-known/security.txt` vulnerability disclosure endpoint
- Stripe checkout creation, Stripe webhook processing, capability-token-protected checkout status polling, checkout session persistence, and idempotent paid-order finalization
- inventory decrement only after verified Stripe payment success
- centralized checkout pricing in `src/server/checkout/pricing.ts`
- checkout-native discount-code validation and paid-order discount usage persistence
- settings-backed shipping/tax rates plus persisted shipping zones/rates and jurisdiction-aware tax rules
- shipping settings Phase 1 foundation with shipping mode/manual-rate API (`GET/PATCH /api/settings/shipping`) and admin workspace at `/admin/settings/shipping`
- shipping setup Phase 2 foundation with setup wizard workspace (`/admin/settings/shipping/setup`) and setup APIs for status/save/test (`GET /api/settings/shipping/setup-status`, `PATCH /api/settings/shipping/setup`, `POST /api/settings/shipping/test-rates`)
- shipping setup Phase 3 foundation with provider connect/disconnect/test APIs (`POST /api/settings/shipping/connect-provider`, `POST /api/settings/shipping/disconnect-provider`, `POST /api/settings/shipping/test-provider`) and encrypted provider credential storage through `IntegrationSecret`
- shipping setup Phase 4 foundation with normalized shipping-rate resolution service (`src/server/shipping/shipping-rate.service.ts`) for manual/live/hybrid quoting and hybrid fallback behavior
- shipping setup Phase 5 foundation with public checkout shipping-rate quote API (`POST /api/checkout/shipping-rates`), checkout shipping-option selection, and server-side selected-rate revalidation before payment-intent amount creation
- shipping setup Phase 6 foundation with admin manual-fulfillment API (`POST /api/orders/[orderNumber]/manual-fulfillment`), over-fulfillment validation, fulfillment-item persistence, and fulfillment-status progression without provider dependency
- shipping setup Phase 7 foundation with `ShippingLabel` persistence, admin order-label rates and purchase APIs (`POST /api/orders/[orderNumber]/shipping-rates`, `POST /api/orders/[orderNumber]/shipping-labels`), provider-backed label purchasing, fulfillment linkage, and order-page label purchase controls
- shipping setup Phase 8 expansion with provider-backed tracking polling plus webhook ingestion (`POST /api/webhooks/shipping-provider?provider=EASYPOST|SHIPPO`) that can drive `Fulfillment.deliveredAt`, alongside background fulfillment lifecycle jobs (`SYNC_SHIPPING_TRACKING`, `SEND_FULFILLMENT_EMAIL`) and tracked shipping-update email deliveries
- shipping and delivery functional expansion with persisted shipping mode, explicit active-rate-provider vs label-provider settings, fallback behavior modes, package/location/manual-rate/fallback-rate APIs, compact provider-first Settings -> Shipping & delivery drawers (including manual fulfillment/local delivery/pickup/packing slip settings), checkout mode-aware live/manual/hybrid rate resolution, and order-level selected shipping method snapshots (`shippingMethodName`, `shippingRateType`, `shippingAmount`, `shippingProvider`, `shippingProviderRateId`, `estimatedDeliveryText`)
- order detail lifecycle Phase 8 expansion with admin notes API (`PATCH /api/orders/[orderNumber]/notes`), customer-visible note timeline entries, optional tracked customer-note email sends, discount snapshot visibility, and guarded payment/fulfillment status quick actions
- owner-only provider connection gateway APIs for settings (`GET /api/settings/providers`, `GET /api/settings/providers/[provider]`, `POST /api/settings/providers/[provider]/credentials`, `POST /api/settings/providers/[provider]/verify`, `DELETE /api/settings/providers/[provider]`) with encrypted credential storage and masked status payloads
- Stripe credential status now distinguishes saved, unreadable, verification-unavailable, and verified states after reload; invalid key formats and test/live mode mismatches are rejected before persistence
- provider connection audit logging for owner credential saves, verification attempts, and disconnects, with actor capture and credential-value redaction
- Stripe runtime now resolves verified DB credentials first with env fallback for checkout payment-intent creation; webhook signature verification now prefers verified DB webhook secret and falls back to env when DB webhook secret is unavailable
- Stripe runtime visibility endpoints now exist at owner-only `GET /api/settings/payments/stripe/runtime-status` and public `GET /api/checkout/stripe-config` (publishable key only, source/mode labeled)
- Settings -> Payments now uses compact provider rows plus per-provider slide-over drawers so credential fields are not always visible on the main settings page
- Smart Promotion catalog pickers now use product-list variant summaries directly, avoiding per-product detail requests when opening create or edit drawers
- Settings -> Webhooks now uses a compact outbound endpoint manager with drawer-based create/manage flow, friendly event groups mapped to real typed events, and encrypted secret handling without raw secret rendering
- Settings -> Email now emphasizes customer-message workflow sections (providers, sender identity, branding, templates, activity) with provider credentials kept behind Manage drawers
- Settings default tab now opens on **General**; Brand Kit is no longer the first settings experience
- DB-backed admin APIs for products, orders, customers, discounts, analytics, settings, media, collections, shipping zones, tax rules, integrations, inbound webhook deliveries, outbound webhook deliveries, and email deliveries
- media object storage foundation with adapter-based provider selection (`MEDIA_STORAGE_PROVIDER=postgres|vercel-blob|s3`), Vercel Blob support for Vercel production, S3-compatible object storage support (Cloudflare R2/AWS S3 envs), and Postgres binary fallback for local/dev
- durable inbound Stripe webhook delivery logging with verified local payload storage, replay, retry scheduling/exhaustion, diagnostics, and admin visibility at `/admin/webhooks`
- System sidebar now labels `/admin/webhooks` as **Delivery logs** (monitoring/debugging); outbound endpoint configuration remains in `Settings -> Webhooks`
- typed internal event dispatcher and static integration registry
- first-party logging and order-confirmation email consumers
- Phase 4 refund service with pending refund persistence, Stripe idempotency keys, payment/order status updates, validated item-level restocking, and return linkage
- Phase 4 return service with state-machine transitions, order-owned item validation, received-return close-with-refund support, and admin order action panels
- Phase 4 outbound merchant webhook foundation with subscriptions, timestamped HMAC signatures, retry/backoff, manual retry API, dead-letter/exhausted visibility, integration settings UI, and admin delivery visibility
- Phase 4 correctness hardening for outbound webhook delivery claiming, manual retry eligibility, integration secret preservation, event-subscription deduplication, and return refund quantity validation
- Phase 4 transactional email observability foundation with `EmailDelivery` persistence, provider adapter seam, order-confirmation delivery tracking, and fast service tests
- Phase 4 analytics event fan-out foundation with typed lifecycle events, `AnalyticsEvent` persistence, and side-effect-safe consumer handling
- Phase 4 background side-effect job foundation with persisted `Job` records, claiming, retry/backoff/exhaustion lifecycle, secure runner route, and initial order-confirmation email job integration
- Phase 4 background runner observability expansion with durable `JobRunnerHeartbeat` tracking (runner name, last start/success/failure, duration/error summary), admin-safe status API (`GET /api/jobs/runner-status`), and delivery-logs runner visibility compatible with Vercel Cron or external schedulers calling `POST /api/jobs/run`
- Phase 4 abandoned checkout recovery foundation with persisted recovery metadata, admin review/send controls, safe tokenized recovery payload API, and secret-protected due-send processing
- Brand Kit foundation with Store-backed branding fields, admin Brand Kit screen/API, safe public brand payloads, and branded checkout/email defaults
- Private beta brand lock: storefront/checkout theme controls are hidden in admin, while logos/support identity fields remain editable and checkout visual tokens are frontend-owned for consistent readability
- GitHub Actions CI workflow for push/PR verification plus optional integration workflow gated by `DATABASE_URL_TEST` secret
- production runbook docs for deployment checklist, environment variables, webhooks/provider setup, backup/restore, and admin recovery
- Vitest fast test harness plus `DATABASE_URL_TEST`-gated real-DB integration specs
- First-run owner bootstrap flow at `POST /api/bootstrap/owner` and `/create-owner` UI page; gated by active-owner check plus optional `SETUP_TOKEN` env var; route returns 409 if owner already exists; signs owner in immediately after creation
- Team management service (`src/server/services/team.service.ts`) with bootstrapOwner, invite, accept invite (bcrypt-hashed single-use expiring tokens), createUser, listUsers, listPendingInvites, updateRole, disable (kills sessions immediately), reactivate, revokeInvite, resendInvite, and last-owner safety invariant enforced for disable/demote operations
- `UserInvite` model in Prisma schema with hashed token, expiry, role, and inviter tracking
- ADMIN role added to UserRole enum (between OWNER and STAFF); `requireAdmin` now allows OWNER, ADMIN, and STAFF; `requireOwner` stays OWNER-only; team management APIs require OWNER
- Team API surface: `GET/POST /api/team/users`, `PATCH /api/team/users/[id]` (set_role, disable, reactivate), `GET/POST /api/team/invites`, `DELETE /api/team/invites/[id]`, `POST /api/team/invites/[id]/resend`, `POST /api/team/invites/accept`
- `/join?token=<raw>` page for invite acceptance with JoinPortal component
- Settings → Team panel (TeamSettingsPanel) with role chips, last-login display, inline role editor, disable/reactivate controls, pending invite list with revoke/resend, and invite/create drawer
- Proxy updated: `/create-owner`, `/join`, `/api/bootstrap`, `/api/team/invites/accept` are public; `/api/team/*` requires session
- `SETUP_TOKEN` optional env var for additional bootstrap security; if set, token is required during owner creation; if not set, bootstrap is open (only when no owner exists)
- Phase 21: SETUP_TOKEN is now **required in production** (`NODE_ENV=production`) when bootstrapping; development/test remain open; invalid or missing token returns a clear error message
- Phase 21: Change-my-password flow at `PATCH /api/auth/password` — requires current password, revokes other sessions after change, keeps current session alive
- Phase 21: Password reset flow — owner generates 24-hour expiring hashed token at `POST /api/team/users/[id]/reset-password`; reset accepted (token-gated, public) at `POST /api/auth/password-reset`; all sessions revoked on acceptance; `/reset-password?token=<raw>` UI page
- Phase 21: `PasswordReset` model added to Prisma schema — hashed token, userId, expiry; single-use deletion on acceptance
- Phase 21: Session management — owner views `GET /api/team/users/[id]/sessions` and revokes `DELETE /api/team/users/[id]/sessions`; authenticated user revokes other sessions at `POST /api/auth/sessions/revoke-others`
- Phase 21: `requireAdminOrAbove` added (OWNER + ADMIN only, excludes STAFF); completes the three-level helper set alongside `requireAdmin` (OWNER+ADMIN+STAFF) and `requireOwner`
- Phase 21: Audit logging added to all team operations — owner_created, invite_created, invite_accepted, role_changed, user_disabled, user_reactivated, password_reset_requested, password_reset_completed, sessions_revoked, other_sessions_revoked
- Phase 21: `scripts/reset-owner.mjs` CLI recovery tool (`npm run doopify:reset-owner`) — connects via DATABASE_URL, creates first OWNER if none exists or resets any existing OWNER password, revokes all sessions, logs no hashes or secrets
- Phase 21: Settings → My account panel (AccountSettingsPanel) for change-password and self-revoke-other-sessions; `/reset-password` public page added to proxy and navigation

## Phase 3 Status

Phase 3 is complete.

Shipped Phase 3 scope includes:

- collection service layer and storefront-safe DTOs
- admin collection APIs and `/admin/collections`
- storefront collection APIs and `/collections` routes
- collection publish/unpublish semantics
- collection merchandising surfaces on homepage/shop
- checkout pricing hardening for discounts, shipping, tax, zone/rate resolution, jurisdiction rules, and checkout snapshots
- private admin CRUD for shipping zones/rates and tax rules
- durable inbound Stripe webhook replay/retry/diagnostics/admin visibility
- shared rate-limit store, production Postgres SSL normalization, and audit logging for settings/payment/fulfillment operations
- fast tests and gated real-DB integration tests for the revenue path, inventory, discount usage caps, webhook conflicts, retry idempotency, and concurrency behavior

## Active Phase 4 Scope

Phase 4 is active now.

### Shipped Phase 4 Foundations

#### Refunds And Returns

Shipped:

- admin refund panel on order detail
- admin return creation panel on order detail
- admin return workflow controls for approve, decline, mark in transit, mark received, and close with refund
- refund service creates a `PENDING` refund before calling Stripe
- Stripe refund calls use deterministic idempotency keys
- failed Stripe refund attempts mark the refund `FAILED` without mutating order/payment/inventory state
- issued refunds update payment and order payment status
- item-level refund validation checks order ownership, variant match, and refundable quantity
- restocking occurs only after Stripe refund success
- returns validate order-owned items and follow the `REQUESTED -> APPROVED -> IN_TRANSIT -> RECEIVED -> CLOSED` state machine
- received returns can close with a linked refund
- close-with-refund now validates refund quantities and variants against the actual returned items
- fast tests cover refund/return services and API behavior
- gated integration coverage was added for partial/full refund, restocking, Stripe failure, return state transitions, and return-to-refund linkage

#### Outbound Merchant Webhooks

Shipped:

- `Integration`, `IntegrationEvent`, `IntegrationSecret`, and `OutboundWebhookDelivery` Prisma-backed models
- settings APIs for creating/updating/deleting integrations with encrypted webhook secrets and custom header secrets
- integration edits preserve existing signing secrets unless explicitly cleared
- event subscriptions are deduplicated and constrained unique per integration/event
- `queueOutboundWebhooks()` service for creating outbound delivery records from typed internal events
- `processOutboundWebhook()` service for signed delivery, response recording, backoff, retrying, and exhausted/dead-letter state
- delivery claiming before outbound sends to reduce duplicate overlapping cron delivery
- manual retry eligibility checks for missing, successful, and non-retryable deliveries
- timestamped HMAC signatures in the `sha256=<hex>` format
- delivery headers: `X-Doopify-Delivery`, `X-Doopify-Event`, `X-Doopify-Timestamp`, and `X-Doopify-Signature`
- custom encrypted outbound headers using `IntegrationSecret` keys prefixed with `HEADER_`
- `processDueOutboundDeliveries()` used by the existing cron-compatible retry runner
- `POST /api/outbound-webhook-deliveries/[id]/retry` for manual retry
- hardened `GET /api/outbound-webhook-deliveries` listing API with status validation
- `/settings` integration panel for creating/editing webhook subscriptions, selected events, active/inactive state, signing secret, and encrypted custom headers
- `/admin/webhooks` inbound/outbound direction switch, outbound delivery table, status filter, response/attempt visibility, and manual retry button
- fast tests for outbound service queueing, signing, delivery success, retry/exhaustion, due processing, manual retry, listing route, and retry route

#### Transactional Email Observability

Shipped foundation:

- `EmailDeliveryStatus` enum and `EmailDelivery` Prisma model
- provider adapter seam in `src/server/email/provider.ts`
- email delivery service in `src/server/services/email-delivery.service.ts`
- tracked send flow with `PENDING -> SENT` and `PENDING -> FAILED` persistence
- order-confirmation email delivery now creates delivery records and stores provider metadata when available
- private email delivery APIs: `GET /api/email-deliveries`, `GET /api/email-deliveries/[id]`, `POST /api/email-deliveries/[id]/resend`
- private email delivery listing now supports template filtering (`order_confirmation`, `fulfillment_tracking`) for shipment-email visibility
- safe resend policy for `FAILED`/`BOUNCED`/`COMPLAINED` order-confirmation deliveries that creates a new tracked send without re-emitting commerce side effects
- admin email delivery visibility in `/admin/webhooks` with status filters, detail inspection, resend controls, and pagination
- provider webhook route at `POST /api/webhooks/email-provider` with Svix signature verification and bounced/complained status transitions
- `DATABASE_URL_TEST`-gated integration specs added for safe resend audit-trail behavior and provider bounce/complaint state transitions
- `DATABASE_URL_TEST` real-DB execution now verifies resend side-effect safety, provider bounce/complaint transitions, outbound webhook retry/idempotency behavior, and integration-secret preservation update flows
- fast tests for delivery creation, sent/failed transitions, tracked send success/failure, paginated delivery listing, email delivery API/resend behavior, and provider webhook route behavior

Ongoing expansion:

- broaden real-DB lifecycle coverage as lifecycle consumers and race paths expand

#### Analytics Event Fan-Out

Shipped foundation:

- `AnalyticsEvent` Prisma model for durable server-side lifecycle analytics
- typed analytics lifecycle events for checkout, order, refund, return, email, and webhook outcomes
- analytics consumer registered in the existing internal event registry
- checkout/refund/return/email/webhook services now emit analytics lifecycle events from server-owned flows
- analytics failures are isolated from commerce durability through handler failure containment

#### Abandoned Checkout Recovery

Shipped foundation:

- recovery lifecycle metadata persisted on `CheckoutSession` (`abandonedAt`, `recoveryToken`, send counters/timestamps, `recoveredAt`)
- admin abandoned checkout APIs and workspace for list/detail, mark-due, due-send, and manual recovery sends
- secret-protected cron-compatible due-send route with summary counts
- token-protected checkout recovery API with server-side repricing and safe payload shaping
- checkout completion now marks recovery success only after verified paid completion when recovery outreach occurred

#### Production Security Headers

Shipped foundation:

- shared security-header builder in `src/server/security/security-headers.ts`
- proxy-applied headers for public, protected, redirect, and API JSON response paths
- baseline `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`
- production-only `Strict-Transport-Security`
- production default CSP report-only mode with Stripe-safe script/connect/frame origins
- environment rollback via `SECURITY_HEADERS_ENABLED=false` and CSP mode control through `CSP_MODE=off|report-only|enforce`
- fast tests for header construction and proxy response coverage

#### Provider Credential Audit Logging

Shipped foundation:

- owner-only provider credential saves emit best-effort audit events with actor, provider, state, source, and submitted field names
- owner-only provider verification attempts emit best-effort audit events with verification outcome and safe metadata keys
- owner-only provider disconnects emit best-effort audit events with previous/new state and source
- credential audit snapshots avoid raw provider credential values and include redaction labels for API keys, passwords, and webhook secrets
- fast credentials-route test verifies audit emission and raw value exclusion

#### Refund Audit Logging

Shipped foundation:

- admin refund creation now plumbs the authenticated actor through to the refund service so audit emissions record actorId/actorEmail/actorRole when initiated from the admin route
- successful refund issuance emits a `refund.issued` best-effort audit event with order id/number, payment id, refund id, amountCents, currency, status, reason, restockItems, item count, and resulting payment status
- failed Stripe refund attempts after pending refund creation emit a `refund.attempt_failed` best-effort audit event with the same safe shape plus a truncated error message
- refund audit snapshots exclude card data, Stripe response bodies, provider secrets, free-text refund notes, and Stripe identifiers (charge/payment-intent/refund) and carry explicit redaction labels
- refund flow is decoupled from audit durability through a defensive wrapper so commerce truth (refund row, payment status, order status, restocking, return linkage) and downstream internal events still fire even if audit emission throws
- fast refund-service tests verify successful audit emission, failed-refund audit emission, audit-failure isolation from the refund flow, and snapshot leakage protection for both success and failure paths

#### Return Audit Logging

Shipped foundation:

- admin return creation/status routes now pass authenticated actor context into return lifecycle services so audits capture actor id/email/role when available
- best-effort return lifecycle audit events now cover `return.created`, `return.approved`, `return.declined`, `return.marked_in_transit`, `return.marked_received`, `return.closed`, and `return.closed_with_refund`
- return audit snapshots include return id, order id/number, previous/new status, reason/note summaries, item count, and refund linkage for close-with-refund without storing provider payloads or secrets
- return flow durability is defended against audit-emission failures so return state transitions and refund-linkage behavior continue even if audit persistence fails
- fast tests cover transition audit emission, close-with-refund linkage, audit-failure isolation, and leakage guards on return audit payloads

#### Phase 26 Security And Compliance Baseline

Shipped:

- owner-only MFA APIs and login challenge flow (`/api/auth/mfa/*`) with owner grace-period tracking
- shipping settings mutations now emit `shipping.settings_updated` audit events
- email template update/reset actions now emit `email_template.updated` and `email_template.reset` audit events
- manual fulfillment and order payment/fulfillment status actions now emit fulfillment/payment status audit events
- customer export foundation added at `GET /api/customers/[id]/export` with audit event emission
- customer detail mutation/read routes now enforce admin auth
- legal/storefront compliance endpoints now include `/privacy`, `/terms`, and `/.well-known/security.txt`
- provider credential records now use a canonical built-in-provider selector, owner-only credential operations, explicit retryable verification attempts, and secret-safe connection snapshots that preserve a known verified state through temporary provider failures
- checkout status uses a hashed, POST-only capability stored in browser session storage (never a URL), with IP rate limiting, a time-bounded redacted legacy path, and idempotent checkout attempts
- session hashing has a staged legacy-token compatibility migration; encrypted values now use versioned envelopes with a previous-key read window
- checkout and success pages send a `no-referrer` policy; the shared admin drawer now traps/restores focus, isolates background content, supports accessible keyboard tabs, and supports dirty-close confirmation
- generated Graphify repository artifacts are removed and guarded by `npm run repo:check`
- dashboard data contexts are route-scoped, so settings/products/orders/customers/discounts APIs are no longer eagerly fetched on unrelated admin pages
- Settings now renders connection status through a shared, unit-tested provider view model; shipping credential disconnects and unsaved credential entry have explicit confirmation/close guards

### Remaining Phase 4 Priorities

1. Setup Wizard and CLI hardening: expand deployment automation with safer non-interactive/dry-run paths and deeper provider provisioning
2. Production hardening and launch readiness: keep CI, deployment checklist, and recovery runbooks current as behavior changes
3. Continued audit-log expansion where admin lifecycle operations need durable traces
4. Broader real-DB lifecycle/race coverage as Phase 4 behavior expands

## Phase 4 Acceptance Checks

Status by acceptance check:

- Admin can issue a partial/full refund and order, payment, and inventory are consistent afterward — **foundation shipped; continue real-DB coverage**
- A return moves through its state machine and triggers a refund correctly — **foundation shipped; continue UX and integration coverage**
- Outbound webhook deliveries are signed, retried with backoff, and visible in the admin — **foundation shipped**
- Integration secrets never appear unencrypted at rest — **foundation shipped with real-DB update-flow preservation coverage plus provider credential audit logging**
- A bounced order confirmation email surfaces in the admin and can be resent without duplicating side effects — **foundation shipped with real-DB resend/provider-transition coverage**
- Lifecycle analytics events are emitted from server-owned flows and persisted without becoming a commerce-side dependency — **foundation shipped**
- Setup can be diagnosed with `doopify doctor`, verified from Settings -> Setup, and configured locally with `doopify setup` — **shipped foundation**
- Build and typecheck stay green throughout — **must be re-run after every change**

## Transactional Email Observability Plan

The current Phase 4 implementation slice is documented in:

```txt
TRANSACTIONAL_EMAIL_OBSERVABILITY_PLAN.md
```

First foundation shipped:

- durable `EmailDelivery` records
- email delivery service/provider adapter seam
- order confirmation delivery status tracking
- failed/sent delivery transitions
- private email delivery list/detail/resend APIs
- resend safety policy for failed/bounced/complained order-confirmation deliveries
- admin email delivery visibility in `/admin/webhooks`
- provider webhook handling for bounced/complained status transitions with signature verification

Remaining target:

- continue expanding lifecycle side-effect proofs and race/idempotency coverage

## Setup Wizard And CLI Plan

The planned setup/deployment automation sequence is documented in:

```txt
SETUP_AND_CLI_PLAN.md
```

Planned sequence:

- `doopify doctor` read-only local diagnostics — **shipped**
- setup status service and `/api/setup/status` — **shipped**
- Settings -> Setup checklist tab — **shipped foundation**
- settings UX split: Setup focuses on foundation diagnostics, while Payments/Shipping/Email own provider onboarding and Webhooks stays outbound-delivery focused — **shipped foundation**
- interactive `doopify setup` — **shipped foundation**
- deployment automation commands (`doopify env push`, `doopify stripe webhook`, `doopify db check`, `doopify deploy`) — **shipped foundation**
- later deepen one-click provisioning and non-interactive/dry-run coverage

## Production Hardening And Launch Readiness

Production readiness foundation now includes:

- CI verification on every push/PR via `.github/workflows/ci.yml`
- optional integration workflow in `.github/workflows/integration.yml` (runs when `DATABASE_URL_TEST` secret is configured)
- security-header foundation with proxy-applied baseline headers, production HSTS, and CSP report-only mode
- production runbook docs:
  - `deployment/checklist.md`
  - `ENVIRONMENT_VARIABLE_REFERENCE.md`
  - `setup/stripe.md`
  - `setup/email.md`
  - `deployment/vercel.md`
  - `troubleshooting.md`
  - `BACKUP_AND_RESTORE.md`
  - `ADMIN_USER_RECOVERY_GUIDE.md`

## Remaining Product Work

### Highest Priority

- Setup Wizard and CLI hardening (non-interactive/dry-run and deeper provider provisioning)
- Production hardening maintenance for CI, deployment runbooks, and recovery runbooks
- Broader real-DB race/idempotency coverage as Phase 4 behaviors expand

### Medium Priority

- Stronger admin-only mutation coverage for lifecycle operations
- More complete audit log consumers for refunds, returns, email resends, webhook retries, and shipping labels
- Additional storefront/admin polish after lifecycle correctness is stable

### Later

- Extract shared domain and service logic into packages
- Introduce an SDK and lightweight CLI/template tooling
- Public plugin platform
- Plugin marketplace
- Full theme directory packaging
- Multi-tenant architecture

## Remaining Hardening Work

### High Priority

- Keep transactional email observability decoupled from order/payment/inventory durability as provider/event coverage expands
- Expand real-DB lifecycle coverage to include new event consumers and race paths
- Keep the centralized pricing authority server-owned as lifecycle flows evolve
- Continue proving payment, inventory, refund, return, webhook, and email behavior through real-DB tests where transaction behavior matters

### Medium Priority

- Extract remaining route-level business logic, especially analytics, discounts, and media administration paths
- Keep storefront reads public/read-only and admin mutation paths private
- Expand audit logging around lifecycle operations
- Monitor CSP report-only behavior in production and tighten to enforced CSP after admin, checkout, media, and provider flows are verified

### Later

- migrate legacy Postgres-backed media binaries to object storage and optionally null historical `MediaAsset.data` values after validation
- Add customer-auth hardening when customer accounts exist
- Tighten CSP origins after object-storage/media and any client analytics origins are finalized

## Explicit Non-Goals Right Now

Do not market or build around these yet:

- public plugin marketplace positioning
- runtime `fs` plus `require()` plugin loading
- replacing the handcrafted admin with schema-generated CRUD UI
- multi-tenant architecture before the single-store flow is stable
- packaging full theme directories before branding tokens and reusable storefront components are settled
- running local shell commands from the browser Setup tab
- storing broad Vercel, Neon, or Stripe account tokens in the app before a scoped token lifecycle is designed

## Explicitly Rejected Technical Directions

- Creating Stripe PaymentIntents from `order.created`
- Exposing Stripe under `/app/api/stripe/webhook/route.ts`
- Adding a root-level runtime filesystem plugin loader
- Replacing the current admin with fully generated CRUD screens
- Treating browser redirects as payment truth

## Phase 20 — Pilot Polish And Merchant Operations

Phase 20 is complete. All three workstreams shipped:

### Workstream A — Order Detail UI Polish

- `OrderDetailView.jsx` and `OrderDetailView.module.css` fully rewritten
- Header: order number at 1.6rem, labeled status chips (Payment/Fulfillment/Order), conditional quick actions
- Giant fulfillment card split into "Fulfillment" (history) and "Create fulfillment" (operations)
- Global feedback banner lifted out of fulfillment card; visible at all scroll positions
- Line item and timeline rows use bottom-border separators instead of individual bordered cards
- Payment summary: muted rows for subtotal/shipping/tax, bold total with hairline divider, shipping method inline
- `OrderDetailView.test.tsx` expanded from 4 to 12 tests

### Workstream B — Live Rates And Label Purchase

**Checkout button polish**: disabled state CSS raised to `rgba(255,255,255,0.50)` text; `primaryStyle` no longer applied when disabled, eliminating dark-on-black in dark mode; loading copy changed to "Loading payment form..."; Brand & Appearance token relationship documented; `checkout-button.copy.test.ts` added (14 tests).

**Shipping settings UX**: `freeOverAmount` field now rendered for FREE rates in collapsible "Advanced conditions"; rate type change resets condition fields; `validateManualRate()` client-side validation with per-drawer error display; label renaming (Min/Max subtotal → Min/Max order total).

**Shipping rate matching**: `minWeight`/`maxWeight` validation changed from `positive()` to `min(0)` in both manual-rate API routes; `diagnoseModernManualRateMismatch()` added for specific error messages when no rate matches (no active rates / wrong destination / weight required / condition mismatch); `shipping-settings.copy.test.ts` added (13 tests); `shipping-rate.service.test.ts` expanded with FREE-over-amount, maxSubtotal-zero, specific error message tests.

**Label purchase critical bug fixed**: `buyOrderShippingLabel` previously re-fetched rates from the provider (creating a new EasyPost/Shippo shipment), making the original selected `providerRateId` invalid — label purchase always failed in practice. Fixed by removing the re-fetch: accepts `shipmentId?: string` from the original rates call and buys directly. API schema updated; `OrderDetailView.jsx` now passes `shipmentId` from rate metadata. `shipping-label.service.test.ts` expanded with 4 new tests (8 total); `shipping-setup.service.test.ts` added (8 tests).

**Live rate and label purchase status**: **Real** — both EasyPost and Shippo adapters call real provider APIs. Setup prerequisites: provider API key, ship-from location, and default package. `canBuyLabels` in setup-status API signals readiness.

### Workstream C — Transactional Email Verification

**Order confirmation email** flow is: `order.paid` → `queueOrderConfirmationEmailDelivery` (PENDING `EmailDelivery` + job) → `processOrderConfirmationEmailDeliveryJob` → SENT or FAILED. Content: order number, items, total, shipping address.

**Shipping confirmation email** flow is: `createManualFulfillment(sendTrackingEmail: true)` → `queueFulfillmentTrackingEmailDelivery` (PENDING `EmailDelivery` + job) → `processFulfillmentTrackingEmailDeliveryJob` → SENT or FAILED. Content: carrier, service, tracking number, tracking URL, items.

**Two bugs fixed in both processors**:
- Template disabled previously left delivery PENDING forever → now marks FAILED with "template is disabled" reason
- Preview mode (no RESEND_API_KEY) previously marked delivery SENT → now marks FAILED with "No email provider configured" reason

**UI**: post-save message includes delivery log link; tracking email checkbox shows inline hint when checked.

**Resend safety verified**: new `EmailDelivery` record only, no order/payment/inventory mutations.

`email-delivery.service.test.ts` expanded from 14 to 22 tests (template-disabled, preview-mode, resend side-effects, DTO field safety, resend eligibility contract).

**Pilot smoke checklist**: `docs/PILOT_SMOKE_CHECKLIST.md` — 12-section checklist covering prerequisites, auth, product setup, shipping config, checkout, webhook/order verification, inventory, discounts, email, setup panel, edge cases, and sign-off table.

### Verification (May 4, 2026)

```bash
npm run db:generate  # clean
npx tsc --noEmit     # clean
npm run test         # 609 passed (115 files)
npm run build        # clean
```

## Verification History

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

## Source Of Truth Rules

- `STATUS.md` tells you what is true now.
- `features-roadmap.md` tells you what to build next.
- `HARDENING.md` tells you what must become safer before production growth.
- `PROJECT_INTENT.md` tells you what Doopify is trying to become.
- `AGENTS.md` tells AI agents how to operate.
- Do not create another root-level roadmap that can drift from these files.
