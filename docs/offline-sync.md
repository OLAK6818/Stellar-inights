# Offline Sync & Local Persistence

This document describes how Stellar Insights keeps the mobile app, the web
frontend, and the backend consistent when a client is offline and later
reconnects. It covers the local persistence layer, the offline mutation
queue, the cache-staleness model, and the client/server reconciliation
contract, plus known failure modes and what is intentionally left as
follow-up work.

## Goals

- Mobile actions taken while offline are persisted durably and are not lost.
- Once connectivity returns, queued actions are replayed safely — replaying
  the same action twice (e.g. because a retry raced the original request)
  must not apply it twice.
- Data shown while offline is visibly distinguishable from fresh data, and
  callers have an explicit way to invalidate it once reconnected.
- The contract between client and server is small and explicit enough that
  any new client (mobile, web, future CLI) can implement it.

## Architecture overview

```
┌─────────────┐        ┌──────────────────┐        ┌────────────────────┐
│   Mobile     │        │     Frontend     │        │      Backend       │
│             │        │                  │        │                    │
│ database.ts │        │ useLocalStorage  │        │  queue::            │
│  - tables   │        │  - isStale       │        │  OfflineSyncQueue   │
│  - sync_queue│       │  - invalidate()  │        │  - idempotent apply │
│             │        │                  │        │                    │
│ useOfflineCaching.ts │  lib/api-client  │        │  cache/             │
│  - replayPendingSyncActions()           │        │  - invalidation on  │
│  - invalidates read cache on reconnect  │        │    applied mutation │
└─────────────┘        └──────────────────┘        └────────────────────┘
```

## Mobile: local persistence (`mobile/src/services/database.ts`)

`initializeDatabase()` provisions four tables, each backed by the existing
encrypted MMKV store (`storageUtils`) rather than a native SQLite binding —
this keeps the module fully unit-testable in Jest with no native mocking,
while keeping a SQL-shaped table/row API (`getRow`, `getAllRows`,
`upsertRow`, `deleteRow`) that a real SQLite driver (e.g. `expo-sqlite`) can
be swapped in behind later without touching call sites.

| Table       | Purpose                                              |
|-------------|-------------------------------------------------------|
| `corridors` | Cached corridor records for offline reads             |
| `anchors`   | Cached anchor records for offline reads                |
| `assets`    | Cached asset records for offline reads                 |
| `sync_queue`| Durable queue of offline mutations awaiting replay     |

`clearDatabase()` removes all four tables, including any unreplayed queue
entries — call this on logout, not on every app start.

### The `sync_queue` table

Each row is a `SyncQueueRow`:

```ts
{
  id: string;            // idempotency key — see "Reconciliation contract" below
  method: 'POST' | 'PUT' | 'DELETE';
  resource: string;      // e.g. "/corridors/us-mx"
  payload?: unknown;
  status: 'pending' | 'applied' | 'failed';
  clientTimestamp: string;
  retryCount: number;
  lastError?: string;
}
```

`enqueueSyncAction()` writes a new `pending` row. `getPendingSyncActions()`
returns everything not yet applied. `markSyncActionStatus()` records success
or failure (incrementing `retryCount` on failure). `removeSyncAction()` drops
a row once it has been durably applied server-side.

## Mobile: replay on reconnect (`mobile/src/hooks/useOfflineCaching.ts`)

`replayPendingSyncActions()` drains `sync_queue` in enqueue order, replaying
each row against the resource it targets (via the existing `apiClient`
POST/PUT/DELETE methods) and either removing it (success) or marking it
`failed` with the error message (so it stays queued for the next reconnect).

`useOfflineCache()` now subscribes to the app's online/offline transition in
both directions:

- **online → offline**: unchanged — current query data is snapshotted into
  the read cache (`offline-cache:v1`), as before.
- **offline → online** (new): `replayPendingSyncActions()` runs, then the
  read cache and the React Query cache are both invalidated, and
  `apiClient.reconcileState()` is called so the next reads come from the
  server rather than from data that may now be stale.

This means: data read while offline is explicitly cached and bounded (TTL,
size limit, as before); once back online, that cache is dropped rather than
silently served past its usefulness.

## Frontend: cache staleness (`frontend/src/hooks/useLocalStorage.ts`)

`useLocalStorage` gained an additive 4th return value (existing 3-tuple call
sites are unaffected — extra array elements are simply ignored if not
destructured):

```ts
const [value, setValue, removeValue, { isStale, lastUpdated, invalidate }] =
  useLocalStorage('corridor-rates', defaultRates, { ttlMs: 5 * 60 * 1000 });
```

- `lastUpdated` is the timestamp (ms) of the last `setValue` call, persisted
  alongside the value under a `${key}:__meta` companion key (so the raw
  stored value's JSON shape is unchanged for existing readers).
- `isStale` is `true` once `ttlMs` has elapsed since `lastUpdated` — or
  immediately, if `ttlMs` is set but the value has never been written via
  this hook (e.g. it predates this feature). Without `ttlMs`, `isStale` is
  always `false`.
- `invalidate()` clears the staleness metadata (not the value itself), so a
  component can keep showing the last-known value while it marks it stale
  and triggers a refetch.

Pair this with `apiReconcile()` (below): when `isStale` flips to `true`,
call `apiReconcile(['corridor', 'anchor'], lastUpdated)` and merge the
response before calling `invalidate()`.

## Frontend: reconciliation helper (`frontend/src/lib/api-client.ts`)

`apiReconcile(dataTypes, lastKnownTimestamp?)` wraps the existing
`POST /api/rpc/reconcile` endpoint (already used by the mobile client's
`apiClient.reconcileState()`) so the frontend has the same recovery path:
ask the server for everything that changed since `lastKnownTimestamp`,
without needing a bespoke endpoint per cache.

## Backend: idempotent replay (`backend/src/queue/mod.rs`)

`OfflineSyncQueue` is the server-side half of the contract: a concurrency-safe,
idempotent ledger of which client-generated action ids have already been
applied.

```rust
let queue = OfflineSyncQueue::new();

let outcome = queue.submit(action, |action| async move {
    // apply the mutation, e.g. dispatch to the corridor/anchor handler
    apply_to_resource(&action).await
}).await?;

match outcome {
    OfflineActionOutcome::Applied => { /* mutation ran */ }
    OfflineActionOutcome::Duplicate => { /* already applied, no-op */ }
}
```

Each `action.id` is reserved atomically before `apply` runs, so two
concurrent submissions of the same id (two devices replaying the same
queued mutation, or a client retry racing the original request) cannot both
apply it — the loser observes `Duplicate` immediately. If `apply` fails, the
reservation is released so the same id can be legitimately retried on the
next reconnect.

`OfflineSyncQueue::metrics()` exposes `received` / `applied` / `duplicates`
/ `failed` counters for observability.

**Today this is a library-level primitive, not yet wired to an HTTP route.**
The mobile/frontend replay paths currently call the existing per-resource
REST endpoints directly (the same way the pre-existing `useOfflineQueue`
hook does). Wiring `OfflineSyncQueue` behind a dedicated
`POST /api/sync/offline-actions` endpoint — so server-side idempotency is
actually enforced for live traffic, not just exercised in tests — is the
natural next step and is intentionally left out of this change to avoid
touching the router in the same pass as the persistence/cache work above.

## Reconciliation contract

The shape shared between a queued mobile action and the backend queue:

| Field             | Mobile (`SyncQueueRow`) | Backend (`OfflineAction`) | Notes                                  |
|-------------------|-------------------------|---------------------------|-----------------------------------------|
| Idempotency key   | `id`                    | `id`                      | Must stay stable across retries.        |
| HTTP method       | `method`                | `method`                  | `POST` \| `PUT` \| `DELETE`.            |
| Target            | `resource`              | `resource`                | Resource path the mutation applies to.  |
| Body              | `payload`               | `payload`                 | Opaque JSON, validated by the handler.  |
| Client clock      | `clientTimestamp`       | `client_timestamp`        | For ordering/debugging, not dedup.      |

Dedup is always by `id`, never by `(method, resource, payload)` — two
distinct user actions can legitimately have the same method/resource/payload
(e.g. two identical retries of a price update), and only the client knows
whether they're the same logical action or not.

## Failure modes

- **Apply fails on the backend** (network blip, validation error): the row
  stays in `sync_queue` as `failed` with `lastError` set, and the server-side
  reservation is released. The next reconnect retries it.
- **App is killed mid-replay**: rows not yet removed remain `pending` (or
  `failed`, if they got that far) in durable storage and are retried on the
  next reconnect — `replayPendingSyncActions()` is idempotent to re-running
  from the top.
- **Two devices replay the same action**: the backend queue's atomic
  reservation guarantees only one application; the other device's replay is
  reported as `Duplicate` and should treat that as success (the desired
  state has already been reached).
- **Stale read cache**: bounded by `ttlMs` (frontend) / cache TTL + size
  limit (mobile); explicitly invalidated on reconnect rather than relying on
  TTL expiry alone, since a long offline period plus a short TTL would
  otherwise serve no data at all until expiry catches up.

## Testing

- Mobile: `mobile/src/services/__tests__/database.test.ts` (table CRUD,
  sync_queue lifecycle) and
  `mobile/src/hooks/__tests__/useOfflineCaching.replay.test.ts` (replay
  dispatch, partial-failure continuation).
- Frontend: `frontend/src/__tests__/hooks/useLocalStorage.test.ts` (staleness
  & invalidation) and `frontend/src/__tests__/api-client.test.ts`
  (`apiReconcile`).
- Backend: `backend/src/queue/mod.rs` unit tests (single/duplicate/concurrent
  submission, failure-then-retry, independent ids).

Run all three with `scripts/verify-offline-sync.sh`.
