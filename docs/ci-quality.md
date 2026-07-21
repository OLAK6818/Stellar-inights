# CI Quality Gates

This document describes the CI quality requirements for the Stellar Insights monorepo and how to run the full quality suite locally.

## Overview

The `ci-quality` workflow ([`.github/workflows/ci-quality.yml`](../.github/workflows/ci-quality.yml)) enforces quality gates across every platform. A pull request cannot merge unless all gates pass.

| Gate | Tool | Threshold |
|------|------|-----------|
| Frontend coverage | Vitest + v8 | ≥ 80 % lines / functions / branches / statements |
| Frontend lint | ESLint | 0 warnings |
| Frontend accessibility | axe-core (via Vitest) | 0 WCAG AA violations |
| Backend lint | Clippy | 0 warnings (`-D warnings`) |
| Backend coverage | cargo-llvm-cov | ≥ 70 % functions covered |
| Mobile type-check | TypeScript (`tsc --noEmit`) | 0 errors |
| Mobile lint | ESLint | 0 errors |
| Cross-platform smoke | `scripts/smoke-test-all.sh` | exit 0 |
| Workflow definitions | YAML + presence check | All required files valid |

---

## Running quality gates locally

### All gates at once

```bash
# File and invariant checks (fastest)
bash scripts/quality-check.sh --fast

# Full compliance including test runs
bash scripts/quality-check.sh
```

### Per-platform commands

#### Frontend

```bash
cd frontend

# Coverage (thresholds enforced by vitest.config.ts)
pnpm vitest run --coverage

# Lint (0 warnings)
pnpm eslint . --ext .ts,.tsx --max-warnings 0

# Accessibility tests
pnpm vitest run src/components/__tests__/accessibility.a11y.test.tsx
```

#### Backend

```bash
cd backend

# Clippy (deny warnings)
cargo clippy --lib -- -W clippy::all -D warnings

# Coverage (≥ 70 % functions)
cargo llvm-cov --all-features --workspace --fail-under-fns 70
```

#### Mobile

```bash
cd mobile

# TypeScript type-check
yarn type-check

# Lint
yarn lint

# Unit tests
yarn test
```

#### Cross-platform smoke test

```bash
# From repo root
bash scripts/smoke-test-all.sh
```

---

## Frontend coverage

Coverage is configured in [`frontend/vitest.config.ts`](../frontend/vitest.config.ts):

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov', 'json-summary'],
  include: ['src/**/*.{ts,tsx}'],
  exclude: ['src/**/*.d.ts', 'src/**/*.{test,spec}.{ts,tsx}', 'src/**/node_modules/**'],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 80,
    statements: 80,
  },
},
```

The CI workflow uploads the LCOV report as an artifact (`frontend-coverage`) for 14 days.

---

## Backend Clippy lint configuration

Clippy is configured in [`backend/Cargo.toml`](../backend/Cargo.toml) under `[lints.clippy]`. The `all` lint group is set to `warn`; CI promotes warnings to errors via `-D warnings` so the build fails on any new lint violation.

---

## Accessibility gate

Accessibility tests use `@axe-core/react` (or equivalent) inside Vitest with jsdom. The tests live in:

```
frontend/src/components/__tests__/accessibility.a11y.test.tsx
```

The gate fails on any WCAG AA violation. To run locally:

```bash
cd frontend && pnpm vitest run src/components/__tests__/accessibility.a11y.test.tsx
```

Reports are uploaded as the `a11y-report` artifact.

---

## Cross-platform smoke test

[`scripts/smoke-test-all.sh`](../scripts/smoke-test-all.sh) delegates to three platform smoke scripts:

- `backend/scripts/smoke-test.sh`
- `frontend/scripts/smoke-test.sh`
- `mobile/scripts/smoke-test.sh`

Each script must exit `0`. The orchestrator prints a summary and exits `1` if any platform fails.

---

## Workflow self-validation

The `workflow-definitions-check` job inside `ci-quality.yml` verifies:

1. All required workflow files are present in `.github/workflows/`.
2. Every `.yml` file in that directory parses as valid YAML.

This prevents broken or missing workflow definitions from silently failing to run.

Required workflow files checked:

- `.github/workflows/quality-compliance.yml`
- `.github/workflows/ci-quality.yml`
- `.github/workflows/coverage.yml`
- `.github/workflows/clippy.yml`
- `.github/workflows/accessibility.yml`

---

## Adding a new quality gate

1. Add the job to `.github/workflows/ci-quality.yml`.
2. Add it to the `needs` list of the `ci-quality-gate` job.
3. Add a local command to this document.
4. If the gate requires a new script, create it under `scripts/` and make it executable.

---

## Artifacts

| Artifact name | Contents | Retention |
|---------------|----------|-----------|
| `frontend-coverage` | LCOV + JSON summary | 14 days |
| `backend-coverage-lcov` | LCOV | 14 days |
| `a11y-report` | axe-core HTML report | 14 days |
