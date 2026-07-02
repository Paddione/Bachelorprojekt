#!/usr/bin/env bash
# scripts/factory/reconcile-ticket-status.sh — watchdog that detects and fixes
# status-drift patterns in tickets. Addresses T001394 M3 / T001441 pattern.
#
# Patterns detected:
#   1. awaiting_deploy-with-done_at — ticket was set to done/shipped, then
#      reverted to awaiting_deploy/null by an automated process. Fix: restore
#      to done/shipped with audit comment.
#   2. terminal-pr-not-merged — ticket is done but the linked PR is NOT actually
#      merged (the auto-close-merged.sh guard may have fired on a false positive).
#      Fix: revert to previous non-terminal status with audit comment.
#   3. terminal-no-pr — ticket in done/archived with no PR ref and no done_at
#      within 24h. Suspicious — flag with audit comment, set attention_mode.
#
# Usage: BRAND=<brand> bash scripts/factory/reconcile-ticket-status.sh [--dry-run]
#
# Env:
#   BRAND              — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE — skips cluster access (offline-test)
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
while [[ $# -gt 0 ]]; do case "$1" in
  --dry-run) DRY_RUN=true; shift ;;
  --help)
    echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
    echo "  Detects and fixes ticket status drift patterns:"
    echo "    - awaiting_deploy-with-done_at → restore to done/shipped"
    echo "    - terminal-pr-not-merged → revert to previous status"
    echo "    - terminal-no-pr → flag for review"
    exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac; done

if [[ -z "${BRAND:-}" ]]; then
  echo "ERROR: BRAND env var is required (mentolder|korczewski)" >&2
  exit 1
fi

if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "reconcile-ticket-status [DRY-RESOLVE]: ctx=dry ns=dry brand=${BRAND}"
  exit 0
fi

factory_resolve

POD=$(factory_pgpod)

reconcile() {
  local ext_id="$1" current_status="$2" fix_status="$3" fix_resolution="$4" reason="$5"

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "reconcile-ticket-status [DRY-RUN]: $ext_id ($current_status) → $fix_status/$fix_resolution — $reason"
    return
  fi

  echo "reconcile-ticket-status: $ext_id ($current_status) → $fix_status/$fix_resolution — $reason" >&2

  kubectl exec "$POD" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
      -v ext_id="$ext_id" \
      -v fix_status="$fix_status" \
      -v fix_resolution="$fix_resolution" \
      -v reason="$reason" <<'SQL' >/dev/null
WITH updated AS (
  UPDATE tickets.tickets
     SET status = :'fix_status'::text,
         resolution = :'fix_resolution'::text,
         done_at = CASE WHEN :'fix_status' = 'done' THEN COALESCE(done_at, now()) ELSE done_at END,
         updated_at = now()
   WHERE external_id = :'ext_id'
     AND (status, resolution) IS DISTINCT FROM (:'fix_status', :'fix_resolution')
 RETURNING id
)
INSERT INTO tickets.ticket_comments (ticket_id, author_label, kind, body, visibility)
SELECT id, 'claude-code', 'watchdog',
       format(E'reconcile-ticket-status watchdog: reverted from %%s to %%s/%%s\nReason: %%s\nAuto-fix applied %s.',
          (SELECT status FROM tickets.tickets WHERE external_id = :'ext_id'),
          :'fix_status', :'fix_resolution', :'reason',
          to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
       'internal'
  FROM updated;
SQL
}

# ── Pattern 1: awaiting_deploy with done_at set ─────────────────────────────
# This is the revert pattern: ticket was done/shipped, then pushed back to
# awaiting_deploy. The done_at timestamp survived the revert.
echo "reconcile-ticket-status: scanning awaiting_deploy-with-done_at (${BRAND})" >&2
mapfile -t ad_with_done < <(
  kubectl exec "$POD" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
      -c "SELECT external_id FROM tickets.tickets
           WHERE status = 'awaiting_deploy'
             AND done_at IS NOT NULL
             AND (resolution IS NULL OR resolution NOT IN ('fixed','shipped'))
           ORDER BY done_at DESC;" 2>/dev/null || true
)

for ext_id in "${ad_with_done[@]}"; do
  [[ -z "$ext_id" ]] && continue
  reconcile "$ext_id" "awaiting_deploy" "done" "shipped" "awaiting_deploy-with-done_at detected — restored to done/shipped"
done

# ── Pattern 2: done but PR not actually merged ──────────────────────────────
# Tickets in terminal state whose linked PR isn't actually merged on GitHub.
echo "reconcile-ticket-status: scanning terminal-pr-not-merged (${BRAND})" >&2
mapfile -t terminal_no_pr_merged < <(
  kubectl exec "$POD" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
      -c "
      SELECT DISTINCT t.external_id, t.status, tl.pr_number
      FROM tickets.tickets t
      JOIN tickets.ticket_links tl ON tl.from_id = t.id
      WHERE t.status IN ('done', 'archived')
        AND tl.kind IN ('fixes', 'fixed_by', 'pr')
        AND tl.pr_number IS NOT NULL
        AND t.updated_at > now() - interval '7 days'
      ORDER BY t.updated_at DESC;" 2>/dev/null || true
)

while IFS='|' read -r ext_id status pr_num; do
  [[ -z "$ext_id" ]] && continue
  echo "reconcile-ticket-status: checking PR #$pr_num for $ext_id" >&2
  merged_at=$(gh pr view "$pr_num" --json mergedAt -q '.mergedAt' 2>/dev/null || echo "null")
  if [[ "$merged_at" == "null" || -z "$merged_at" ]]; then
    # PR not merged — revert from done to awaiting_deploy
    reconcile "$ext_id" "$status" "awaiting_deploy" "" "terminal-pr-not-merged — PR #$pr_num is not merged; reverted to awaiting_deploy"
  fi
done <<< "$(printf '%s\n' "${terminal_no_pr_merged[@]}")"

# ── Pattern 3: done/archived with no PR ref and no done_at (stale) ──────────
# Tickets in terminal state with no PR reference and no recent done_at are fishy.
echo "reconcile-ticket-status: scanning terminal-no-pr (${BRAND})" >&2
mapfile -t terminal_no_pr < <(
  kubectl exec "$POD" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
      -c "SELECT t.external_id
           FROM tickets.tickets t
           WHERE t.status IN ('done', 'archived')
             AND t.done_at IS NULL
             AND t.updated_at < now() - interval '24 hours'
             AND NOT EXISTS (
               SELECT 1 FROM tickets.ticket_links tl
               WHERE tl.from_id = t.id AND tl.kind IN ('fixes', 'fixed_by', 'pr')
             )
           ORDER BY t.updated_at DESC;" 2>/dev/null || true
)

for ext_id in "${terminal_no_pr[@]}"; do
  [[ -z "$ext_id" ]] && continue
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "reconcile-ticket-status [DRY-RUN]: $ext_id terminal-no-pr — flagging for review" >&2
    continue
  fi
  kubectl exec "$POD" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 \
      -v ext_id="$ext_id" <<'SQL' >/dev/null
UPDATE tickets.tickets
   SET attention_mode = 'needs_human',
       notes = COALESCE(notes || E'\n\n', '') || format(E'reconcile-ticket-status watchdog: terminal-no-pr — ticket in terminal state with no PR ref and no done_at. Needs manual review.\nDetected: %s', to_char(now(), 'YYYY-MM-DD HH24:MI:SS')),
       updated_at = now()
 WHERE external_id = :'ext_id'
   AND attention_mode IS DISTINCT FROM 'needs_human';
SQL
  echo "reconcile-ticket-status: $ext_id terminal-no-pr — set attention_mode=needs_human" >&2
done

echo "reconcile-ticket-status: fertig (BRAND=${BRAND}, DRY_RUN=${DRY_RUN})"
