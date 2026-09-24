# Security

Security model, known risks, and operational hardening status for Doopify private beta.

---

## Authentication

- Admin sessions use JWT tokens signed with `JWT_SECRET`.
- Sessions are persisted in `Session` records and validated on every admin request.
- Login is rate-limited by IP and email address to slow brute-force attacks.
- `requireAuth`, `requireAdmin`, `requireAdminOrAbove`, and `requireOwner` helpers are applied to sensitive API routes.
- Password changes revoke all other active sessions.
- Password resets use 24-hour single-use hashed tokens and revoke all sessions on acceptance.
- OWNER accounts can enable TOTP MFA with recovery codes and login challenges.

---

## Stripe payment security

- Checkout totals are server-owned. The browser cannot send a total.
- Stripe webhook signatures are verified using `STRIPE_WEBHOOK_SECRET` before any order mutation.
- Browser redirect success is not order truth. Only verified webhook success finalizes an order.
- One environment-only Stripe configuration serves checkout, refunds and signature verification.

---

## Infrastructure secrets

- All provider credentials and outbound webhook keys/header values live in deployment environment variables, consumed through typed server-only config.
- `DATA_ENCRYPTION_KEY` encrypts application data (MFA and private download tokens), preserving existing envelopes and rotation.
- Secrets are never returned to the browser in raw form.
- Typed outbound destination configuration references secret variable names; delivery records preserve destination snapshots.
- Provider credential CRUD and disconnect APIs are removed. Owner diagnostics return safe states only.

---

## Security headers

Applied by `src/proxy.ts` on every response:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` (restrictive default)
- `Strict-Transport-Security` (production only)
- CSP in report-only mode with Stripe-safe origins and `frame-ancestors 'none'`

CSP is currently `report-only`. Tighten to enforced mode after admin, checkout, media, and provider flows are verified in your environment.

Control via:
- `SECURITY_HEADERS_ENABLED=false` — disable all security headers (emergency rollback)
- `CSP_MODE=off|report-only|enforce` — control CSP enforcement level

---

## Audit logging

Audit events are emitted for:
- Owner creation and team operations (invite, accept, role change, disable/reactivate)
- Password resets and session revocations
- Refund issuance and failures
- Return lifecycle transitions
- Fulfillment operations
- Shipping settings mutations
- Email template update/reset actions
- Outbound webhook delivery events

Audit events are best-effort — a failed audit write does not block the underlying operation.

---

## Data boundaries

- Storefront routes are public and read-only. No commerce mutations are possible from storefront APIs.
- Admin mutation routes require a valid session.
- Owner-only routes (team management and integration diagnostics) require `requireOwner`.
- Media served from `/api/media/:id` is currently public by ID. Treat media IDs as semi-public.
- Product and gallery media should be treated as public assets. Do not upload sensitive files.

---

## Known beta limitations

- **CSP is report-only**, not enforced. Monitor CSP reports and tighten after verification.
- **Media is stored in Postgres** by default (`MediaAsset.data`) as a local/dev fallback. For production, prefer object storage: `MEDIA_STORAGE_PROVIDER=vercel-blob` on Vercel with `BLOB_READ_WRITE_TOKEN`, or `MEDIA_STORAGE_PROVIDER=s3` for S3/R2. Postgres-backed media is not suitable for high-volume public traffic.
- **Rate limiting uses Postgres** in production. No Redis layer exists.
- **No customer account auth** — customers check out as guests. Customer auth hardening is a later phase.
- **Audit log is append-only** with no retention policy or export tooling yet.
- **Email provider webhook verification** uses Svix. Only Resend is tested; SMTP has no inbound webhook path.

---

## Pre-production hardening checklist

Before accepting real payment volume:

- [ ] `JWT_SECRET` and `DATA_ENCRYPTION_KEY` are high-entropy, unique, and not placeholder values
- [ ] `STRIPE_WEBHOOK_SECRET` is set and verified (not just env-var placeholder)
- [ ] `sslmode=verify-full` on `DATABASE_URL`
- [ ] `SETUP_TOKEN` revoked after owner creation
- [ ] CSP mode reviewed — consider moving to enforce after testing
- [ ] Stripe keys are production mode (`sk_live_`, not `sk_test_`)
- [ ] Sending domain is verified with SPF/DKIM/DMARC (if email enabled)
- [ ] Backup and restore path tested (see [docs/BACKUP_AND_RESTORE.md](./BACKUP_AND_RESTORE.md))

---

## Responsible disclosure

This is a private beta product. If you discover a security issue, report it through `/.well-known/security.txt` or contact the maintainer directly before any public disclosure.
