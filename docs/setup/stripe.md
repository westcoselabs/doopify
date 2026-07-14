# Stripe Setup

Connect Stripe for checkout and order finalization.

---

## How Stripe is used

- **Checkout**: `POST /api/checkout/create` creates a Stripe PaymentIntent. The Stripe.js payment element collects card details on the checkout page.
- **Order finalization**: `POST /api/webhooks/stripe` receives `payment_intent.succeeded` from Stripe and finalizes the order. This is the only path that creates orders and decrements inventory.
- **Browser redirect is not order truth.** Orders are never created on redirect alone.

---

## 1. Get API keys

In the Stripe Dashboard → Developers → API Keys:

- Copy **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Copy **Secret key** → `STRIPE_SECRET_KEY`

Use `sk_test_` / `pk_test_` keys in test mode for development and private beta.

---

## 2. Configure the webhook endpoint

**CLI method (recommended):**

```bash
npm run doopify:stripe:webhook
```

This registers `POST /api/webhooks/stripe`, subscribes to the required events, and outputs the webhook signing secret.

**Manual method:**

In the Stripe Dashboard → Webhooks → Add endpoint:

- URL: `https://<your-domain>/api/webhooks/stripe`
- Events to subscribe:
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`

Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`.

---

## 3. Save credentials in the admin

Go to **Settings → Payments** in the admin.

Open the Stripe drawer, enter your keys, and click **Test connection**. The admin stores and validates credentials against Stripe's API.

Credentials are stored encrypted at rest.

---

## 4. Verify the payment path

Run a test checkout:

1. Use card `4242 4242 4242 4242`, any future expiry, any CVC.
2. Complete checkout.
3. Verify the order appears in **Orders** in the admin (not on the success page redirect).
4. Check `/admin/webhooks` → Delivery logs to confirm the webhook was received and processed.

---

## Test cards

| Card | Behavior |
|---|---|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0025 0000 3155` | 3D Secure required |

See [Stripe test card docs](https://stripe.com/docs/testing) for a full list.

---

## Notes

- Inventory decrements only after verified webhook success.
- Failed Stripe charges do not create orders.
- The admin runtime can fall back to env-var keys if DB credentials are not yet saved.
