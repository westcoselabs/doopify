# Local development

Use Node.js 22.18 or newer, npm and PostgreSQL. Doopify uses real commerce persistence locally.

## Environment and database

Copy `.env.example` to `.env` and replace placeholders. Next.js supports `.env.local` overrides; Prisma CLI configuration reads `.env` and the process environment. Keep `DATABASE_URL` available to database commands. `DIRECT_URL` is not used by the current Prisma configuration.

Required foundation: `DATABASE_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY` and an appropriate `NEXT_PUBLIC_STORE_URL` (`http://localhost:3000` locally). Generate new random encryption keys only for new installations; preserve existing keys on upgrade.

Select optional capabilities explicitly: `EMAIL_PROVIDER=none|resend|smtp|preview`, `SHIPPING_RATE_PROVIDER=none|shippo|easypost`, `SHIPPING_LABEL_PROVIDER=none|shippo|easypost`, and `MEDIA_STORAGE_PROVIDER=postgres|vercel-blob|s3`. Add corresponding credentials in the environment. Preview email is development-only and never reports a successful send.

```bash
npm ci
npm run db:generate
npm run db:deploy:safe
npm run db:seed:bootstrap
npm run doopify:doctor
npm run dev
```

The safe migration command inspects migration history; resolve known predecessor histories using their runbooks. `db:push` is reserved for disposable development/test schemas, not an existing deployment upgrade. Existing credential-backed stores use the [migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md).

## First owner and store setup

Open `/create-owner`. If `SETUP_TOKEN` is configured, enter it; production requires it. Bootstrap closes once an active owner exists. Merchant business configuration remains in the focused Settings pages. Infrastructure is visible through **System → Developer** and changed only through local/deployment environment variables.

For local Stripe webhooks:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Set the listener's signing secret in `STRIPE_WEBHOOK_SECRET` and restart. Use matching test-mode Stripe keys. Run a worker in another process with `npm run worker`, or call the protected POST runner endpoints using an authenticated scheduler.

## Verification

```bash
npm run db:generate
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Real-DB tests require a disposable `DATABASE_URL_TEST`. A dedicated schema is preferred. For a confirmed disposable public schema, `E2E_DATABASE_URL` must match exactly and `DOOPIFY_ALLOW_PUBLIC_TEST_SCHEMA=1` explicitly permits reset. Never point these variables at a live store.

Install browser binaries with `npm run test:e2e:install` before `npm run test:e2e`. Existing local-server tests can use `E2E_BASE_URL` and `E2E_SKIP_WEBSERVER=1`. Stripe smoke tests require explicit test credentials and opt-in. See [worker deployment](worker.md) and the [environment reference](../ENVIRONMENT_VARIABLE_REFERENCE.md).
