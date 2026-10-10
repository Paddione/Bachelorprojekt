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
  local id="" branch="" plan="" partials="1" hold="" allow_empty=0 derived plan_tmp
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
      --hold)                 hold=1; shift ;;
      --no-hold)              hold=0; shift ;;
      --allow-empty-touched)  allow_empty=1; shift ;;
      # Die Fehlermeldung ist der einzige Ort, an dem ein Aufrufer im Fehlerfall
      # ueberhaupt hinsieht — also nennt sie die gueltigen Flags. [T002375-p3]
      *)          echo "Unknown stage-plan option: $1" >&2
                  echo "  Gueltige Flags: --id <ext-id> --branch <branch> --plan|--plan-file <pfad> --partials <1..9> --hold|--no-hold [--allow-empty-touched]" >&2
                  echo "  --partials ist PFLICHT, auch fuer einen einzelnen, nicht aufgeteilten Plan." >&2
                  echo "  stage-plan verlangt seit T003267 eine explizite Hold-Entscheidung: --hold = Operator gibt spaeter frei, --no-hold = Ausfuehrung sofort freigegeben." >&2
                  exit 2 ;;
    esac; done
  if [[ -z "$id"     ]]; then echo "ERROR: --id is required."     >&2; exit 2; fi
  if [[ -z "$branch" ]]; then echo "ERROR: --branch is required." >&2; exit 2; fi
  if [[ -z "$plan"   ]]; then echo "ERROR: --plan is required."   >&2; exit 2; fi
  case "$partials" in [1-9]) ;; *) echo "ERROR: --partials must be 1..9" >&2; exit 2 ;; esac
  if [[ -z "$hold" ]]; then
    echo "ERROR: stage-plan verlangt eine explizite Hold-Entscheidung." >&2
    echo "  Ohne Flag kein Stage: --hold = Operator gibt spaeter frei, --no-hold = Ausfuehrung sofort freigegeben." >&2
    exit 1
  fi
  # [T002471-M6] plan_file muss im Git-Tree von branch oder HEAD sein
  # Der reine -f-Check auf Disk akzeptierte Dateien, die nur im Staging-Bereich lagen,
  # aber nicht committed waren. Die Plan-Referenz liefe dann ins Leere.
  if ! git cat-file -e "${branch}:${plan}" 2>/dev/null \
    && ! git cat-file -e "HEAD:${plan}" 2>/dev/null; then
    echo "ERROR: Plan file '${plan}' does not exist on branch '${branch}' or in HEAD." >&2
    echo "  Die Datei muss committed sein, bevor stage-plan sie referenzieren kann." >&2
    echo "  Verwende 'git add' und 'git commit' oder pushe den Branch." >&2
    exit 1
  fi

  # [T002446] touched_files aus dem `## File Structure`-Block des Plans ableiten —
  # JETZT vor dem ersten SQL-Write (T003267 P2.2), damit ein leerer Derivation-Fund
  # das Ticket nicht halb gestaged zuruecklaesst.
  plan_tmp="$(mktemp)"
  if git cat-file -e "${branch}:${plan}" 2>/dev/null; then
    git cat-file -p "${branch}:${plan}" >"$plan_tmp" 2>/dev/null
  elif git cat-file -e "HEAD:${plan}" 2>/dev/null; then
    git cat-file -p "HEAD:${plan}" >"$plan_tmp" 2>/dev/null
  elif [[ -f "${plan}" ]]; then
    cp "${plan}" "$plan_tmp"
  fi
  derived="$(bash "$(dirname "${BASH_SOURCE[0]}")/../../plan-touched-files.sh" "$plan_tmp" 2>/dev/null || true)"
  rm -f "$plan_tmp"

  if [[ -z "${derived//[[:space:]]/}" && "$allow_empty" != "1" ]]; then
    echo "ERROR: keine touched_files aus '${plan}' ableitbar (T002673)." >&2
    echo "  Plan im Branch-Commit ist noch das propose-Skeleton? Erst committen, dann stagen." >&2
    echo "  Bewusster Sonderfall ohne File-Structure-Pfade: --allow-empty-touched setzen." >&2
    exit 1
  fi

  local pod; pod=$(_pgpod)

  local _sw_body _sw_slug _sw_trailer
  if git cat-file -e "${branch}:${plan}" 2>/dev/null; then
    _sw_body="$(git cat-file -p "${branch}:${plan}" 2>/dev/null)"
  else
    _sw_body="$(git cat-file -p "HEAD:${plan}" 2>/dev/null)"
  fi
  _sw_slug="$(basename "$(dirname "${plan}")")"
  case "${_sw_slug}/${branch}/${id}" in
    *\'*|*\"*|*\;*|*\\*) echo "ERROR: stage-plan DB write refused: unsafe chars in slug/branch/id." >&2; exit 1 ;;
  esac
  _sw_trailer="<!-- plan-stage branch=${branch} plan=${plan} -->"

  local driver="${TICKET_PHASE_DRIVER:-devflow}"
  case "$driver" in factory|devflow) ;; *) driver="devflow" ;; esac

  local csv_arg=""
  if [[ -n "${derived//[[:space:]]/}" ]]; then
    csv_arg="$(printf '%s' "$derived" | paste -sd, -)"
    echo "touched_files: $(printf '%s\n' "$derived" | grep -c .) Pfad(e) aus dem Plan uebernommen" >&2
  else
    echo "touched_files: --allow-empty-touched — Spalte unveraendert" >&2
  fi

  local rel_bool="true"
  if [[ "$hold" == "1" ]]; then
    rel_bool="false"
  fi

  local _sw_existing
  _sw_existing="$(_exec_sql "$pod" -v ext_id="$id" -v slug="$_sw_slug" <<'EOF'
SELECT count(*) FROM tickets.ticket_plans tp JOIN tickets.tickets t ON t.id = tp.ticket_id
 WHERE t.external_id = :'ext_id' AND tp.slug = :'slug' AND tp.pr_number IS NULL;
EOF
)"

  local _sw_sql_part
  if [[ "${_sw_existing//[[:space:]]/}" == "0" ]]; then
    _sw_sql_part="$(printf 'INSERT INTO tickets.ticket_plans (ticket_id, slug, branch, content, pr_number)\nSELECT t.id, '\''%s'\'', '\''%s'\'', $plan$%s\n%s$plan$, NULL\nFROM tickets.tickets t WHERE t.external_id = '\''%s'\'';' "$_sw_slug" "$branch" "$_sw_body" "$_sw_trailer" "$id")"
  else
    _sw_sql_part="$(printf 'UPDATE tickets.ticket_plans tp SET content = $plan$%s\n%s$plan$, branch = '\''%s'\'', archived_at = now()\nFROM tickets.tickets t WHERE t.id = tp.ticket_id AND t.external_id = '\''%s'\'' AND tp.slug = '\''%s'\'' AND tp.pr_number IS NULL;' "$_sw_body" "$_sw_trailer" "$branch" "$id" "$_sw_slug")"
  fi

  local sql_tx
  sql_tx="$(cat <<EOF
BEGIN;

UPDATE tickets.tickets
   SET status = 'plan_staged',
       slot_count = :partials::integer,
       readiness = COALESCE(readiness, '{}'::jsonb) || '{"execution_released":${rel_bool}}'::jsonb
 WHERE external_id = :'ext_id';

UPDATE tickets.tickets
   SET touched_files = ARRAY(
         SELECT DISTINCT e FROM unnest(
           COALESCE(touched_files, ARRAY[]::text[]) || string_to_array(:'files', ',')
         ) AS e
         WHERE e <> '' ORDER BY e)
 WHERE external_id = :'ext_id' AND :'files' <> '';

DELETE FROM tickets.ticket_comments c
 USING tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND c.ticket_id = t.id
   AND c.body LIKE 'FACTORY-PLAN-REF %';

INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT t.id, 'dev-flow-plan', :'ref', 'internal'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id';

${_sw_sql_part}

INSERT INTO tickets.factory_phase_events (ticket_id, phase, state, detail, driver)
SELECT t.id, 'plan', 'done', :'detail', :'driver'
  FROM tickets.tickets t
 WHERE t.external_id = :'ext_id'
   AND NOT EXISTS (
     SELECT 1 FROM tickets.factory_phase_events e
      WHERE e.ticket_id = t.id AND e.phase = 'plan' AND e.state = 'done'
   );

COMMIT;
EOF
)"


  if ! printf '%s' "$sql_tx" | _exec_sql_with_timeout "$pod" \
    -v ext_id="$id" \
    -v partials="$partials" \
    -v files="$csv_arg" \
    -v ref="FACTORY-PLAN-REF branch=${branch} plan=${plan}" \
    -v slug="$_sw_slug" \
    -v branch="$branch" \
    -v driver="$driver" \
    -v detail="auto: stage-plan" -- stage-tx; then
    echo "ERROR: stage-plan transaction failed." >&2
    exit 1
  fi

  # Verifizieren, dass das Ticket tatsächlich existierte und aktualisiert wurde
  local _verify_staged
  _verify_staged="$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT count(*) FROM tickets.tickets WHERE external_id = :'ext_id' AND status = 'plan_staged';
EOF
)"
  if [[ "${_verify_staged//[[:space:]]/}" -lt 1 ]]; then
    echo "ERROR: stage-plan failed: Ticket $id not found or not staged." >&2
    exit 1
  fi

  if [[ "$hold" != "1" ]]; then
    if ! _exec_sql "$pod" -v setby='stage-plan' <<'EOF' >/dev/null 2>&1
INSERT INTO tickets.factory_control (key, brand, value, set_by, updated_at)
VALUES ('force-tick-requested', NULL, now()::text, :'setby', now())
ON CONFLICT (key, brand) DO UPDATE
  SET value = EXCLUDED.value, set_by = EXCLUDED.set_by, updated_at = now();
EOF
    then
      echo "WARN: stage-plan: force-tick flag write failed — write may have succeeded despite timeout" >&2
    fi
  fi

  if [[ "$hold" == "1" ]]; then
    echo "Ticket $id staged in Kommissionierung (status=plan_staged, execution held)"
  else
    echo "Ticket $id staged in Kommissionierung (status=plan_staged)"
  fi
  # [T901542] Stage-time-Indexierung: Plan-Partials als Doctype plan_partial in
  # die K1-Collection specs_plans (pre-merge Recall, ein Chunk pro Partial).
  # Fail-soft — warnt statt abzubrechen; Staging scheitert nie am Embed-Gateway.
  # stdout (Beleg-JSON) geht nach /dev/null, damit kein Aufrufer-Parsing bricht.
  if command -v node >/dev/null 2>&1; then
    local _stage_index_root
    _stage_index_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
    if [[ -f "${_stage_index_root}/scripts/llm/plan-stage-index.mjs" && -f "${plan}" ]]; then
      node "${_stage_index_root}/scripts/llm/plan-stage-index.mjs" --plan-dir "$(dirname "${plan}")" >/dev/null         || echo "WARN: stage-plan: plan-stage-index failed for '${plan}' — staging unaffected" >&2
    else
      echo "WARN: stage-plan: plan-stage-index skipped (plan not on disk: '${plan}')" >&2
    fi
  else
    echo "WARN: stage-plan: plan-stage-index skipped (node not found)" >&2
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
