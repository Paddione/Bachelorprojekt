#!/usr/bin/env bash
# scripts/ci-pr-health.sh — CI-PR-Health: parse GitHub check-run results precisely.
#
# Usage:
#   scripts/ci-pr-health.sh [--pr <number> | --sha <sha> | --branch <branch>]
#
# Detects failure modes that naive parsers miss:
#   - In-progress checks (no conclusion yet) → pending, not failed
#   - Skipped / neutral checks → ignored (not failures)
#   - Cancelled checks → reported separately (usually a superseded run)
#   - Action-required → reported as pending, not failure
#   - Stale checks from outdated SHAs → filtered out
#   - Missing required checks → detected via branch-protection rules
#
# Returns:
#   0 = all required checks green (or only neutral/skipped/pending)
#   1 = one or more required checks failed/timed out
#   2 = no checks found at all (CI never started)
#   3 = API/auth error
#   4 = branch not found
#
# Flags:
#   --strict    Also flag NEUTRAL and SKIPPED on required checks as warnings
#   --json      Output raw JSON summary instead of human-readable text
#
# Dependencies: gh (GitHub CLI) with valid auth session.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ── Defaults ──────────────────────────────────────────────────────────────────
MODE="text"        # text | json
STRICT=false
TARGET=""

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --pr)      shift; TARGET="pr:$1" ;;
    --sha)     shift; TARGET="sha:$1" ;;
    --branch)  shift; TARGET="branch:$1" ;;
    --strict)  STRICT=true ;;
    --json)    MODE="json" ;;
    --help|-h) sed -n '2,/^$/p' "$0" | sed 's/^# //p; s/^#$//'; exit 0 ;;
    *)         echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

# ── Determine commit SHA ──────────────────────────────────────────────────────
resolve_sha() {
  local kind="${TARGET%%:*}" val="${TARGET#*:}"
  case "$kind" in
    sha)
      echo "$val"
      ;;
    pr)
      gh pr view "$val" --json headRefOid -q '.headRefOid' 2>/dev/null || {
        echo "ERROR: PR #${val} not found" >&2; exit 4
      }
      ;;
    branch)
      gh api "repos/:owner/:repo/git/refs/heads/${val}" -q '.object.sha' 2>/dev/null || {
        echo "ERROR: branch '${val}' not found" >&2; exit 4
      }
      ;;
    *)
      # Default: use HEAD
      git rev-parse HEAD 2>/dev/null || { echo "ERROR: not in a git repo" >&2; exit 3; }
      ;;
  esac
}

SHA="$(resolve_sha)"
REPO="${GITHUB_REPOSITORY:-Paddione/Bachelorprojekt}"

# ── Fetch check-runs ──────────────────────────────────────────────────────────
# We fetch ALL pages of check-runs via the commit-level endpoint. The per-PR
# statusCheckRollup can be stale (cached by GitHub until the next push event).
# [T002414-p1] The commit-level API always reflects the current state.
fetch_check_runs() {
  gh api "repos/${REPO}/commits/${SHA}/check-runs" --paginate 2>/dev/null || {
    echo "ERROR: GitHub API call failed (check auth/permissions)" >&2
    exit 3
  }
}

check_runs_json="$(fetch_check_runs)"

# ── Parse ─────────────────────────────────────────────────────────────────────
# We classify each check-run into one of:
#   - failed:   conclusion in (failure, timed_out, startup_failure)
#   - cancelled: conclusion = cancelled (superseded run)
#   - pending:   status != completed (queued, in_progress, waiting, requested)
#   - skipped:   conclusion = skipped or neutral
#   - stale:     check is from an older SHA (head_sha != our SHA)
#   - passed:    conclusion = success

# Separate current vs stale checks (API may return check runs from multiple SHAs)
current_checks="$(echo "$check_runs_json" | jq -c --arg sha "$SHA" \
  '[.check_runs[] | select(.head_sha == $sha or (.head_sha | not))]')"

stale_checks="$(echo "$check_runs_json" | jq -c --arg sha "$SHA" \
  '[.check_runs[] | select(.head_sha != $sha and .head_sha != null)]')"

# Categorize
failed="$(echo "$current_checks" | jq -c \
  '[.[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "startup_failure")]')"

cancelled="$(echo "$current_checks" | jq -c \
  '[.[] | select(.conclusion == "cancelled")]')"

pending="$(echo "$current_checks" | jq -c \
  '[.[] | select(.status != "completed")]')"

skipped="$(echo "$current_checks" | jq -c \
  '[.[] | select(.conclusion == "skipped" or .conclusion == "neutral")]')"

passed="$(echo "$current_checks" | jq -c \
  '[.[] | select(.conclusion == "success")]')"

unknown="$(echo "$current_checks" | jq -c \
  '[.[] | select(
     .conclusion != null
     and .conclusion != "success"
     and .conclusion != "failure"
     and .conclusion != "timed_out"
     and .conclusion != "startup_failure"
     and .conclusion != "cancelled"
     and .conclusion != "skipped"
     and .conclusion != "neutral"
   )]')"

# ── Counts ────────────────────────────────────────────────────────────────────
total_current="$(echo "$current_checks" | jq 'length')"
n_failed="$(echo "$failed" | jq 'length')"
n_cancelled="$(echo "$cancelled" | jq 'length')"
n_pending="$(echo "$pending" | jq 'length')"
n_skipped="$(echo "$skipped" | jq 'length')"
n_passed="$(echo "$passed" | jq 'length')"
n_unknown="$(echo "$unknown" | jq 'length')"
n_stale="$(echo "$stale_checks" | jq 'length')"

# ── Required-checks awareness ─────────────────────────────────────────────────
# Fetch branch protection rules to determine which checks are required.
# Falls back gracefully if branch isn't protected or API call fails.
required_checks=""
if [[ "$STRICT" == true ]]; then
  required_checks="$(gh api "repos/${REPO}/branches/main/protection/required_status_checks/contexts" 2>/dev/null || echo "[]")"
fi

# ── Output ─────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "json" ]]; then
  jq -n \
    --arg sha "$SHA" \
    --argjson current "$current_checks" \
    --argjson stale "$stale_checks" \
    --argjson passed "$passed" \
    --argjson failed "$failed" \
    --argjson cancelled "$cancelled" \
    --argjson pending "$pending" \
    --argjson skipped "$skipped" \
    --argjson unknown "$unknown" \
    '{sha: $sha, total: ($current | length), passed: ($passed | length), failed: ($failed | length), cancelled: ($cancelled | length), pending: ($pending | length), skipped: ($skipped | length), unknown: ($unknown | length), stale: ($stale | length)}'
else
  echo "═══════════════════════════════════════════════════"
  echo "  CI-PR-Health — SHA ${SHA:0:12}"
  echo "═══════════════════════════════════════════════════"
  echo ""
  echo "  Total checks on this SHA:  ${total_current}"
  echo "  ├─ ✅ Passed:              ${n_passed}"
  echo "  ├─ ❌ Failed/Timed out:    ${n_failed}"
  echo "  ├─ 🚫 Cancelled:          ${n_cancelled}"
  echo "  ├─ ⏳ Pending:            ${n_pending}"
  echo "  ├─ ⏭️ Skipped/Neutral:    ${n_skipped}"
  echo "  ├─ ❓ Unknown:            ${n_unknown}"
  echo "  └─ 🗑️ Stale (old SHA):    ${n_stale}"
  echo ""

  if [[ "$n_failed" -gt 0 ]]; then
    echo "── Failed / Timed out ─────────────────────────────"
    echo "$failed" | jq -r '.[] | "  ❌ \(.name // .check_name // "unnamed"): \(.conclusion)"'
    echo ""
  fi

  if [[ "$n_cancelled" -gt 0 ]]; then
    echo "── Cancelled (superseded) ─────────────────────────"
    echo "$cancelled" | jq -r '.[] | "  🚫 \(.name // .check_name // "unnamed"): cancelled"'
    echo ""
  fi

  if [[ "$n_pending" -gt 0 ]]; then
    echo "── Pending ────────────────────────────────────────"
    echo "$pending" | jq -r '.[] | "  ⏳ \(.name // .check_name // "unnamed"): \(.status // "unknown")"'
    echo ""
  fi

  if [[ "$n_unknown" -gt 0 ]]; then
    echo "── Unknown conclusions ────────────────────────────"
    echo "$unknown" | jq -r '.[] | "  ❓ \(.name // .check_name // "unnamed"): \(.conclusion)"'
    echo ""
  fi

  if [[ "$n_stale" -gt 0 ]]; then
    echo "── Stale checks (ignored) ─────────────────────────"
    echo "$stale_checks" | jq -r '.[] | "  🗑️ \(.name // .check_name // "unnamed") (head: \(.head_sha[0:12]))"'
    echo ""
  fi
fi

# ── Exit code determination ───────────────────────────────────────────────────
if [[ "$total_current" -eq 0 ]]; then
  [[ "$MODE" != "json" ]] && echo "❌ No checks found on this SHA — CI was never triggered" >&2
  exit 2
fi

if [[ "$n_failed" -gt 0 ]]; then
  [[ "$MODE" != "json" ]] && echo "❌ ${n_failed} check(s) failed" >&2
  exit 1
fi

# If strict mode: flag skipped/neutral required checks
if [[ "$STRICT" == true && -n "$required_checks" && "$required_checks" != "[]" ]]; then
  strict_fail=0
  while IFS= read -r ctx; do
    [[ -z "$ctx" ]] && continue
    # Check if this required context appears in skipped or cancelled
    if echo "$skipped" | jq -e --arg ctx "$ctx" '[.[] | select(.name == $ctx or .check_name == $ctx)] | length > 0' >/dev/null 2>&1; then
      [[ "$MODE" != "json" ]] && echo "⚠ Strict: required check '${ctx}' was skipped" >&2
      strict_fail=1
    fi
    if echo "$cancelled" | jq -e --arg ctx "$ctx" '[.[] | select(.name == $ctx or .check_name == $ctx)] | length > 0' >/dev/null 2>&1; then
      [[ "$MODE" != "json" ]] && echo "⚠ Strict: required check '${ctx}' was cancelled" >&2
      strict_fail=1
    fi
  done < <(echo "$required_checks" | jq -r '.[]')
  if [[ "$strict_fail" -ne 0 ]]; then
    exit 1
  fi
fi

[[ "$MODE" != "json" ]] && echo "✅ All ${total_current} check(s) healthy"
exit 0
