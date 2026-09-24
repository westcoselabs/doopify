# Environment-only simplification: acceptance evidence

Measured September 24, 2026 against merged master `06c8336cfd7140435ef5a45fcc803db7a5010c70`, which includes all 28 Smart Promotions commits and the remediation branch. The clock-dependent checkout test was corrected before the fast-forward and ordinary push of master. This report covers the implementation branch; no production database or provider environment was changed.

## Comparable production measurements

Windows, Node 24.11.1, Next 16.2.10 production builds, local PostgreSQL 16, the same owner and synthetic fixture: 1,000 products, 2,000 variants, 10,000 paid/refunded orders, 500 customers, 30 collections, 25 stored image binaries and 10 active promotions. Each route has one browser navigation with browser cache disabled and 30 subsequent sequential warm HTTP samples. These are local observations, not a production load test or confidence interval.

| Acceptance metric | Merged master | Implementation | Change |
| --- | ---: | ---: | ---: |
| General route-specific gzip JS, including its Settings layout | 74,666 B | 13,134 B | **82.4% less** |
| All General manifest-referenced gzip JS | 93,475 B | 31,943 B | 65.8% less |
| General browser-transferred script body bytes | 385,777 B | 162,609 B | 57.8% less |
| General initial-navigation SQL queries | 109 | 6 | **94.5% fewer** |
| General initial-navigation requests | 96 | 23 | 76.0% fewer |
| General browser scripting | 101.8 ms | 29.4 ms | 71.1% less |
| Shop initial-navigation SQL queries | 120 | 13 | 89.2% fewer |
| Collection initial-navigation SQL queries | 92 | 15 | 83.7% fewer |
| Collection HTML/RSC response | 1,318,875 B | 54,863 B | 95.8% smaller |

The new General leaf page alone is 2,305 B gzip, but that excludes the new Settings layout. **The acceptance comparison includes that layout** so moving code between files cannot manufacture a reduction. Both 50% targets pass. The parser/adapters have no runtime credential-table reads or decryptions. All eight settings pages render without initial business-data fetches or automatic provider tests; General receives its DTO from the Server Component. CSP telemetry can still create requests in the browser trace.

| Route | Warm HTTP p50, before → after | Warm HTTP p95, before → after | Browser script bytes, before → after | Initial SQL time, before → after |
| --- | --- | --- | --- | --- |
| General | 6.5 → 12.7 ms | 9.3 → 19.5 ms | 385,777 → 162,609 B | 753.7 → 3.2 ms |
| Shop | 3.9 → 20.0 ms | 5.4 → 29.8 ms | 181,780 → 159,914 B | 1,323.7 → 91.0 ms |
| Collection | 131.2 → 16.0 ms | 157.5 → 20.8 ms | 190,066 → 159,529 B | 723.1 → 32.9 ms |
| Empty checkout | 10.2 → 7.9 ms | 12.6 → 11.9 ms | 194,653 → 190,259 B | 16.9 → 2.6 ms |

General and Shop now render their data on the server; the old initial HTML was a client shell. Their higher HTTP latency is an expected tradeoff, not a speedup. Initial browser work, requests and SQL fall substantially. SQL timing includes all navigation queries and may overlap; it is not wall-clock route latency. Navigation-to-network-idle also depends on fonts, images and prefetch. The checkout browser case is empty-cart navigation and does not measure live Stripe latency.

Product/collection reads have bounded server pagination/search and consistent publication rules. Metadata projections exclude `MediaAsset.data`; image delivery remains a separate binary request. Removing speculative catalog link prefetch avoids querying each visible destination before the customer chooses it. Analytics aggregates the complete paid/refunded-order cohort, keeps currencies separate, counts repeat customers from paid orders and reports issued refunds separately.

## Promotion-heavy checkout profiling

The existing loader/evaluator was profiled with 10, 100 and 1,000 active promotions and 1, 10 and 50 cart lines, 25 samples per combination. At 1,000 promotions, the implementation performs seven loader queries, transfers about 362 KB of loader data, and measures 12.9–14.1 ms loader p50 / 19.7–23.0 ms p95. Pure evaluation p95 stays below 0.52 ms. Baseline timings are comparable; the loader/evaluator was deliberately unchanged.

The loader's cost still grows with active promotion count. Candidate filtering is a measured follow-up, requiring proof that product/variant/customer eligibility and saved paid snapshots stay equivalent. No unsafe eligibility shortcut or promotion stacking was introduced. Existing promotion admin/checkout browser suites and all retained promotion, payment, session, capability-token and rotation tests pass.

## Verification

- Prisma generation, TypeScript, production build and repository hygiene passed.
- Lint: zero errors, 25 warnings (merged baseline: 43 warnings). JavaScript pages now also enforce undefined-variable detection.
- Fast unit/service suite: **1,433 passed**, zero failures or skips, including three additional cross-platform upload filename cases after Linux CI exposed a host-dependent basename operation. Removed tests covered deleted credential CRUD, masking, provider setup and monolithic Settings implementations; equivalent commerce/reliability tests remain or were replaced with the env-only contracts.
- Disposable real-Postgres suite: **40 passed** across six files, including checkout/inventory races, refund/return behavior, complete analytics/catalog datasets, email ownership and concurrent job/inbound/outbound claims.
- Existing Playwright suite: **20 passed**, two live-Stripe checks intentionally skipped because ordinary tests strip external credentials. This includes promotion admin/checkout, capability POST behavior, digital order snapshots, smoke checks and desktop/mobile snapshots.
- Production settings browser checks: **eight routes passed** with a Pacific/Auckland browser timezone differing from the server; no browser errors, anonymous diagnostics denied, legacy section bookmarks redirected, failed General save preserved the draft and did not show success.
- Local backup/restore migration rehearsal passed: effective config, current/previous encryption keys, MFA/download envelopes, delivery IDs/payloads and commerce rows preserved; undrained contract refused; guarded contract succeeded after drain.
- React Doctor changed-scope scan: 71/100 with three Tax form callback diagnostics. Comparable clean full snapshots improved from 39/100 to 47/100. The three reported errors were inspected as false positives: `perform` invokes the async mutation once outside React's state updater; actual `setRules` callbacks are pure. Existing unrelated diagnostics remain; no claim of a clean whole-repository scan is made.

The production build retains one Turbopack dynamic-filesystem tracing warning for private digital downloads. The generated download route trace contains 213 files and no environment files, private uploads or local verification/worktree artifacts. Suggested ignore annotations did not resolve it and were removed. This matches a [reported Next.js tracing issue](https://github.com/vercel/next.js/issues/95125); inspect deploy traces on the target host rather than suppressing the warning or changing private-file containment.

## Reduction and deployment boundaries

The initial published branch exposed two CI setup defects before tests ran: an incomplete optional dependency lock entry and a pre-existing unsupported job-level secret condition. The lockfile was regenerated without an installed dependency tree and validated with npm 11.19's Linux/x64 clean-install dry run. Integration CI now provisions its own disposable Postgres 16 service instead of depending on a shared database secret. Remote verification results must be checked for the final branch head separately from the local evidence above.

The [remote Postgres suite](https://github.com/westcoselabs/doopify/actions/runs/35956701179) passed all 40 tests. Linux unit CI then caught Windows-style upload names being parsed with POSIX server path rules; filename parsing now handles both client path styles explicitly. The [earlier Vercel preview](https://vercel.com/westcoselabs/doopify/GZ7u1KZnkuZ66ZGyC7EshCpaBdJ5) failed on `Invalid environment configuration: DATA_ENCRYPTION_KEY`. The existing effective key was subsequently added under the new name in local configuration and Vercel Preview/Production, retaining the hosted legacy name for rollback. No key was rotated and no runtime fallback was added.

Production `src` code (TS/JS/JSX/TSX/CSS, excluding tests/declarations) falls from 93,910 to approximately 77,900 physical lines: **about 16,000 lines removed net**. API route files fall from **148 to 133**. The [exact code/API inventory](env-only-code-size.json) includes new files, not just tracked deletions.

Provider execution is env-only, but existing database tables remain physically present through the rollback window. The [upgrade runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md) requires a restored copy of the actual installation, preserved effective accounts/keys/destinations, a maintenance window, drained work and application/worker cutover together. The local rehearsal is synthetic. No production secrets were exported, live emails sent, payment/label operations performed, or production tables dropped by this work.

Deployment-specific provider smoke tests, actual backup rehearsal and cutover remain operator acceptance. The post-commit event/side-effect crash window remains an explicit transactional-outbox follow-up. Expiring claims and email send-start markers do not promise exactly-once external delivery.

## Settings and documentation refinement, September 24

The [current bundle measurement](settings-refinement-bundle.json) records General route-specific gzip JS at **12,083 bytes**, down another **8.0%** from 13,134 bytes and **83.8%** from merged master. General still performs six initial Prisma queries. The [current browser checks](settings-refinement-browser.json) cover five merchant pages, separate Account/Team/Developer routes, bookmark redirects, mobile navigation and preserved drafts after failed General, shipping-location and template saves. All eight pages issue **zero initial fetch/XHR requests**. Light/dark and 390/1440px renders were inspected.

Prisma generation, lint (zero errors, 25 existing warnings), TypeScript, build and repository hygiene passed. The unit suite passes **1,431 tests**; deleted cases belonged to the two removed, unused status APIs and email-status service, while new cases reject infrastructure/theme mutations through merchant APIs. Existing browser suites pass **20 tests**, with the same two live-Stripe checks skipped. React Doctor remains **71/100**, with the same three pre-existing callback diagnostics. The known private-download tracing warning remains.

Shipping no longer loads a separate readiness snapshot. Its location editor is reachable, fallback rates are collapsible, and failed location saves display an error in the open editor. Customer emails owns message content rather than duplicate sender setup. Developer diagnostics are compact read-only disclosures outside merchant Settings. Legacy Store data and migration runbooks remain; this pass makes no schema or deployment changes.

Superseded archives, beta plans and the duplicate contributing pointer were removed from the working tree; Git history retains them. The maintained documentation index replaces that navigation clutter, while original performance and migration evidence above remains available. Use `node scripts/measure-settings-bundle.mjs refinement` and `node scripts/check-settings-browser.mjs` to reproduce the current refinement artifacts.

## Reproduction and artifacts

`scripts/seed-performance-fixture.mjs` is guarded to the disposable loopback `doopify_test/commerce_perf` target on port 55432. `scripts/performance-server.mjs` runs an inert production server on port 3107. Run `node scripts/measure-performance.mjs after`, `node scripts/measure-settings-bundle.mjs after` and `node scripts/check-settings-browser.mjs` against that fixture; `baseline` selects the old Settings URL and requires a build of merged master. Promotion profiling uses `PERFORMANCE_DATABASE_URL` and `PERFORMANCE_LABEL=after` with `npx vitest run --config scripts/performance.config.ts`.

Recorded evidence: [baseline bundles](env-only-baseline.json), [after bundles](env-only-after.json), [baseline browser/SQL](env-only-baseline-runtime.json), [after browser/SQL](env-only-after-runtime.json), [baseline promotions](env-only-promotion-baseline.json), [after promotions](env-only-promotion-after.json), [settings browser checks](env-only-settings-browser.json), and [migration rehearsal](env-only-migration-rehearsal.json).
