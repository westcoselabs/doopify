# Session Token Hash Migration Runbook

The original `20260710_hash_persisted_sessions` migration contains a table-wide
`DELETE FROM "sessions"`. It may already be recorded in deployed migration
history, so it must not be edited or replayed.

## Deployment decision

Inspect the target database's `_prisma_migrations` history before deploying.

- If `20260710_hash_persisted_sessions` is already applied, existing sessions
  were revoked by that historical deployment. Apply
  `20260713_session_hash_compatibility` normally; it adds the compatible
  `tokenHash` column and does not delete session rows.
- If it is not applied, do **not** run it. After confirming the database has
  the pre-migration `sessions.token` column, mark that specific migration as
  applied with `prisma migrate resolve --applied 20260710_hash_persisted_sessions`.
  Then run the remaining migrations, including
  `20260713_session_hash_compatibility`. This preserves legacy tokens until
  their normal expiry.

Do not automate `migrate resolve`; it is a production deployment decision and
requires an operator to verify the migration history and schema first.

## Compatibility window

- New sessions write only `tokenHash`; they never recreate plaintext tokens.
- Authentication checks `tokenHash` first and can accept `token` only before
  `SESSION_LEGACY_TOKEN_CUTOFF`.
- Set `SESSION_LEGACY_TOKEN_CUTOFF` to the production deployment time plus
  the maximum session lifetime (currently seven days). Keep the configured
  value fixed through the rollout; do not extend it on redeploy.
- After that cutoff, legacy plaintext bearer tokens are rejected. A later,
  separately reviewed migration may remove the legacy column after verifying
  there are no active legacy rows.

## Rollback

Rolling application code back remains possible while the legacy `token`
column exists. Do not remove `tokenHash` or delete sessions during rollback.
If a deployment must be rolled back, preserve the configured compatibility
cutoff and investigate session failures through normal authentication logs.
