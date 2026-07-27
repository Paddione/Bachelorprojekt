#!/usr/bin/env bash
# scripts/factory/watchdog.sh — escalate stale in-flight features for a brand.
#   BRAND=<brand> FACTORY_STALE_MIN=30 bash scripts/factory/watchdog.sh
# A feature/task in_progress whose updated_at is older than the threshold is
# treated as a hung/crashed pipeline: slot released, a comment recorded, and
# status reset. If a FACTORY-PLAN-REF already exists (dev-flow-plan staged a
# plan before the pipeline hung), the reset target is 'backlog' (feature) or
# 'plan_staged' (task) instead of 'triage' — pipeline.js auto-detects
# FACTORY-PLAN-REF and resumes at Implement, skipping Scout/Design/Plan, so a
# ticket with a staged plan must land back in a status queue.sh dispatches
# (triage is not dispatched, which forced a wasteful full re-plan) [T001850].
# updated_at is auto-bumped by fn_lifecycle_ts on every row write; pipeline.js
# writes a `ticket.sh touch` at each phase boundary, so a healthy long phase
# is not mistaken for stale. JSON array of escalated ext_ids.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"
BRAND="${BRAND:-}"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
STALE_MIN="${FACTORY_STALE_MIN:-30}"
# After this many consecutive stale rounds WITHOUT real phase progress a ticket is
# handed to `ticket.sh unfactory` instead of being reset into the queue again
# (T002361). At the 30-minute default that is ~90 minutes before a human is asked.
MAX_ATTEMPTS="${FACTORY_MAX_ATTEMPTS:-3}"

mapfile -t stale < <(printf "SELECT external_id, type FROM tickets.tickets WHERE type IN ('feature','task') AND status='in_progress' AND updated_at < now() - make_interval(mins => %s);" "$STALE_MIN" | factory_psql)

# Zombie-Worktree-Cleanup: a hung pipeline leaves .worktrees/sf-* behind. Remove the
# worktree whose branch matches this ticket (idempotent; never fails the loop).
# Extracted into a function with T002361 so the escalation path gets the same
# housekeeping as the reset path — an unfactored ticket must not leave a worktree
# behind just because it took the other branch.
_wd_cleanup_worktree() {
  local ext_id="$1" ext_lc stale_wt
  ext_lc="$(printf '%s' "$ext_id" | tr '[:upper:]' '[:lower:]')"
  stale_wt="$(git worktree list --porcelain 2>/dev/null \
    | awk -v p1="refs/heads/feature/sf-$ext_lc" -v p2="refs/heads/chore/sf-$ext_lc" '
        /^worktree /{w=$2} $0=="branch "p1 || $0=="branch "p2{print w}')"
  [[ -z "$stale_wt" ]] && return 0
  if git -C "$stale_wt" status --short 2>/dev/null | grep -q .; then
    bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
      --body "Watchdog: zombie worktree $stale_wt has uncommitted changes — skipped force-remove, needs manual review" >/dev/null 2>&1 || true
  else
    git worktree remove --force "$stale_wt" 2>/dev/null || rm -rf "$stale_wt" 2>/dev/null || true
    git worktree prune 2>/dev/null || true
  fi
}

escalated='[]'
for row in "${stale[@]}"; do
  [[ -z "$row" ]] && continue
  ext_id="${row%%|*}"
  ticket_type="${row##*|}"
  ticket_json="$(BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" get --id "$ext_id")"
  plan_ref="$(echo "$ticket_json" | jq -r '.plan_ref // empty')"

  # ── Attempt counter (T002361) ───────────────────────────────────────────────
  # Counts CONSECUTIVE stale rounds without progress. Without it, a dry-run that
  # aborts before `ticket.sh dryrun-mark` leaves guard_dryrun_ok permanently
  # unsatisfied: the reset below puts the ticket back in the queue, the next tick
  # forces another preview, and the pipeline dies again — an unbounded 30-minute
  # loop that burns one headless session per round (observed on T002282/T002307/
  # T002338 on 2026-07-27).
  #
  # brand MUST be non-NULL. tickets.factory_control carries UNIQUE (key, brand)
  # and Postgres treats NULLs in a unique constraint as distinct, so a NULL-brand
  # row makes ON CONFLICT a no-op and accumulates duplicates instead of updating
  # (T000474; cmd_dryrun_mark still has that bug, harmless there because
  # dryrun-check only needs LIMIT 1, fatal for a counter).
  #
  # Progress is measured against factory_phase_events.at, NOT tickets.updated_at:
  # fn_lifecycle_ts bumps updated_at on every row write, so a bare `ticket.sh
  # touch` would masquerade as progress and reset the counter forever.
  attempt="$(factory_psql -v ext_id="$ext_id" -v key="factory_attempt:$ext_id" -v brand="$BRAND" 2>/dev/null <<'SQL' || true
WITH tgt AS (
  SELECT id FROM tickets.tickets WHERE external_id = :'ext_id'
), prog AS (
  SELECT max(pe.at) AS last_at
  FROM tickets.factory_phase_events pe JOIN tgt ON pe.ticket_id = tgt.id
), cur AS (
  SELECT value, updated_at FROM tickets.factory_control
  WHERE key = :'key' AND brand = :'brand'
)
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
SELECT :'key', :'brand',
       CASE
         WHEN (SELECT last_at FROM prog) IS NOT NULL
          AND (SELECT last_at FROM prog) > COALESCE((SELECT updated_at FROM cur), '-infinity'::timestamptz)
           THEN '1'
         ELSE ((CASE WHEN (SELECT value FROM cur) ~ '^[0-9]+$'
                     THEN (SELECT value FROM cur)::int ELSE 0 END) + 1)::text
       END,
       'watchdog', now()
ON CONFLICT (key, brand) DO UPDATE SET value = EXCLUDED.value, set_by = 'watchdog', updated_at = now()
RETURNING value;
SQL
)"

  # Fail-open on purpose: an unreadable/unwritable counter must NOT push tickets
  # into the terminal state. A database hiccup that silences the queue would be a
  # worse failure mode than the livelock this guards against.
  escalate=0
  if [[ "$attempt" =~ ^[0-9]+$ ]]; then
    if (( attempt >= MAX_ATTEMPTS )); then escalate=1; fi
  else
    echo "watchdog: attempt counter for $ext_id unreadable — falling back to plain reset" >&2
    attempt="?"
  fi

  if (( escalate == 1 )); then
    # unfactory sets status=blocked, attention_mode=needs_human and
    # readiness.factory_excluded=true in one transaction and writes its own
    # closing comment. Slot release and zombie cleanup below still run — the
    # escalation replaces the status target, not the housekeeping.
    BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" unfactory \
      --id "$ext_id" --attempts "$attempt" >/dev/null
    BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
    escalated=$(echo "$escalated" | jq -c --arg e "$ext_id" '. + [$e]')
    _wd_cleanup_worktree "$ext_id"
    continue
  fi

  # The attempt suffix makes consecutive rounds distinguishable. Seven byte-identical
  # comments on T002282 were themselves a signal nobody read (T002361).
  attempt_note=" [attempt ${attempt}/${MAX_ATTEMPTS}]"
  if [[ -n "$plan_ref" && "$ticket_type" == "feature" ]]; then
    reset_status="backlog"
    reset_msg="Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write). Plan already staged (${plan_ref}) — resuming via backlog instead of restarting from Scout.${attempt_note}"
  elif [[ -n "$plan_ref" && "$ticket_type" == "task" ]]; then
    reset_status="plan_staged"
    reset_msg="Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write). Plan already staged (${plan_ref}) — resuming via plan_staged instead of restarting from Scout.${attempt_note}"
  else
    reset_status="triage"
    reset_msg="Watchdog: pipeline stale > ${STALE_MIN}min (no phase progress write). Returned to queue (triage); slot released.${attempt_note}"
  fi
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" update-status --id "$ext_id" --status "$reset_status" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" release-slot --id "$ext_id" >/dev/null
  BRAND="$BRAND" TICKET_CTX="$FACTORY_CTX" bash "$HERE/../ticket.sh" add-comment --id "$ext_id" \
    --body "$reset_msg" >/dev/null
  _wd_cleanup_worktree "$ext_id"
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
