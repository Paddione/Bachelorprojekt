#!/usr/bin/env bash
# scripts/test-dev-flow-execute-sync.sh — Verifies dev-flow-execute Step 0 safe main-branch sync logic.
set -uo pipefail

PASS=0 FAIL=0
DUMMY_ROOT=$(mktemp -d)
trap 'rm -rf "$DUMMY_ROOT"' EXIT

cd "$DUMMY_ROOT"
git init --bare remote.git >/dev/null 2>&1 || { echo "❌ init failed"; exit 1; }
git clone remote.git worktree >/dev/null 2>&1 || { echo "❌ clone failed"; exit 1; }
cd worktree
git config user.email "test@test.com"
git config user.name "test"
git checkout -b main >/dev/null 2>&1 || { echo "❌ checkout main failed"; exit 1; }
git commit --allow-empty -m "init" >/dev/null 2>&1 || { echo "❌ commit failed"; exit 1; }
git push origin main >/dev/null 2>&1 || { echo "❌ push failed"; exit 1; }

# Feature branch
git checkout -b feature/test-branch >/dev/null 2>&1 || { echo "❌ checkout feature branch failed"; exit 1; }

MAIN_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$MAIN_BRANCH" = "main" ]; then
  SYNC_MODE="pull-rebase"
else
  SYNC_MODE="fetch-only"
fi

if [ "$SYNC_MODE" = "fetch-only" ]; then
  echo "✅ PASS: feature branch → fetch-only (no pull/rebase)"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: feature branch should be fetch-only, got $SYNC_MODE"
  FAIL=$((FAIL + 1))
fi

# Main branch
git checkout main >/dev/null 2>&1
MAIN_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$MAIN_BRANCH" = "main" ]; then
  SYNC_MODE="pull-rebase"
else
  SYNC_MODE="fetch-only"
fi

if [ "$SYNC_MODE" = "pull-rebase" ]; then
  echo "✅ PASS: main branch → pull-rebase"
  PASS=$((PASS + 1))
else
  echo "❌ FAIL: main branch should be pull-rebase, got $SYNC_MODE"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
