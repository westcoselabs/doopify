# Secret Rotation Runbook

> Operational rotation checklist for production credentials and signing secrets.
>
> Last updated: May 5, 2026

## Scope

Rotate these secrets regularly and after any suspected exposure:

- `JWT_SECRET`
- `ENCRYPTION_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- shipping provider API keys (EasyPost/Shippo)
- `WEBHOOK_RETRY_SECRET`
- `JOB_RUNNER_SECRET`
- `ABANDONED_CHECKOUT_SECRET`
- database credentials / `DATABASE_URL`

## Rotation Cadence

- High-impact credentials (JWT/encryption/database/payment/webhook): every 90 days.
- Lower-impact operational secrets: every 90-180 days.
- Immediate rotation after incident response confirms or suspects leakage.

## Standard Rotation Procedure

1. Prepare new secret values in your secret manager.
2. Update non-production first and run:
   - `npm run db:generate`
   - `npx tsc --noEmit`
   - `npm run test`
   - `npm run build`
3. Deploy production with both old/new overlap where supported by provider APIs.
4. Verify:
   - admin authentication and session creation
   - checkout creation and Stripe webhook finalization
   - background job runner authentication
   - provider webhook verification and outbound webhook retries
5. Remove old values after validation window.
6. Record rotation date, owner, and verification evidence.

## Special Notes

### JWT Secret

- Rotating `JWT_SECRET` immediately invalidates existing sessions.
- Announce maintenance impact before production cutover.

### Encryption Key

- Existing encrypted rows (provider secrets, integration headers, MFA secrets) depend on `ENCRYPTION_KEY`.
- Deploy the new `ENCRYPTION_KEY` with the old value in `ENCRYPTION_KEY_PREVIOUS`; the application writes versioned envelopes and can read legacy/current envelopes during the overlap.
- First run `npm run secrets:reencrypt -- --dry-run`. It reads encrypted rows and reports only metadata counts; it never prints plaintext or secret values.
- Review the dry-run report, back up the database, then run `npm run secrets:reencrypt -- --apply --confirm-reencrypt`.
- The command verifies each replacement before writing it. If a row is unreadable, it does not overwrite that row; retain the prior key, restore the row from a verified backup if needed, and rerun after correction.
- Verify checkout, provider status, outbound webhooks, MFA login, and digital-download access before removing `ENCRYPTION_KEY_PREVIOUS`.
- Do not rotate encryption key ad hoc, generate a new key automatically, or remove the previous key before the validation window closes.

### Stripe + Webhooks

- Rotate Stripe API credentials and webhook signing secrets together when possible.
- Ensure webhook endpoint signatures still verify after cutover.

## Logging and Evidence

- Never log raw secret values.
- Store only metadata in change records:
  - what changed
  - when it changed
  - who approved and executed rotation
  - validation outcomes
