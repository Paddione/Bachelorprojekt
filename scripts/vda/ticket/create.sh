# scripts/vda/ticket/create.sh — ticket create subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local type="" title="" desc="" brand="mentolder" severity="" priority="mittel" status="triage" attention_mode="" is_test="false"
  while [[ $# -gt 0 ]]; do case "$1" in
      --type)           type="$2"; shift 2 ;;
      --title)          title="$2"; shift 2 ;;
      --description)    desc="$2"; shift 2 ;;
      --brand)          brand="$2"; shift 2 ;;
      --severity)       severity="$2"; shift 2 ;;
      --priority)       priority="$2"; shift 2 ;;
      --status)         status="$2"; shift 2 ;;
      --attention-mode) attention_mode="$2"; shift 2 ;;
      --is-test-data)   is_test="true"; shift ;;
      *)                echo "Unknown create option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$type" || -z "$title" || -z "$desc" ]]; then
    echo "ERROR: --type, --title, and --description are required." >&2
    exit 2
  fi
  local pod; pod=$(_pgpod)
  local result ext_id
  result=$(_exec_sql "$pod" \
    -v type="$type" \
    -v brand="$brand" \
    -v title="$title" \
    -v desc="$desc" \
    -v status="$status" \
    -v sev="$severity" \
    -v prio="$priority" \
    -v attn="$attention_mode" \
    -v is_test="$is_test" <<'EOF'
INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority, attention_mode, is_test_data)
VALUES (:'type', :'brand', :'title', :'desc', :'status', NULLIF(:'sev', ''), :'prio', COALESCE(NULLIF(:'attn', ''), 'auto'), :'is_test'::boolean)
RETURNING external_id || '|' || id;
EOF
)
  ext_id="${result%%|*}"
  echo "$result"
  if [[ "$type" == "mishap" ]] && [[ -n "$ext_id" ]]; then
    local sdir; sdir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    "${sdir}/mishap-categorize.sh" "$ext_id" "$title" "$desc" >&2 || true
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
