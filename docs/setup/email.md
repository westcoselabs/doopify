# Email setup

Select the email adapter explicitly in environment variables. `EMAIL_PROVIDER=none` is the default and disables sends. `EMAIL_PROVIDER=preview` is development-only and never records a message as sent. No email-provider API keys are entered in admin.

## Resend

Set `EMAIL_PROVIDER=resend` and `RESEND_API_KEY`. Verify your sending domain with the provider and configure sender/support identity in **Settings → General** and **Settings → Brand**.

For delivery feedback, register `https://<store-domain>/api/webhooks/email-provider`, subscribe to the delivery/bounce/complaint events you use, and set `RESEND_WEBHOOK_SECRET`. Restart or redeploy after changing the environment.

The Developer connection test reads provider domain status; it does not send a message. A restricted send-only key may send successfully while lacking diagnostic read permission. Use a saved-template test to validate the actual email path.

## SMTP

Set `EMAIL_PROVIDER=smtp` together with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD` and `SMTP_FROM_EMAIL`. Port defaults to 587 and secure defaults to false. The Developer test verifies the configured SMTP connection without sending.

## Merchant workflow

**Settings → Customer emails** edits order-confirmation/shipping-update templates, enablement and reply-to addresses. Store contact identity is managed in General. Save a template before using **Send saved template test**. Brand settings own logos and support identity. These business fields remain in Postgres.

**System → Delivery logs** shows safe delivery status and provider metadata. Missing configuration, explicit preview and real provider failure are reported without a false sent confirmation. A failure does not roll back a paid order or repeat inventory changes.

## Unknown send outcomes

An external provider can accept mail just before a worker crashes or times out. Persisted send-attempt state prevents an automatic duplicate retry in that case. Review the provider's delivery log and the matching Doopify record before explicitly resending an eligible failed message. Do not claim exactly-once delivery across SMTP/provider boundaries.

Configure the job runner for order/fulfillment email. See [worker deployment](../deployment/worker.md) and the [migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md).
