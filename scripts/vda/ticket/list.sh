#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local brand="${BRAND:-mentolder}" status="" type="" attention_mode="" missing_id=false limit=200

  while [[ $# -gt 0 ]]; do case "$1" in
    --brand)          brand="$2"; shift 2 ;;
    --status)         status="$2"; shift 2 ;;
    --type)           type="$2"; shift 2 ;;
    --attention-mode) attention_mode="$2"; shift 2 ;;
    --missing-id)     missing_id=true; shift ;;
    --limit)          limit="$2"; shift 2 ;;
    *)                echo "Unknown list option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
    echo "ticket list [DRY-RESOLVE]: brand=${brand}"
    exit 0
  fi

  local pod; pod=$(_pgpod)

  local where="brand = :'brand'"
  [[ -n "$status" ]]         && where+=" AND status = :'status'"
  [[ -n "$type" ]]           && where+=" AND type = :'type'"
  [[ -n "$attention_mode" ]] && where+=" AND attention_mode = :'attn'"
  [[ "$missing_id" == "true" ]] && where+=" AND external_id IS NULL"

  _exec_sql "$pod" \
    -v brand="$brand" \
    -v status="$status" \
    -v type="$type" \
    -v attn="$attention_mode" \
    -v lim="$limit" <<EOF
SELECT COALESCE(json_agg(row ORDER BY row.created_at ASC), '[]')
FROM (
  SELECT external_id, title, status, type, priority, severity,
         attention_mode, created_at::date AS created_at
  FROM tickets.tickets
  WHERE $where
  ORDER BY created_at ASC
  LIMIT :'lim'::int
) row;
EOF
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
