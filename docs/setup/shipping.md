# Shipping setup

Infrastructure and store fulfillment policy have separate owners.

Developers set `SHIPPING_RATE_PROVIDER` and `SHIPPING_LABEL_PROVIDER` to `none`, `shippo` or `easypost` independently, plus the selected provider's `SHIPPO_API_KEY` or `EASYPOST_API_KEY`. Restart or redeploy after changes. Admin shows the selections read-only; requests cannot switch providers.

Owners can run an explicit provider connection test in **System → Developer**. Configuration presence alone does not prove carrier availability, address validity or label eligibility.

## Merchant shipping configuration

Open **Settings → Shipping & delivery** at `/admin/settings/shipping`.

- **Manual:** add active destination rules with flat, weight-based, subtotal-based or free rates as supported by the editor.
- **Live:** use the environment-selected provider; configure an active ship-from location, default package and product variant weights.
- **Hybrid:** resolve live rates first and apply the selected fallback policy when live rates are unavailable.
- Maintain fallback rates and choose `SHOW_FALLBACK`, `HIDE_SHIPPING` or `MANUAL_QUOTE` as appropriate.
- Configure manual fulfillment instructions, local delivery, pickup and packing-slip fields.

A physical checkout needs an applicable shipping option. Test the customer's destination through the real storefront quote flow; selected quotes are revalidated on the server before the PaymentIntent amount is created. Digital-only orders do not need physical shipping.

## Labels and tracking

Order detail obtains and revalidates label rates from the environment-selected label provider. Labels have their own stored cost and fulfillment linkage; a label purchase cannot alter a paid order's checkout totals. Manual checkout rates and label purchasing remain independent.

Configure provider callbacks at `/api/webhooks/shipping-provider?provider=SHIPPO` or `provider=EASYPOST`, and set the corresponding `SHIPPO_WEBHOOK_SECRET` or `EASYPOST_WEBHOOK_SECRET`. Only verified callbacks can update tracked fulfillment delivery state. Background tracking and email jobs require a working runner.

If rates are unavailable, check destination matching, package dimensions, product weights, origin/contact fields, provider permissions and the selected fallback behavior. Run the explicit launch check in **System → Developer** for saved business readiness. See [worker deployment](../deployment/worker.md).
