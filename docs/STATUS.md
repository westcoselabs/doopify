# Doopify Status

> Canonical current repository status. Documentation refresh: September 24, 2026.
> Active work: environment-only commerce simplification, implemented on `codex/env-only-commerce-simplification`; production rollout is pending.

Doopify is a developer-first, self-hostable commerce engine with a protected operational admin, public storefront, Next.js 16, Prisma/Postgres, Stripe payments and explicit server-side extension seams.

**Developers configure infrastructure. Doopify operates the store.**

## Current implementation

- One typed server-only environment entry point supplies Stripe, Resend/SMTP, Shippo/EasyPost, storage and runner adapters. Infrastructure credentials are no longer runtime database data.
- Owner-only **System → Developer** at `/admin/system/developer` exposes safe configuration states and explicit read-only connection tests. Provider credential forms, save/disconnect APIs, masking helpers, DB verification metadata and the DB → decrypt → env fallback layer are removed.
- Focused Server Component settings routes load business data for General, Brand, Shipping, Taxes, Email, Account and Team. Business mutation APIs and role guards remain. Admin navigation no longer prefetches unrelated modules.
- Shipping rates/labels select providers through `SHIPPING_RATE_PROVIDER` and `SHIPPING_LABEL_PROVIDER`. Merchant rates, packages, locations, fallback policy, manual fulfillment, local delivery, pickup and packing slips stay in admin.
- Outbound destinations, event subscriptions and header/signing-secret references are developer-owned in `src/server/config/outbound-webhooks.ts`. Postgres retains durable delivery history. **System → Delivery logs** supports monitoring and eligible retries.
- `DATA_ENCRYPTION_KEY` protects application-owned encrypted data including owner MFA and digital-download tokens. Existing encrypted data must retain the same key value through the rename.
- Configuration status is local and synchronous. Live diagnostics are explicit. Launch checks read a saved snapshot on navigation and scan bounded product pages only when requested.
- Storefront shop/collection queries paginate and search the complete published catalog, project public fields and media metadata, and avoid fetching image bytes for listing pages.
- Analytics uses server aggregate queries over the complete dataset with separate per-currency money totals, instead of calculating store totals from the first admin list page.
- Jobs and inbound/outbound webhook deliveries use expiring ownership claims and guarded completion. Inbound signatures are verified before canonical records are written. Runner batches use bounded concurrency and time budgets.
- Queued email sends persist send-attempt state; unknown outcomes after a provider send require reconciliation instead of blind automatic resend. Missing email configuration and preview never masquerade as successful delivery.

## Commerce guarantees retained

- Checkout recalculates prices, discounts, shipping and taxes on the server using integer minor units.
- Verified Stripe webhook payment success creates paid orders idempotently. Browser redirects and checkout polling are read-only with respect to payment truth.
- Inventory changes, discount usage caps and order/payment persistence remain transaction-safe; refunds use pending persistence, Stripe idempotency, item validation and guarded restocking.
- Returns retain their state machine, item ownership checks and close-with-refund flow.
- Digital-only checkout and private downloads retain capability tokens, encrypted application data and fulfillment protections.
- Session-backed JWT authentication, hashed sessions, OWNER/ADMIN/STAFF guards, owner MFA, bootstrap restrictions, password reset, invite/session management and last-owner protection remain.
- Smart Promotions retain integer-cent allocation and deterministic winners: one automatic promotion, no discount-code stacking, physical variants only and reward items already in the cart. Paid finalization uses saved snapshots, a cap reached after checkout cannot reject a paid order, and historical applications survive source promotion deletion.
- Background jobs, webhook retry/backoff/exhaustion, delivery logs, audits and side-effect isolation remain operational foundations.

## Release and upgrade status

The preceding remediation work was merged to master at `06c8336cfd7140435ef5a45fcc803db7a5010c70`. The environment-only work follows that baseline. Passing repository tests or a local migration rehearsal does not mean a production store has been upgraded.

Existing installations must follow the [environment-only migration runbook](ENV_ONLY_MIGRATION_RUNBOOK.md): export and validate configuration, apply additive changes, deploy with legacy tables intact, validate real operations, retain a rollback window, then explicitly contract legacy credential tables and columns. Never rotate the application encryption key as a side effect of moving provider configuration.

Local acceptance passed: Prisma generation, lint, TypeScript, production build, 1,430 fast tests, 40 disposable real-DB tests, 20 browser tests (two live-provider checks skipped), eight production settings routes and the synthetic restored-database migration rehearsal. General route-specific gzip JS fell 82.4% and navigation queries fell 94.5%. See [acceptance evidence](performance/env-only-acceptance.md) for measurement boundaries, warnings and exact artifacts. Actual production smoke checks and rollback-window closure remain operator work.

## Phase history and remaining scope

Phases 1–3 established catalog, checkout, collections and verified payment finalization. Phase 4 added refunds, returns, outbound delivery, email observability, analytics events, jobs and abandoned-checkout recovery. Phases 20–21 strengthened merchant workflows, team/account management and bootstrap/recovery. Phase 26 tracks production security and operational hardening. The detailed [roadmap](features-roadmap.md) retains that sequence; removed credential UI and wizard descriptions are superseded by the current architecture.

Continue proving real-DB payment/inventory/refund/return and delivery races as services evolve. Complete deployment-specific backups/restore rehearsal, CSP enforcement review, provider webhook tests, email deliverability verification and capacity measurements before broader launch claims.

Deferred: customer accounts, public runtime plugins/marketplace, theme marketplace, multi-tenant SaaS and platform extraction. Do not rebuild existing commerce foundations to implement these prematurely.

## Source of truth

Read [PROJECT_INTENT.md](PROJECT_INTENT.md), [features-roadmap.md](features-roadmap.md), [HARDENING.md](HARDENING.md), [architecture/env-only-commerce.md](architecture/env-only-commerce.md), and [CONTRIBUTING.md](../CONTRIBUTING.md). Ignore `docs/archive/` for current setup, deployment and security guidance.
