# Performance Optimization Guide

This document covers the performance strategy across the Stellar Insights stack — backend query
efficiency, Redis caching, frontend realtime rendering, and mobile sync. It also describes how
to run benchmarks and interpret their output.

---

## 1. Backend

### 1.1 Database connection pool

The pool is configured for high-concurrency workloads via `backend/src/database.rs`. All values
are tunable through environment variables without recompiling.

| Parameter | Default | Env variable | Notes |
|-----------|---------|--------------|-------|
| Max connections | 100 | `DB_POOL_MAX_CONNECTIONS` | Raised from 50 to handle burst traffic before pool exhaustion |
| Min connections | 5 | `DB_POOL_MIN_CONNECTIONS` | Pre-warmed — avoids cold-start latency spikes |
| Acquire timeout | 10 s | `DB_POOL_CONNECT_TIMEOUT_SECONDS` | Callers get a fast 503 instead of hanging indefinitely |
| Idle timeout | 600 s | `DB_POOL_IDLE_TIMEOUT_SECONDS` | Idle connections returned to OS after 10 min |
| Max lifetime | 1800 s | `DB_POOL_MAX_LIFETIME_SECONDS` | Forces periodic recycling to prevent stale connections |

Under sustained high load, increase `DB_POOL_MAX_CONNECTIONS` first. Lower
`DB_POOL_CONNECT_TIMEOUT_SECONDS` (e.g. to 5 s) if callers are already queuing and a fast
failure is preferable to a slow one.

### 1.2 Slow query detection

Query logging is environment-aware:

- **Development** (`RUST_ENV=development`): every SQL statement is logged at `DEBUG` level.
- **Production**: only queries exceeding the slow threshold are logged. The threshold defaults
  to 100 ms and is configurable:

```dotenv
DB_SLOW_QUERY_MS=100     # log queries slower than this (milliseconds)
DB_LOG_LEVEL=warn        # trace | debug | info | warn | error | off
```

Slow query log lines include the query text and `EXPLAIN QUERY PLAN` output, which identifies
missing index usage. Watch for `SCAN TABLE` in the plan — it signals a full table scan that
should be covered by an index.

### 1.3 Query patterns

**Pagination** — all list endpoints return the standard `PaginatedResponse<T>` envelope:

```json
{
  "data": [...],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 312,
    "has_next": true,
    "next_offset": 50
  }
}
```

Always pass explicit `LIMIT`/`OFFSET` to the database rather than fetching all rows and slicing
in application code.

**Batch loading** — when fetching assets for multiple anchors, use an `IN (?, ?, …)` clause
constructed with sqlx's dynamic query builder rather than issuing one query per anchor. This
prevents the classic N+1 pattern.

**Index-aligned ordering** — sort columns (`reliability_score DESC`, `created_at DESC`,
`corridor_key ASC`) should be covered by indexes. Verify with:

```bash
# SQLite
sqlite3 stellar_insights.db "EXPLAIN QUERY PLAN SELECT * FROM anchors ORDER BY reliability_score DESC LIMIT 50;"

# PostgreSQL
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM anchors ORDER BY reliability_score DESC LIMIT 50;"
```

A healthy plan shows `INDEX SCAN` or `BITMAP INDEX SCAN`, not `SEQ SCAN`.

**Outbound RPC rate limiting** — Horizon's public endpoint allows roughly 100 req/min. The
token-bucket limiter is tuned below that ceiling:

```dotenv
RPC_RATE_LIMIT_REQUESTS_PER_MINUTE=90   # sustained rate
RPC_RATE_LIMIT_BURST_SIZE=10            # short-burst headroom
RPC_RATE_LIMIT_QUEUE_SIZE=100           # max queued requests before 429
```

Reduce `RPC_RATE_LIMIT_REQUESTS_PER_MINUTE` if you share the same API key across multiple
instances. Increase `RPC_RATE_LIMIT_BURST_SIZE` when ingesting historical backfills.

Paginated RPC fetches are rate-throttled between pages:

```dotenv
RPC_MAX_RECORDS_PER_REQUEST=200    # Horizon max per call
RPC_MAX_TOTAL_RECORDS=10000        # cap total records per backfill run
RPC_PAGINATION_DELAY_MS=100        # pause between pages
```

---

## 2. Redis caching

### 2.1 TTL configuration

Three TTL bands cover the main data types. All are configurable at runtime:

| Data type | Default TTL | Env variable | Reasoning |
|-----------|-------------|--------------|-----------|
| Corridor metrics | 300 s (5 min) | `CACHE_CORRIDOR_METRICS_TTL` | Metrics change on each ingestion run (every 5 min by default) |
| Anchor data | 600 s (10 min) | `CACHE_ANCHOR_DATA_TTL` | Anchor profiles are slow-moving; longer TTL reduces DB reads |
| Dashboard stats | 60 s (1 min) | `CACHE_DASHBOARD_STATS_TTL` | High-visibility page; short TTL keeps numbers fresh |

To raise dashboard stats freshness for staging environments:

```dotenv
CACHE_DASHBOARD_STATS_TTL=300
```

Monitor hit rates before increasing TTLs in production — a high miss rate often signals a
cache key mismatch rather than a TTL problem.

### 2.2 Cache key structure

Keys follow a `type:operation:params` pattern:

| Key | Usage |
|-----|-------|
| `corridor:detail:<key>` | Single corridor metrics |
| `corridor:list:<limit>:<offset>:<filters>` | Paginated corridor list |
| `anchor:detail:<id>` | Single anchor profile |
| `anchor:list:<limit>:<offset>` | Paginated anchor list |
| `anchor:account:<address>` | Anchor lookup by Stellar account |
| `anchor:assets:<anchor_id>` | Assets associated with an anchor |
| `dashboard:stats` | Dashboard summary |
| `metrics:overview` | Metrics overview page |
| `analytics:dashboard` | Analytics dashboard aggregate |

### 2.3 Cache invalidation

Invalidation is pattern-based using Redis `SCAN` + `UNLINK` (non-blocking — safe under load):

```
anchor:*        — invalidates all anchor caches
corridor:*      — invalidates all corridor caches
dashboard:*     — invalidates dashboard caches
```

Cascade rule: invalidating a single item (e.g. `anchor:detail:<id>`) also deletes related
list caches (`anchor:*`) because list pages embed the same data. This avoids stale list
responses after a single-item update.

Trigger invalidation after any write operation:

```rust
// After anchor update
cache_invalidation.invalidate_anchor(&anchor_id).await?;

// After corridor ingestion
cache_invalidation.invalidate_corridors().await?;
```

Do not call `invalidate_anchors()` (bulk) after single-item updates in high-throughput paths —
it wipes all anchor cache entries and causes a thundering herd on the next read.

---

## 3. Frontend

### 3.1 Realtime updates — `useRealtimeCorridors`

The hook (`frontend/src/hooks/useRealtimeCorridors.ts`) manages three state buckets fed by
WebSocket messages:

| State | Type | Cap | Update strategy |
|-------|------|-----|-----------------|
| `corridorUpdates` | `Map<string, CorridorUpdate>` | unbounded | keyed replace — only the latest update per corridor is kept |
| `healthAlerts` | `HealthAlert[]` | 50 | prepend + slice |
| `recentPayments` | `NewPayment[]` | 100 | prepend + slice |

All message handlers are wrapped in `useCallback` with a minimal dependency array
`[enablePaymentStream, onCorridorUpdate, onHealthAlert, onNewPayment]`. Adding unstable
references (e.g. inline objects or functions) to that array will re-create the handler on
every render and cause redundant WebSocket re-subscriptions.

The `Map`-based corridor state means components that read a single corridor key can use
`corridorUpdates.get(key)` and will only re-render when that specific key changes, provided
the consumer is also memoized.

### 3.2 Memoization guidelines

Use `useMemo` for any derived list that involves filtering, sorting, or pagination over a
parent array. Without it, re-renders triggered by unrelated state (e.g. connection status)
will re-sort the entire list on every tick.

```tsx
// Good — only re-sorts when anchors, sortField, or sortOrder changes
const sorted = useMemo(
  () => sortAnchors(anchors, sortField, sortOrder),
  [anchors, sortField, sortOrder],
);

// Avoid — re-sorts on every render
const sorted = sortAnchors(anchors, sortField, sortOrder);
```

Use `React.memo` on leaf components that receive high-frequency props (e.g. a single corridor
row in a live table). Without it, any parent state change re-renders the entire list.

```tsx
const CorridorRow = React.memo(({ corridor }: { corridor: CorridorUpdate }) => {
  // renders only when corridor reference changes
});
```

### 3.3 Bundle size budgets

Enforced in CI via `scripts/analyze-bundle.mjs` and webpack `performance.hints`:

| Metric | Budget |
|--------|--------|
| Main bundle (gzipped) | ≤ 200 KB |
| Per-asset raw size | ≤ 500 KB |
| Per-entrypoint raw size | ≤ 500 KB |

Check locally:

```bash
cd frontend
pnpm run analyze       # full build + bundle report
pnpm run build         # webpack warns on oversized assets
```

### 3.4 Core Web Vitals targets

| Metric | Target |
|--------|--------|
| Largest Contentful Paint (LCP) | ≤ 2.5 s |
| First Input Delay (FID) | ≤ 100 ms |
| Cumulative Layout Shift (CLS) | ≤ 0.1 |
| Time to Interactive (TTI) | ≤ 3 s |
| Lighthouse performance score | ≥ 90 |

Measure with `pnpm run analyze` or Lighthouse in Chrome DevTools against the production build
(`pnpm build && pnpm start`). The dev server adds significant overhead and is not a reliable
baseline.

---

## 4. Mobile

### 4.1 API client

The mobile API client (`mobile/src/services/api.ts`) uses Axios with request/response
interceptors that:

- Attach `Authorization` and `X-Stellar-Network` headers on every outbound request
- Record `startTime` in request metadata and compute `duration` on response for latency logging
- Log response size to identify oversized payloads worth paginating or compressing

Avoid logging the full response body in production — the interceptor already logs size and
status, which is enough for triage without leaking data.

### 4.2 Offline queue and sync

When the device is offline, write operations are queued in persistent storage and replayed
when connectivity returns. Key characteristics:

| Property | Value |
|----------|-------|
| Storage backend | AsyncStorage (persisted across app restarts) |
| Max retries | Platform-specific: iOS 5, Android 4, default 3 |
| Item states | `pending` → `processing` → `failed` |
| Processing trigger | Network status change to online via NetInfo listener |
| Batch strategy | Sequential — items processed in order, failures do not block subsequent items |

After `MAX_RETRY_COUNT` failures the item moves to permanent `failed` status and must be
manually retried. This prevents an unrecoverable item from blocking the queue indefinitely.

Tuning guidance:
- Increase retry counts for unreliable network conditions (e.g. field devices with intermittent connectivity).
- Add exponential backoff between retries if the backend returns 429 or 503 — a fixed-count
  retry without delay can amplify load on a recovering server.

### 4.3 Reduce unnecessary network usage

- Use the `X-Stellar-Network` header (already set by the interceptor) to let the backend
  return network-appropriate responses without redundant round trips.
- Enable conditional requests (`ETag` / `If-None-Match`) for read-heavy endpoints so a
  304 Not Modified response avoids retransmitting unchanged data.
- Respect `CACHE_CORRIDOR_METRICS_TTL` and `CACHE_ANCHOR_DATA_TTL` on the mobile side: do
  not poll the API faster than the server-side cache TTL — the response will be identical.

---

## 5. Benchmarks

### 5.1 Running benchmarks

All benchmarks are in `backend/benches/` and run with Criterion.

```bash
# Cache operations (requires Redis on localhost:6379)
cd backend
cargo bench --bench cache_benchmarks

# Run a specific cache benchmark
cargo bench --bench cache_benchmarks -- cache_set

# Corridor creation, key generation, median computation
cargo bench --bench corridor_benchmarks

# Save a baseline for before/after comparison
cargo bench --bench corridor_benchmarks -- --save-baseline main

# Compare against the baseline after a change
cargo bench --bench corridor_benchmarks -- --baseline main

# Database operations (uses in-memory SQLite — no external deps)
cargo bench --bench database_benchmarks
```

Criterion writes HTML reports to `backend/target/criterion/`. Open
`backend/target/criterion/report/index.html` in a browser for flame graphs and regression
charts.

### 5.2 Benchmark scope

| Benchmark file | What it measures |
|----------------|-----------------|
| `cache_benchmarks.rs` | Cache set/get latency, serialization overhead, concurrent access at 1/10/100 concurrency, hit rate under load |
| `corridor_benchmarks.rs` | Corridor struct creation + normalization, corridor key generation, payment record processing, median latency computation |
| `database_benchmarks.rs` | Connection pool management, query execution time, batch operation throughput, transaction handling — all against in-memory SQLite |

### 5.3 Interpreting results

Criterion reports time per iteration in nanoseconds or microseconds with confidence intervals.
A regression is flagged when a change makes a benchmark measurably slower. Key numbers to
watch:

- **Cache set/get p99 latency** — should stay under 1 ms for local Redis; higher values
  indicate network issues or Redis memory pressure.
- **Corridor key generation** — pure CPU; should be sub-microsecond. A regression here
  indicates an accidental allocation in a hot path.
- **DB batch vs. per-row** — the batch benchmark should demonstrate super-linear throughput
  gains over the per-row baseline; if not, the batch size may be too small.

---

## 6. Regression prevention

- Run `cargo bench -- --baseline main` in CI on PRs that touch `backend/src/cache.rs`,
  `backend/src/database.rs`, or any query-heavy handler.
- Run `pnpm run analyze` in CI on PRs that add new dependencies or change page structure.
- Review slow query logs weekly in staging. Any query appearing consistently above the
  `DB_SLOW_QUERY_MS` threshold is a candidate for an index or a query rewrite.
- Profile mobile before shipping: use Flipper (Android) or Instruments (iOS) to confirm that
  sync operations complete within the expected window and do not block the UI thread.
