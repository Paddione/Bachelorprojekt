# scripts/vda/ticket/stage-plan.sh — ticket stage-plan subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" branch="" plan="" partials="1" hold=0
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)       id="$2"; shift 2 ;;
      --branch)   branch="$2"; shift 2 ;;
      --plan)     plan="$2"; shift 2 ;;
      --partials) partials="$2"; shift 2 ;;
      --hold)     hold=1; shift ;;
      *)          echo "Unknown stage-plan option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$id"     ]]; then echo "ERROR: --id is required."     >&2; exit 2; fi
  if [[ -z "$branch" ]]; then echo "ERROR: --branch is required." >&2; exit 2; fi
  if [[ -z "$plan"   ]]; then echo "ERROR: --plan is required."   >&2; exit 2; fi
  case "$partials" in [1-9]) ;; *) echo "ERROR: --partials must be 1..9" >&2; exit 2 ;; esac
  # Pre-flight: verify the plan file exists on the named branch, in HEAD, or on
  # the local filesystem (prevents silent staging of broken refs). Checked from
  # most specific to most general: the branch ref covers the common case of the
  # MCP server running the check from the main checkout while the plan only
  # exists on the worktree's feature branch (T002263).
  if ! git cat-file -e "${branch}:${plan}" 2>/dev/null \
    && ! git cat-file -e "HEAD:${plan}" 2>/dev/null \
    && ! [[ -f "${plan}" ]]; then
    echo "ERROR: Plan file '${plan}' does not exist on branch '${branch}', in HEAD, or on disk. Check the path and make sure the commit was pushed." >&2
    exit 1
  fi
  local pod; pod=$(_pgpod)
  _exec_sql "$pod" -v ext_id="$id" -v partials="$partials" <<'EOF' >/dev/null
UPDATE tickets.tickets SET status='plan_staged', slot_count = :'partials'::integer
 WHERE external_id = :'ext_id';
EOF
  if [[ "$hold" == "1" ]]; then
    _exec_sql "$pod" -v ext_id="$id" <<'EOF' >/dev/null
UPDATE tickets.tickets SET readiness = COALESCE(readiness,'{}'::jsonb) || '{"execution_released":false}'::jsonb
 WHERE external_id = :'ext_id';
EOF
  fi
  _exec_sql "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" <<'EOF' >/dev/null
DELETE FROM tickets.ticket_comments c
 USING tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND c.ticket_id = t.id
   AND c.body LIKE 'FACTORY-PLAN-REF %';
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'dev-flow-plan', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id';
EOF
  local driver="${TICKET_PHASE_DRIVER:-devflow}"
  case "$driver" in factory|devflow) ;; *) driver="devflow" ;; esac
  _exec_sql "$pod" -v ext_id="$id" -v driver="$driver" -v detail="auto: stage-plan" <<'EOF' >/dev/null
INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT t.id, p.phase, 'done', :'detail', :'driver'
FROM tickets.tickets t
CROSS JOIN (VALUES ('scout'),('design'),('plan')) AS p(phase)
WHERE t.external_id = :'ext_id'
  AND NOT EXISTS (
    SELECT 1 FROM tickets.factory_phase_events e
     WHERE e.ticket_id = t.id AND e.phase = p.phase AND e.state = 'done'
  );
EOF
  # Auto-tick wake (REQ-SF-AUTOTICK-001; supersedes T002102-p3 Task 1/4/5, D2):
  # after a successful stage, request a force-tick and kick factory.service so the
  # staged plan is picked up now instead of on the next factory.timer interval.
  # Both triggers are best-effort — a DB or systemd failure degrades to the timer
  # path (warn, non-fatal, exit stays 0). Flag mirrors writeControl()
  # (website/src/lib/factory-floor.ts): key='force-tick-requested', brand NULL,
  # ON CONFLICT (key, brand). The consumer (scripts/factory/wakeup.sh:70-83) reads
  # LIMIT 1 and DELETEs all matching rows, so a repeated stage is harmless even
  # when a NULL-brand row is not deduped by the unique index.
  if [[ "$hold" != "1" ]]; then
    if ! _exec_sql "$pod" -v setby='stage-plan' <<'EOF' >/dev/null 2>&1
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES ('force-tick-requested', NULL, now()::text, :'setby', now())
ON CONFLICT (key, brand) DO UPDATE
  SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, updated_at = now();
EOF
    then
      echo "WARN: stage-plan: force-tick flag write failed — factory will tick on the next factory.timer interval" >&2
    fi
  fi
  if [[ "$hold" == "1" ]]; then
    echo "Ticket $id staged in Kommissionierung (status=plan_staged, execution held)"
  else
    echo "Ticket $id staged in Kommissionierung (status=plan_staged)"
  fi
  if [[ "$hold" != "1" ]]; then
    # --no-block: factory.service ist Type=oneshot (RuntimeMaxSec=3600). Ohne --no-block
    # wartet `systemctl start` auf einen laufenden Tick und macht aus dem oben als
    # best-effort/non-fatal deklarierten Weck-Aufruf einen Hang von bis zu 61 min. Die
    # Bestaetigung steht davor, damit der Stage auch bei klemmendem systemd gemeldet
    # wird. [T002366]
    systemctl --user start --no-block factory.service 2>/dev/null || true
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
