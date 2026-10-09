# Scaling and Settings hardening

Implemented on `codex/env-only-commerce-simplification`, September 24, 2026. Production deployment and capacity certification remain separate gates. This work extends the single-store Prisma/Postgres architecture; it does not introduce a second persistence system or change payment/tax authority.

## Issues and changes

| Issue | Change | Practical effect |
| --- | --- | --- |
| Live shipping selections depended on one process's memory | Hash-addressed, expiring Postgres quote snapshots | Quotes survive restarts and replica changes; cart/address/price checks remain server-owned |
| Commerce could commit before its downstream events were persisted | Existing jobs table acts as a transactional outbox | Order, payment-status, refund, return and fulfillment transactions persist their event intent atomically, including legacy adjustment and purchased-label paths |
| A crash after event fan-out could duplicate consumers | Dispatch receipt and persistence-only consumers share a fenced transaction | Analytics, email jobs/deliveries, tracking jobs and outbound deliveries roll back together; replay skips a completed event |
| Production bundles could each allocate an independent full pool | Reuse the global Prisma client/adapter in production | Pool bounds apply across bundles in the same JavaScript runtime; separate processes/isolates still need their own budget |
| Workers scanned the same candidates; batches could wait while holding leases | `FOR UPDATE SKIP LOCKED` for jobs/outbound claims, acquisition only as a slot becomes free | At most four active tasks per runner; a 45-second acquisition budget; owned tasks finish before acquisition errors propagate |
| Public media reads used the environment's current storage adapter | Resolve each asset's persisted provider | Mixed Postgres/S3 assets remain readable during migration |
| Private S3 reads buffered the entire object | Stream with backpressure and cancellation | Response memory is bounded by stream buffers; disconnects release the upstream stream |
| Upload previews accumulated blob URLs; asynchronous updates captured stale drafts | Owned URL/request/timer cleanup and current-draft updates | Upload completion preserves intervening edits; previews release after replacement/removal/close |
| Product editor typing notified the catalog and deep-cloned the draft | Separate memoized subscriptions, immutable updates and weakly cached collection comparisons | The catalog skips draft-only renders; unchanged media/variant collections reuse references and signatures |
| Shipping saves refetched the entire workspace and reset other drafts | Local editor state, mutation-result merging, narrow workspace projection | Drawer typing stays local; unrelated unsaved checkout settings survive entity saves; no follow-up GET after save |
| Cleared rate limits were omitted from PATCH | Explicit nullable fields and an editable free-shipping threshold | Limits can be removed and changing rate type clears irrelevant constraints |
| Tax preview disagreed with active checkout logic | Reuse integer-cent tax calculation; show retained regional configuration read-only | Preview supports inclusive tax and shipping taxation without activating legacy regional rules |
| Settings had duplicate controls and fragile custom choice menus | Native selects, General-owned store name, optional brand overrides, dirty-only saves, reset/discard and disabled fields during saves | Smaller control code and simpler merchant decisions; structured validation errors remain visible |

The settings navigation guard covers links and browser unload. In-app browser history transitions are not a comprehensive navigation-blocking API. Provider response reconciliation and external exactly-once delivery are not guaranteed by an internal outbox.

## Deployment sequence

1. Rehearse against a restored installation using the existing [migration runbook](../ENV_ONLY_MIGRATION_RUNBOOK.md). Back up first. The new migrations are `20260925_checkout_quote_snapshots` and `20260926_transactional_event_outbox`; neither contracts legacy tables.
2. Stop old worker acquisition, let owned work finish, apply additive migrations through `npm run db:deploy:safe`, then deploy the matching application and worker artifact. Old workers do not understand `DISPATCH_INTERNAL_EVENT`. Rehearse index-build time and database lock budgets with production-sized jobs data.
3. Allow old in-memory live quotes to expire/drain (15 minutes), or have affected checkouts refresh their rates. A missing quote fails validation; never substitute a client-provided shipping amount.
4. Keep job runners active: customer email/tracking/outbound work now follows durable event processing. Monitor pending/oldest jobs, exhausted events and delivery failures; verify queue latency against the store's operational target.
5. Keep additive tables and dispatch receipts during rollback. Never blindly delete receipts or successful deduplicated jobs: their identities prevent replay from creating new fan-out. Agree on an archival/replay policy before adding retention. Do not roll workers back to a version that cannot read queued event jobs.

Expired quotes are cleaned in bounded batches (500 rows per jobs-run pass, hard maximum 1,000 per call). Size worker cadence so cleanup exceeds expired-quote arrival volume; alarm on growth and oldest expiry. Quotes store fingerprints and provider rate metadata, not raw customer addresses or bearer tokens.

## Capacity verification

Use the isolated loopback fixture on port 55432, schema `commerce_perf`, with 1,000 products, 2,000 variants, 10,000 orders and 30 collections. `scripts/performance-server.mjs` strips live provider credentials and supports app ports 3107/3108. Set `CAPACITY_OBSERVE=1` to collect buffered RSS, heap, event-loop p99, CPU and pool occupancy every second. Set `PERFORMANCE_PORT=3108` for the second replica. The fixture server fixes each application's pool limit at ten and acquisition timeout at five seconds.

`node scripts/check-capacity.mjs` runs a bounded open-loop workload: 60% shop, 20% collections, 10% product detail, 10% protected Shipping settings. Every route is evenly split across both replicas. It also enqueues real internal event jobs every five seconds in the disposable database and invokes both job runners; worker failure detection checks the response body as well as HTTP status. It reports offered/completed/dropped requests, scheduling delay, dispatch-to-headers time, body-consumption time, total scheduled-to-complete latency, bytes, HTTP errors, queue age and database connections, with route, replica and five-second aggregates. It never calls payment, label or email providers. This is a read/render and internal dispatch workload, not a live checkout/provider capacity test or browser rendering/hydration measurement.

- First gate: three runs with `CAPACITY_RPS=100`, `CAPACITY_WARMUP_SECONDS=30`, `CAPACITY_SECONDS=60`; warmup is separately reported.
- Burst gate: `CAPACITY_RPS=500`, `CAPACITY_SECONDS=60`.
- Only after the gates pass: `CAPACITY_RPS=100`, `CAPACITY_SECONDS=3600` for the soak, with no growing queue, pool wait or sustained post-GC heap trend.
- Initial harness thresholds: errors below 1%, no dropped demand, no worker failures and aggregate p95 below 1 second in every run. Scheduling p99 must remain below the local 50 ms validity guard. Establish per-route business SLOs on production-like infrastructure before launch.

Reports are written to `output/capacity-*.json`; process samples are `output/capacity-runtime-*.ndjson`. Capture a revision plus working-tree diff with measurements. A local result does not establish hosted capacity: include TLS/CDN, network database latency, provider sandbox work, realistic write ratios and background delivery volume in staging.

### Historical measurements — September 24, 2026

The production build was tested on two local app processes sharing a local Postgres 16 fixture. No build, test suite or browser automation ran concurrently with the load runs. The load generator shares this host, so these are diagnostic observations rather than hosted capacity estimates. [Raw request results and runtime summaries](scaling-capacity.json) include the base revision, build ID, per-route latency and sample boundaries.

| Workload | Offered / completed | Failed requests / dropped demand | p50 / p95 / p99 | Gate |
| --- | --- | --- | --- | --- |
| 100 RPS × 60 seconds, before production pool reuse | 6,000 / 6,000 | 0 / 0 | 49 / 1,375 / 2,026 ms | Latency failed |
| 100 RPS × 60 seconds, after production pool reuse | 6,000 / 6,000 | 0 / 0 | 42 / 1,391 / 1,905 ms | Latency failed |
| 500 RPS × 60 seconds, after production pool reuse | 30,000 / 9,262 | 13 timeouts / 20,738 | 2,838 / 8,483 / 9,523 ms | Saturated |

Pool instrumentation found three pools in each process before the reuse fix and one afterward. Sampled database connections fell from 30–31 to 20–21 (including the harness connection). This is evidence of bounded connection use, not a latency improvement. At 100 RPS, pool wait peaked at 125 queued acquisitions in one replica; protected Shipping had the highest route p95 at 1,941 ms. At 500 RPS, wait reached 999, so increasing request concurrency without reducing database/render work would worsen overload.

The highest sampled per-process RSS was 585 MiB at 100 RPS and 1,192 MiB at 500 RPS after pool reuse. Event-loop p99 samples peaked at 117 ms and 92 ms respectively. These short runs include warmup/GC variation and do not prove the absence of heap leaks. Worker calls had no failures and sampled pending queues were empty, with only one internal event produced per five seconds; this does not certify high-volume delivery throughput.

At this historical checkpoint both prerequisite gates failed, so the one-hour soak was **not run**. These measurements used route-parity replica selection (Shipping pinned to one replica and product detail to the other), lacked a separately measured 30-second warmup, and did not decompose scheduled-to-complete latency. The historical worker check did not inspect the body's failed-job count. Preserve this evidence as observed, with those limitations; it is not a corrected baseline for attributing the changes below. The focused pass below runs only 100 RPS; burst, soak and deployment acceptance remain pending.

## Focused 100-RPS pass

**The latency gate remains open.** The corrected baselines passed, but the final untraced runs returned **216 / 7,887 / 146 ms p95**. The second run dropped 142 requests and recorded 48 request failures (0.8% of offered demand, including timeouts); worker failures were zero. These changes remove unnecessary work, but they do **not** establish a repeatable p95 reduction. Do not describe the best run as production readiness or the historical 1.39 seconds as a controlled before/after baseline.

[Focused measurement evidence](p95-100-rps.json) preserves all runs, separate warmup results, route/replica/five-second aggregates, failure counts, runtime summaries, query plans, CPU profile summaries and raw-file hashes. Original `scaling-capacity.json` is unchanged. Full request records and local trace/profile files remain in `output/`; no credentials, SQL parameters or customer payloads are exported by the tracer.

### Controlled scope and source identity

- Two production app processes, ten connections each, unchanged fixture and 60/20/10/10 route mix, ten-second request timeout, 500-request concurrency cap and five-second worker cadence. Each corrected run has 30 seconds of warmup followed by 60 measured seconds at 100 RPS. No builds or tests ran concurrently with load. There was no 500-RPS or soak run in this pass.
- Base revision: `c7b36d7ba428e530f518060e29d30d58687981bc`, with the existing uncommitted hardening work. Baseline build: `UOkbznfV7Sedymf07tNAB`. Collection-link build: `cX_xVFwCfR0w__xgyj8gC`. Final build: `-HraVsWcxniTHRq6aW09A`. Source manifests and changed application-file hashes are identified in the evidence; a base commit alone does not identify these dirty builds.
- Replica assignment now rotates each ten-request cycle so every route is split evenly. Priming touches every route on both replicas. A replay of the original skewed harness on the unchanged baseline build reached 95 ms p95 / 413 ms p99. The original 1.39-second result therefore was not reliably reproduced even before the application changes. Routing, priming, observer changes and shared-host variation cannot be assigned separate causal percentages from these runs.

### Verified work reductions

`getStorefrontCollectionLinks` projects only `id`, `title` and `handle` for Shop navigation (limit 24) and collection peers (limit 5, excluding the current handle). It reuses publication/nonempty filtering and the existing updated-time/ID ordering. The full summary API, its images, product counts and pagination remain unchanged.

Typical sampled SQL counts fall from **13 to 7** on Shop and **15 to 9** on both collection routes; detail stays at 7 and Shipping at 11. At this mix, that is approximately **480 fewer queries/second**, from 1,260 to 780, excluding workers. Collection-link payloads also reduce complete response size: Shop **96,361 → 93,217 bytes**, collection 0 **54,863 → 54,208**, collection 1 **54,874 → 54,217**. Detail and Shipping response sizes are unchanged. These savings are observed work/payload reductions, not an inferred latency percentage.

`getStorefrontDocumentSettings` projects the favicon through `findPrimaryStore`, preserving missing-store behavior and deterministic legacy resolution. It avoids the previous full settings read and public-brand payload construction. Query count and HTTP bytes stay unchanged by this second change; the representative PostgreSQL plan width falls from 1,881 to 32 bytes (an estimate, not measured network bytes). No cache, pool expansion, session-validation shortcut or new index was introduced.

### Untraced measurements

All values below are milliseconds. Every run offered 6,000 measured requests. Except final run 2, all completed 6,000 with zero request failures and drops. Every run had zero worker failures and scheduling p99 below 31 ms, within the 50 ms guard.

| Stage | Warmup p95 (separate) | Measured p95 | Measured p99 | Gate |
| --- | ---: | ---: | ---: | --- |
| Corrected baseline 1 | 529 | 57 | 118 | Pass |
| Corrected baseline 2 | 52 | 51 | 96 | Pass |
| Corrected baseline 3 | 55 | 57 | 223 | Pass |
| Collection links only | 809 | 691 | 1,133 | Pass, slower than baseline |
| Final 1: links + favicon | 1,316 | 216 | 1,035 | Pass |
| Final 2: links + favicon | 2,217 | 7,887 | 9,956 | Fail: 5,858 completed, 142 dropped, 48 failed |
| Final 3: links + favicon | 580 | 146 | 773 | Pass |

Every route's p95 / p99 is shown below. The numbered collection routes and product handle refer to the preserved synthetic fixture. Final Shipping timeouts must not be hidden behind the more heavily weighted Shop route.

| Route | Baseline 1 | Baseline 2 | Baseline 3 | Final 1 | Final 2 | Final 3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shop | 57 / 117 | 50 / 98 | 56 / 222 | 214 / 931 | 4,667 / 4,765 | 151 / 716 |
| Collection 0 | 50 / 79 | 44 / 65 | 46 / 190 | 221 / 1,330 | 7,914 / 8,234 | 100 / 867 |
| Collection 1 | 59 / 139 | 55 / 83 | 59 / 258 | 202 / 1,270 | 7,884 / 8,241 | 171 / 914 |
| Product detail | 35 / 58 | 33 / 44 | 33 / 159 | 199 / 899 | 4,571 / 4,693 | 80 / 647 |
| Protected Shipping | 74 / 128 | 62 / 124 | 79 / 223 | 218 / 1,263 | 10,019 / 10,031 | 150 / 929 |

### Tracing, attribution and remaining delay

The benchmark-only preload registers OpenTelemetry before Next.js loads and uses [Next.js's existing spans](https://nextjs.org/docs/app/guides/open-telemetry), with 10% parent-based request sampling. It adds request IDs, pg acquisition/connection-hold/SQL spans and a safe fingerprint/category for queries; auth SQL and middleware are reported separately from rendering. This does not measure a complete standalone authentication function duration. Output uses a bounded buffer with asynchronous local flushes and visible dropped-record counts. SQL spans include driver/network/decode time. The analyzer uses interval unions, clips spans to the request, and never adds concurrent SQL durations or unrelated percentiles to claim a critical path. Render spans overlap database work; residual server time is not pure CPU.

For reproduction, start both `scripts/performance-server.mjs` processes with `CAPACITY_OBSERVE=1`; the second also sets `PERFORMANCE_PORT=3108`. Use `CAPACITY_TRACE=0` for acceptance. For diagnostics, restart both with `CAPACITY_TRACE=1`, set the same flag on `scripts/check-capacity.mjs`, and give the run a `CAPACITY_LABEL`. Optional `CAPACITY_CPU_PROFILE=1` captures the first 15 measured seconds on each traced server; mark that run as profiled on the harness too. After buffered output has flushed, run `node scripts/analyze-capacity.mjs output/capacity-<timestamp>.json`. `scripts/explain-capacity.mjs` and `scripts/check-p95-freshness.mjs` target only the disposable fixture and must run without competing load. The freshness check restores its edited fixture fields in `finally`.

Tracing defects found during the investigation are retained and labelled in the evidence. The initial 100% prototype reused keep-alive root contexts and is excluded from attribution. Subsequent early traces used unique roots but could lose SQL ownership when a queued pg connection was handed over; their queued-request SQL attribution is incomplete. The final implementation explicitly associates SQL with the connection borrower. A forced single-connection handoff check with 200 requests verified unique sampled roots and one correctly owned SQL span per sampled request.

The corrected final sampled run reached **58 ms p95 / 82 ms p99**, with 613 traced requests, consistent route query counts, zero sampled pool queueing and no telemetry drops. Sampled p95 values were **1.74 ms acquisition union**, **10.95 ms SQL union**, **10.98 ms connection-hold union**, **18.57 ms render union**, and **27.16 ms residual server time**; these overlap and are not additive. In its slowest sampled 5%, acquisition p95 was only 2.23 ms. This explains the healthy state, not the later saturation window.

Instrumentation overhead cannot be assigned one stable percentage: the early 100% prototype measured 157 ms p95, early 10% baseline trace 4,241 ms, links-only trace 369 ms, CPU-profiled final diagnostic 483 ms, and corrected final trace 58 ms, while untraced final results ranged from 146 to 7,887 ms. Correlation defects, process restarts, profiling and uncontrolled background host activity confound those comparisons. Acceptance uses only untraced runs; diagnostic successes do not replace the failed run.

In failing final run 2, both app pools stayed capped at ten connections while waiting acquisitions peaked at **481 and 508**. Sampled total database connections stayed at **21**, including the harness. Five-second p95 rose from 113 ms near the start to approximately ten seconds mid-run. Dispatch-to-headers p95 was **7,099 ms** and body-consumption p95 **2,974 ms**; those percentiles must not be summed. Per-process CPU medians rose to roughly **120% of one core** (including background runtime threads), event-loop p99 samples peaked at **124/151 ms**, and RSS approached **999/1,006 MiB**. Worker backlog samples remained empty. The next run recovered, although RSS remained elevated; these short samples establish neither a leak nor stable memory usage.

Representative read-only `EXPLAIN (ANALYZE, BUFFERS)` plans completed in **0.021–1.273 ms** on the fixture. They justify eliminating redundant reads, not adding an index without further evidence. They are representative statements measured without load, not proof that every Prisma query remained fast during saturation. The separate 15-second CPU profiles showed about 45–47% idle samples, distributed Next/React and Prisma work, roughly 1–1.5% GC samples, and measurable profiler overhead. They did not capture failing final run 2 or identify a dominant application function suitable for another verified optimization.

**Remaining explanation:** long-tail episodes correlate with rising pool queues, CPU demand and memory pressure. The trigger and division between connection hold time, SQL under load, framework/GC work and host contention are not established. The failed untraced run cannot retrospectively supply missing spans. Continue only this 100-RPS investigation: capture a failing window with the corrected tracing, inspect the dominant SQL/CPU path in that window, and accept another code change only after a repeatable comparison. Preserve freshness and the fixed connection budget. Burst, soak and deployment certification stay pending.

### Focused verification

Real PostgreSQL coverage verifies visible/nonempty navigation, future publication, ordering, exclusions, limits, next-read changes, missing stores and legacy favicon resolution. HTTP checks on both final production replicas verify immediate title/favicon edits, publication removal, anonymous Shipping denial and the unchanged full collection API fields/pagination. Prisma generation, TypeScript, production build, **1,453 fast tests**, **47 real-DB tests**, three harness metric tests, the queued trace-ownership check and repository hygiene passed. Lint has zero errors and 25 existing warnings; React Doctor remains 72/100 with 21 warnings. No deployment readiness claim follows from these local checks.

### Correctness and UI verification from the preceding hardening pass

- Prisma generation, TypeScript and production build passed. Lint passed with 25 existing warnings. The build retains the existing dynamic-file-path warning for digital downloads.
- Fast suite: **228 files / 1,453 tests passed**. Real Postgres suite: **8 files / 44 tests passed**, including transaction rollback, outbox replay, lost-claim fencing, shared quotes and competing worker claims.
- The restored-schema migration rehearsal passed through `db:deploy:safe`, preserving an existing job and retained legacy data. CI now runs this rehearsal; remote CI for these uncommitted changes has not run.
- [Eight production Settings/System routes](scaling-settings-browser.json) passed desktop/mobile, anonymous-access and draft-preservation checks. Shipping's initial query count was 11 versus 13 in the preceding refinement evidence; initial settings API requests remained absent.
- `node scripts/check-scaling-browser.mjs` passed native keyboard selection, entity saves without a full reload, independent checkout-method drafts, visible validation failures, upload edits retained during asynchronous completion and blob URLs returning from two to zero after editor close. Provider uploads were mocked; rate creation/deletion used the disposable database.
- React Doctor changed scope against `origin/master`: **72/100, 21 warnings**, unchanged from the preceding changed-scope scan. Transaction-consumer sequencing and bounded sequential uploads are intentional; settings response status is checked in the shared reader. Remaining branch-wide component complexity and older SettingsContext effects remain follow-up work. No diagnostics were suppressed.

## Next optimizations

Set `DATABASE_POOL_MAX` (default 10) and `DATABASE_POOL_TIMEOUT_MS` (default 5,000) per process. Budget all active app replicas, rollout overlap, workers and administrative connections against the database limit. Increase replicas/pools only with measured database headroom.

Profile the slow routes with query plans and representative data before adding indexes, catalog caching, analytics rollups or promotion candidate filtering. Preserve publication boundaries, stock freshness, integer-cent allocations and paid snapshots. Prefer S3/CDN media for bandwidth-heavy installations. Keep the typed static integration registry and persistence-only outbox consumers; provider I/O belongs in durable delivery jobs.
