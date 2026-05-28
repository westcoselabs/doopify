# Digital Products Runbook

Operational runbook for Doopify v1 digital products and admin support workflows.

---

## 1. V1 feature overview

Digital products in Doopify v1 are guest-friendly downloads backed by secure tokenized access and admin support tooling.

Supported in v1:

- Digital-only products
- Private admin upload and product linking for digital files
- Secure download endpoint at `/api/digital-downloads/[token]`
- Checkout success page digital download card
- Digital download email delivery
- Admin order detail digital delivery tools:
  - Copy link
  - Resend email
  - Revoke access
  - Regenerate link

Not supported in v1:

- Mixed physical + digital carts
- Customer accounts, login, profile, or download library
- Subscriptions or memberships
- License key generation
- DRM or watermarking

---

## 2. Buyer flow

1. Buyer purchases a digital-only checkout.
2. Payment is finalized through existing verified Stripe webhook flow.
3. Digital grant(s) are issued for paid order items.
4. Buyer sees download card on checkout success page when links are available.
5. Buyer receives digital download email with secure tokenized link(s).
6. Buyer downloads through `/api/digital-downloads/[token]` until grant is expired, revoked, or exhausted.

---

## 3. Admin flow

1. Admin creates or edits product and sets fulfillment type to digital.
2. Admin uploads private digital file.
3. Admin links file to digital product.
4. After paid order finalization, admin can open order detail and use **Digital delivery** card.
5. Admin can:
   - copy the active secure link
   - resend digital delivery email
   - revoke grant access
   - regenerate a grant link (invalidates old URL)

---

## 4. Support flow

Use the order detail **Digital delivery** card to support buyers:

1. Check status (`Active`, `Expired`, `Revoked`, `Download limit reached`, `Pending`).
2. Verify download count and expiry.
3. Review last downloaded time and safe event summary when available.
4. Resend email if buyer cannot find message.
5. Revoke access only when required (refund/fraud/manual support decision).
6. Regenerate link when previous link is compromised or inaccessible.

Notes:

- Regeneration invalidates the previous URL.
- Revoke does not delete history; it sets `revokedAt`.
- Download count is preserved during regeneration by default.

---

## 5. Environment and storage checklist

Required or strongly recommended:

- `ENCRYPTION_KEY`
  - Required for secure encrypted token storage and secret encryption helpers.
- `NEXT_PUBLIC_STORE_URL`
  - Required for absolute links used in email/download contexts.
- `DIGITAL_ASSET_LOCAL_DIR`
  - Optional; local private file root when not using S3 private storage.
  - Defaults to `.private-digital-assets` if unset.
- `MEDIA_STORAGE_PROVIDER=s3` (recommended for production private digital storage)
- `MEDIA_S3_REGION`
- `MEDIA_S3_BUCKET`
- `MEDIA_S3_ACCESS_KEY_ID`
- `MEDIA_S3_SECRET_ACCESS_KEY`
- `MEDIA_S3_ENDPOINT` (optional for S3-compatible providers such as R2)

Warnings:

- S3 privacy depends on bucket policy and IAM. Misconfigured buckets can expose files.
- Digital files must never be stored in publicly readable buckets.
- `MEDIA_STORAGE_PROVIDER=vercel-blob` is intentionally rejected for private digital uploads until privacy guarantees are finalized.

---

## 6. Storage and security notes

- Digital files are stored in private storage paths (`local-private` or `s3-private`).
- Public/raw object URLs are not used for buyer download access.
- Buyer/admin response DTOs do not expose:
  - `storageKey`
  - `tokenHash`
  - `tokenEnc`
  - raw storage URLs
- Delivery tokens are encrypted at rest in `DigitalDownloadDelivery.tokenEnc`.
- Endpoint authorization is token-hash based (`DigitalDownloadGrant.tokenHash` validation).
- Grant state checks deny unsafe access for:
  - expired
  - revoked
  - exhausted

---

## 7. Manual QA checklist

### Product setup and purchase path

1. Create a digital product in admin.
2. Upload a private digital file.
3. Link uploaded file to the digital product.
4. Buy the product through checkout as a digital-only cart.
5. Confirm no shipping step is required for digital-only checkout.
6. Confirm checkout success page shows digital download card.
7. Confirm digital download email is sent with secure link.

### Download behavior

1. Open email download link and confirm download works.
2. Confirm download count increments after successful download.
3. From admin order detail, revoke access and confirm link stops working.
4. Regenerate link and confirm:
   - old link fails
   - new link works
5. Use resend email action and confirm a new digital email delivery record/outcome.

### Regression checks

1. Confirm physical product checkout still requires shipping.
2. Confirm mixed physical + digital cart is blocked.

---

## 8. Security checklist

- [ ] `storageKey` is never exposed in buyer/admin API payloads.
- [ ] `tokenHash` is never exposed in buyer/admin API payloads.
- [ ] `tokenEnc` is never exposed in buyer/admin API payloads.
- [ ] Raw/public storage URLs are never exposed in buyer/admin API payloads.
- [ ] Raw token plaintext is not persisted at rest.
- [ ] Download endpoint validates token via hash lookup and grant state checks.
- [ ] Expired/revoked/exhausted grants return safe denial behavior.
- [ ] Admin digital delivery routes require existing admin auth.
- [ ] Buyer flow remains guest-friendly without requiring customer accounts.

---

## 9. Known limitations

- Existing Prisma shadow migration-history issue remains out of scope in this phase.
- Clean bootstrap from migrations-only history may require future baseline repair work.
- Customer accounts/download library are intentionally excluded in v1.
- Mixed physical + digital carts are intentionally blocked in v1.

