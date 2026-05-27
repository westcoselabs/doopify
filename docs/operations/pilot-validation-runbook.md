# Pilot Validation Runbook

> Step-by-step validation guide for a controlled private beta pilot.
>
> Last updated: May 3, 2026

---

## Staging / Private Beta Assumptions

- Doopify is deployed to a staging or production environment (Vercel or equivalent).
- The database is a dedicated Neon branch or equivalent Postgres instance — not shared with local dev.
- Stripe is in **test mode** for pilot validation (`sk_test_...` / `pk_test_...` keys).
- Real Stripe webhooks are registered and reachable via HTTPS.
- All validation steps use real data flows — no mocks.

Optional pre-check: run `npm run test:e2e` locally for a safe smoke baseline before manual pilot validation (install browsers first with `npm run test:e2e:install` or `npx playwright install`).

---

## 1. Required Environment Checklist

Confirm before starting validation:

- [ ] `DATABASE_URL` configured with `sslmode=verify-full` (for Neon production branch)
- [ ] `DIRECT_URL` configured for Prisma tooling
- [ ] `JWT_SECRET` — at least 32 characters, high entropy
- [ ] `ENCRYPTION_KEY` — set for encrypted integration secrets
- [ ] `NEXT_PUBLIC_STORE_URL` — points to your deployed storefront
- [ ] `STRIPE_SECRET_KEY` — test mode secret key (`sk_test_...`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — test mode publishable key (`pk_test_...`)
- [ ] `STRIPE_WEBHOOK_SECRET` — signing secret from Stripe test webhook endpoint
- [ ] `WEBHOOK_RETRY_SECRET` — protects internal retry routes

Open Settings → Setup in the admin. The **Launch readiness** panel should show all required items as Ready or Skipped.

---

## 2. Provider Setup Checklist

### Stripe

- [ ] Stripe webhook endpoint registered: `https://<your-domain>/api/webhooks/stripe`
- [ ] Subscribed events: `payment_intent.succeeded`, `payment_intent.payment_failed`
- [ ] `STRIPE_WEBHOOK_SECRET` matches the signing secret from Stripe dashboard
- [ ] In admin: Settings → Payments → Stripe → credentials saved and verified

### Email (optional for private beta)

- [ ] Resend API key added in Settings → Email → Connect Resend
- [ ] Sending domain verified in Resend (SPF/DKIM/DMARC)
- [ ] Webhook registered: `https://<your-domain>/api/webhooks/email-provider`
- [ ] `RESEND_WEBHOOK_SECRET` set for bounce/complaint verification

If email is intentionally skipped for private beta, confirm Launch readiness shows "Optional" for the email check — it does not block launch.

### Shipping

- [ ] At least one shipping method is ready: either manual flat rates or a live provider (Shippo/EasyPost)
- [ ] In admin: Settings → Shipping & delivery → mode configured and rates set
- [ ] Launch readiness → Shipping rates: shows "Ready"

### Tax

- [ ] Tax is either configured (Settings → Taxes & duties, rate > 0) or explicitly disabled
- [ ] Launch readiness → Tax: shows "Ready" or "Skipped"

---

## 3. Test Product Setup

1. Open admin → Products → New product.
2. Set product status to **Active**.
3. Set a title (e.g., "Pilot Test Product").
4. Add at least one variant with:
   - Price: `$9.99` (or any non-zero amount)
   - Inventory: `10`
5. (Optional) Upload a product image.
6. Save and publish.
7. Confirm product appears on the storefront at `NEXT_PUBLIC_STORE_URL/shop`.
8. Launch readiness → Active products: should show "Ready".

---

## 4. Stripe Test Checkout Walkthrough

1. Open the storefront.
2. Add the test product to cart.
3. Proceed to checkout.
4. Fill in customer details (use a test email address).
5. Select a shipping method.
6. Enter Stripe test card:
   - Card number: `4242 4242 4242 4242`
   - Expiry: any future date (e.g., `12/29`)
   - CVC: any 3 digits (e.g., `123`)
   - Postal code: any valid code (e.g., `10001`)
7. Submit payment.

**Expected result:** Browser shows checkout success page.

> **Important:** The order is NOT created on browser redirect. It is created only after the Stripe webhook is received and verified. Proceed to the next step.

---

## 5. Webhook Verification Steps

After checkout:

1. Open admin → `/admin/webhooks`.
2. Switch to the **Inbound** tab.
3. Confirm a `payment_intent.succeeded` event from Stripe is visible.
4. Confirm the event status is **delivered** (not failed or retrying).
5. Navigate to admin → Orders.
6. Confirm the test order appears with status "Paid" or equivalent.
7. Confirm the order was created **after** the webhook timestamp — not before.

If the webhook is missing or failed:
- Check that `STRIPE_WEBHOOK_SECRET` matches the Stripe endpoint signing secret.
- Check that the endpoint URL is publicly reachable.
- Use Stripe dashboard → Webhooks → recent deliveries to inspect failures.
- Use admin → Webhooks → Retry to manually trigger a retry.

---

## 6. Inventory Verification

After the test order:

1. Open admin → Products → the test product.
2. Check the variant inventory count.
3. Confirm inventory decreased by the ordered quantity (e.g., from 10 → 9).

Inventory decrements only after verified webhook success. If inventory did not decrease, the webhook may not have been processed.

---

## 7. Email Verification Steps

If email is configured:

1. Open admin → System → Delivery logs (or `/admin/webhooks` → Email deliveries tab).
2. Confirm an order confirmation email delivery record is visible for the test order.
3. Confirm delivery status is **sent** or **delivered**.
4. Check the test email inbox — confirm the order confirmation email arrived.

If email is not configured (optional for private beta):
- Confirm no errors appear related to email in the webhook log.
- Confirm Launch readiness → Email provider shows "Optional" (not a blocker).

---

## 8. Shipping and Tax Verification Steps

During the test checkout:

- [ ] Shipping rates appeared correctly in the checkout UI.
- [ ] The shipping rate matched what is configured in Settings → Shipping.
- [ ] If tax is enabled: tax amount appeared in the order total.
- [ ] If tax is disabled: no tax line appeared.

After the order is created:
- [ ] Open the order detail in admin — shipping and tax totals match the checkout.

---

## 9. Media / Object Storage Verification Steps

1. Open admin → Media (or `/media`).
2. Upload a test image (JPEG or PNG, under 10 MB).
3. Confirm the upload succeeds and the image appears in the media library.
4. Link the image to the test product.
5. Open the storefront product page — confirm the product image loads.

If using Vercel Blob (`MEDIA_STORAGE_PROVIDER=vercel-blob`):
- Confirm uploads succeed with `BLOB_READ_WRITE_TOKEN` configured.
- Confirm product image requests redirect from `/api/media/{assetId}` to a `blob.vercel-storage.com` URL.

If using S3/R2 object storage (`MEDIA_STORAGE_PROVIDER=s3`):
- Confirm the media URL redirects to the CDN/S3 public URL (check browser Network tab).
- Confirm `MEDIA_PUBLIC_BASE_URL` is set in the deployment validation panel if using a CDN.

If using Postgres storage (default for private beta):
- Media loads from `/api/media/{assetId}` — no additional configuration needed.

---

## 10. Cron / Job Runner Verification Steps

1. Confirm `WEBHOOK_RETRY_SECRET` is set (it is the fallback auth for all job runner routes).
2. Trigger the webhook retry runner manually:

```bash
curl -X POST https://<your-domain>/api/webhook-retries/run \
  -H "Authorization: Bearer <WEBHOOK_RETRY_SECRET>"
```

Expected: `200 OK` with a JSON body. No 401/403.

3. Open admin → Webhooks → check for any failed outbound deliveries that need retry.
4. If any deliveries are in retry state, confirm they are retried on schedule.

---

## 11. Refund Test Path

1. Open the test order created in step 4.
2. In the order detail, initiate a refund (partial or full).
3. Confirm the refund record appears with status "Pending" or "Completed".
4. Confirm the Stripe dashboard shows the refund against the payment intent.
5. If inventory restocking is enabled, confirm inventory was restored.

---

## 12. Return Test Path

1. Open the test order.
2. Initiate a return from the order action panel.
3. Confirm the return record appears with the correct items and state.
4. Mark the return as received.
5. Optionally: close the return with a refund and confirm the refund is created.

---

## 13. Outbound Webhook Delivery / Retry Visibility

If outbound merchant webhooks are configured (Settings → Webhooks):

1. Confirm at least one event subscription is active.
2. Place or update an order and confirm an outbound delivery attempt is visible in admin → Webhooks → Outbound.
3. Confirm delivery status (delivered, failed, or retrying).
4. If a delivery failed, confirm the retry schedule is visible and the retry can be triggered manually.

---

## 14. Backup / Restore Verification Steps

Before launch, verify the recovery path is documented and accessible:

1. Confirm `docs/BACKUP_AND_RESTORE.md` is current and the restore steps are understood.
2. Confirm `docs/ADMIN_USER_RECOVERY_GUIDE.md` is accessible.
3. (Recommended) Run a test `pg_dump` from the staging database and confirm it completes:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --file pilot-backup-$(date +%Y%m%d).dump
```

4. Keep the dump in secure off-platform storage.

---

## 15. Rollback Steps

If a critical issue is found during pilot:

1. Roll back to the previous Vercel deployment:
   - Vercel dashboard → Deployments → select previous → Promote.
   - Or: `vercel rollback` via CLI.
2. Validate core routes: `/login`, `/shop`, `/checkout`, `/admin/webhooks`.
3. If data was mutated incorrectly, use Neon branch restore (preferred) or `pg_restore` from the backup.
4. Check `/admin/webhooks` for failed webhook deliveries that need investigation.
5. Document the incident timeline and root cause in a runbook note.

---

## 16. Private Merchant Pilot Acceptance Checklist

Complete this checklist before opening the pilot to any merchant:

### Environment

- [ ] All required env vars are set and confirmed in the Deployment validation panel
- [ ] Launch readiness panel shows all required items as Ready or Skipped
- [ ] No "Needs setup" items in Launch readiness (or known exceptions documented)

### Commerce path

- [ ] Test product created with valid price and inventory
- [ ] Test product visible on storefront
- [ ] Stripe test checkout completed successfully end-to-end
- [ ] Order created only after webhook success (not on browser redirect)
- [ ] Inventory decremented after paid order
- [ ] Order detail loads correctly in admin

### Webhooks and email

- [ ] Stripe webhook delivered and logged in `/admin/webhooks`
- [ ] Email delivery record visible (or email intentionally skipped)
- [ ] Webhook retry runner responds correctly to authorized requests

### Refund and return

- [ ] Refund path tested on test order
- [ ] Return path tested on test order

### Media

- [ ] Media upload and display working
- [ ] Product image visible on storefront

### Recovery

- [ ] Backup path confirmed
- [ ] Rollback steps understood
- [ ] Admin recovery runbook accessible

---

## 17. Smoke Regression Checklist (Consolidated)

Use this final pass immediately before merchant handoff.

### Admin auth and access

- [ ] `/login` loads and owner/admin login succeeds.
- [ ] Logout destroys session and protected admin routes redirect back to `/login`.
- [ ] Admin navigation remains functional (`/admin`, `/admin/orders`, `/admin/webhooks`, `/admin/settings`).

### Storefront and checkout regression

- [ ] `/shop` and at least one `/shop/[handle]` page load without console/runtime errors.
- [ ] Cart add/remove still works after a completed order.
- [ ] Checkout rejects empty-cart and missing-shipping-option flows with clear errors.
- [ ] Failed payment card (`4000 0000 0000 9995`) does not create an order.
- [ ] Successful payment card (`4242 4242 4242 4242`) completes checkout and shows success.

### Order, inventory, and pricing

- [ ] Order appears in admin only after verified webhook processing.
- [ ] Inventory decrements exactly once for successful paid order.
- [ ] Discount code flow (if configured) applies correctly and increments usage counters.

### Shipping, tax, and email

- [ ] Shipping rates appear for intended destination and configured mode (manual/live/hybrid).
- [ ] Tax behavior matches configuration (enabled with expected line item, or intentionally disabled).
- [ ] Email delivery record appears in delivery logs (or intentional email skip is documented).

### Final sign-off

| Check | Result | Notes |
|---|---|---|
| Stripe webhook -> 200 OK | | |
| Order created by webhook (not redirect) | | |
| Inventory decremented correctly | | |
| Order visible in admin | | |
| Email delivered or intentionally skipped | | |
| No critical console/runtime errors | | |

**Signed off by:** _______________
**Date:** _______________
**Environment URL:** _______________
