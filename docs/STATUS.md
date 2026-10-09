# Doopify Status

> Canonical current repository status. Documentation refresh: September 24, 2026.
> Active work: the 100-RPS latency gate remains open on `codex/env-only-commerce-simplification`. Narrow read reductions and corrected measurements are implemented locally; one of three final runs failed. Preserve freshness, two replicas and ten connections per replica. Production rollout is pending.

Doopify is a developer-first, self-hostable commerce engine with a protected operational admin, public storefront, Next.js 16, Prisma/Postgres, Stripe payments and explicit server-side extension seams.

**Developers configure infrastructure. Doopify operates the store.**

## Current implementation

- One typed server-only environment entry point supplies Stripe, Resend/SMTP, Shippo/EasyPost, storage and runner adapters. Infrastructure credentials are no longer runtime database data.
- Owner-only **System → Developer** at `/admin/system/developer` exposes safe configuration states and explicit read-only connection tests. Provider credential forms, save/disconnect APIs, masking helpers, DB verification metadata and the DB → decrypt → env fallback layer are removed.
- Focused Server Component settings routes load business data for General, Brand, Shipping, Taxes and Customer emails. Team is under System; My account is a separate personal destination. Old bookmarks redirect to their authorized pages. Business mutation APIs and role guards remain. Admin navigation no longer prefetches unrelated modules.
- Shipping rates/labels select providers through `SHIPPING_RATE_PROVIDER` and `SHIPPING_LABEL_PROVIDER`. Merchant rates, packages, locations, fallback policy, manual fulfillment, local delivery, pickup and packing slips stay in admin.
- Outbound destinations, event subscriptions and header/signing-secret references are developer-owned in `src/server/config/outbound-webhooks.ts`. Postgres retains durable delivery history. **System → Delivery logs** supports monitoring and eligible retries.
- `DATA_ENCRYPTION_KEY` protects application-owned encrypted data including owner MFA and digital-download tokens. Existing encrypted data must retain the same key value through the rename.
- Configuration status is local and synchronous. Live diagnostics are explicit. Launch checks read a saved snapshot on navigation and scan bounded product pages only when requested.
- Storefront shop/collection queries paginate and search the complete published catalog, project public fields and media metadata, and avoid fetching image bytes for listing pages.
- Analytics uses server aggregate queries over the complete dataset with separate per-currency money totals, instead of calculating store totals from the first admin list page.
- Jobs and inbound/outbound webhook deliveries use expiring ownership claims and guarded completion. Inbound signatures are verified before canonical records are written. Runner batches use bounded concurrency and time budgets.
- Queued email sends persist send-attempt state; unknown outcomes after a provider send require reconciliation instead of blind automatic resend. Missing email configuration and preview never masquerade as successful delivery.

## Scaling hardening on this branch

- Live checkout quotes use expiring, hashed-token Postgres snapshots shared across replicas, with bounded worker cleanup.
- Commerce transactions persist events into the existing jobs table. Dispatch receipts and transactional consumers prevent duplicate internal fan-out after retry/crash; external provider delivery still follows existing reconciliation rules.
- Jobs and outbound workers claim available rows with SKIP LOCKED and acquire only for free execution slots. Prisma clients/pools are shared across production bundles in one runtime; pool size and acquisition timeout are explicit environment settings.
- Media reads follow the asset's saved storage provider and stream private S3 objects. Product upload previews, requests and timers have owned cleanup; catalog/editor/notification subscriptions and immutable draft updates reduce typing work.
- Shipping has isolated editor drafts, narrow workspace reads and mutation-result merging; nullable rate limits and free-shipping thresholds round-trip. Tax preview matches the active flat checkout calculation, while retained regional rules remain read-only. General, Brand and Email use dirty saves and reset/discard controls.
- Shop and collection peer navigation now project only collection IDs, titles and handles; the storefront document reads only the favicon through primary/legacy store resolution. Public collection summaries remain unchanged and fresh requests reflect edits on both replicas. The fixture performs six fewer SQL queries on 80% of requests (about 480 fewer queries/second at the same mix).

Local verification passed: Prisma generation, TypeScript, production build, lint (25 existing warnings), 1,453 fast tests, 47 real-DB integration tests, harness checks and HTTP freshness/public-boundary checks. The preceding additive migration rehearsal and production Settings browser checks remain recorded in [scaling evidence and rollout](performance/scaling-hardening.md).

The corrected 100-RPS baselines were 57/51/57 ms p95; final untraced runs were **216/7,887/146 ms**. The failing run dropped 142 requests and had 48 request failures, with zero worker failures. Pool queues reached 508 waiting acquisitions within the unchanged ten-connection limit; scheduling remained healthy. Query/payload work fell, but repeatable p95 improvement is **not established**. The historical 1.39-second measurement and saturated 500-RPS run remain preserved with limitations. No burst or soak was run in this pass. The immediate priority remains attributing and reducing the intermittent 100-RPS saturation; deployment capacity and restore/provider gates remain open.

## Settings refinement

Merchant Settings now has five sections. Shipping leads with customer rates and exposes location management; Customer emails focuses on message templates instead of duplicating store contact setup. Developer is a separate compact read-only diagnostics page. Unused email/shipping status APIs and obsolete credential-screen styles are removed. General rejects the unused deployment-domain field; Brand rejects frontend theme mutations. Stored legacy values remain readable until an explicit data migration.

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

The earlier Settings refinement acceptance passed Prisma generation, lint, TypeScript, production build, 1,431 fast tests, 20 browser tests (two live-provider checks skipped) and eight production Settings/System routes. Its 40 disposable real-DB tests and synthetic restored-database migration rehearsal also passed. At that revision, General route-specific gzip JS measured 83.8% below merged master and navigation queries measured 94.5% lower. See [earlier acceptance evidence](performance/env-only-acceptance.md) for measurement boundaries, warnings and exact artifacts; current scaling verification is reported above. Actual production smoke checks and rollback-window closure remain operator work.

CI integration tests now provision a disposable Postgres 16 service on every push/PR, without requiring a shared database secret. The published branch's initial dependency-install and workflow-condition failures have repository fixes; final-head remote checks are a separate release gate.

The local environment and Vercel Preview/Production now have `DATA_ENCRYPTION_KEY` with the existing effective key material preserved. The old hosted variable remains for the existing deployment and rollback. This configuration change does not apply database migrations or complete production cutover.

The environment template now has a small active baseline and commented optional provider/setup values. Unused `DIRECT_URL` configuration is removed; Prisma tooling consumes `DATABASE_URL`. Independent runner credentials remain supported and must be retained while schedulers use them.

## Phase history and remaining scope

Phases 1–3 established catalog, checkout, collections and verified payment finalization. Phase 4 added refunds, returns, outbound delivery, email observability, analytics events, jobs and abandoned-checkout recovery. Phases 20–21 strengthened merchant workflows, team/account management and bootstrap/recovery. Phase 26 tracks production security and operational hardening. The concise [roadmap](features-roadmap.md) retains that sequence and next work. Superseded plans and design mockups are recoverable in Git history.

Continue proving real-DB payment/inventory/refund/return and delivery races as services evolve. Complete deployment-specific backups/restore rehearsal, CSP enforcement review, provider webhook tests, email deliverability verification and capacity measurements before broader launch claims.

Deferred: customer accounts, public runtime plugins/marketplace, theme marketplace, multi-tenant SaaS and platform extraction. Do not rebuild existing commerce foundations to implement these prematurely.

## Source of truth

Read [PROJECT_INTENT.md](PROJECT_INTENT.md), [features-roadmap.md](features-roadmap.md), [HARDENING.md](HARDENING.md), [architecture/env-only-commerce.md](architecture/env-only-commerce.md), and [CONTRIBUTING.md](../CONTRIBUTING.md). The [documentation index](README.md) lists maintained guides; Git history contains superseded plans.
