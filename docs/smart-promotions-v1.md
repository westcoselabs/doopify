# Smart Promotions V1

Smart Promotions V1 adds server-evaluated automatic promotions to checkout and paid-order records.

---

## Merchant Behavior

- Smart Promotions are managed in **Discounts & Promotions**.
- Discount codes and automatic promotions are separated into their own tabs.
- Automatic promotion types in V1:
  - Product group discount
  - Buy X Get Y
  - Free gift
- Product group discounts apply to selected qualifier products.
- Buy X Get Y and Free gift rewards only apply when the reward item is already in cart.
- Auto-add gifts are not enabled in V1.
- Smart Promotions do not combine with discount codes in V1.
- Physical products only in V1; digital products are not eligible.
- Lower priority number means higher priority.
- One automatic promotion max per checkout in V1; best discount usually wins.

## Technical Behavior

- Checkout totals and promotion truth are server-owned.
- Browser cart and checkout UI do not calculate promotion discounts.
- Promotions are evaluated during checkout creation.
- Promotion usage increments only after verified paid-order creation.
- Paid orders persist promotion application snapshots and line allocations.
- Stripe webhook finalization uses the checkout snapshot and does not recompute promotions.
- Cart is local-only and only shows that automatic promotions are calculated at checkout.
- Playwright screenshot captures in `/test-result` are local QA artifacts and are not committed.
- Playwright local e2e injects test-only Stripe fallback keys when real keys are missing or placeholder values are detected in web server env.

## V1 Limits (Deferred)

- No auto-add free gifts.
- No same-SKU Buy 2 Get 1 unless explicitly enabled in a future phase.
- No customer segment targeting.
- No advanced stacking matrix.
- No digital product promotions.
- No mixed physical/digital bundles.
- No server quote endpoint for live cart promotion preview.
- No committed visual baseline screenshot snapshots.
