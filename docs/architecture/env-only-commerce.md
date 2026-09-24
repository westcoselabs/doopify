# Environment-only commerce architecture

Implementation branch: `codex/env-only-commerce-simplification`. Production rollout requires the [migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md); local verification is not proof of deployment.

**Developers configure infrastructure. Doopify operates the store.**

```text
.env / deployment environment
  -> typed server config
  -> small payment, email, shipping, storage and job adapters
  -> commerce services
  -> Prisma / Postgres
  -> operational admin
```

`src/lib/env-schema.ts` validates configuration and derives safe presence status. `src/lib/env.ts` is the server-only runtime entry point. Adapters consume that configuration directly; there is no database credential lookup, decryption or environment fallback chain. Missing infrastructure fails clearly when its capability is used. `EMAIL_PROVIDER=none` intentionally disables email; explicit development preview never records a sent message.

Postgres owns products, prices, stock, customers, orders, refunds, returns, store business settings, sessions, jobs and delivery history. Infrastructure secrets belong in deployment environment variables. `DATA_ENCRYPTION_KEY` remains necessary for application data such as owner MFA and digital-download access tokens. During upgrade, rename the existing key without changing its value.

## Operational admin

| Route | Ownership and data |
| --- | --- |
| `/admin/settings/general` | Store identity, address, currency and timezone |
| `/admin/settings/brand` | Logos, support identity and social links |
| `/admin/settings/shipping` | Shipping behavior, manual/fallback rates, packages, origin locations, pickup, local delivery and packing slips |
| `/admin/settings/taxes` | Tax strategy, rules and origin |
| `/admin/settings/email` | Customer-message sender identity and templates |
| `/admin/settings/account` | Password, sessions and owner MFA |
| `/admin/settings/team` | Owner-only team and invites |
| `/admin/system/developer` | Owner-only environment presence, explicit diagnostics and saved launch checks |
| `/admin/webhooks` | Inbound/outbound/email delivery monitoring and eligible retries |

Each settings route is a Server Component with a leaf authorization guard and a small interactive form. Its server DTO contains only needed safe fields. General does not load products, orders, customers, provider SDKs, or other settings forms. Admin navigation disables speculative prefetch of unrelated modules.

`GET /api/system/integrations` reports names, missing variable names, Configured/Missing, Test/Live and webhook-secret presence. It performs no provider request or Prisma credential query. `POST /api/system/integrations/[provider]/test` is an owner-only, explicit, bounded read-only diagnostic. Healthy/Error describes that test at its recorded time; Configured does not imply provider reachability or delivery success. No test sends an email or buys a shipping label.

Ordinary navigation reads the latest persisted launch check. Explicit `POST /api/readiness/run` examines business readiness and operational records, scanning products in bounded pages. Local shell/database/deployment tasks remain in the CLI.

## Shipping and outbound webhooks

`SHIPPING_RATE_PROVIDER` and `SHIPPING_LABEL_PROVIDER` select `none`, `shippo` or `easypost` independently. Merchant shipping mode and fallback behavior remain database settings. Request payloads cannot change infrastructure provider selection.

Developers declare outbound destinations in `src/server/config/outbound-webhooks.ts`: stable destination ID, URL, event subscriptions and environment variable references for signing keys and optional headers. Admin can inspect/retry deliveries but cannot edit destinations or secrets. Preserve destination IDs and HMAC keys through migration; retire a destination with `events: []` until queued deliveries are drained.

## Commerce and delivery guarantees

Pricing remains server-owned and uses integer minor units. Verified Stripe success finalizes the order; the browser cannot create paid orders. Existing payment idempotency, transactional stock changes, discount usage caps, refunds and returns remain service invariants.

Inbound signatures are checked before canonical delivery state is written. Rejected payloads use a separate hash-derived identity. Verified duplicate receipts cannot reset payload, outcome or retry ownership. Ingress, automatic retries and manual replay share atomic expiring claims. Jobs and outbound delivery completion also require the current unexpired claim.

Runner batches bound concurrency and acquisition time; crashed claims can expire and become eligible again. An email send can succeed externally just before a process crashes. Such uncertain outcomes require operator reconciliation rather than an automatic duplicate send. This is not an exactly-once external-delivery guarantee.

## Performance acceptance

Measure production client chunks and real browser requests separately. Compare the same fixture, build mode, role, cache state and route. Required evidence includes General compressed JavaScript reduction, no unrelated settings requests or credential queries, bounded catalog pages with search across the full published catalog, metadata-only media reads, aggregate analytics correctness and durable delivery concurrency tests. See [performance artifacts](../performance/) for recorded baselines and acceptance results.
