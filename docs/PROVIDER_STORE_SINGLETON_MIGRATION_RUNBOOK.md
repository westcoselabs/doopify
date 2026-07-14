# Provider And Store Singleton Migration Runbook

This runbook covers the historical `20260711_provider_and_store_singletons`
migration and the corrective `20260714_correct_provider_store_singletons`
migration. Use `npm run db:deploy:safe` for the final application of pending
migrations. Do not execute the predecessor SQL directly.

## Inspect before resolving

Use a read-only SQL session against the target schema to inspect:

- `_prisma_migrations` rows for `20260711_provider_and_store_singletons` and
  `20260714_correct_provider_store_singletons`, including failed/rolled-back
  records;
- duplicate built-in `Integration.type` rows for Stripe, Shippo, EasyPost,
  Resend, and SMTP;
- duplicate `Store` rows;
- `integrations_providerKey_key` and `stores_singletonKey_key` indexes.

Unknown migration records, missing history alongside application objects, or a
schema that cannot be positively identified must fail closed. Escalate instead
of guessing a migration resolution.

## Supported histories

### A. `20260711` is pending

If the predecessor has never started and duplicate rows exist, do **not** run
`prisma migrate deploy`: its unique-index SQL can fail. After the review above
confirms the schema already has the additive columns or the corrected migration
is the intended path, an operator may record only the historical migration as
applied:

```bash
prisma migrate resolve --applied 20260711_provider_and_store_singletons
npm run db:deploy:safe
```

The safe command then applies the corrective migration, which deterministically
chooses one canonical row per provider and one oldest primary Store, sets only
the winners' keys, marks demoted provider duplicates inactive, and creates the
unique indexes.

### B. `20260711` failed

Inspect the failed record and duplicate rows. If review confirms it is safe to
skip the predecessor rather than retry it, first clear its failed state and
then explicitly mark the historical migration applied:

```bash
prisma migrate resolve --rolled-back 20260711_provider_and_store_singletons
prisma migrate resolve --applied 20260711_provider_and_store_singletons
npm run db:deploy:safe
```

Never use this sequence for an unknown partial schema; obtain a database
recovery plan instead.

### C. `20260711` is applied and `20260714` is pending

Run `npm run db:deploy:safe`. It applies the corrective migration through the
supported path. Inspect final canonical rows and indexes afterward.

### D. Both are applied

Run `npm run db:deploy:safe` as the normal idempotent deployment gate, then
verify the indexes and exactly one `providerKey` winner per built-in provider
and one `singletonKey = 'PRIMARY'` Store.

## Rollback and preservation

The corrective migration preserves duplicate Integration and Store rows. It
only demotes duplicate providers to `INACTIVE` and clears their singleton key.
Reactivation/reassignment is an operator action. Rolling back application code
does not restore a predecessor migration's historical behavior; do not drop the
unique indexes or delete duplicate records as an improvised rollback.
