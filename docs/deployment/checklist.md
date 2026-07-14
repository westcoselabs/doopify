# Production Deployment Checklist

> Repeatable launch checklist for private beta and early production.
>
> Last updated: May 3, 2026

## Preconditions

- [ ] Local verification gate is green (see Section 1)
- [ ] Required production secrets are available
- [ ] Neon project/branch is ready for production traffic (see `docs/deployment/vercel.md`)
- [ ] Stripe account and webhook endpoint are configured (see `docs/setup/stripe.md`)
- [ ] Resend domain and webhook endpoint are configured, or email is intentionally skipped
- [ ] At least one active product with a valid price and available inventory exists
- [ ] Shipping is configured (manual rates or live provider)
- [ ] Tax is configured or intentionally disabled

---

## 1. Local Verification Gate

Run before deploying:

```bash
npm ci
npm run db:generate
npx tsc --noEmit
npm run test
npm run build
```

Optional integration pass when disposable Postgres is configured:

```bash
DATABASE_URL_TEST="postgresql://..." npm run test:integration
```

---

## 2. Required Environment Variables

Confirm each variable is set in your production environment. See `docs/ENVIRONMENT_VARIABLE_REFERENCE.md` for full details.

### Core app

- [ ] `DATABASE_URL` — Postgres connection string with `sslmode=verify-full` for Neon/production
- [ ] `DIRECT_URL` — Direct Prisma URL (recommended)
- [ ] `JWT_SECRET` — At least 32 characters, high entropy, not a placeholder
- [ ] `ENCRYPTION_KEY` — Required for encrypted integration secrets in production
- [ ] `NEXT_PUBLIC_STORE_URL` — Public storefront base URL
- [ ] `WEBHOOK_RETRY_SECRET` — Protects `POST /api/webhook-retries/run`

### Stripe

- [ ] `STRIPE_SECRET_KEY` — Server-side API key
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Client-side checkout key
- [ ] `STRIPE_WEBHOOK_SECRET` — Signing secret for `POST /api/webhooks/stripe`

### Email (optional for private beta)

- [ ] `RESEND_API_KEY` — Required for live transactional email sends
- [ ] `RESEND_WEBHOOK_SECRET` — Required for bounce/complaint webhook verification

### Shipping (if using live provider)

- [ ] `SHIPPO_API_KEY` or `EASYPOST_API_KEY` — Required for live shipping rates
- [ ] `SHIPPO_WEBHOOK_SECRET` or `EASYPOST_WEBHOOK_SECRET` — Required for shipping provider webhooks

### Media / object storage (optional for private beta)

- [ ] On Vercel: `MEDIA_STORAGE_PROVIDER=vercel-blob` and `BLOB_READ_WRITE_TOKEN` configured
- [ ] On S3/R2: `MEDIA_STORAGE_PROVIDER=s3` plus `MEDIA_S3_REGION`, `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`

### Rate limiting (multi-instance)

- [ ] `DOOPIFY_RATE_LIMIT_STORE=postgres` — Set explicitly for multi-instance deployments (auto-defaults to postgres in production)

---

## 3. Configure App Locally

Use guided setup:

```bash
npm run doopify:setup
```

Then run deployment setup actions:

```bash
npm run doopify:db:check
npm run db:deploy:safe
npm run doopify:stripe:webhook
npm run doopify:env:push
```

---

## 4. Deploy

Use the CLI deploy flow:

```bash
npm run doopify:deploy
```

This runs:

- production build preflight
- optional DB check
- optional webhook automation
- optional Vercel env sync
- Vercel production deployment command

---

## 5. Post-Deploy Smoke Checks

### Auth and admin

- [ ] `/login` renders
- [ ] Admin login works with owner credentials
- [ ] `/settings` loads, including Setup tab
- [ ] Settings → Setup tab shows Launch readiness and Deployment validation panels
- [ ] Launch readiness: all required checks show "Ready" or "Skipped"
- [ ] Deployment validation: no "Needs setup" items for configured providers

### Commerce path

- [ ] Storefront loads at `NEXT_PUBLIC_STORE_URL`
- [ ] At least one product is visible on the storefront
- [ ] Checkout loads (`/checkout`) and Stripe.js initializes
- [ ] Stripe test checkout completes successfully (use card `4242 4242 4242 4242`)
- [ ] Order appears in admin only after webhook success (not on browser redirect)
- [ ] Inventory is decremented after paid order
- [ ] Order detail (`/orders/[orderNumber]`) loads correctly

### Webhooks and email

- [ ] `POST /api/webhooks/stripe` receives Stripe events (check `/admin/webhooks`)
- [ ] `POST /api/webhooks/email-provider` receives provider events (if Resend configured)
- [ ] Order confirmation email delivery record visible (if email configured)

### Media

- [ ] Media upload works (`/media` admin)
- [ ] Product images load on storefront with Postgres storage
- [ ] If using Vercel Blob or S3/R2: product images redirect/stream from object storage correctly

---

## 6. Release Claim Guardrails

Do not claim production readiness unless:

- CI is passing on current commit
- Deployment checklist completed
- Backup/restore path validated (see `docs/BACKUP_AND_RESTORE.md`)
- Admin recovery runbook tested (see `docs/ADMIN_USER_RECOVERY_GUIDE.md`)
- Known risks documented in `docs/HARDENING.md`

---

## 7. Rollback Path

If release causes severe regression:

1. Roll back to previous Vercel deployment using Vercel dashboard or CLI.
2. Validate core routes and webhook processing.
3. If data repair is needed, use `docs/BACKUP_AND_RESTORE.md`.
4. If admin access is broken, use `docs/ADMIN_USER_RECOVERY_GUIDE.md`.
5. Check `/admin/webhooks` for failed deliveries requiring manual retry.
