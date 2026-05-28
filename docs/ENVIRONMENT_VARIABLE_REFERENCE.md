# Environment Variable Reference

> Runtime and CLI environment variable reference for production operations.
>
> Last updated: May 5, 2026

## Runtime Core

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Primary Postgres connection string used by Prisma/runtime. |
| `DIRECT_URL` | Recommended | Direct Postgres URL used by Prisma tooling/migrations. |
| `JWT_SECRET` | Yes | Auth JWT signing secret. Use high-entropy value. |
| `ENCRYPTION_KEY` | Strongly recommended (required in production) | Secret used by integration secret encryption helpers. |
| `NEXT_PUBLIC_STORE_URL` | Yes | Public base URL used for setup/deployment checks and links. |
| `WEBHOOK_RETRY_SECRET` | Yes | Auth secret for `POST /api/webhook-retries/run`. |
| `JOB_RUNNER_SECRET` | Optional override | Auth secret for `POST /api/jobs/run` (falls back to `WEBHOOK_RETRY_SECRET` when unset). |
| `ABANDONED_CHECKOUT_SECRET` | Optional override | Auth secret for `POST /api/abandoned-checkouts/send-due` (falls back to `WEBHOOK_RETRY_SECRET` when unset). |
| `OWNER_MFA_GRACE_PERIOD_DAYS` | Optional | Owner MFA grace window in days before policy enforcement guidance. Default: `14`. |

## Stripe

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes | Server-side Stripe API key for checkout and refunds. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Client-side Stripe key for checkout UI. |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe signing secret used to verify `/api/webhooks/stripe`. |

## Resend / Email Provider

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Optional (required for live sends) | Enables live transactional email sends. |
| `RESEND_WEBHOOK_SECRET` | Required when email provider webhooks enabled | Svix signing secret for `/api/webhooks/email-provider`. |

## SMTP Email Provider (Alternative)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SMTP_HOST` | Required when SMTP is used | SMTP host for runtime provider connection fallback. |
| `SMTP_PORT` | Required when SMTP is used | SMTP port for runtime provider connection fallback. |
| `SMTP_SECURE` | Required when SMTP is used | `true`/`false` secure transport toggle for SMTP. |
| `SMTP_USERNAME` | Required when SMTP is used | SMTP username. |
| `SMTP_PASSWORD` | Required when SMTP is used | SMTP password. |
| `SMTP_FROM_EMAIL` | Optional | Default sender used by SMTP delivery wiring. |

## Shipping Provider Credentials

| Variable | Required | Purpose |
| --- | --- | --- |
| `SHIPPO_API_KEY` | Required when Shippo env fallback is used | Shippo API key for shipping rate/provider fallback paths. |
| `EASYPOST_API_KEY` | Required when EasyPost env fallback is used | EasyPost API key for shipping rate/provider fallback paths. |

## Media / Object Storage

| Variable | Required | Purpose |
| --- | --- | --- |
| `MEDIA_STORAGE_PROVIDER` | Optional | `postgres` (local/dev fallback), `vercel-blob`/`blob` (recommended on Vercel), or `s3` (S3/R2). Controls where media binary data is stored. |
| `BLOB_READ_WRITE_TOKEN` | Required when `MEDIA_STORAGE_PROVIDER=vercel-blob` or `blob` | Vercel Blob read/write token used for media uploads and deletes. |
| `MEDIA_S3_REGION` | Required when `MEDIA_STORAGE_PROVIDER=s3` | S3/R2 region (e.g., `auto` for Cloudflare R2). |
| `MEDIA_S3_BUCKET` | Required when `MEDIA_STORAGE_PROVIDER=s3` | S3/R2 bucket name. |
| `MEDIA_S3_ACCESS_KEY_ID` | Required when `MEDIA_STORAGE_PROVIDER=s3` | S3/R2 access key ID. |
| `MEDIA_S3_SECRET_ACCESS_KEY` | Required when `MEDIA_STORAGE_PROVIDER=s3` | S3/R2 secret access key. |
| `MEDIA_S3_ENDPOINT` | Optional | Custom endpoint for S3-compatible providers (e.g., Cloudflare R2). |
| `MEDIA_PUBLIC_BASE_URL` | Optional | Public CDN base URL for object-stored media (e.g., `https://cdn.example.com/media`). Also used in `img-src` CSP. |
| `DIGITAL_ASSET_LOCAL_DIR` | Optional | Local private directory for digital asset binaries when private downloads are stored on disk (defaults to `.private-digital-assets`). |

## Security / CSP

| Variable | Required | Purpose |
| --- | --- | --- |
| `SECURITY_HEADERS_ENABLED` | Optional | Set `false` to emergency-disable all security headers. Default: enabled. |
| `CSP_MODE` | Optional | `off`, `report-only` (default), or `enforce`. Controls Content-Security-Policy enforcement. |
| `CSP_MEDIA_ORIGINS` | Optional | Comma-separated exact media/CDN origins for `img-src` CSP. Replaces broad `https:` fallback when set. |
| `CSP_ANALYTICS_ORIGINS` | Optional | Comma-separated analytics origins for `connect-src` CSP if a client analytics vendor is added. |

## Rate Limiting

| Variable | Required | Purpose |
| --- | --- | --- |
| `DOOPIFY_RATE_LIMIT_STORE` | Optional | `postgres` or `memory`. Defaults to `postgres` in production. Use `postgres` for multi-instance deployments. |

## Shipping Provider Webhooks

| Variable | Required | Purpose |
| --- | --- | --- |
| `EASYPOST_WEBHOOK_SECRET` | Required when EasyPost webhook ingestion enabled | Signature verification secret for `/api/webhooks/shipping-provider?provider=EASYPOST`. |
| `SHIPPO_WEBHOOK_SECRET` | Required when Shippo webhook ingestion enabled | Signature verification secret for `/api/webhooks/shipping-provider?provider=SHIPPO`. |

## Setup / Bootstrap Helpers

| Variable | Required | Purpose |
| --- | --- | --- |
| `DOOPIFY_STORE_NAME` | Setup-time | Store bootstrap name used by setup tooling. |
| `DOOPIFY_STORE_EMAIL` | Setup-time | Store bootstrap email used by setup tooling. |
| `DOOPIFY_ADMIN_EMAIL` | Setup-time | Owner/admin bootstrap account email. |
| `DOOPIFY_ADMIN_PASSWORD` | Setup-time | Owner/admin bootstrap password. |

## Deployment Automation Helpers

| Variable | Required | Purpose |
| --- | --- | --- |
| `VERCEL_TOKEN` | For `env push`/`deploy` | Vercel auth token for CLI/API automation. |
| `VERCEL_PROJECT_ID` or `VERCEL_PROJECT_NAME` | For `env push`/`deploy` | Vercel project target identifier. |
| `VERCEL_TEAM_ID` or `VERCEL_TEAM_SLUG` | Optional | Team scope for Vercel project actions. |

## Test-Only

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL_TEST` | For integration tests | Disposable Postgres target for `npm run test:integration`. |

## Notes

- Keep database URLs in `.env`.
- Keep app/runtime secrets in `.env.local`.
- Keep `.env` and `.env.local` local-only; use host-managed secrets for production.
- Never commit real credentials.
- Rotate production secrets after incident response or compromise suspicion.
- `MEDIA_PUBLIC_BASE_URL` is the canonical media CDN env var. `MEDIA_S3_PUBLIC_URL` is legacy/deprecated.
- Postgres media storage is a local/dev fallback. Use Vercel Blob on Vercel production, or S3/R2 for non-Vercel object storage.
- Product/gallery media is public by design. Do not upload sensitive/private files.
- Private digital uploads are intentionally rejected for `MEDIA_STORAGE_PROVIDER=vercel-blob` until private-object guarantees are finalized.
- For digital downloads on S3-compatible storage, bucket privacy and IAM policy configuration are required to keep files private.
