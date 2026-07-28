#!/usr/bin/env bash
# scripts/devflow-post-merge-ticket-closure.sh — Scan merged commits for incidentally
# referenced tickets and add advisory comments. [T002279]
#
# Usage:
#   bash scripts/devflow-post-merge-ticket-closure.sh [--merge-sha <sha>]
#
# If no --merge-sha is given, uses HEAD (assumes the current commit is the merge commit).
#
# Behavior:
#   1. Extracts the PR's own ticket ID from the merge commit message (T\d{6}).
#   2. Scans the merge commit diff + message for ALL T\d{6} references.
#   3. For each referenced ID that is NOT the PR's own ticket:
#      a. Checks if the ticket is still open via ticket.sh get.
#      b. If open, adds an internal comment: "possibly fixed in <sha>, please verify".
#   4. Does NOT auto-close tickets (deliberate: a mention in the diff is not proof).
#
# Environment:
#   BRAND, TICKET_CTX — forwarded to ticket.sh (default to mentolder/fleet).
#   TICKET_OFFLINE   — if set, skip all ticket.sh calls (e.g. in dev envs without k8s).
#
# Returns 0 (best-effort — non-fatal by design).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$HERE/.." && pwd)"

MERGE_SHA=""

while [[ $# -gt 0 ]]; do case "$1" in
  --merge-sha) MERGE_SHA="$2"; shift 2 ;;
  *) echo "Usage: devflow-post-merge-ticket-closure.sh [--merge-sha <sha>]" >&2; exit 2 ;;
esac; done

if [[ -z "$MERGE_SHA" ]]; then
  MERGE_SHA="HEAD"
fi

# Resolve to a full SHA if needed
FULL_SHA="$(git rev-parse "$MERGE_SHA" 2>/dev/null || true)"
SHORT_SHA="$(git rev-parse --short "$MERGE_SHA" 2>/dev/null || echo "$MERGE_SHA")"

if [[ -z "$FULL_SHA" ]]; then
  echo "WARNING: Could not resolve '$MERGE_SHA' to a commit — skipping." >&2
  exit 0
fi

echo "--- T002279: Scanning merge commit $SHORT_SHA for incidentally fixed tickets ---"

# 1) Get the PR's own ticket ID from the merge commit message
PR_TICKET_ID="$(git log -1 "$FULL_SHA" --pretty=%B | grep -oE 'T[0-9]{6}' | head -1 || true)"
echo "PR's own ticket: ${PR_TICKET_ID:-<none>}"

# 2) Collect ALL ticket IDs referenced in the merge
#    Scans both the commit message body AND added lines in the diff.
#    Using git diff-tree with --unified=0 to get only added lines.
ALL_IDS="$(
  {
    # From commit message (full body)
    git log -1 "$FULL_SHA" --pretty=%B
    # From diff: added lines only — grep '^+' and strip the '+'
    git diff-tree --no-commit-id -r --unified=0 "$FULL_SHA" 2>/dev/null \
      | grep '^+' | sed 's/^+//'
  } | grep -oE 'T[0-9]{6}' | sort -u || true
)"

if [[ -z "$ALL_IDS" ]]; then
  echo "No ticket IDs found in merge commit — nothing to track."
  exit 0
fi

echo "Referenced ticket IDs: $(echo "$ALL_IDS" | tr '\n' ' ')"

# 3) Process each referenced ticket (skip the PR's own)
OFFLINE="${TICKET_OFFLINE:-}"
CLOSED_COUNT=0
NOTIFIED_COUNT=0

while IFS= read -r tid; do
  [[ -z "$tid" ]] && continue
  [[ "$tid" = "$PR_TICKET_ID" ]] && continue

  echo ""
  echo "→ Checking ticket $tid ..."

  if [[ -n "$OFFLINE" ]]; then
    echo "  TICKET_OFFLINE set — skipping DB check for $tid."
    continue
  fi

  # Fetch ticket status
  TICKET_JSON="$(bash "$REPO_DIR/scripts/ticket.sh" get --id "$tid" 2>/dev/null || echo '{}')"

  # Extract status using simple grep (no jq dependency)
  TICKET_STATUS="$(echo "$TICKET_JSON" \
    | grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' \
    | head -1 \
    | sed 's/"status"//;s/[":[:space:]]//g' || echo "unknown")"

  case "$TICKET_STATUS" in
    done|archived|"")
      echo "  Status=$TICKET_STATUS — already closed, skipping."
      CLOSED_COUNT=$((CLOSED_COUNT + 1))
      continue
      ;;
    unknown)
      echo "  Ticket $tid not found or inaccessible — skipping."
      continue
      ;;
  esac

  echo "  Status=$TICKET_STATUS — open, adding advisory comment."

  COMMENT="⚠️ **Possible incidental fix — please verify**
Ticket $tid was referenced in commit \`$SHORT_SHA\` (merged to main).
This ticket may have been fixed incidentally as part of another change.

Please verify whether this fix is complete. If yes, close the ticket.
If not, leave it open for a dedicated fix.

_Source: post-merge ticket-tracking (T002279)_"

  if bash "$REPO_DIR/scripts/ticket.sh" add-comment \
    --id "$tid" \
    --body "$COMMENT" \
    --author "devflow-post-merge" \
    --visibility internal 2>/dev/null; then
    NOTIFIED_COUNT=$((NOTIFIED_COUNT + 1))
    echo "  ✓ Comment added to $tid"
  else
    echo "  WARNING: Could not add comment to $tid (offline? no DB access?)"
    # Non-fatal: the CI job may not have kubectl access
  fi
done <<< "$ALL_IDS"

echo ""
echo "--- Summary: $NOTIFIED_COUNT tickets notified, $CLOSED_COUNT already closed ---"
