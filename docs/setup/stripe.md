# Stripe setup

Stripe configuration belongs in `.env.local` or your deployment environment. The admin never accepts or stores provider keys.

1. Set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from the same Stripe account and mode. Use test mode for development.
2. Register `https://<store-domain>/api/webhooks/stripe` for `payment_intent.succeeded` and `payment_intent.payment_failed` in Stripe. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.
3. Set the real public URL in `NEXT_PUBLIC_STORE_URL`, then restart or redeploy. Public build variables must be present at build time.
4. As owner, open **System → Developer**. Configured means values are present. Use **Test connection** for an explicit account-read check; **Webhook Ready** means signing configuration is present, not that an event has arrived.
5. Complete a Stripe test-mode checkout, confirm a processed delivery in **System → Delivery logs**, and verify one paid order and one inventory decrement. Replaying the verified event must not duplicate commerce effects.

For local delivery forwarding:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Use the signing secret from that listener in the local environment. The local CLI helper `npm run doopify:stripe:webhook` supports webhook setup; review its plan/options before changing a remote endpoint.

Only verified Stripe success finalizes paid orders. The browser redirect is not payment truth. Failed or missing signature configuration cannot create a paid order. Existing stores must use the [migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md) before dropping legacy credentials.
