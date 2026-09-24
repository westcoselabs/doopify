# Doopify roadmap

Updated September 24, 2026. [STATUS](STATUS.md) owns current implementation status; this file owns sequencing. [HARDENING](HARDENING.md) owns correctness and operational requirements.

## Current release

The remediation and 28 Smart Promotions commits are merged to master at `06c8336c`. Environment-only simplification and the Settings refinement are implemented on `codex/env-only-commerce-simplification`. Production cutover is pending.

1. Preserve the merged commerce, promotions, session, encryption and migration guarantees.
2. Use typed environment configuration and small adapters; remove credential persistence and browser configuration.
3. Keep merchant Settings limited to General, Brand, Shipping, Taxes and Customer emails. System owns Team, Developer and delivery monitoring; My account is a separate personal destination.
4. Verify bounded catalog reads, complete analytics aggregates, claim ownership and email reconciliation. Keep production-build evidence in [performance acceptance](performance/env-only-acceptance.md).
5. Rehearse on a restored installation, drain work, switch application and worker together, verify real operations, retain rollback tables, then contract through the [migration runbook](ENV_ONLY_MIGRATION_RUNBOOK.md).

Repository checks and a synthetic rehearsal do not complete step 5.

## Next work

- Close the post-commit event crash window with a transactional outbox. Preserve the static registry, saved checkout/promotion snapshots and consumer idempotency.
- Migrate remaining legacy Store shipping/tax fields to canonical locations, packages, rates and rules only after proving equivalent behavior on restored data. Historical theme values remain readable; the admin cannot change frontend design tokens. Do not drop fields or remove compatibility readers during a UI cleanup.
- Complete deployment-specific restore, webhook, email deliverability, CSP enforcement and load/capacity checks from [HARDENING](HARDENING.md).
- Extend real-DB race tests as new consumers are added; move remaining route business logic into existing services.
- Optimize promotion candidate loading only when measurements justify it. Preserve eligibility, deterministic integer-cent allocation and paid snapshot semantics.

## Completed foundation

| Sequence | Result |
| --- | --- |
| Phases 1–3 | DB-backed catalog, storefront, server-owned checkout, verified payment finalization, collections and merchandising |
| Phase 4 | Refunds, returns, delivery observability, transactional email, analytics events, jobs and checkout recovery |
| Phases 20–21 | Merchant workflows, team/account management, owner bootstrap and recovery |
| Phase 26 | Security and operational hardening; deployment-specific acceptance remains ongoing |
| Smart Promotions V1 | Server-owned automatic promotions with deterministic winners, allocation and durable paid snapshots |
| Environment simplification | Env-only infrastructure, focused server pages, bounded data reads and delivery concurrency protection |

Implementation detail belongs in [architecture](architecture/env-only-commerce.md) and [Smart Promotions](smart-promotions-v1.md), not duplicated phase completion lists.

## Deferred

Customer accounts, runtime plugins, public plugin/theme marketplaces, multi-tenant SaaS, generated admin replacement and platform extraction. Build these only after the single-store commerce engine proves reliable. Developers own the storefront design system.
