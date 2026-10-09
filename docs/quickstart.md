# Doopify quickstart

Use Node.js 22.18 or newer and a real PostgreSQL database. Existing stores must follow the [environment-only migration runbook](ENV_ONLY_MIGRATION_RUNBOOK.md) instead of treating the database as a fresh install.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env`. Populate database, authentication and data-encryption settings. Next.js also supports local overrides in `.env.local`; database CLI commands need `DATABASE_URL` in their shell or `.env`.
3. Generate separate high-entropy values for `JWT_SECRET` and, for a **new store only**, `DATA_ENCRYPTION_KEY`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

4. Set `NEXT_PUBLIC_STORE_URL`, the matching Stripe key pair, `STRIPE_WEBHOOK_SECRET` and runner secrets. Choose email/shipping/storage adapters using the [environment reference](ENVIRONMENT_VARIABLE_REFERENCE.md).
5. Initialize the database and store:

   ```bash
   npm run db:generate
   npm run db:deploy:safe
   npm run db:seed:bootstrap
   npm run doopify:doctor
   npm run dev
   ```

6. Open `/create-owner`. Production requires `SETUP_TOKEN`; local development requires it only when set. Bootstrap is unavailable once an active owner exists.
7. Configure business settings in **Settings → General**, **Shipping & delivery** and **Taxes & duties**. Create an active product with a price and stock or an intentional backorder policy.
8. In **System → Developer**, review environment presence and explicitly test the providers you use. The browser cannot edit infrastructure secrets. Register/forward provider webhooks as described in [Stripe setup](setup/stripe.md).
9. Run a test-mode checkout. Confirm one paid order after the verified Stripe webhook, the correct stock/discount effects, and delivery/job records. Run the explicit launch check for saved business readiness.

See [local development](deployment/local.md), [Vercel deployment](deployment/vercel.md), [email](setup/email.md), [shipping](setup/shipping.md), and [team management](setup/team.md).
