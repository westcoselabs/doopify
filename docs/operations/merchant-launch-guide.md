# Merchant Launch Guide

Practical guide for merchants preparing to launch with Doopify.

This guide focuses on two things:
- The canonical Launch checklist in Settings -> Setup
- The final manual smoke workflow before sending traffic to the storefront

---

## 1. Canonical launch checklist surface

Use **Settings -> Setup -> Launch checklist** as the full, server-derived readiness view.

- Full checklist: Settings -> Setup
- Compact summary: Admin dashboard "Launch checklist" card

Both surfaces load the latest saved snapshot from `/api/readiness`.
Owners can refresh and save a new snapshot with `POST /api/readiness/run`.

---

## 2. What the launch checklist checks

The checklist groups readiness into these categories:

- Store setup
- Payments
- Products
- Shipping
- Email
- Operations
- Test order

Typical checks include:

- Store profile completeness (name/contact basics)
- Storefront URL quality and reachability basics
- Stripe key/configuration state
- Stripe webhook secret and delivery confidence
- Shipping mode and shippable-rate readiness
- Product sellability (active products, pricing, weight, inventory/backorder state)
- Email sender/provider readiness and email job health signals
- Operational signals (runner/health checks when available)
- Confirmed test checkout path

---

## 3. Required vs recommended

Checklist items use launch severity so teams can prioritize correctly:

- **Required before launch**: blocker items. If incomplete, launch is not ready.
- **Recommended before launch**: warning/info items. Launch may proceed, but risk is higher.
- **Optional**: useful quality items that do not block launch by default.

Overall state in Setup:

- **Ready to launch**: required items are complete.
- **Almost ready**: required items are complete but warnings/recommended items remain.
- **Setup needed**: one or more required items are incomplete.

---

## 4. Fixing common incomplete items

Use the checklist CTA links first. These routes are the fastest fix path.

### Store profile

- Route: `Settings -> General`
- Complete store name and key contact fields used by storefront/legal/email surfaces.
- Re-check Launch checklist after saving.

### Storefront URL

- Route: `Settings -> Setup` (URL check details) and `Settings -> General` (if store URL is managed there)
- Use a full public URL (for example `https://store.example.com`).
- Avoid localhost/internal hosts in production.
- Prefer HTTPS and a stable canonical domain.

### Stripe keys

- Route: `Settings -> Payments`
- Save Stripe publishable and secret credentials in the Stripe provider drawer.
- Run provider verification after save.

### Stripe webhook secret

- Route: `Settings -> Payments` and Stripe dashboard/webhook setup flow
- Confirm webhook endpoint points to `/api/webhooks/stripe` on the deployed domain.
- Ensure signing secret matches current endpoint configuration.
- Use Delivery logs to confirm successful recent webhook deliveries.

### Shipping setup

- Route: `Settings -> Shipping & delivery`
- Ensure at least one viable shipping path exists for launch destinations:
  - Manual mode: active rate(s) that match expected carts
  - Live mode: verified provider plus origin/package configuration
  - Hybrid mode: live primary path plus valid fallback behavior
- Use rate testing before re-running checklist checks.

### Product prices

- Route: `Products`
- Ensure active products include at least one purchasable variant with a valid non-zero price.
- Resolve missing/invalid price fields for active variants.

### Product weights

- Route: `Products`
- For active physical products, set valid variant weight values.
- Missing or invalid physical weights can break shipping quotes.

### Inventory and backorder

- Route: `Products`
- Ensure launch catalog has purchasable inventory coverage.
- Products with zero inventory and continue-selling disabled are not launch-ready stock.
- Backorder-enabled variants are generally warning/ready signals, not hard blockers.
- Coming-soon products can remain visible but do not count as purchasable launch inventory.

### Email sender and job health

- Route: `Settings -> Email` and `System -> Delivery logs`
- Configure sender/provider identity if you plan live transactional mail at launch.
- Review delivery/job health signals in Setup and delivery logs.
- Email readiness is typically recommended/optional for private beta unless your policy makes it required.

### Test checkout

- Route: storefront checkout + `System -> Delivery logs` + `Orders`
- Run an end-to-end test payment and verify webhook-based order finalization.

---

## 5. Final pre-launch smoke workflow

Run this workflow on the deployed environment immediately before launch.

1. Create a new active physical product in admin.
2. Add product media and confirm it renders on storefront product page.
3. Set at least one variant weight value (for shipping quote compatibility).
4. Set variant inventory (or intentional backorder behavior) for launchable variants.
5. From storefront checkout, confirm a shipping quote appears for target address.
6. Complete checkout with a Stripe test card (`4242 4242 4242 4242` in test mode).
7. Confirm payment success in Stripe test dashboard.
8. Confirm inbound Stripe webhook delivery succeeded in `System -> Delivery logs`.
9. Confirm order appears in `Orders` only after webhook finalization.
10. Confirm inventory decremented exactly once for purchased quantity.
11. Confirm order confirmation email delivery record exists (or intentional no-provider behavior is clearly logged).
12. Confirm email/job health surfaces show expected state after the test order.

Recommended sign-off output:

- Environment URL
- Test order number
- Webhook delivery id/status
- Inventory before/after
- Email delivery status
- Reviewer and timestamp

---

## 6. Deferred digital features

Digital commerce remains deferred/foundation-only in the current launch scope.

Not in active launch checklist scope:

- Full digital products experience
- Digital downloads
- Digital delivery emails

Treat these as future-phase capabilities, not launch blockers for the current physical-commerce checklist.

---

## 7. Related docs

- `docs/setup/stripe.md`
- `docs/setup/shipping.md`
- `docs/setup/email.md`
- `docs/deployment/checklist.md`
- `docs/operations/pilot-validation-runbook.md`
