# Environment-only upgrade

This upgrade removes infrastructure credentials from the application runtime. It does **not** rotate provider accounts or application encryption keys. A Git merge or application build does not apply database migrations. Production cutover and the rollback window require an operator.

The local [rehearsal report](performance/env-only-migration-rehearsal.json) covers a synthetic legacy database restored with `pg_dump`, including encrypted MFA/download data and outbound history. It is not a rehearsal of your production backup. Repeat the procedure on a restored copy of the actual installation before scheduling production.

## Prepare and export

1. Record the application/worker versions, database migration history, deployment environment and provider account identities. Back up the database and verify restoration in isolation. Keep a deployable copy of the pre-upgrade application and its original environment.
2. Use Node.js 22.18 or later. Resolve the existing migration preflight before proceeding; unknown, missing or failed migration history is a blocker. Follow the established [migration deployment runbook](PROVIDER_STORE_SINGLETON_MIGRATION_RUNBOOK.md), never an unreviewed `db push` against existing commerce data.
3. Create a private directory **outside the repository**. Put the effective legacy deployment environment in a private `legacy.env` there. Include `DATABASE_URL`, existing `ENCRYPTION_KEY` and any `ENCRYPTION_KEY_PREVIOUS`. For the rehearsal, change only the database target to the restored database and disable network access to live providers.
4. Run the local tool, substituting absolute private paths below:

```text
node scripts/env-only-migration.mjs status --legacy-env-file <private>/legacy.env
node scripts/env-only-migration.mjs export --legacy-env-file <private>/legacy.env --env-file <private>/runtime.env --destinations-file <private>/outbound-webhooks.ts
```

Exports are exclusive writes with restricted permissions. They contain real credentials: never commit them, attach them to a ticket, paste them into logs or leave them in build output. The tool prints source names and counts only. It refuses unreadable secrets and unsafe migration history. It does not call providers or mutate commerce rows.

The export reproduces the effective legacy provider resolution, including verified Stripe/email credentials and shipping selection, rather than choosing a different saved account. The previous transactional sender actually used Resend; a saved SMTP connection alone did not make it the sender. The tool exports that effective behavior, or `EMAIL_PROVIDER=none` if no sender existed. Use `--email-provider smtp` consistently on export/verify/contract only for a deliberate SMTP activation after delivery testing.

`DATA_ENCRYPTION_KEY` and `DATA_ENCRYPTION_KEY_PREVIOUS` receive the same effective key material as their legacy equivalents. Do not generate new keys. The export does not re-encrypt envelopes. Operational settings unrelated to this export (for example CSP, rate limiting and worker scheduling) must remain in the deployment environment.

Review the generated typed destinations, then copy their non-secret declarations to `src/server/config/outbound-webhooks.ts`. Preserve destination IDs, URLs, events and secret references. Copy the separately exported variable values to the host's secret environment. Never inline signing keys or header values. Active unsigned legacy destinations must be assigned a reviewed signing key before migration; export fails closed for them. Retired destinations with pending work require reconciliation; retain their identities until the work is drained.

## Rehearse expansion and validate

1. Against the restored database, run `npm run db:preflight-migrations` and `npm run db:deploy:safe`. These existing commands load `.env` and then `.env.local`; verify their printed host/database/schema matches the restored target. The offline export tool's `--legacy-env-file` does not configure these separate commands.
2. The additive migration `20260924_env_only_delivery_leases` adds claim tokens/expiry, email send-start state and destination snapshots. It backfills snapshots while preserving delivery IDs, payloads and history, then removes the outbound foreign key to integrations. Legacy tables and Store provider columns remain for rollback.
3. Validate the export and actual destination file against the expanded database:

```text
node scripts/env-only-migration.mjs verify --legacy-env-file <private>/legacy.env --env-file <private>/runtime.env --destinations-file <repository>/src/server/config/outbound-webhooks.ts
```

Verification first parses the export with the production environment schema, then compares effective provider values, current/previous encryption keys, shipping selectors, destination IDs/URLs/events/secret references, complete snapshots and readable MFA/download envelopes. Legacy storage aliases/CDN names are normalized during export; outbound signing-key bytes are preserved exactly. It reads application rows in bounded pages and does not change them. A pass is configuration preservation evidence; it is not a live provider check.

4. Deploy the application and worker together against the restored target using the exported environment. Confirm owner login/MFA, old download tokens, historical orders and outbound deliveries, settings access and diagnostics. Use isolated provider test accounts for live smoke checks. Exercise verified Stripe finalization/replay, inventory races, refunds/returns, shipping quotes/labels, email delivery and retry ownership. Do not send copied customer messages or replay production payments from the restored database.
5. Prove rollback to the old application with its original environment while legacy tables remain. Record timing, queue counts and validation evidence.

## Production maintenance window

1. Pause new checkout/operational writes and job scheduling. Drain jobs, inbound/outbound retries and queued email using the old application. Reconcile exhausted deliveries and any uncertain send with provider logs. Stop the old worker before changing configuration.
2. Take the agreed backup. Repeat export using current production state, review the effective account/destination identities, and apply the additive migration through the guarded deployment path. Verify all snapshot backfills and encrypted data before continuing.
3. Install the reviewed typed destination file and environment variables. Set email and shipping selectors explicitly. Keep the old environment privately for rollback, but the new runtime reads only renamed data keys and env provider configuration.
4. Deploy application and worker together; confirm old instances and schedules are stopped. Run `verify` against the expanded database and final configuration. Then perform deliberate provider connection tests and a verified webhook receipt; Configured, Healthy and a verified receipt are different observations.
5. Validate a test checkout/payment/order, inventory movement, refund, return, email, shipping and retry/replay path. Reopen traffic and schedules only after checks pass. Monitor failed/uncertain deliveries, runner heartbeats, checkout latency and database errors.

Keep the legacy tables/columns and old keys for the agreed rollback period. Do not rotate the data key during this period. Roll back application and worker together, restoring their original environment. The additive migration leaves old schema fields available; do not reset or restore over newer commerce data to roll back code. Review newly queued events before resuming the old worker.

## Contract after the rollback window

Contract is a separate explicit local operation, never part of automatic deployment. Stop writes/workers and drain queues again. With a fresh tested backup and recorded cutover verification:

```text
node scripts/env-only-migration.mjs contract --legacy-env-file <private>/legacy.env --env-file <private>/runtime.env --destinations-file <repository>/src/server/config/outbound-webhooks.ts --maintenance-window --backup-confirmed --cutover-verified --confirm-contract
```

The command requires known migration history, the applied additive migration, preserved effective config and readable encrypted data. Inside a serializable transaction it locks the relevant tables, refuses undrained queues or unexpected integration foreign keys, and drops only the three legacy integration tables, four Store provider columns and obsolete integration status enum. It retains commerce data and delivery history. Contract failure rolls back.

After contract, the old application cannot run against the contracted schema. Database restoration is a separate recovery procedure with a plan for all subsequent commerce writes. Securely retire exported plaintext files and legacy environment values according to the host's secret-handling policy, and retain only metadata evidence.

## Remaining durability boundary

External email outcomes can be uncertain after a timeout/crash. The delivery fails for operator review instead of an automatic SMTP duplicate. Outbound consumers must continue deduplicating by delivery ID. A transactional outbox for the crash window between a commerce commit and static event dispatch is a separate follow-up, not an assurance made by this migration.
