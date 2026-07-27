#!/usr/bin/env bash
# scripts/factory/queue.sh — schedulable backlog feature tickets for a brand.
#   BRAND=<brand> bash scripts/factory/queue.sh
# Reads RAW backlog features (touched_files may be NULL — a fresh feature gets
# its touched_files inside the pipeline's Scout phase, so v_active_features
# (which filters NULL touched_files) is NOT used here). JSON array, ordered
# priority (hoch→mittel→niedrig) then created_at. Read-only metadata only.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
factory_resolve
[[ -n "${FACTORY_DRY_RESOLVE:-}" ]] && { echo "resolved: ctx=${FACTORY_CTX} ns=${FACTORY_NS}"; exit 0; }
cat <<'SQL' | factory_psql
SELECT COALESCE(json_agg(row_to_json(q)), '[]')
FROM (
  SELECT external_id, title, priority, touched_files, created_at
  FROM tickets.tickets
  WHERE (
      -- factory_excluded (T002361) gates BOTH branches below. It is the durable half
      -- of `ticket.sh unfactory`: status='blocked' alone already keeps a ticket out of
      -- these two branches, but the flag survives a later status change, so moving an
      -- unfactored ticket back to backlog/plan_staged by hand or by another script does
      -- NOT silently re-expose it to dispatch. Clearing it is a deliberate human act
      -- (`ticket.sh plan-meta set --readiness factory_excluded=false`).
      -- Default false: an absent flag must never exclude a ticket — same convention as
      -- lastenheft_locked (default false) and execution_released (default true).
      --
      -- Feature backlog: Lastenheft-locked (requirements firm = AI-ready).
      (type='feature' AND status='backlog'
       AND COALESCE((readiness->>'lastenheft_locked')::boolean, false) = true
       AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false)
      -- Staged chore/task tickets (e.g. mishap-tracker auto-plans): the plan is
      -- already authored + lint-gated by stage-plan, so no lastenheft gate applies.
      -- execution_released=true is the default (backward-compatible: only tickets
      -- explicitly held via stage-plan --hold are excluded from dispatch).
      OR (type='task' AND status='plan_staged'
          AND COALESCE((readiness->>'execution_released')::boolean, true) = true
          AND COALESCE((readiness->>'factory_excluded')::boolean, false) = false)
    )
  ORDER BY CASE priority WHEN 'hoch' THEN 1 WHEN 'mittel' THEN 2 WHEN 'niedrig' THEN 3 END, created_at
) q;
SQL
