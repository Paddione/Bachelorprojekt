#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local brand="${BRAND:-mentolder}" status="" type="" attention_mode="" missing_id=false limit=200 sort="desc"
  local include_test_data=false

  while [[ $# -gt 0 ]]; do case "$1" in
    --brand)          brand="$2"; shift 2 ;;
    --status)         status="$2"; shift 2 ;;
    --type)           type="$2"; shift 2 ;;
    --attention-mode) attention_mode="$2"; shift 2 ;;
    --missing-id)     missing_id=true; shift ;;
    --limit)          limit="$2"; shift 2 ;;
    --sort)           sort="$2"; shift 2 ;;
    --include-test-data) include_test_data=true; shift ;;
    *)                echo "Unknown list option: $1" >&2; exit 2 ;;
  esac; done

  case "$sort" in
    asc|desc) : ;;
    *) echo "Unknown --sort value: $sort (expected asc|desc)" >&2; exit 2 ;;
  esac
  local order_dir="DESC"
  [[ "$sort" == "asc" ]] && order_dir="ASC"

  # [T014386] Filter-Validierung VOR jedem DB-Zugriff. Die Reihenfolge ist die
  # eigentliche Zusicherung: CI stellt keine Ticket-DB bereit, ein Guard hinter
  # dem Verbindungsaufbau waere dort dauerhaft uebersprungen statt wirksam.
  # Vorher lieferte ein unbekannter Filterwert '[]' mit Exit 0 — nicht von
  # "kein Treffer" unterscheidbar.
  [[ -n "$status" ]]         && { _ticket_validate_enum_list status "$status" "$TICKET_VALID_STATUS" || exit 2; }
  [[ -n "$type" ]]           && { _ticket_validate_enum type "$type" "$TICKET_VALID_TYPE" || exit 2; }
  [[ -n "$attention_mode" ]] && { _ticket_validate_enum attention-mode "$attention_mode" "$TICKET_VALID_ATTENTION" || exit 2; }

  if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
    echo "ticket list [DRY-RESOLVE]: brand=${brand}"
    exit 0
  fi

  local pod; pod=$(_pgpod)

  local where="brand = :'brand'"
  # T012972: --status nimmt eine Komma-Liste ("triage,planning"). Ein zweites --status-Flag
  # waere kein Ausweg — die Schleife oben ueberschreibt den Wert, und der Aufrufer bekaeme
  # still die Treffer des LETZTEN Werts statt der Vereinigung. Die Aufloesung gehoert
  # deshalb hierher, wo die Liste als Ganzes ankommt. Leerzeichen werden entfernt, damit
  # "triage, planning" nicht an einem Wert mit fuehrendem Blank scheitert.
  # [T014386] Die Werte sind vorher gegen TICKET_VALID_STATUS geprueft — frueher
  # stand hier "open,triage" als Beispiel, obwohl 'open' kein definierter Status
  # ist. Der Kommentar lehrte damit genau den Wert, den die CLI still verschluckte.
  [[ -n "$status" ]]         && where+=" AND status = ANY(string_to_array(replace(:'status', ' ', ''), ','))"
  [[ -n "$type" ]]           && where+=" AND type = :'type'"
  [[ -n "$attention_mode" ]] && where+=" AND attention_mode = :'attn'"
  [[ "$missing_id" == "true" ]] && where+=" AND external_id IS NULL"
  [[ "$include_test_data" != "true" ]] && where+=" AND is_test_data IS NOT TRUE"

  # T001916: default is now newest-first (created_at DESC). With more than
  # `--limit` rows in the brand, an ASC default silently dropped the newest
  # (and thus most relevant open) tickets from standard output. --sort asc
  # restores the old oldest-first behavior for callers that need it.
  _exec_sql "$pod" \
    -v brand="$brand" \
    -v status="$status" \
    -v type="$type" \
    -v attn="$attention_mode" \
    -v lim="$limit" <<EOF
SELECT COALESCE(json_agg(row ORDER BY row.created_at ${order_dir}), '[]')
FROM (
  -- T003406/T003811: Triage-Projektion. Die Felder der missing[]-Berechnung
  -- (component, areas, depends_on, readiness) und der Planungs-Einordnung
  -- (effort, planning_rank, desc_len, updated_at) muessen ohne Umweg ueber
  -- rohes SQL aus list/export lesbar sein. Additiv — bestehende Konsumenten
  -- (health-goals-update.sh, ticket-mcp-markdown) greifen per Key zu.
  SELECT external_id, title, status, type, priority, severity,
         attention_mode, component, areas, depends_on, readiness,
         effort, planning_rank, length(description) AS desc_len,
         created_at::date AS created_at, updated_at
  FROM tickets.tickets
  WHERE $where
  ORDER BY created_at ${order_dir}
  LIMIT :'lim'::int
) row;
EOF
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
