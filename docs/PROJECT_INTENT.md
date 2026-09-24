# Doopify Project Intent

> Doopify is a developer-first, self-hostable commerce engine with a real admin, real storefront, Prisma/Postgres as the source of truth, Stripe-backed checkout architecture, and typed server-side extension seams.

Documentation refresh: September 24, 2026

## The One-Sentence Intent

Build a serious commerce engine that developers can understand, self-host, extend, and trust without inheriting a black-box SaaS platform or a demo-only starter kit.

## What Doopify Is

Doopify is:

- a full-stack commerce app
- a developer-first product foundation
- a self-hostable single-store commerce engine first
- a future platform only after the core app proves itself
- a real admin plus real storefront
- a Prisma/Postgres-backed source of truth
- a Stripe-backed checkout architecture
- a typed event-driven extension surface
- a place where integrations start as explicit server-side code, not magical runtime plugins

## What Doopify Is Not

Doopify is not currently:

- a theme marketplace
- a plugin marketplace
- a multi-tenant SaaS
- a schema-generated admin experiment
- a headless-only API with no product experience
- a visual prototype
- a fake checkout demo
- a system where the browser decides payment truth

## Positioning

Use this externally:

> Doopify is a developer-first, self-hostable commerce engine built with Next.js, Prisma, PostgreSQL, and Stripe. It gives developers a real admin, a real storefront, server-owned checkout logic, verified webhook order creation, and typed server-side extension seams.

Use this internally:

> Make the single-store commerce loop reliable before extracting platform pieces.

Avoid this as primary positioning:

> Shopify clone.

That phrase can be useful as a quick mental model, but it undersells the developer-first and self-hostable angle.

## Product Pillars

### 1. Real Commerce Before Platform Theater

The app must work as a commerce product before it becomes a platform.

Build and harden:

- catalog
- collections
- checkout
- payment confirmation
- orders
- inventory
- admin workflows
- storefront merchandising
- operational visibility

Then extract platform pieces.

### 2. Prisma/Postgres As The Source Of Commerce Truth

Prisma owns the commerce schema. PostgreSQL owns commerce persistence. Developers configure infrastructure through a pure typed environment parser and a server-only runtime entry point. Provider adapters consume it directly; infrastructure credentials never come from database rows.

Developers configure infrastructure. Doopify operates the store.

Rules:

- Do not create parallel fake models in UI state.
- Do not bypass Prisma for core domain writes.
- Use Prisma relations and constraints to protect business invariants.
- Prefer explicit schema evolution over loose JSON blobs for core commerce entities.
- Use snapshots only when historical payment/order truth must be preserved.

### 3. Server-Owned Checkout

The client can collect intent. The server owns money.

Checkout must:

- validate live product and variant data
- recompute prices server-side
- validate inventory server-side
- create/persist a checkout session
- create the Stripe payment intent
- treat verified Stripe webhook success as the order finalization trigger

The browser redirect is useful for UX. It is not the source of truth.

### 4. Typed Server-Side Extension Seams

Doopify should be extendable before it is pluggable.

Current model:

- typed internal event map
- server-only dispatcher
- static integration registry
- first-party consumers for logging and confirmation email

Current extension delivery:

- developer-configured outbound webhooks with durable snapshots, signing and retries
- environment-owned infrastructure credentials
- operational delivery monitoring and guarded replay

A versioned plugin manifest remains deferred until the event contract is stable.

### 5. Handcrafted Admin Until Generation Is Earned

The current admin is product-specific and useful. It should not be replaced by generated CRUD screens before the product workflows are stable.

Generation can help later with scaffolding. It should not replace:

- checkout operations
- fulfillment workflows
- collection merchandising
- settings workflows
- payment and refund flows
- merchant-facing UX decisions

### 6. Self-Hostable By Default

A developer should be able to clone, configure, run, inspect, extend, and deploy Doopify without needing a hidden hosted control plane.

Self-hostable means:

- clear environment variables
- explicit database setup
- predictable build commands
- inspectable services
- documented route/API surfaces
- replaceable infrastructure choices over time
- operational notes for production readiness

## Architecture Boundaries

### Storefront

Responsibilities:

- display catalog and collections
- show branding-safe store settings
- manage cart UX
- initiate checkout
- render checkout success/failure state

Rules:

- never directly mutate the database
- never calculate final payment truth
- prefer server-backed reads
- use storefront-safe DTOs
- avoid exposing admin/private fields

### Admin

Responsibilities:

- authenticate merchants/admin users
- manage catalog, media, orders, discounts, customers, settings, analytics, and collections
- initiate admin-only mutations
- display operational state

Rules:

- every private action must be authenticated and authorized
- admin APIs should stay separate from public storefront APIs
- local state may optimize UX, but the database remains the source of truth
- route handlers should delegate business logic to services

### API And Services

Responsibilities:

- validation
- auth/session checks
- business rules
- persistence
- Stripe/payment orchestration
- event emission

Rules:

- route handlers stay thin
- service modules own business logic
- all core DB access goes through Prisma
- errors should be structured and safe
- response shapes should remain consistent

### Database

Responsibilities:

- persistent commerce truth
- relational integrity
- business constraints where possible
- historical snapshots where mutable product data would otherwise distort past orders

Rules:

- indexes belong on lookup paths
- unique constraints should protect idempotency
- avoid duplicating data unless preserving historical truth or improving measured performance
- schema changes must be paired with service/API updates

## Money And Inventory Rules

- Store money in integer minor units.
- Never trust client-submitted totals.
- Use one pricing service as discounts, shipping, and tax grow.
- Persist checkout/order snapshots where historical accuracy matters.
- Inventory decrement happens after verified payment success.
- Duplicate webhook delivery must not create duplicate orders.
- Race conditions must not push stock negative.

## Extension Rules

Allowed now:

- typed events
- first-party integrations
- static registry
- outbound webhook foundation
- database business settings and environment-only infrastructure secrets

Deferred:

- runtime plugin loading from the filesystem
- public plugin marketplace
- unversioned plugin contracts
- arbitrary third-party code execution inside the main app

## Launch Claim Discipline

Safe claims:

- Developer-first commerce engine
- Self-hostable app foundation
- Real admin plus real storefront
- Prisma/Postgres-backed commerce data
- Stripe-backed checkout architecture
- Verified webhook order finalization
- Typed server-side extension seams
- Collection-driven merchandising

Avoid until built and hardened:

- Plugin marketplace
- Theme marketplace
- Multi-tenant SaaS
- Fully generated admin
- Enterprise-grade tax engine
- Drop-in Shopify replacement for every merchant type

## Definition Of Success

Doopify succeeds when a developer can:

1. clone it
2. configure Postgres and Stripe
3. run the admin and storefront
4. create products and collections
5. check out through Stripe
6. see orders finalized from verified webhooks
7. understand how data flows through Prisma services
8. extend server behavior through typed events
9. deploy it without hidden platform dependencies
10. trust the core commerce loop under failure and retry conditions
