# Production deployment checklist

Updated September 24, 2026. This checklist records deployment work; branch-local tests do not establish production readiness.

## Before promotion

- [ ] Run Prisma generation, lint, TypeScript, fast tests and production build.
- [ ] Run relevant real-DB payment/inventory/refund/return, delivery-claim and migration tests against a disposable target.
- [ ] Record production bundle/request/query comparisons against the same fixture and build mode.
- [ ] Back up the target database and verify restoration access.
- [ ] Existing stores: complete export and verification in the [environment-only migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md). Apply additive migrations while retaining legacy tables and encryption key values.
- [ ] Verify `DATABASE_URL`, `JWT_SECRET`, `DATA_ENCRYPTION_KEY` and `NEXT_PUBLIC_STORE_URL` in the intended deployment environment.
- [ ] Configure matching Stripe keys and webhook signing secret.
- [ ] Configure explicit email/shipping/storage selection and the corresponding environment credentials.
- [ ] Deploy the static outbound destination declarations with preserved IDs and environment signing/header keys.
- [ ] Configure authenticated POST job/retry/recovery scheduling and its environment secrets.
- [ ] Require `SETUP_TOKEN` for first-owner bootstrap; preserve existing owner MFA/session migration settings when upgrading.
- [ ] Verify an active sellable product, applicable physical shipping, and intended tax policy.

## After deployment

- [ ] Log in as owner; verify password, MFA and role boundaries as applicable.
- [ ] Load focused General/Brand/Shipping/Tax/Email/Account/Team pages and save representative business changes.
- [ ] **System → Developer** shows safe presence states. Run explicit provider tests; no secrets are returned or editable.
- [ ] Run a saved launch check. Review warnings instead of treating Configured as proof of live health.
- [ ] Complete test-mode checkout: webhook creates one paid order, accurate money/discount snapshots and one stock change.
- [ ] Repeat/replay the verified event; no duplicate order or inventory effect.
- [ ] Confirm invalid signatures cannot alter an existing canonical delivery.
- [ ] Verify refunds/returns and digital downloads as used by this store.
- [ ] Confirm background heartbeats, inbound/outbound retries and delivery exhaustion visibility.
- [ ] Confirm real email delivery; missing configuration/preview must not be marked sent. Reconcile uncertain send outcomes before retrying.
- [ ] Validate storage uploads, public media and private digital asset boundaries.
- [ ] Confirm backups, operational alerting and rollback ownership.

Keep the compatibility schema until the agreed rollback window closes. Run legacy contraction only in a maintenance window after the migration tool verifies configuration/data and queues are drained. See [production runbook](../PRODUCTION_RUNBOOK.md).
