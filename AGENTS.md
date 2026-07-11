# Doopify Agent Instructions

> This file guides AI coding agents and future maintainers without creating a second conflicting roadmap.

Documentation refresh: May 5, 2026

## Required Reading Order

Before writing code, read:

1. `docs/STATUS.md` - current shipped, active, and pending status
2. `docs/PROJECT_INTENT.md` - product intent, architecture principles, and non-goals
3. `docs/features-roadmap.md` - product phases and build sequencing
4. `docs/HARDENING.md` - security, correctness, and operational readiness
5. `CONTRIBUTING.md` - development rules and definition of done

If these files conflict, treat `docs/STATUS.md` as current state, `docs/features-roadmap.md` as the build sequence, and `docs/HARDENING.md` as the security/correctness backlog.

Ignore files in `docs/archive/` unless the user explicitly asks for historical context.
Do not use `docs/archive/**` as current status, setup, deployment, or security truth.

## Current Repo Truth ##

Doopify is a real DB-backed commerce app, not a prototype.

Phase 21 is complete. The repo is in post-Phase-21 state with a full commerce foundation.

Implemented:

- Prisma/Postgres-backed commerce schema for products, variants, media, customers, orders, payments, fulfillments, refunds, returns, discounts, settings, sessions, integrations, inbound/outbound webhook deliveries, email deliveries, analytics events, background jobs, and team/invite management
- Protected admin auth with session-backed JWT validation
- Private route protection through `src/proxy.ts`
- Role-based access: OWNER, ADMIN, STAFF with `requireAuth`, `requireAdmin`, `requireAdminOrAbove`, `requireOwner` helpers
- DB-backed admin APIs for all commerce entities
- Storefront product routes at `/`, `/shop`, and `/shop/[handle]`
- Storefront collection routes at `/collections` and `/collections/[handle]`
- Checkout flow at `/checkout` with server-owned pricing, shipping selection, and Stripe PaymentIntents
- `POST /api/checkout/create` — checkout session creation and pricing
- `POST /api/webhooks/stripe` — verified Stripe webhook order finalization
- `GET /api/checkout/status` — order status polling
- `POST /api/checkout/shipping-rates` — server-side shipping rate quotes
- Idempotent order creation from verified Stripe payment success
- Inventory decrement only after verified payment success
- Centralized checkout pricing service in `src/server/checkout/pricing.ts`
- Checkout-native code discounts validated server-side
- Settings-backed shipping zones/rates and jurisdiction-aware tax rules
- Full shipping setup: manual rates, live provider rates (EasyPost/Shippo), hybrid fallback, label purchase, tracking
- Refund service with pending persistence, Stripe idempotency, item validation, restocking, return linkage
- Return service with state-machine transitions and close-with-refund
- Outbound merchant webhooks with subscriptions, HMAC signing, retry/backoff, dead-letter visibility
- Encrypted integration secrets via `IntegrationSecret` model
- Transactional email delivery tracking with Resend or SMTP
- Provider bounce/complaint webhook handling
- Analytics event fan-out through the dispatcher
- Abandoned checkout recovery with tokenized recovery links
- Background job infrastructure with claiming, retry/backoff, exhaustion
- First-run owner bootstrap at `/create-owner` with `SETUP_TOKEN` production gate
- Team management: invite, accept, role change, disable, reactivate, password reset, session management
- `UserInvite` and `PasswordReset` Prisma models with hashed single-use expiring tokens
- Production security headers with proxy-applied baseline, HSTS, and CSP report-only mode
- Audit logging for team operations, provider credentials, refunds, returns, and fulfillments
- GitHub Actions CI workflow
- Vitest fast tests plus `DATABASE_URL_TEST`-gated real-DB integration specs
- Media object storage adapter: Postgres (default) or S3-compatible (Cloudflare R2/AWS S3)
- Brand Kit with store-backed branding fields, admin screen/API, and safe public brand payloads

## What Not To Rebuild

Do not rebuild these foundations unless source inspection proves they are broken:

- Prisma commerce schema
- Admin auth/session foundation
- Role-based access helpers
- Product/variant/media admin persistence
- Storefront catalog routes
- Checkout creation and pricing service
- Stripe webhook route and order finalization
- Collection service/API/storefront
- Refund/return service foundation
- Shipping rate service and provider adapters
- Inbound webhook delivery/replay/retry foundation
- Outbound merchant webhook delivery foundation
- Integration secrets foundation
- Typed event dispatcher and static registry
- Email delivery service and provider adapter
- Background job lifecycle
- Team management service
- Owner bootstrap flow

## Agent Rules

### No Placeholder Commerce Logic

Do not write fake payment, fake order, fake inventory, fake email, or fake pricing logic unless explicitly asked for a mock.

If a feature touches money, inventory, auth, email delivery, setup/deployment, integrations, or public/private data boundaries, implement it against the real service architecture.

### Use Existing Patterns

Before adding a file:

- search for an existing service
- search for an existing DTO
- search for an existing route response pattern
- search for existing validation helpers
- search for existing event types

Extend what exists when possible.

### Keep Route Handlers Thin

Route handlers should: parse input, validate, authorize, call a service, return a consistent response.

Business logic belongs in service modules.

### Keep Prisma Central

All core commerce persistence should go through Prisma. Do not introduce a second data source of truth.

### Keep Checkout Server-Owned

The client does not own totals, discounts, shipping, tax, inventory truth, payment success, or order creation.

Verified Stripe webhook success finalizes orders.

### Keep Extension Seams Typed And Observable

Use typed events, persisted delivery records, and the static registry for integrations.

Do not add runtime plugin loading or marketplace mechanics yet.

### Keep Setup Automation Split Correctly

The browser Setup tab may read setup status and guide the user. It must not run local shell commands.

Local file writes, provider API calls, Prisma commands, Vercel env changes, and Stripe webhook configuration belong in a local CLI (`doopify doctor` / `doopify setup`).

### Respect Next.js Version Conventions

This repo uses Next.js 16. Before touching framework-specific behavior, check existing project code.

Be careful with:
- `src/proxy.ts`
- App Router route handlers
- Caching and revalidation
- Server/client component boundaries

## Definition Of Done For Agent Work

A change is complete when:

- it fits the existing architecture
- it does not contradict `docs/STATUS.md`
- it keeps Prisma/Postgres as the source of truth
- it preserves server-owned checkout
- it does not expose private fields publicly
- it handles errors cleanly
- it updates status docs when status changes
- it passes the relevant verification commands

Recommended verification:

```bash
npm run db:generate
npx tsc --noEmit
npm run test
npm run build
```

## Documentation Updates

When a shipped/pending/deferred status changes, update:

- `docs/STATUS.md`
- `docs/features-roadmap.md`
- `docs/HARDENING.md` if security/correctness/ops changed
- `README.md` if onboarding or orientation changed

Do not recreate `CLAUDE.md`, phase kickoff docs, or a duplicate phase-completion roadmap.

Internal planning docs live in `docs/archive/internal/`. Do not treat them as current status.

## Imported Claude Cowork project instructions

# Doopify

> **Developer-first, self-hostable commerce engine.**
>
> Doopify is a real commerce application built with Next.js 16, Prisma, PostgreSQL, Stripe-backed checkout architecture, and typed server-side extension seams. It ships a protected admin, a storefront, database-backed services, and a clear path from single-store reliability to later platform extraction.

## Current Status

Documentation refresh: April 26, 2026  
Last repo verification recorded in active docs: April 26, 2026

Doopify is no longer a prototype or only a UI shell. It has a working admin, storefront, checkout entry point, Stripe webhook path, Prisma/Postgres-backed commerce data, and typed internal event seams.

### Working now

- Protected admin auth with session-backed JWT validation
- Safe cookie parsing and required environment validation
- Login rate limiting by IP plus email
- DB-backed products, variants, media, customers, discounts, settings, analytics, orders, payments, fulfillments, refunds, returns, and sessions
- Storefront catalog routes at `/`, `/shop`, and `/shop/[handle]`
- Collection browsing at `/collections` and `/collections/[handle]`
- Cart-to-checkout flow at `/checkout`
- `POST /api/checkout/create` for live-priced checkout session creation
- `POST /api/webhooks/stripe` for verified Stripe webhook processing
- `GET /api/checkout/status` for success-page reconciliation
- Checkout session persistence with paid and failed status tracking
- Idempotent paid-order creation keyed from verified Stripe payment success
- Inventory decrement only after verified payment success
- Checkout-native code discounts through the centralized server pricing path
- Baseline destination-aware shipping zone rates and tax rules through the centralized server pricing path
- Discount applications and usage counts created only after verified paid order creation succeeds
- Durable Stripe webhook delivery logging with provider event id, type, status, attempts, processed timestamp, last error, and payload hash
- Admin collection management at `/admin/collections`
- Collection publish/unpublish semantics with unpublished collections hidden from storefront reads
- Storefront-safe collection DTOs with summary/detail query separation
- Centralized checkout pricing service for server-owned subtotal, shipping, tax, discount, and total calculation
- Public storefront settings endpoint for branding-safe store data
- Typed internal event dispatcher
- Static server-side integration registry
- First-party event consumers for logging and order confirmation email delivery
- Vitest fast test harness plus `DATABASE_URL_TEST`-gated integration specs for checkout inventory, payment-idempotency, and discount-usage behavior

### Active phase

The current active product phase is **Phase 3: Merchant Readiness And Storefront Differentiation**.

Current priorities:

1. Expand broader real-DB idempotency/race-condition coverage beyond duplicate payment-intent completion
2. Refine shipping and tax behavior from baseline defaults into configurable merchant-grade rules
3. Add webhook replay and support visibility on top of durable delivery logs
4. Stronger storefront merchandising and branding surfaces
5. Operational hardening: shared rate limits, audit logs, and production Postgres SSL review

### Known follow-up gaps

- More complete tax logic
- Configurable shipping zones and rates beyond current baseline defaults
- Discount-code storefront UX polish and rejected-code messaging
- Refund and return flows connected to payments and inventory
- More edge-case coverage for admin collection mutations and broader real-DB idempotency/race-condition behavior
- Shared rate-limiting store before multi-instance deployment
- Webhook delivery retry/replay tooling and support-facing visibility
- Audit logging around settings changes, payment events, and fulfillment operations
- Moving media binary storage out of Postgres into object storage/CDN later

## Active Documentation Map

Start here when returning to the repo:

1. [`STATUS.md`](./STATUS.md) - current shipped, active, pending, and deferred status
2. [`PROJECT_INTENT.md`](./PROJECT_INTENT.md) - product intent, architecture principles, and non-goals
3. [`features-roadmap.md`](./features-roadmap.md) - product phases and build sequencing
4. [`HARDENING.md`](./HARDENING.md) - security, correctness, and operational readiness
5. [`CONTRIBUTING.md`](./CONTRIBUTING.md) - development rules and definition of done
6. [`AGENTS.md`](./AGENTS.md) - instructions for AI coding agents and future maintainers
7. [`PHASE_3_KICKOFF.md`](./PHASE_3_KICKOFF.md) - active Phase 3 execution brief
8. [`LAUNCH_ROLLOUT.md`](./LAUNCH_ROLLOUT.md) - launch positioning and claim discipline

Do not keep stale root-level planning files that contradict `STATUS.md`, `features-roadmap.md`, or `HARDENING.md`.

## Key Routes

### Admin pages

- `/orders`
- `/admin/collections`
- `/draft-orders`
- `/products`
- `/media`
- `/customers`
- `/discounts`
- `/analytics`
- `/settings`

### Storefront pages

- `/`
- `/shop`
- `/shop/[handle]`
- `/collections`
- `/collections/[handle]`
- `/checkout`
- `/checkout/success`

### Core API routes

- `/api/auth/*`
- `/api/products`
- `/api/collections`
- `/api/orders`
- `/api/customers`
- `/api/discounts`
- `/api/settings`
- `/api/analytics`
- `/api/media`
- `/api/storefront/products`
- `/api/storefront/collections`
- `/api/storefront/settings`
- `/api/checkout/create`
- `/api/checkout/status`
- `/api/webhooks/stripe`

## Architecture Principles

- Prisma is the source of truth for the commerce domain.
- PostgreSQL is the primary persistence layer.
- Route handlers validate, authorize, and orchestrate.
- Service modules own business logic.
- UI components never bypass route/service boundaries to mutate data.
- Checkout totals stay server-owned.
- Browser redirects are not payment truth.
- Verified Stripe webhooks finalize paid orders.
- Internal integrations use typed server-side events before any public plugin platform exists.
- The admin remains handcrafted until real reuse justifies scaffolding or generation.
- Platform extraction comes after the single-store commerce loop is reliable.

## Development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Common database commands:

```bash
npm run db:generate
npm run db:push
npm run db:seed
npm run db:seed:bootstrap
```

Production build:

```bash
npm run build
```

Run fast automated tests:

```bash
npm run test
```

Run integration tests when a disposable test database or schema is configured:

```bash
DATABASE_URL_TEST="postgresql://..." npm run test:integration
```

`DATABASE_URL_TEST` must point at disposable Postgres storage, never the normal development database. The integration-test wrapper runs Vitest through `npm exec` for more reliable Windows execution.

Recommended merge gate once tests are present:

```bash
npm run db:generate
npx tsc --noEmit
npm run test
npm run test:integration # when DATABASE_URL_TEST is configured
npm run build
```

## Database And Environment

This repo expects PostgreSQL through Prisma.

- Put `DATABASE_URL` and `DIRECT_URL` in `.env`
- Put app/runtime secrets in `.env.local`
- Production Postgres SSL should be reviewed and normalized so environments explicitly use `sslmode=verify-full`

## Notes On Media

Media is currently stored in Postgres through `MediaAsset.data` and served by `/api/media/[assetId]`.

That is acceptable for local development and current admin workflows. Moving to object storage or a CDN-backed image service remains a later production-readiness task.

## Do Not Reintroduce

Do not re-add `CLAUDE.md` as a separate roadmap. It was removed because it created status drift.

Use `AGENTS.md` for AI-agent instructions and `STATUS.md` plus `features-roadmap.md` for repo truth.
