# Issue #98 — Frontend Configuration & Environment Safety

## Summary

Closes #36 (standardise env vars) and #38 (remove debug console output).

Two frontend hygiene gaps were addressed in this PR:

1. **Env-var drift** — six different files read `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_WS_URL`, and `NEXT_PUBLIC_WS_PORT` directly from `process.env`, each with its own fallback logic. Any mis-spelling or rename would silently fall through to the wrong default.

2. **Unguarded console output** — `contractSubmission.ts`, `zustand/middleware.ts`, `RealtimeCollaboration.tsx`, and `StateProvider.tsx` contained naked `console.log/warn/error` calls that would appear in production builds.

---

## Canonical Env-Var Convention

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | In production | REST API base URL |
| `NEXT_PUBLIC_WS_URL` | Optional | WebSocket URL (derived from `API_URL` when absent) |
| `NEXT_PUBLIC_APP_ENV` | No | `development` \| `test` \| `production` (defaults `development`) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | No | `testnet` \| `mainnet` (defaults `testnet`) |
| `NEXT_PUBLIC_ENABLE_PROD_LOGS` | No | Set to `"true"` to allow debug output in production |

### Legacy aliases (still accepted, discouraged)

| Old name | Mapped to |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `NEXT_PUBLIC_API_URL` |
| `NEXT_PUBLIC_WS_PORT` | Used to derive `wsUrl` when `NEXT_PUBLIC_WS_URL` is absent |

**Rule:** No file other than `frontend/src/config.ts` should read any of these variables from `process.env`.

---

## Config Helper (`frontend/src/config.ts`)

The module exports a single immutable `config` object and a pure `validateConfig()` function.

```typescript
import { config } from '@/config';

config.apiUrl          // REST base URL
config.backendUrl      // alias for apiUrl (server-side route handlers)
config.wsUrl           // WebSocket URL
config.appEnv          // "development" | "test" | "production"
config.stellarNetwork  // "testnet" | "mainnet"
config.isDevelopment   // boolean shorthand
config.isProduction
config.isMainnet
config.enableProductionLogs
```

### Startup behaviour

| Environment | Missing `NEXT_PUBLIC_API_URL` | Invalid `APP_ENV` or `STELLAR_NETWORK` |
|---|---|---|
| `production` | **Fatal error** (throws on module load) | **Fatal error** |
| `development` / `test` | Warning printed; fallback `http://localhost:8080` | **Fatal error** |

### WS URL derivation priority

1. `NEXT_PUBLIC_WS_URL` (explicit)
2. Derived from `NEXT_PUBLIC_API_URL` — scheme swap (`http→ws`, `https→wss`) + `/ws` path
3. Legacy: `NEXT_PUBLIC_WS_PORT` + current hostname (browser only)
4. Hard fallback: `ws://localhost:8080/ws`

---

## Logger Convention

All structured logging goes through `@/lib/logger` (already established). After this PR:

- No production code file except `logger.ts` contains a bare `console.*` call
- Debug/info/warn output is gated to `isDevelopment || enableProductionLogs`
- Error-level logs are forwarded to Sentry in production via `sendToErrorTracking`

### Scoped loggers

For component/service-specific prefixes:

```typescript
import { createScopedLogger } from '@/lib/logger';

const log = createScopedLogger('ContractSubmission');
log.info('starting submission', { contractId });
log.error('submission failed', err, { contractId });
```

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/config.ts` | Complete rewrite — multi-var config, WS derivation, `validateConfig()` |
| `frontend/src/app/api/network-graph/route.ts` | `process.env.NEXT_PUBLIC_BACKEND_URL` → `config.backendUrl` |
| `frontend/src/lib/websocket.ts` | `getDefaultWsUrl()` → `config.wsUrl` |
| `frontend/src/contexts/NotificationContext.tsx` | `process.env.NEXT_PUBLIC_WS_URL` → empty default (callers pass `config.wsUrl`) |
| `frontend/src/components/WebSocketDemo.tsx` | `process.env.NEXT_PUBLIC_WS_URL` → `config.wsUrl` |
| `frontend/src/hooks/useRealtimeCorridors.ts` | `process.env.NEXT_PUBLIC_WS_URL` → `config.wsUrl` |
| `frontend/src/hooks/useRealtimeAnchors.ts` | `process.env.NEXT_PUBLIC_WS_URL` → `config.wsUrl` |
| `frontend/src/services/contractSubmission.ts` | 9× `console.*` → `logger.*` |
| `frontend/src/lib/zustand/middleware.ts` | 7× `console.*` → `logger.*` |
| `frontend/src/components/RealtimeCollaboration.tsx` | 2× `console.error` → `logger.error` |
| `frontend/src/components/StateProvider.tsx` | 3× `console.*` → `logger.*` |
| `frontend/src/__tests__/config.test.ts` | New — 22 unit tests for config helper |

---

## Testing

```bash
# Run config tests
cd frontend
npm run test -- src/__tests__/config.test.ts

# Run all tests
npm test
```

Tests cover:

- `validateConfig()` with all valid combinations
- All error paths (production + localhost URL, bad `APP_ENV`, bad `STELLAR_NETWORK`)
- Warning path (missing API URL in development)
- Multiple-error accumulation
- `wsUrl` derivation: explicit > API URL scheme-swap > fallback
- Legacy alias resolution (`NEXT_PUBLIC_BACKEND_URL`)
- Convenience boolean flags (`isDevelopment`, `isProduction`, `isMainnet`)
- `enableProductionLogs` default + override

---

## Rollout Notes

- No breaking changes to the public `config` export shape — only additions
- `NotificationContext` default parameter change is backward-compatible: callers that did not pass `websocketUrl` got `""` before (disabled) and still get `""` after. Callers that want realtime should now pass `config.wsUrl`
- `NEXT_PUBLIC_BACKEND_URL` will continue to work as a fallback until teams migrate to `NEXT_PUBLIC_API_URL`
- In development, the missing-URL warning is printed once at startup — not on every request
