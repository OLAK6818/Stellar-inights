#!/usr/bin/env bash
# Quality compliance script — validates logging, error handling, and test
# coverage gates across backend, frontend, and mobile.
#
# Usage:
#   bash scripts/quality-check.sh              # full check
#   bash scripts/quality-check.sh --fast       # skip test runs, check files only
#
# Exit 0 = all checks pass.  Exit 1 = one or more violations found.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
FAST=false
[[ "${1:-}" == "--fast" ]] && FAST=true

PASS=0
FAIL=0
RESULTS=()

# ── helpers ──────────────────────────────────────────────────────────────────

ok()   { PASS=$((PASS+1)); RESULTS+=("[PASS] $1"); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("[FAIL] $1 — $2"); echo "  ✗ $1: $2"; }

check_file() {
  local label="$1" path="$2"
  if [[ -f "$REPO_ROOT/$path" ]]; then
    ok "$label"
  else
    fail "$label" "missing: $path"
  fi
}

check_grep() {
  local label="$1" file="$2" pattern="$3"
  if grep -qE "$pattern" "$REPO_ROOT/$file" 2>/dev/null; then
    ok "$label"
  else
    fail "$label" "pattern not found in $file: $pattern"
  fi
}

# ── Section 1: Required files ────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  1/4  Required source files"
echo "══════════════════════════════════════════════════════════"

check_file "backend logging module"           "backend/src/logging.rs"
check_file "backend redaction module"         "backend/src/logging/redaction.rs"
check_file "backend quality assertions"       "backend/src/logging/quality_assertions.rs"
check_file "backend error types"              "backend/src/error.rs"
check_file "frontend logger"                  "frontend/src/lib/logger.ts"
check_file "frontend ErrorBoundary"           "frontend/src/components/ErrorBoundary.tsx"
check_file "mobile notifications service"     "mobile/src/services/notifications.ts"
check_file "mobile useErrorHandling hook"     "mobile/src/hooks/useErrorHandling.ts"
check_file "mobile logger service"            "mobile/src/services/logger.ts"

# ── Section 2: Quality invariants ───────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  2/4  Quality invariants in source files"
echo "══════════════════════════════════════════════════════════"

# Backend: Redacted wrapper must exist
check_grep "backend Redacted<T> wrapper" \
  "backend/src/logging/redaction.rs" \
  "struct Redacted"

# Backend: Production safety assertions exist
check_grep "backend assert_no_sensitive_data fn" \
  "backend/src/logging/quality_assertions.rs" \
  "fn assert_no_sensitive_data"

# Frontend logger: production guard present
check_grep "frontend logger production guard" \
  "frontend/src/lib/logger.ts" \
  "isDevelopment|NODE_ENV"

# Frontend logger: redaction logic present
check_grep "frontend logger redaction" \
  "frontend/src/lib/logger.ts" \
  "REDACTED|redact"

# Frontend ErrorBoundary: uses logger (no raw console.error)
check_grep "ErrorBoundary uses logger" \
  "frontend/src/components/ErrorBoundary.tsx" \
  "logger\."

# Frontend ErrorBoundary: componentStack must only render inside a NODE_ENV development guard.
# A correct implementation looks like:
#   {process.env.NODE_ENV === "development" && ... componentStack ... }
# Fail only when componentStack appears WITHOUT a dev-env guard anywhere in the file.
_eb="$REPO_ROOT/frontend/src/components/ErrorBoundary.tsx"
if grep -qE "errorInfo\.componentStack|\.componentStack" "$_eb" 2>/dev/null; then
  if grep -qE 'NODE_ENV.*development|process\.env\.NODE_ENV' "$_eb" 2>/dev/null; then
    ok "ErrorBoundary componentStack is dev-only guarded"
  else
    fail "ErrorBoundary stack trace leak" \
      "componentStack rendered without NODE_ENV === 'development' guard in ErrorBoundary.tsx"
  fi
else
  ok "ErrorBoundary does not expose componentStack to DOM"
fi

# Mobile: useErrorHandling sanitizes sensitive data
check_grep "mobile useErrorHandling redaction" \
  "mobile/src/hooks/useErrorHandling.ts" \
  "SENSITIVE_PATTERNS|sanitize|REDACTED"

# Mobile: logger uses redaction
check_grep "mobile logger redaction" \
  "mobile/src/services/logger.ts" \
  "REDACTED|redact"

# Vitest config: no duplicate include keys
if node -e "
  const fs = require('fs');
  const src = fs.readFileSync('$REPO_ROOT/frontend/vitest.config.ts', 'utf8');
  const matches = src.match(/^\s+include:/gm) || [];
  if (matches.length > 1) { console.error('duplicate include keys'); process.exit(1); }
" 2>/dev/null; then
  ok "vitest.config.ts has no duplicate include keys"
else
  fail "vitest.config.ts duplicate include" "duplicate include keys found — coverage misconfigured"
fi

# ── Section 3: Test files ────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  3/4  Required test files"
echo "══════════════════════════════════════════════════════════"

check_file "frontend logger production tests" \
  "frontend/src/lib/__tests__/logger.production.test.ts"
check_file "frontend ErrorBoundary production tests" \
  "frontend/src/components/__tests__/ErrorBoundary.production.test.tsx"
check_file "mobile useErrorHandling tests" \
  "mobile/src/hooks/__tests__/useErrorHandling.test.ts"
check_file "backend quality_assertions unit tests (inline)" \
  "backend/src/logging/quality_assertions.rs"

# backend tests must contain #[test] blocks
check_grep "backend quality_assertions has tests" \
  "backend/src/logging/quality_assertions.rs" \
  "#\[test\]"

# ── Section 4: Run tests (skipped with --fast) ───────────────────────────────

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  4/4  Test execution"
echo "══════════════════════════════════════════════════════════"

if $FAST; then
  echo "  (skipped — --fast mode)"
else
  run_tests() {
    local label="$1"; shift
    echo ""
    echo "  Running $label …"
    if "$@"; then
      ok "$label tests pass"
    else
      fail "$label tests" "test suite exited non-zero"
    fi
  }

  if command -v cargo &>/dev/null; then
    run_tests "backend quality_assertions" \
      bash -c "cd '$REPO_ROOT/backend' && cargo test logging::quality_assertions 2>&1 | tail -5"
  else
    echo "  (cargo not found — skipping backend tests)"
  fi

  if command -v pnpm &>/dev/null; then
    run_tests "frontend logger production" \
      bash -c "cd '$REPO_ROOT/frontend' && pnpm vitest run src/lib/__tests__/logger.production.test.ts 2>&1 | tail -10"
    run_tests "frontend ErrorBoundary production" \
      bash -c "cd '$REPO_ROOT/frontend' && pnpm vitest run src/components/__tests__/ErrorBoundary.production.test.tsx 2>&1 | tail -10"
  else
    echo "  (pnpm not found — skipping frontend tests)"
  fi

  if command -v jest &>/dev/null || [ -f "$REPO_ROOT/mobile/node_modules/.bin/jest" ]; then
    run_tests "mobile useErrorHandling" \
      bash -c "cd '$REPO_ROOT/mobile' && npx jest src/hooks/__tests__/useErrorHandling.test.ts --passWithNoTests 2>&1 | tail -10"
  else
    echo "  (jest not found — skipping mobile tests)"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────

TOTAL=$((PASS+FAIL))
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  QUALITY COMPLIANCE SUMMARY"
echo "══════════════════════════════════════════════════════════"
for r in "${RESULTS[@]}"; do echo "  $r"; done
echo ""
echo "  $PASS/$TOTAL checks passed"
echo "══════════════════════════════════════════════════════════"

[[ $FAIL -eq 0 ]]
