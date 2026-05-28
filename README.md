# Doopify

**Developer-first, self-hostable commerce engine — private beta.**

Doopify is a real commerce application built with Next.js 16, Prisma, PostgreSQL, and Stripe-backed checkout architecture. It ships a protected admin, a public storefront, database-backed services, and a clear setup path from first deploy to first sale.

---

## What it does

- Protected admin with role-based team management (Owner, Admin, Staff)
- Owner MFA (TOTP, recovery codes, and login challenge)
- Public storefront with product catalog, collection browsing, and cart
- Server-owned checkout with Stripe PaymentIntents — browser redirects are not order truth
- Verified Stripe webhook order finalization with idempotent inventory decrement
- Configurable shipping (manual flat rates, live carrier rates via Shippo/EasyPost, hybrid)
- Jurisdiction-aware tax rules
- Discount codes with usage limits and post-payment persistence
- Refund and return management with Stripe idempotency
- Outbound merchant webhooks with HMAC signing, retry/backoff, and delivery observability
- Transactional email via Resend or SMTP with delivery tracking and safe resend
- Digital products v1: digital-only checkout, secure downloads, guest-friendly delivery, and admin support actions
- Abandoned checkout recovery with tokenized recovery links
- Background job infrastructure with retry, exhaustion, and cron-compatible runner
- Audit logging for team operations, payment events, and lifecycle mutations
- Legal/compliance storefront baseline (`/privacy`, `/terms`, `/.well-known/security.txt`)
- Media storage (Postgres local/dev fallback; Vercel Blob recommended on Vercel; S3/R2 optional)
- GitHub Actions CI and production deployment runbooks

---

## Getting started

**Quickstart (15 minutes):** [docs/quickstart.md](./docs/quickstart.md)

**Deploy to Vercel:** [docs/deployment/vercel.md](./docs/deployment/vercel.md)

**Local setup:** [docs/deployment/local.md](./docs/deployment/local.md)

### Setup essentials

- Copy `.env.example` to `.env.local` before first boot.
- `DATABASE_URL` and `DIRECT_URL` are required before the app can boot.
- `SETUP_TOKEN` behavior:
  - Local development: optional.
  - Deployed production first-owner bootstrap: required.
  - `/create-owner` requires a token only when `SETUP_TOKEN` is set (and production enforces that it must be set).
- `/create-owner` closes permanently after the first active `OWNER` account exists.
- For private beta onboarding, configure Stripe and email from **Settings -> Payments** and **Settings -> Email** (do not rely on placeholder env values).

---

## Setup guides

| Topic | Guide |
|---|---|
| First owner account | [docs/setup/first-owner.md](./docs/setup/first-owner.md) |
| Stripe | [docs/setup/stripe.md](./docs/setup/stripe.md) |
| Shipping | [docs/setup/shipping.md](./docs/setup/shipping.md) |
| Email | [docs/setup/email.md](./docs/setup/email.md) |
| Team management | [docs/setup/team.md](./docs/setup/team.md) |

---

## Operations

| Topic | Guide |
|---|---|
| Pilot validation runbook | [docs/operations/pilot-validation-runbook.md](./docs/operations/pilot-validation-runbook.md) |
| Digital products runbook | [docs/operations/digital-products-runbook.md](./docs/operations/digital-products-runbook.md) |
| Troubleshooting | [docs/troubleshooting.md](./docs/troubleshooting.md) |
| Production runbook | [docs/PRODUCTION_RUNBOOK.md](./docs/PRODUCTION_RUNBOOK.md) |
| Deployment checklist | [docs/deployment/checklist.md](./docs/deployment/checklist.md) |
| Backup and restore | [docs/BACKUP_AND_RESTORE.md](./docs/BACKUP_AND_RESTORE.md) |
| Secret rotation | [docs/SECRET_ROTATION_RUNBOOK.md](./docs/SECRET_ROTATION_RUNBOOK.md) |
| Admin recovery | [docs/ADMIN_USER_RECOVERY_GUIDE.md](./docs/ADMIN_USER_RECOVERY_GUIDE.md) |
| Customer data posture | [docs/CUSTOMER_DATA_POSTURE.md](./docs/CUSTOMER_DATA_POSTURE.md) |

---

## Reference

| Topic | Doc |
|---|---|
| Current status | [docs/STATUS.md](./docs/STATUS.md) |
| Product intent | [docs/PROJECT_INTENT.md](./docs/PROJECT_INTENT.md) |
| Feature roadmap | [docs/features-roadmap.md](./docs/features-roadmap.md) |
| Security | [docs/security.md](./docs/security.md) |
| Checkout architecture | [docs/architecture/checkout.md](./docs/architecture/checkout.md) |
| Event architecture | [docs/architecture/events.md](./docs/architecture/events.md) |
| Environment variables | [docs/ENVIRONMENT_VARIABLE_REFERENCE.md](./docs/ENVIRONMENT_VARIABLE_REFERENCE.md) |
| AI agent instructions | [AGENTS.md](./AGENTS.md) |

---

## Development

```bash
npm install
npm run dev
```

Verification gate (run before every commit):

```bash
npm run db:generate
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Database commands:

```bash
npm run db:generate       # regenerate Prisma client
npm run db:push           # apply schema to database
npm run db:seed:bootstrap # create initial store record
npm run db:studio         # open Prisma Studio
```

Diagnostics:

```bash
npm run doopify:doctor    # check env, DB, and setup status
```

Integration tests (requires a separate disposable database):

```bash
DATABASE_URL_TEST="postgresql://..." npm run test:integration
```

Never point `DATABASE_URL_TEST` at your development or production database.

E2E smoke tests (safe-by-default, local only):

```bash
npm run test:e2e:install
npm run test:e2e
```

- `npm run test:e2e` requires Playwright browser binaries; run `npm run test:e2e:install` (or `npx playwright install`) first.
- Defaults to `http://127.0.0.1:3000` and starts a local dev server automatically.
- Refuses non-local base URLs unless `E2E_ALLOW_REMOTE=1` is set.
- Stripe-specific smoke checks are skipped unless all required Stripe env vars are present **and** `E2E_STRIPE_SMOKE=1`.
- To target an existing local server, set `E2E_BASE_URL` and optionally `E2E_SKIP_WEBSERVER=1`.

---

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL via Prisma ORM
- **Payments:** Stripe
- **Email:** Resend or SMTP
- **Shipping:** EasyPost / Shippo (optional)
- **Testing:** Vitest (fast unit + gated real-DB integration specs)
- **Deployment:** Vercel + Neon (recommended)

---

## Private beta limitations

- Media stored in Postgres by default (local/dev fallback) — use `MEDIA_STORAGE_PROVIDER=vercel-blob` on Vercel or `MEDIA_STORAGE_PROVIDER=s3` for S3/R2 before high-volume public traffic
- Product and gallery images are public media URLs — do not upload sensitive or private files
- CSP is in report-only mode — tighten to enforce after production verification
- No customer account system — checkout is guest-only
- No public plugin marketplace or theme directory
- Not a Shopify replacement or multi-tenant SaaS platform

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

Do not re-add `CLAUDE.md` or duplicate phase-completion roadmaps. Use `AGENTS.md`, `docs/STATUS.md`, `docs/features-roadmap.md`, and `docs/HARDENING.md` for repo truth.
