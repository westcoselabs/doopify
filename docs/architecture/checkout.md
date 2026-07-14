# Checkout Architecture

How the Doopify checkout flow works from cart to confirmed order.

---

## Core principle

**The server owns all checkout truth.** The browser does not compute totals, apply discounts, or finalize orders. Browser redirects are not order truth.

---

## Flow overview

```
Browser cart
    │
    ▼
POST /api/checkout/create
    │  Validates cart items against DB
    │  Computes pricing via server pricing service
    │  Creates/updates CheckoutSession
    │  Creates Stripe PaymentIntent
    │
    ▼
Stripe.js payment element (browser)
    │  Collects card details
    │  Submits to Stripe directly
    │
    ▼
Stripe → POST /api/webhooks/stripe
    │  Verifies webhook signature
    │  Processes payment_intent.succeeded
    │  Creates Order, OrderItems, Payment
    │  Decrements inventory
    │  Emits order.paid internal event
    │  Queues email / analytics side effects
    │
    ▼
Browser → POST /api/checkout/status with JSON paymentIntentId and statusToken
    │  Polls for order number after payment intent ID is known
    │  Redirects to /checkout/success once order is confirmed
```

---

## Pricing service

`src/server/checkout/pricing.ts` is the single authority for:

- Subtotal calculation from live DB variant prices
- Discount code validation and application
- Shipping rate resolution (manual, live, hybrid)
- Jurisdiction-aware tax calculation
- Total calculation

Totals are never accepted from the browser. The pricing service runs server-side on every `checkout/create` call.

---

## Shipping rate selection

1. Customer enters address and clicks **Load shipping options**.
2. `POST /api/checkout/shipping-rates` calls the shipping-rate service.
3. Customer selects a rate.
4. On payment form submission, the selected rate is **revalidated server-side** before the PaymentIntent amount is finalized.

This prevents amount tampering via client-side rate substitution.

---

## Order creation (idempotent)

Orders are created by `payment_intent.succeeded` webhook processing.

- The CheckoutSession is keyed to the PaymentIntent ID.
- If the webhook fires multiple times (Stripe retry behavior), the second call finds the existing order and returns without creating a duplicate.
- Inventory decrement is also idempotent — it only fires when the order transitions from `PENDING` to `PAID` for the first time.

---

## Webhook processing

`POST /api/webhooks/stripe` verifies signatures using `STRIPE_WEBHOOK_SECRET` (from DB if saved, falls back to env).

Delivery records are persisted in `WebhookDelivery` for every received event. Failed deliveries can be replayed from `/admin/webhooks`.

---

## Checkout session persistence

`CheckoutSession` tracks:
- Cart items and pricing snapshot
- Stripe PaymentIntent ID
- Status: `PENDING`, `PAID`, `FAILED`
- Abandoned checkout metadata (for recovery outreach)

---

## Abandoned checkout recovery

Abandoned checkouts are detected by background job. Recovery emails contain a tokenized link that reopens the session with server-side repricing. Checkout completion marks the recovery as converted only after verified payment success.

---

## Customer-facing checkout status UX

`/checkout/success` now presents customer-safe states while checkout finalization continues server-side:

- **Processing:** "Processing your order" with a loading indicator.
- **Confirmed:** "Thank you for your order" with order number and support contact details.
- **Delayed confirmation:** "We’re still processing your order" with retry and support actions.
- **Failed payment:** customer-safe retry guidance.

Commerce invariants are unchanged:

- browser redirect does not create orders
- paid orders are created only after verified Stripe webhook success
- status polling is read-only and does not finalize orders

---

## Files

| File | Purpose |
|---|---|
| `src/server/checkout/pricing.ts` | Centralized pricing authority |
| `src/server/shipping/shipping-rate.service.ts` | Rate resolution (manual/live/hybrid) |
| `src/app/api/checkout/create/route.ts` | Checkout session creation |
| `src/app/api/checkout/status/route.ts` | Order status polling |
| `src/app/api/checkout/shipping-rates/route.ts` | Shipping rate quote API |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook processing |
