# Deploy to Vercel

Developers configure infrastructure in Vercel Environment Variables. Doopify's admin manages the store and safe diagnostics.

## Prepare

1. Provision PostgreSQL and set `DATABASE_URL` with appropriate TLS and pool settings. The current Prisma configuration uses `DATABASE_URL`; use the intended migration connection when running the migration CLI.
2. For an existing store, complete the [environment-only migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md) before cutting over. Preserve application encryption keys, provider account/mode, outbound destination IDs and signing keys.
3. Run the [verification gate](../../CONTRIBUTING.md) and disposable real-DB tests before promotion.

## Configure environment

Set variables for the intended Vercel environment (Preview or Production):

- Core: `DATABASE_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY`, `NEXT_PUBLIC_STORE_URL`.
- Stripe: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Jobs: `JOB_RUNNER_SECRET`, `WEBHOOK_RETRY_SECRET`, `ABANDONED_CHECKOUT_SECRET`.
- First owner: `SETUP_TOKEN`, required for initial production bootstrap.
- Email: `EMAIL_PROVIDER` plus selected Resend/SMTP settings. `none` disables email; preview is prohibited in production.
- Shipping: `SHIPPING_RATE_PROVIDER`, `SHIPPING_LABEL_PROVIDER` and selected API/webhook keys.
- Media: `MEDIA_STORAGE_PROVIDER` and matching object-storage credentials. `vercel-blob` supports public media on Vercel; private digital asset uploads need the documented private storage option.
- Outbound: the `OUTBOUND_WEBHOOK_*` variable names referenced by `src/server/config/outbound-webhooks.ts`.

See the [environment reference](../ENVIRONMENT_VARIABLE_REFERENCE.md) for exact names. Rebuild/redeploy after configuration changes; public build variables must be present during the build. Never enter infrastructure keys into the Doopify admin.

## Migrate and deploy

With the intended database target in your trusted local/deployment environment:

```bash
npm run db:generate
npm run db:deploy:safe
npm run doopify:doctor
npm run build
```

Deploy through your configured Vercel Git integration or `npm run doopify:deploy`. Review CLI plans before remote changes. Production databases use migrations, not `db:push` or development reset commands.

Register `https://<store-domain>/api/webhooks/stripe` for the required payment-intent events and supply its signing secret before checkout goes live. Configure email/shipping callbacks when used. Create the initial owner at `/create-owner`, then review **System → Developer** and store business settings.

## Schedule operational work

The runners are **POST-only**. Use an external scheduler or the Doopify worker capable of issuing authenticated POST requests:

| Endpoint | Bearer secret | Typical cadence |
| --- | --- | --- |
| `/api/jobs/run` | `JOB_RUNNER_SECRET` | Every 1–5 minutes |
| `/api/webhook-retries/run` | `WEBHOOK_RETRY_SECRET` | Every 1–5 minutes |
| `/api/abandoned-checkouts/send-due` | `ABANDONED_CHECKOUT_SECRET` | Every 30–60 minutes |

A `vercel.json` cron path alone does not invoke these POST handlers. Do not count a scheduled GET as working background delivery. Validate recorded runner heartbeats and actual queue progress. See [worker deployment](worker.md).

## Validate and rollback

Use the [deployment checklist](checklist.md) and [pilot validation](../operations/pilot-validation-runbook.md). Presence status does not replace a verified test checkout, job run, email delivery and webhook test.

Keep the preceding deployment, database backup, legacy credential tables and old environment snapshot through the upgrade rollback window. After the explicit destructive contraction, an application rollback alone is insufficient; follow the migration runbook's restore procedure.
