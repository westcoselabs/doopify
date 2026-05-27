## Summary

Describe what changed and why.

## Scope

- [ ] Docs only
- [ ] Tooling/config only
- [ ] App behavior changes

## Safety Checklist

- [ ] No secrets or credentials added
- [ ] Auth, privacy, and data-boundary impacts reviewed
- [ ] Webhook/integration side effects reviewed (if applicable)
- [ ] Checkout/payment/order/inventory behavior changed (explicitly acknowledge):
  - [ ] Yes
  - [ ] No

## Verification Checklist

- [ ] `npm run db:generate`
- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] Additional checks (if applicable) documented in PR description
