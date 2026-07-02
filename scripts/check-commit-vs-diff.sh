#!/usr/bin/env bash
# check-commit-vs-diff.sh — reject commits whose subject claims an
# implementation change but whose staged diff contains only test/spec/plan
# files. The guard closes the T001434 mishap: a dev-flow-plan stage commit
# used "fix(infra): chain loggingMiddleware in middleware.ts via
# sequence() [T001434]" as its title, but the diff only contained the RED
# integration test plus plan artifacts. The next implementer
# (dev-flow-execute) trusted the title and skipped the actual fix; the bug
# landed in a follow-up commit instead of the same PR.
#
# This script enforces the rule at commit-msg time:
#   - If the subject uses an implementation type (fix/feat/refactor/perf)
#   - AND the staged diff contains ONLY test/spec/plan files
#   - THEN reject with a clear error pointing the author to the right
#     prefix (test(red): for RED-only test commits, chore(plan): for
#     plan-only commits).
#
# Wired into:
#   - .githooks/commit-msg  (local, blocking)
#   - .github/workflows/ci.yml commit-lint job (CI, blocking, catches bypasses)
#
# Usage:
#   check-commit-vs-diff.sh <commit-msg-file>
#   check-commit-vs-diff.sh --self-test   # internal sanity test (no side effects)
#
# Exit codes: 0 = subject and diff are consistent, 1 = inconsistent (commit blocked).
set -uo pipefail

MSG_FILE="${1:-}"
SELF_TEST=0
if [[ "${1:-}" == "--self-test" ]]; then
  SELF_TEST=1
  MSG_FILE=""
fi

if [[ -z "$MSG_FILE" && $SELF_TEST -eq 0 ]]; then
  echo "check-commit-vs-diff: usage: check-commit-vs-diff.sh <commit-msg-file>" >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [[ -z "$REPO_ROOT" ]]; then
  echo "check-commit-vs-diff: not inside a git repository" >&2
  exit 2
fi

# ── Self-test mode ────────────────────────────────────────────────────────────
if [[ $SELF_TEST -eq 1 ]]; then
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  fail=0
  assert_allows() {
    local name="$1" subject="$2" files="$3"
    rm -rf "$TMP/repo" && mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q >/dev/null
    git config user.email test@test && git config user.name test >/dev/null
    : > "$TMP/msg"
    printf '%s\n' "$subject" >> "$TMP/msg"
    for f in $files; do
      mkdir -p "$(dirname "$f")"
      printf 'content' > "$f"
    done
    [[ -n "$files" ]] && git add -A >/dev/null 2>&1
    if "$REPO_ROOT/scripts/check-commit-vs-diff.sh" "$TMP/msg" >/dev/null 2>&1; then
      echo "  ok    $name"
    else
      echo "  FAIL  $name (expected allow, got block)"
      fail=1
    fi
    cd "$REPO_ROOT"
  }
  assert_blocks() {
    local name="$1" subject="$2" files="$3"
    rm -rf "$TMP/repo" && mkdir -p "$TMP/repo" && cd "$TMP/repo" && git init -q >/dev/null
    git config user.email test@test && git config user.name test >/dev/null
    : > "$TMP/msg"
    printf '%s\n' "$subject" >> "$TMP/msg"
    for f in $files; do
      mkdir -p "$(dirname "$f")"
      printf 'content' > "$f"
    done
    [[ -n "$files" ]] && git add -A >/dev/null 2>&1
    if "$REPO_ROOT/scripts/check-commit-vs-diff.sh" "$TMP/msg" >/dev/null 2>&1; then
      echo "  FAIL  $name (expected block, got allow)"
      fail=1
    else
      echo "  ok    $name (blocked as expected)"
    fi
    cd "$REPO_ROOT"
  }

  # Allow cases
  assert_allows "feat(real-code)"      "feat(website): add pricing widget"        "website/src/components/Pricing.tsx"
  assert_allows "fix(real-code)"       "fix(infra): chain middleware sequence"    "website/src/middleware.ts"
  assert_allows "fix(real+test)"       "fix(infra): chain middleware sequence"    "website/src/middleware.ts website/src/middleware.test.ts"
  assert_allows "chore(plans)"         "chore(plans): stage t001434 for execution" "openspec/changes/t001434/tasks.md"
  assert_allows "test(red-only)"       "test(red): verify locals.requestLogger"   "website/src/middleware.test.ts"
  assert_allows "docs(readme)"         "docs: update README"                      "README.md"
  assert_allows "ci(workflow)"         "ci: bump action versions"                ".github/workflows/ci.yml"
  assert_allows "fix(scope-less)"      "fix: typo"                                "scripts/check.sh"

  # Block cases — the T001434 pattern
  assert_blocks "fix(red-only-test)"   "fix(infra): chain middleware sequence"    "website/src/middleware.test.ts"
  assert_blocks "fix(plan-only)"       "fix(infra): chain middleware sequence"    "openspec/changes/t001434/tasks.md"
  assert_blocks "fix(plan-and-test)"   "fix(infra): chain middleware sequence"    "website/src/middleware.test.ts openspec/changes/t001434/tasks.md"
  assert_blocks "fix(spec-only)"       "fix(infra): chain middleware sequence"    "openspec/specs/centralized-logging.md"
  assert_blocks "feat(plan-only)"      "feat(infra): add logging chain"           "openspec/changes/t001434/proposal.md openspec/changes/t001434/tasks.md"
  assert_blocks "refactor(plan-only)"  "refactor(scripts): consolidate guards"    "openspec/changes/cleanup/tasks.md"
  assert_blocks "perf(plan-only)"      "perf(db): index tickets table"            "openspec/changes/perf-index/tasks.md"

  # Edge case: production code in a non-standard path still counts as impl
  assert_allows "fix(kustomize)"       "fix(infra): tweak configmap"              "k3d/configmap-domains.yaml"
  # Edge case: amend without staged changes (no-op commit) — should not block
  assert_allows "fix(no-op)"           "fix: nothing"                             ""

  if [[ $fail -ne 0 ]]; then
    echo "check-commit-vs-diff: self-test FAILED" >&2
    exit 1
  fi
  echo "check-commit-vs-diff: self-test passed (15 cases)"
  exit 0
fi

# ── Normal mode ───────────────────────────────────────────────────────────────
[[ -f "$MSG_FILE" ]] || { echo "check-commit-vs-diff: message file '$MSG_FILE' not found" >&2; exit 2; }

# --- Parse subject (first non-comment, non-blank line) ---
SUBJECT="$(grep -m1 -E '^[^#[:space:]]' "$MSG_FILE" | sed 's/^[[:space:]]*//')"
[[ -n "$SUBJECT" ]] || exit 0  # empty subject — let other hooks (commitlint) handle it

# --- Detect implementation types ---
# Mirrors @commitlint/config-conventional `types:` plus the breaking-change
# marker `!`. We deliberately do NOT block `test:`, `chore:`, `docs:`, `ci:`,
# `build:`, `style:`, `revert:` — those are non-implementation.
if ! echo "$SUBJECT" | grep -qE '^(fix|feat|refactor|perf)(!)?(\([^)]+\))?:\s'; then
  exit 0
fi

# --- Inspect staged diff file list ---
STAGED_FILES="$(git -C "$REPO_ROOT" diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
[[ -n "$STAGED_FILES" ]] || exit 0  # empty commit (e.g. amend with --allow-empty) — nothing to check

# Files that are NOT production-code-bearing: test/spec/plan artifacts.
# Everything that survives this filter is "real" code that proves the
# implementation claim in the subject line.
NON_IMPL_FILES="$(echo "$STAGED_FILES" \
  | grep -vE '\.(test|spec)\.[A-Za-z0-9]+$' \
  | grep -vE '^(openspec/changes/|openspec/changes/archive/)' \
  | grep -vE '^openspec/specs/' \
  | grep -vE '^docs/superpowers/specs/' \
  | grep -vE '^\.ticket$' \
  | grep -vE '^openspec/changes/[^/]+/\.openspec\.yaml$')"

if [[ -z "$NON_IMPL_FILES" ]]; then
  cat >&2 <<EOF
✗  check-commit-vs-diff: subject claims implementation but diff has no production code

Subject:    $SUBJECT
Staged:     $(echo "$STAGED_FILES" | tr '\n' ' ' | sed 's/ $//')

This is the T001434 mishap pattern — a 'fix:' / 'feat:' / 'refactor:' /
'perf:' title with only RED-tests or plan artifacts in the diff. The next
implementer would trust the title and skip the actual implementation,
and the bug lands in a follow-up commit instead of the same PR.

Use one of these prefixes instead:
  test(red): …   for a RED-only test commit (the test is supposed to fail)
  chore(plan): … for a plan-only commit (openspec/changes/, openspec/specs/, docs/superpowers/specs/)
  test: …        for a test commit that is intentionally part of the fix

If this really IS an implementation commit, your diff is missing the
production-code change — review the plan and add the missing files before
committing again.

To bypass (emergency only): SKIP_COMMIT_VS_DIFF=1 git commit ...
EOF
  exit 1
fi

exit 0
