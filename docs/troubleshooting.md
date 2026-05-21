# Troubleshooting

Common setup and runtime issues with resolutions.

---

## Invalid Stripe key

**Symptom:** Checkout page fails to load the payment form. Admin Settings → Payments shows an error on verify.

**Resolution:**
1. Confirm `STRIPE_SECRET_KEY` starts with `sk_test_` (test mode) or `sk_live_` (production).
2. Confirm `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_test_` or `pk_live_`.
3. Make sure both keys come from the same Stripe account and the same mode (test vs. live).
4. In the admin, go to **Settings → Payments**, open the Stripe drawer, re-enter your keys, and click **Verify provider**.
5. If keys are correct but checkout still fails, check the browser console for Stripe.js errors.

---

## Stripe webhook returning 400 or 301

**Symptom:** Stripe dashboard shows webhook deliveries failing with `400 Bad Request` or `301 Moved Permanently`.

**301 (redirect):**
- Your domain is redirecting HTTP to HTTPS and Stripe is hitting the HTTP URL.
- Ensure your webhook endpoint URL uses `https://` explicitly.
- Check your host for redirect rules that strip the path.

**400 (signature verification failed):**
- `STRIPE_WEBHOOK_SECRET` is wrong or not set.
- Get the signing secret from Stripe Dashboard → Webhooks → your endpoint → Signing secret.
- Set `STRIPE_WEBHOOK_SECRET` in your production environment and redeploy.
- Re-run `npm run doopify:stripe:webhook` to regenerate if needed.

**400 (body parsing):**
- Stripe webhooks require the raw request body for signature verification.
- Do not add body parsing middleware that transforms the payload before it reaches `/api/webhooks/stripe`.

---

## Payment succeeded but no order created

**Symptom:** Stripe shows `payment_intent.succeeded` but no order appears in the admin.

**Checklist:**
1. Go to `/admin/webhooks` → Delivery logs. Find the Stripe delivery and check its status.
2. If the delivery shows `FAILED`, click into it to see the error. Common causes:
   - Signature verification failed (wrong `STRIPE_WEBHOOK_SECRET`)
   - Database error during order creation (check logs)
3. If no delivery record exists, the webhook never reached your server — check the Stripe webhook endpoint URL and network access.
4. Use the **Replay** button on a failed delivery to retry processing without waiting for Stripe to retry.

---

## No shipping options at checkout

**Symptom:** Customer enters address, clicks "Load shipping options," but no rates appear.

**Resolution:**
1. Go to **Settings → Shipping & delivery** → confirm at least one rate exists and is marked **Active**.
2. Check the rate's destination country. If set to a specific country (e.g., `US`), it will only match that country. Leave blank to match all.
3. For weight-based rates: all cart item variants must have a weight value. Check the product variants in the admin.
4. For FREE-over-amount rates: the cart subtotal must exceed the threshold.
5. Use the **Test rates** button in shipping settings to diagnose which condition is failing.
6. For live provider rates: confirm the provider is verified, ship-from address is set, and default package dimensions are configured.

---

## Owner setup blocked

**Symptom:** `/create-owner` shows an error or is inaccessible.

**Possible causes:**

- **"Owner already exists"** — An owner account was already created. Log in at `/login`. If you lost credentials, use `npm run doopify:reset-owner`.
- **"Invalid setup token"** — In production, `SETUP_TOKEN` is required. Set it as an environment variable and redeploy before visiting the page.
- **"SETUP_TOKEN not set"** — Same as above. Set it in your host environment variables.
- **Route returns 404** — The app is not running or the deployment didn't complete.

Recovery if locked out:
```bash
npm run doopify:reset-owner
```

See [docs/setup/first-owner.md](./setup/first-owner.md) and [docs/ADMIN_USER_RECOVERY_GUIDE.md](./ADMIN_USER_RECOVERY_GUIDE.md).

---

## Missing environment variables

**Symptom:** App crashes on startup, admin crashes, or Prisma fails.

**Resolution:**
1. Run diagnostics:
   ```bash
   npm run doopify:doctor
   ```
2. Verify all required variables are set (see [.env.example](../.env.example) and [docs/ENVIRONMENT_VARIABLE_REFERENCE.md](./ENVIRONMENT_VARIABLE_REFERENCE.md)).
3. In production on Vercel, confirm variables are set for the correct environment (Production, not just Preview).
4. After adding or changing env vars in Vercel, you must redeploy for changes to take effect.

**Most commonly missing:**
- `ENCRYPTION_KEY` — required for integration secret storage
- `STRIPE_WEBHOOK_SECRET` — required for order creation via webhook
- `WEBHOOK_RETRY_SECRET` — required for cron-called retry routes

---

## Email provider not configured (preview mode)

**Symptom:** Email delivery records show `FAILED` with reason `"No email provider configured"`.

**Resolution:**

This is expected behavior when no email provider is set. Emails are logged but not sent.

To enable live email:
1. Set `RESEND_API_KEY` (or SMTP vars) in your environment.
2. Go to **Settings → Email** in the admin and save credentials.
3. Use **Resend** in the delivery log to retry failed deliveries.

Email is optional for private beta. See [docs/setup/email.md](./setup/email.md).

---

## Paid order succeeded but confirmation email is delayed

**Symptom:** Order is paid/created, but confirmation email is missing or arrives late.

**What this means:** Order finalization already succeeded. Email delivery is async and depends on job runner availability.

**Resolution:**
1. Open `/admin/webhooks` and switch to **Email deliveries**.
2. Check **Email job processing health** and **Background runners**:
   - warning/critical usually indicates queued due jobs, failed jobs, or stale/idle runner heartbeats.
3. Confirm your worker/cron is calling `POST /api/jobs/run`.
4. For failed/bounced/complained deliveries, use **Retry** in Delivery logs when available.
5. If runner is healthy but email still fails, verify email provider credentials in **Settings -> Email**.

This is visibility-only monitoring: checkout/order success does not depend on email send success.

---

## TypeScript or build errors

Run the verification gate:

```bash
npm run db:generate
npx tsc --noEmit
npm run test
npm run build
```

If `db:generate` fails, your database connection may be unreachable or the schema is out of sync:
```bash
npm run doopify:db:check
npm run db:push
```

---

## Prisma client out of date

**Symptom:** Runtime errors about missing fields or Prisma types.

```bash
npm run db:generate
```

This regenerates the Prisma client from the current schema. Run it after any schema change or after `npm install`.

---

## Getting more help

- Run `npm run doopify:doctor` for a local diagnostics report.
- Check `/admin/webhooks` for failed webhook deliveries and replay tools.
- Check **Settings → Setup** for the launch readiness panel.
- See [docs/PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md) for operational procedures.
