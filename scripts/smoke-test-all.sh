#!/usr/bin/env bash
# Root-level smoke test runner — executes all platform smoke tests and reports a summary.
# Usage: bash scripts/smoke-test-all.sh
# Exit 0 = all pass, exit 1 = one or more failed

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.."
PASS=0
FAIL=0
RESULTS=()

run_check() {
  local label="$1"
  local script="$2"

  echo ""
  echo "══════════════════════════════════════════"
  echo "  Running: $label"
  echo "══════════════════════════════════════════"

  if bash "$script"; then
    PASS=$((PASS+1))
    RESULTS+=("[PASS] $label")
  else
    FAIL=$((FAIL+1))
    RESULTS+=("[FAIL] $label")
  fi
}

run_check "backend smoke test"  "$REPO_ROOT/backend/scripts/smoke-test.sh"
run_check "frontend smoke test" "$REPO_ROOT/frontend/scripts/smoke-test.sh"
run_check "mobile smoke test"   "$REPO_ROOT/mobile/scripts/smoke-test.sh"

TOTAL=$((PASS+FAIL))

echo ""
echo "══════════════════════════════════════════"
echo "  SMOKE TEST SUMMARY"
echo "══════════════════════════════════════════"
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "[SUMMARY] $PASS/$TOTAL checks passed"
echo "══════════════════════════════════════════"

if [[ $FAIL -eq 0 ]]; then
  exit 0
else
  exit 1
fi
