# scripts/vda/ticket/stage-plan.sh — ticket stage-plan subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

# Watchdog um _exec_sql. `timeout` scheidet aus: es ist ein externes Binary und
# kann keine Shell-Funktion starten (rc=127, "No such file or directory") — ein
# `timeout 120 _exec_sql …` haette JEDEN Schreibvorgang lahmgelegt statt ihn
# abzusichern. Stattdessen laeuft _exec_sql in einer Hintergrund-Subshell, die
# nach Ablauf der Frist SIGTERM bekommt.
#
# Kontext-Label wird als `-- <ctx>` uebergeben und aus der Argumentliste
# herausgeloest, damit es nicht bei psql landet.
_exec_sql_with_timeout() {
  local pod="$1"; shift
  local timeout_sec="${STAGE_PLAN_SQL_TIMEOUT:-120}" ctx=unknown
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --) ctx="${2:-unknown}"; shift 2 ;;
      *)  args+=("$1"); shift ;;
    esac
  done

  local sql; sql="$(cat)"          # Heredoc einlesen, bevor die Subshell startet
  ( printf '%s' "$sql" | _exec_sql "$pod" "${args[@]}" >/dev/null 2>&1 ) &
  local pid=$! waited=0
  while kill -0 "$pid" 2>/dev/null && (( waited < timeout_sec )); do
    sleep 1; waited=$(( waited + 1 ))
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null
    echo "WARN: stage-plan: SQL timed out after ${timeout_sec}s (ctx=$ctx) — write may have succeeded despite timeout" >&2
    return 1
  fi
  wait "$pid"
}

main() {
  local id="" branch="" plan="" partials="1" hold=0
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)       id="$2"; shift 2 ;;
      --branch)   branch="$2"; shift 2 ;;
      # --plan-file ist der Name, den `archive-plan` (scripts/ticket.sh) und der
      # MCP-Wrapper `archive_plan` benutzen. Wer zwischen beiden Kommandos wechselte,
      # lief zuverlaessig in einen Fehlversuch (T002372-M2, T002325-M2). Der Alias
      # geht bewusst NUR in diese Richtung: `archive-plan` bekommt kein `--plan`,
      # weil `--plan-file` dort der etablierte Name ist. Ein Alias in beide
      # Richtungen verdoppelt die Oberflaeche, ohne das Problem kleiner zu machen.
      --plan|--plan-file) plan="$2"; shift 2 ;;
      --partials) partials="$2"; shift 2 ;;
      --hold)     hold=1; shift ;;
      # Die Fehlermeldung ist der einzige Ort, an dem ein Aufrufer im Fehlerfall
      # ueberhaupt hinsieht — also nennt sie die gueltigen Flags. [T002375-p3]
      *)          echo "Unknown stage-plan option: $1" >&2
                  echo "  Gueltige Flags: --id <ext-id> --branch <branch> --plan|--plan-file <pfad> --partials <1..9> [--hold]" >&2
                  echo "  --partials ist PFLICHT, auch fuer einen einzelnen, nicht aufgeteilten Plan." >&2
                  echo "  Ohne --hold ist das Ticket sofort factory-greifbar (stage-plan weckt factory.service)." >&2
                  exit 2 ;;
    esac; done
  if [[ -z "$id"     ]]; then echo "ERROR: --id is required."     >&2; exit 2; fi
  if [[ -z "$branch" ]]; then echo "ERROR: --branch is required." >&2; exit 2; fi
  if [[ -z "$plan"   ]]; then echo "ERROR: --plan is required."   >&2; exit 2; fi
  case "$partials" in [1-9]) ;; *) echo "ERROR: --partials must be 1..9" >&2; exit 2 ;; esac
  if ! git cat-file -e "${branch}:${plan}" 2>/dev/null \
    && ! git cat-file -e "HEAD:${plan}" 2>/dev/null \
    && ! [[ -f "${plan}" ]]; then
    echo "ERROR: Plan file '${plan}' does not exist on branch '${branch}', in HEAD, or on disk. Check the path and make sure the commit was pushed." >&2
    exit 1
  fi
  local pod; pod=$(_pgpod)
  _exec_sql_with_timeout "$pod" -v ext_id="$id" -v partials="$partials" -- status-update <<'EOF'
UPDATE tickets.tickets SET status='plan_staged', slot_count = :'partials'::integer
 WHERE external_id = :'ext_id';
EOF
  if [[ "$hold" == "1" ]]; then
    _exec_sql_with_timeout "$pod" -v ext_id="$id" -- hold-flag <<'EOF'
UPDATE tickets.tickets SET readiness = COALESCE(readiness,'{}'::jsonb) || '{"execution_released":false}'::jsonb
 WHERE external_id = :'ext_id';
EOF
  fi
  _exec_sql_with_timeout "$pod" -v ext_id="$id" -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" -- plan-ref <<'EOF'
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
  _exec_sql_with_timeout "$pod" -v ext_id="$id" -v driver="$driver" -v detail="auto: stage-plan" -- phase-events <<'EOF'
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
    systemctl --user start --no-block factory.service 2>/dev/null || true
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
