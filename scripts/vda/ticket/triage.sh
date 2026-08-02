# scripts/vda/ticket/triage.sh — ticket triage subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"
source "$(dirname "${BASH_SOURCE[0]}")/../../lib/vda-core.sh"

_normalize_priority() {
  case "${1,,}" in niedrig|low) echo "niedrig" ;; mittel|medium) echo "mittel" ;; hoch|high|kritisch|critical) echo "hoch" ;; *) echo "INVALID" ;; esac
}

_VALID_SEVERITIES="critical major minor trivial"
_VALID_STATUSES="triage planning plan_staged backlog in_progress in_review qa_review awaiting_deploy blocked done archived"

show_help() {
  vda_header "vda.sh ticket triage"
  echo "Usage: vda.sh ticket triage --id <ext-id> [flags]"
  echo ""
  echo "Flags: --priority, --severity, --status, --component, --type, --attention-mode, --suggest, --apply, --no-comment, -h|--help"
}

main() {
  local id="" priority="" severity="" status="" component="" type="" attention_mode="" suggest="false" apply="false" no_comment="false"

  while [[ $# -gt 0 ]]; do case "$1" in
    --id) id="$2"; shift 2 ;; --priority) priority="$2"; shift 2 ;; --severity) severity="$2"; shift 2 ;;
    --status) status="$2"; shift 2 ;; --component) component="$2"; shift 2 ;;
    --type) type="$2"; shift 2 ;; --attention-mode) attention_mode="$2"; shift 2 ;;
    --suggest) suggest="true"; shift ;; --apply) apply="true"; shift ;; --no-comment) no_comment="true"; shift ;;
    -h|--help) show_help; exit 0 ;; *) vda_error "Unknown triage option: $1"; exit 2 ;;
  esac; done

  if [[ -z "$id" ]]; then vda_error "--id is required"; exit 2; fi

  if [[ -n "$priority" ]]; then
    local n; n=$(_normalize_priority "$priority")
    [[ "$n" == "INVALID" ]] && { vda_error "Invalid priority: $priority (niedrig|mittel|hoch|low|medium|high|critical)"; exit 2; }
    priority="$n"
  fi
  if [[ -n "$severity" ]] && ! [[ " $_VALID_SEVERITIES " == *" ${severity,,} "* ]]; then
    vda_error "Invalid severity: $severity (critical|major|minor|trivial)"; exit 2
  fi
  if [[ -n "$status" ]] && ! [[ " $_VALID_STATUSES " == *" ${status,,} "* ]]; then
    vda_error "Invalid status: $status (triage|planning|plan_staged|backlog|in_progress|in_review|qa_review|awaiting_deploy|blocked|done|archived)"; exit 2
  fi
  # Dual-Vokabular waehrend des Uebergangs [T002329]: die drei Altwerte bleiben
  # gueltig, bis Teil D (T002331) sie aus dem DB-CHECK entfernt.
  if [[ -n "$type" ]] && ! [[ " fix feat chore project docs refactor perf test ci build bug feature task " == *" ${type,,} "* ]]; then
    vda_error "Invalid type: $type (fix|feat|chore|project|docs|refactor|perf|test|ci|build — legacy: bug|feature|task)"; exit 2
  fi
  if [[ -n "$attention_mode" ]] && ! [[ " auto ai_ready needs_human " == *" ${attention_mode,,} "* ]]; then
    vda_error "Invalid attention_mode: $attention_mode (auto|ai_ready|needs_human)"; exit 2
  fi

  if [[ "$apply" == "true" || "${VDA_NONINTERACTIVE:-0}" == "1" || ! -t 0 ]]; then
    # In non-interactive mode, only require fields that are explicitly being set.
    # If a field is not provided as a flag, skip the interactive prompt but don't error—
    # the database UPDATE will only set non-empty values.
    # [T002498-M9] `component` zählt mit: es IST ein änderbares Feld des Tools,
    # sein Fehlen in dieser Liste machte reine Komponenten-Nachtragungen unmöglich.
    [[ -n "$priority" || -n "$severity" || -n "$status" || -n "$component" || -n "$type" || -n "$attention_mode" ]] || \
      { vda_error "At least one field (--priority, --severity, --status, --component, --type, --attention-mode) must be provided in non-interactive mode"; exit 2; }
  fi

  local pod; pod=$(_pgpod)
  local ticket
  ticket=$(_exec_sql "$pod" -v ext_id="$id" <<'SQL'
SELECT json_build_object('external_id',external_id,'title',title,'type',type,'status',status,'priority',priority,'severity',severity,'component',component)::text FROM tickets.tickets WHERE external_id=:'ext_id';
SQL
)
  [[ -z "$ticket" || "$ticket" == "null" ]] && { vda_error "Ticket $id not found"; exit 1; }

  # [T002498-M8] Der frühere Header-Block zeigte den Zustand VOR der Änderung —
  # mit "—" für noch nicht gesetzte Felder. Zusammen mit der unvollständigen
  # Bestätigungszeile unten suggerierte er einen Teilfehlschlag. Der VOR-Block
  # wird nicht mehr ausgegeben; die Bestätigung am Ende listet den NACH-Zustand.

  if [[ "$suggest" == "true" ]]; then
    local r; r=$(curl -fsS -X POST "${TRIAGE_API_URL:-http://localhost:4321/api/admin/tickets}/${id}/triage" 2>/dev/null || true)
    if [[ -n "$r" ]]; then
      local sp se sc
      sp=$(jq -r '.priority // ""' <<<"$r" 2>/dev/null || true)
      se=$(jq -r '.severity // ""' <<<"$r" 2>/dev/null || true)
      sc=$(jq -r '.component // ""' <<<"$r" 2>/dev/null || true)
      [[ -n "$sp" && -z "$priority" ]] && priority="$sp"
      [[ -n "$se" && -z "$severity" ]] && severity="$se"
      [[ -n "$sc" && -z "$component" ]] && component="$sc"
      vda_section "AI Priority" "${sp:---}"
      vda_section "AI Severity" "${se:---}"
      vda_section "AI Component" "${sc:---}"; echo ""
    else
      vda_warn "AI suggest unavailable — proceeding manually"; echo ""
    fi
  fi

  # Only prompt interactively if in interactive mode and field is empty
  if [[ "$apply" != "true" && "${VDA_NONINTERACTIVE:-0}" != "1" && -t 0 ]]; then
    [[ -z "$priority" ]] && priority=$(vda_choose "Priority" niedrig mittel hoch)
    [[ -z "$severity" ]] && severity=$(vda_choose "Severity" critical major minor trivial)
    [[ -z "$status" ]] && status=$(vda_choose "Status" triage planning plan_staged backlog in_progress in_review qa_review awaiting_deploy blocked done archived)
    [[ -z "$component" ]] && component=$(vda_input "Component" "")
  fi

  if [[ "$apply" != "true" && "${VDA_NONINTERACTIVE:-0}" != "1" && -t 0 ]]; then
    vda_confirm "Apply triage?" || { vda_warn "Cancelled"; exit 0; }
  fi

  _exec_sql "$pod" -v ext_id="$id" -v p="$priority" -v s="$severity" -v st="$status" -v c="$component" -v tp="$type" -v attn="$attention_mode" <<'SQL' >/dev/null
UPDATE tickets.tickets SET
  priority=COALESCE(NULLIF(:'p',''), priority),
  severity=COALESCE(NULLIF(:'s',''), severity),
  status=COALESCE(NULLIF(:'st',''), status),
  component=COALESCE(NULLIF(:'c',''), component),
  type=COALESCE(NULLIF(:'tp',''), type),
  attention_mode=COALESCE(NULLIF(:'attn',''), attention_mode)
WHERE external_id=:'ext_id';
SQL

  if [[ "$no_comment" != "true" ]]; then
    local body; body="Triage: priority=${priority}, severity=${severity}, status=${status}, type=${type:-unchanged}, attention_mode=${attention_mode:-unchanged}"
    [[ -n "$component" ]] && body+=", component=${component}"
    _exec_sql "$pod" -v ext_id="$id" -v body="$body" <<'SQL' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility) SELECT id, 'triage', :'body', 'internal' FROM tickets.tickets WHERE external_id=:'ext_id';
SQL
  fi

  # [T002498-M8] Die Bestätigung listet ALLE im Aufruf übergebenen (nicht-leeren)
  # Felder — vorher zeigte das Template nur "<priority>/<severity> → <status>",
  # ein Aufruf mit severity+component+attention_mode ergab "✓ /critical →" und
  # suggerierte einen Teilfehlschlag, obwohl alle Felder korrekt geschrieben
  # wurden. Der obenstehende VOR-Zustand-Block verstärkte den Eindruck (zeigte
  # "—" für noch nicht gesetzte Felder) und wurde dafür entfernt.
  local changed=() kv
  for kv in "priority=$priority" "severity=$severity" "status=$status" "component=$component" "type=$type" "attention_mode=$attention_mode"; do
    [[ -n "${kv#*=}" ]] && changed+=("$kv")
  done
  if [[ ${#changed[@]} -gt 0 ]]; then
    vda_success "Ticket $id triaged: ${changed[*]}"
  else
    vda_success "Ticket $id triaged (keine Felder gesetzt)"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi
