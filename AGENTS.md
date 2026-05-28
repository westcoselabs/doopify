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
