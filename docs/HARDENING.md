# Doopify hardening

Updated September 24, 2026. Current repository guarantees and remaining release work. See [STATUS](STATUS.md), [verification evidence](performance/env-only-acceptance.md) and the [upgrade runbook](ENV_ONLY_MIGRATION_RUNBOOK.md). Repository verification does not prove production deployment.

## Implemented protections

- Session-backed JWT validation checks the database; new session rows store token hashes. Plaintext legacy reads require an explicit valid cutoff. Use the guarded additive deployment path in the [session migration runbook](SESSION_TOKEN_MIGRATION_RUNBOOK.md).
- Route authorization supplements boundary-safe proxy protection. OWNER, ADMIN and STAFF operate store settings; only OWNER manages Team and Developer diagnostics. Personal account access requires a session. Old Account/Team bookmarks redirect to authorized destinations.
- Owner bootstrap is transaction-guarded and production-gated by `SETUP_TOKEN`. There are no permanent default production credentials. Team changes preserve the last owner; disabling an account revokes its sessions. Invite/reset tokens are hashed, expiring and single-use.
- Owner MFA supports TOTP and one-time recovery codes. Application encryption preserves versioned envelopes, current/previous keys and rotation. Renaming `DATA_ENCRYPTION_KEY` must preserve key material. Provider decryption exists only in offline migration tooling.
- Media upload types are verified from bytes; SVG uploads are rejected. Public DTOs omit private fields, metadata lists omit image bytes and storefront catalog reads enforce publication and pagination.
- Analytics aggregates complete paid-order cohorts separately by currency.
- Jobs and inbound/outbound deliveries use atomic expiring claims and owner-fenced completion. Requests, response reads, queue concurrency and runner acquisition time are bounded.
- Invalid Stripe signatures cannot overwrite a verified receipt. Duplicate verified ingress cannot reset payload, outcome or retry ownership.
- Email delivery/job pairs are atomic. Persisted send-start state prevents blind resends after an uncertain send. Receipt state cannot be downgraded by a stale sender. Preview and missing configuration never report successful delivery.
- Merchant Settings contains persistent business data only. Domain/runtime/provider selection and frontend design tokens cannot be changed through its forms or general/brand APIs. Developer diagnostics expose safe presence and explicit test outcomes, never secret fragments.

## Remaining work, in order

1. Rehearse against a restored production installation, validate configuration export and delivery snapshots, then coordinate application/worker cutover and rollback closure. No UI cleanup authorizes destructive schema changes.
2. Close the crash window between a committed commerce transaction and downstream event/job persistence with a transactional outbox. Current side-effect isolation does not guarantee event delivery after a process crash or exactly-once external sends.
3. Complete deployment-specific backup restore, live provider webhook and email deliverability tests, capacity measurements and CSP enforcement review. See [production operations](PRODUCTION_RUNBOOK.md), [backup/restore](BACKUP_AND_RESTORE.md), [dependency triage](DEPENDENCY_ADVISORY_TRIAGE.md) and [customer data posture](CUSTOMER_DATA_POSTURE.md).
4. Expand real-DB payment/inventory/refund/return and delivery race coverage with new behavior. Add missing audit coverage for email resends and webhook retries; keep sensitive mutation authorization explicit.
5. Move remaining discounts/media route business logic into services. Migrate legacy shipping/tax data and Postgres media only after data equivalence and rollback validation.

## Payment And Checkout Invariants

These invariants should not be broken by future work:

- the browser may start checkout
- the server recalculates checkout totals
- the server validates live variant pricing and inventory
- the server creates and persists the checkout session
- Stripe webhook success finalizes order creation
- browser redirect success does not create the order
- duplicate Stripe events do not create duplicate orders
- checkout customer creation is idempotent when duplicate payment-intent completions race
- conflicting Stripe success/failure deliveries for one payment intent must not downgrade paid checkout state
- inventory decrement happens only after verified payment success
- discount applications and usage increments happen only after verified paid-order creation
- capped discount usage is enforced safely under concurrent paid-order finalization
- late payment-success webhook delivery can finalize an expired checkout session exactly once
- order/payment/inventory commits remain durable even when order confirmation email delivery fails
- failed checkout state is persisted and visible to the user
- persisted money is stored in integer minor units (`*Cents` fields for USD)
- Stripe `amount` values must use the same stored integer cents values directly
- dollar display formatting belongs only at API/UI boundaries, never in persistence math
- checkout shipping charges must be server-calculated and revalidated from server-owned shipping configuration
- label-purchase cost and checkout shipping charge are separate values and must never be conflated
- buying labels must never mutate order totals or payment status
- checkout rates decide what customers pay; label providers create postage after order placement
- manual shipping and manual fulfillment paths must remain available without live carrier credentials
- Shipping business settings and test-rate APIs remain admin-authorized and never return provider credentials.
- Owner-only integration diagnostics run on explicit POST; navigation performs no provider checks.
- Infrastructure secrets are consumed directly from typed server config with zero credential-table reads.
- Focused Settings Server Components load only the business data and forms needed for that route.
- Stripe runtime status and checkout config routes must never expose raw Stripe secret key or webhook secret; publishable key exposure must remain explicit and source-labeled
- Diagnostic failures report Error at the time of the test, separately from environment presence and verified webhook receipt.
- Provider failures never mutate deployment configuration; failed webhook attempts cannot overwrite verified deliveries.
- Playwright mutation suites must require `DATABASE_URL_TEST` on a dedicated non-public schema and must never read `.env` to obtain a normal development database URL
- manual, EasyPost, and Shippo shipping quotes should flow through a normalized internal quote shape before checkout/admin consumers use rate data

## Refund And Return Invariants

- the app must persist enough state to reconcile Stripe refund success/failure
- a Stripe refund should use an idempotency key derived from local refund identity
- order/payment status must not change unless the refund is issued
- inventory restocking must not happen unless the refund is issued and restocking is requested
- refund items must belong to the order and stay within refundable quantity bounds
- returns must move only through allowed state transitions
- closing a return with a refund must link the return to the refund record
- close-with-refund item quantities must not exceed the quantities actually received in the return

## Outbound Webhook Invariants

- outbound webhook subscriptions must be explicit by destination and event in typed developer configuration
- destination identities must be unique and stable across deployments
- delivery records must be durable before delivery is attempted
- signing secrets and custom header secrets live only in environment variables; persisted snapshots contain references, never secret values
- configuration changes must retain delivery identities and snapshots; a destination mismatch requires review before historical delivery resumes
- outbound payload signing must include a timestamp to reduce replay risk
- non-2xx responses should be recorded and retried according to policy
- due delivery processing must claim a delivery before sending to reduce duplicate sends from overlapping workers
- exhausted deliveries must remain visible to the admin as a dead-letter state
- manual retries must not erase the history needed to debug earlier failures
- typed internal events remain the source of outbound delivery creation

## Background Job Invariants

- Background side effects are persisted as jobs and processed with claiming, retries, backoff, and exhaustion.
- Core commerce truth such as payment success, order creation, inventory decrement, refunds, returns, and discount usage must not depend on background job success.
- Abandoned checkout recovery can send recovery emails and rebuild checkout intent, but it must never create orders, mark payments paid, decrement inventory, or trust saved/client totals. Verified Stripe webhook success remains the only paid-order finalization path.
- Brand Kit public payloads must expose only safe branding fields. Brand Kit changes must not affect checkout/payment/order correctness.
- Storefront and checkout readability must not depend on admin theme values; frontend-owned checkout tokens and Stripe appearance settings are the active safety baseline.


## Verification and release

Run the [contributing verification gate](../CONTRIBUTING.md), disposable real-DB concurrency/migration tests and relevant browser suites. Mutation suites must never use the normal development or production database. Preserve capability-token, promotion, session cutoff and encryption rotation coverage.

Use the [environment-only migration](ENV_ONLY_MIGRATION_RUNBOOK.md), [singleton migration](PROVIDER_STORE_SINGLETON_MIGRATION_RUNBOOK.md), [session migration](SESSION_TOKEN_MIGRATION_RUNBOOK.md) and [secret rotation](SECRET_ROTATION_RUNBOOK.md) procedures when applicable. Retain legacy physical tables for the agreed rollback window. No forced database reset, silent key regeneration or automatic destructive contract step.

Infrastructure navigation makes no provider calls. Explicit owner tests are read-only and bounded. Local setup, provider provisioning, environment writes and deployment actions belong in the CLI. Keep runbooks synchronized with the actual runtime contract.
