# Quality Compliance

This document describes the quality compliance expectations for the Stellar Insights monorepo and explains how to run the validation suite locally.

## Overview

Quality compliance enforces three invariants across every platform layer:

1. **Production-safe logging** — debug-level output is suppressed; sensitive values are redacted before any log line reaches a sink.
2. **Error handling hygiene** — error boundaries and error hooks never expose raw stack traces, secret keys, or PII to the UI or external consumers.
3. **Test coverage** — every quality rule has an automated test that fails CI if the rule is violated.

---

## Scope

| Layer | Files covered |
|-------|---------------|
| Backend (Rust) | `backend/src/logging/`, `backend/src/logging/quality_assertions.rs`, `backend/src/error.rs` |
| Frontend (Next.js) | `frontend/src/lib/logger.ts`, `frontend/src/components/ErrorBoundary.tsx` |
| Mobile (React Native) | `mobile/src/services/notifications.ts`, `mobile/src/services/logger.ts`, `mobile/src/hooks/useErrorHandling.ts` |
| Docs | `docs/quality-compliance.md` (this file) |
| CI | `.github/workflows/quality-compliance.yml` |

---

## Running the compliance suite locally

### Quick check (file presence + invariants only — no test runs)

```bash
bash scripts/quality-check.sh --fast
```

### Full check (includes test execution)

```bash
bash scripts/quality-check.sh
```

The script exits `0` when all checks pass and `1` when any check fails. It prints a per-check PASS/FAIL summary.

---

## What the script validates

### Section 1 — Required source files

Every file listed in the scope table must exist. A missing file is an immediate failure.

### Section 2 — Quality invariants

| Check | Location | What is asserted |
|-------|----------|------------------|
| `Redacted<T>` wrapper | `backend/src/logging/redaction.rs` | Wrapper type exists |
| `assert_no_sensitive_data` | `backend/src/logging/quality_assertions.rs` | Function exists |
| Production guard | `frontend/src/lib/logger.ts` | `isDevelopment` / `NODE_ENV` check present |
| Logger redaction | `frontend/src/lib/logger.ts` | `REDACTED` or `redact` pattern present |
| ErrorBoundary uses logger | `frontend/src/components/ErrorBoundary.tsx` | `logger.` call present |
| No stack trace in DOM | `frontend/src/components/ErrorBoundary.tsx` | `componentStack` not rendered |
| Mobile redaction | `mobile/src/hooks/useErrorHandling.ts` | `SENSITIVE_PATTERNS` / sanitize present |
| Mobile logger redaction | `mobile/src/services/logger.ts` | `REDACTED` or `redact` pattern present |
| No duplicate vitest include | `frontend/vitest.config.ts` | Single `include` key in coverage block |

### Section 3 — Required test files

| Test file | Validates |
|-----------|-----------|
| `frontend/src/lib/__tests__/logger.production.test.ts` | Debug suppression and sensitive-data redaction in production |
| `frontend/src/components/__tests__/ErrorBoundary.production.test.tsx` | ErrorBoundary does not leak secrets or stack traces to DOM |
| `mobile/src/hooks/__tests__/useErrorHandling.test.ts` | useErrorHandling captures errors, redacts secrets, and exposes recovery state |
| `backend/src/logging/quality_assertions.rs` (inline `#[test]`) | Rust production-safety assertion functions |

### Section 4 — Test execution

When run without `--fast`, the script invokes:

```bash
# Backend
cargo test logging::quality_assertions

# Frontend
pnpm vitest run src/lib/__tests__/logger.production.test.ts
pnpm vitest run src/components/__tests__/ErrorBoundary.production.test.tsx

# Mobile
npx jest src/hooks/__tests__/useErrorHandling.test.ts
```

---

## Production logging rules

### Backend (Rust)

- Use `Redacted<T>` for any value that might be a secret (keys, tokens, mnemonics).
- Use the `redact_*` helpers from `backend/src/logging/redaction.rs` when logging user-identifiable values.
- Never log raw Stellar secret keys (`S…`), raw JWTs, or private key hex strings.
- The `RUST_LOG` environment variable must be set to `info` or higher in production (`warn` recommended).

```rust
use crate::logging::{Redacted, redact_account};

tracing::info!(
    account = %redact_account(&user.stellar_account),
    "Balance check requested"
);
```

### Frontend (TypeScript / Next.js)

- All logging goes through `logger` from `frontend/src/lib/logger.ts` — never `console.*` directly.
- `logger.debug()` is a no-op when `NODE_ENV !== 'development'`.
- Metadata passed to any `logger.*` call is automatically run through `redactSensitiveData()` before output.

```ts
import { logger } from '@/lib/logger';

logger.info('Payment initiated', { corridorId, amount });  // amount is redacted
```

### Mobile (React Native)

- Use `logger` from `mobile/src/services/logger.ts`.
- Use `useErrorHandling` hook for runtime error capture — it sanitizes the error message before storing it in state.
- Debug output is disabled in release builds (`__DEV__ === false`).

```ts
import { useErrorHandling } from '@hooks/useErrorHandling';

const { captureError, error, hasError, clearError } = useErrorHandling();
```

---

## Error boundary rules

`ErrorBoundary` (`frontend/src/components/ErrorBoundary.tsx`) must:

- Log the caught error via `logger.error()`.
- Render a generic fallback UI — not the raw `error.message` or `errorInfo.componentStack`.
- Accept a `fallback` prop so callers can supply a custom safe message.
- Call the optional `onError` prop for observability, without surfacing internals to the user.

---

## CI enforcement

The [quality-compliance workflow](.github/workflows/quality-compliance.yml) runs on every push and pull request to `main` / `develop`. It runs:

1. `bash scripts/quality-check.sh --fast` (file and invariant checks)
2. Backend `cargo test logging::quality_assertions`
3. Frontend production logger and ErrorBoundary tests
4. Mobile `useErrorHandling` tests
5. A final `quality-gate` job that fails the PR if any check above fails

Merge is blocked until all jobs in the `quality-gate` step succeed.

---

## Adding a new quality check

1. Write the assertion in the appropriate layer (Rust `#[test]`, Vitest `it(…)`, or Jest `it(…)`).
2. Add a `check_file` or `check_grep` line to `scripts/quality-check.sh`.
3. Update this document with a row in the relevant table.
