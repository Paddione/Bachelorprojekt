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
  echo "Flags: --priority, --severity, --status, --component, --suggest, --apply, --no-comment, -h|--help"
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
  if [[ -n "$type" ]] && ! [[ " bug feature task project " == *" ${type,,} "* ]]; then
    vda_error "Invalid type: $type (bug|feature|task|project)"; exit 2
  fi
  if [[ -n "$attention_mode" ]] && ! [[ " auto ai_ready needs_human " == *" ${attention_mode,,} "* ]]; then
    vda_error "Invalid attention_mode: $attention_mode (auto|ai_ready|needs_human)"; exit 2
  fi

  if [[ "$apply" == "true" || "${VDA_NONINTERACTIVE:-0}" == "1" || ! -t 0 ]]; then
    # In non-interactive mode, only require fields that are explicitly being set.
    # If a field is not provided as a flag, skip the interactive prompt but don't error—
    # the database UPDATE will only set non-empty values.
    [[ -n "$priority" || -n "$severity" || -n "$status" || -n "$type" || -n "$attention_mode" ]] || \
      { vda_error "At least one field (--priority, --severity, --status, --type, --attention-mode) must be provided in non-interactive mode"; exit 2; }
  fi

  local pod; pod=$(_pgpod)
  local ticket
  ticket=$(_exec_sql "$pod" -v ext_id="$id" <<'SQL'
SELECT json_build_object('external_id',external_id,'title',title,'type',type,'status',status,'priority',priority,'severity',severity,'component',component)::text FROM tickets.tickets WHERE external_id=:'ext_id';
SQL
)
  [[ -z "$ticket" || "$ticket" == "null" ]] && { vda_error "Ticket $id not found"; exit 1; }

  vda_header "Ticket $id"
  for field in title type status priority severity component; do
    vda_section "${field^}" "$(jq -r ".$field // \"—\"" <<<"$ticket" 2>/dev/null || echo "—")"
  done; echo ""

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
  component=NULLIF(:'c',''),
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

  vda_success "Ticket $id triaged: ${priority}/${severity} → ${status}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi
