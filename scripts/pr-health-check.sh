#!/usr/bin/env bash
# ==============================================================================
# PR Health Check — Inspects PR Mergeability & CI Status
# Usage:
#   scripts/pr-health-check.sh [PR_NUMBER_OR_URL_OR_BRANCH]
# ==============================================================================

set -euo pipefail

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  # Try to detect PR for current branch
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "HEAD" && "$CURRENT_BRANCH" != "main" ]]; then
    TARGET="$CURRENT_BRANCH"
  else
    echo "❌ Usage: scripts/pr-health-check.sh <PR_NUMBER_OR_BRANCH>" >&2
    exit 1
  fi
fi

# Query GitHub CLI for PR status fields
PR_JSON=$(gh pr view "$TARGET" --json number,title,url,state,mergeable,mergeStateStatus,statusCheckRollup 2>/dev/null || echo "")

if [[ -z "$PR_JSON" ]]; then
  echo "❌ PR not found for target: $TARGET" >&2
  exit 1
fi

PR_NUM=$(echo "$PR_JSON" | jq -r '.number')
PR_URL=$(echo "$PR_JSON" | jq -r '.url')
PR_STATE=$(echo "$PR_JSON" | jq -r '.state')
MERGEABLE=$(echo "$PR_JSON" | jq -r '.mergeable')
MERGE_STATE=$(echo "$PR_JSON" | jq -r '.mergeStateStatus')

echo "🔍 PR #$PR_NUM ($PR_URL)"
echo "   State: $PR_STATE | Mergeable: $MERGEABLE | MergeStateStatus: $MERGE_STATE"

# Check for Merge Conflicts (DIRTY or CONFLICTING)
if [[ "$MERGEABLE" == "CONFLICTING" || "$MERGE_STATE" == "DIRTY" ]]; then
  echo "⚠️ CONFLICT DETECTED: PR #$PR_NUM has merge conflicts with main!"
  echo "👉 Action Required: Run 'git fetch origin main && git rebase origin/main' and resolve conflicts now."
  exit 1
fi

if [[ "$MERGE_STATE" == "BEHIND" ]]; then
  echo "ℹ️ BEHIND: PR #$PR_NUM is behind origin/main. Rebase recommended before merging."
fi

# Check Rollup Status
ROLLUP_STATE=$(echo "$PR_JSON" | jq -r '.statusCheckRollup[0].state // "NONE"')
echo "   CI Check Rollup: $ROLLUP_STATE"

if [[ "$MERGEABLE" == "MERGEABLE" && ("$MERGE_STATE" == "CLEAN" || "$MERGE_STATE" == "HAS_HOOKS" || "$MERGE_STATE" == "UNSTABLE") ]]; then
  echo "✅ READY: PR #$PR_NUM is mergeable."
  exit 0
elif [[ "$ROLLUP_STATE" == "FAILURE" || "$ROLLUP_STATE" == "ERROR" ]]; then
  echo "❌ CHECKS_FAILED: CI checks failed for PR #$PR_NUM."
  exit 1
else
  echo "⏳ PENDING: PR #$PR_NUM checks or merge status pending ($MERGE_STATE)."
  exit 2
fi
