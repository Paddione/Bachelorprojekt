#!/usr/bin/env bash
# scripts/factory/watchdog.sh — escalate stale in-flight features for a brand.
#   BRAND=<brand> FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
# A feature in_progress whose updated_at is older than the threshold is treated
# as a hung/crashed pipeline: status → triage (back to queue), slot released, and
# a comment recorded. updated_at is auto-bumped by fn_lifecycle_ts on every row
# write; pipeline.js writes a `ticket.sh touch` at each phase boundary, so a
# healthy long phase is not mistaken for stale. JSON array of escalated ext_ids.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
BRAND="${BRAND:-}"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
STALE_MIN="${FACTORY_STALE_MIN:-30}"

mapfile -t stale < <(printf "SELECT external_id FROM tickets.tickets WHERE type IN ('feature','task') AND status='in_progress' AND updated_at < now() - make_interval(mins => %s);" "$STALE_MIN" | factory_psql)

escalated='[]'
for ext_id in "${stale[@]}"; do
  [[ -z "$ext_id" ]] && continue
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status triage >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write). Returned to queue (triage); slot released." >/dev/null
  # Zombie-Worktree-Cleanup: a hung pipeline leaves .worktrees/sf-* behind. Remove the
  # worktree whose branch matches this ticket (idempotent; never fails the loop).
  ext_lc="$(printf '%s' "$ext_id" | tr '[:upper:]' '[:lower:]')"
  stale_wt="$(git worktree list --porcelain 2>/dev/null \
    | awk -v p1="refs/heads/feature/sf-$ext_lc" -v p2="refs/heads/chore/sf-$ext_lc" '
        /^worktree /{w=$2} $0=="branch "p1 || $0=="branch "p2{print w}')"
  if [[ -n "$stale_wt" ]]; then
    git worktree remove --force "$stale_wt" 2>/dev/null || rm -rf "$stale_wt" 2>/dev/null || true
    git worktree prune 2>/dev/null || true
  fi
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done

# ── awaiting_deploy staleness (>24h) ──────────────────────────────────────
AD_STALE_H="${FACTORY_AD_STALE_H:-24}"
mapfile -t ad_stale < <(printf "SELECT external_id FROM tickets.tickets WHERE type='feature' AND status='awaiting_deploy' AND updated_at < now() - make_interval(hours => %s);" "$AD_STALE_H" | factory_psql)

for ext_id in "${ad_stale[@]}"; do
  [[ -z "$ext_id" ]] && continue
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "Watchdog: awaiting_deploy stale > ${AD_STALE_H}h. Merged but not deployed — needs manual intervention." >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" patch --id "$ext_id" --attention-mode needs_human >/dev/null
  escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
done

echo "$escalated"
