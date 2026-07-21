# scripts/vda/ticket/create.sh — ticket create subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local type="" title="" desc="" brand="mentolder" severity="" priority="mittel" status="triage" attention_mode="" is_test="false" areas="" product_id=""
  # Tolerate an optional leading "create" subcommand token so this script can
  # be invoked either standalone (`create.sh create --type ...`) or via the
  # ticket.sh dispatcher (which already shifts the subcommand off before
  # calling main). [T001582-M2]
  [[ "${1:-}" == "create" ]] && shift
  while [[ $# -gt 0 ]]; do case "$1" in
      --type)           type="$2"; shift 2 ;;
      --title)          title="$2"; shift 2 ;;
      --description)    desc="$2"; shift 2 ;;
      --brand)          brand="$2"; shift 2 ;;
      --severity)       severity="$2"; shift 2 ;;
      --priority)       priority="$2"; shift 2 ;;
      --status)         status="$2"; shift 2 ;;
      --attention-mode) attention_mode="$2"; shift 2 ;;
      --areas)          areas="$2"; shift 2 ;;
      --product-id)     product_id="$2"; shift 2 ;;
      --is-test-data)   is_test="true"; shift ;;
      *)                echo "Unknown create option: $1" >&2; exit 2 ;;
    esac; done
  if [[ -z "$type" || -z "$title" || -z "$desc" ]]; then
    echo "ERROR: --type, --title, and --description are required." >&2
    exit 2
  fi
  # [T001582-M2] Validate --severity client-side before any DB access, so an
  # invalid value never burns a sequence id on a failed insert. Empty stays
  # allowed (severity is optional).
  if [[ -n "$severity" ]]; then
    case "$severity" in
      critical|major|minor|trivial) ;;
      *)
        echo "ERROR: --severity must be one of: critical, major, minor, trivial (got: $severity)" >&2
        exit 2
        ;;
    esac
  fi
  local pod; pod=$(_pgpod)
  local parent_uuid=""
  if [[ -n "$product_id" ]]; then
    parent_uuid=$(_resolve_product_id "$pod" "$product_id" "$brand") || exit 2
  fi
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
    -v is_test="$is_test" \
    -v areas="$areas" \
    -v parent="$parent_uuid" <<'EOF'
INSERT INTO tickets.tickets (type, brand, title, description, status, severity, priority, attention_mode, is_test_data, areas, parent_id)
VALUES (:'type', :'brand', :'title', :'desc', :'status', NULLIF(:'sev', ''), :'prio', COALESCE(NULLIF(:'attn', ''), 'auto'), :'is_test'::boolean, CASE WHEN :'areas'='' THEN NULL ELSE string_to_array(:'areas',',') END, NULLIF(:'parent', '')::uuid)
RETURNING external_id || '|' || id;
EOF
)
  ext_id="${result%%|*}"
  echo "$result"

  # === Triage-Hook (Auto-Triage via Heuristik) ===
  if [[ -n "$ext_id" && -f "scripts/triage/heuristik.mjs" ]]; then
    local triage_result=""
    triage_result=$(node scripts/triage/heuristik.mjs \
      --title "$title" \
      --description "$desc" \
      --areas "$areas" 2>/tmp/triage-error.log) || triage_result=""

    if [[ -n "$triage_result" ]]; then
      local auto_apply confidence suggested_severity
      auto_apply=$(echo "$triage_result" | jq -r '.auto_apply' 2>/dev/null || echo "false")
      confidence=$(echo "$triage_result" | jq -r '.confidence' 2>/dev/null || echo "0")
      suggested_severity=$(echo "$triage_result" | jq -r '.severity' 2>/dev/null || echo "")

      if [[ "$auto_apply" == "true" && -n "$suggested_severity" ]]; then
        # >90% Confidence → Severity direkt setzen
        _exec_sql "$pod" -v ext_id="$ext_id" -v sev="$suggested_severity" <<'EOF' >/dev/null
UPDATE tickets.tickets SET severity = NULLIF(:'sev', '') WHERE external_id = :'ext_id';
EOF
      elif (( $(echo "$confidence >= 0.50" | bc -l 2>/dev/null || echo 0) )) && [[ -n "$suggested_severity" ]]; then
        # 50–90% → Vorschlag-Comment hinterlegen
        local pct
        pct=$(python3 -c "print(f'{float(\"$confidence\")*100:.0f}')" 2>/dev/null || echo "$confidence")
        _exec_sql "$pod" -v ext_id="$ext_id" -v body="## Vorgeschlagene Severity: ${suggested_severity} (Confidence: ${pct}%)" -v author="auto-triage" -v vis="internal" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, :'author', :'body', :'vis'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
      fi
    fi
  fi

  if [[ "$type" == "mishap" ]] && [[ -n "$ext_id" ]]; then
    local sdir; sdir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
    "${sdir}/mishap-categorize.sh" "$ext_id" "$title" "$desc" >&2 || true
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
