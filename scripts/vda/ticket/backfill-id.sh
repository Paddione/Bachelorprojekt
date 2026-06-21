#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local brand="${BRAND:-mentolder}"
  while [[ $# -gt 0 ]]; do case "$1" in
    --brand) brand="$2"; shift 2 ;;
    *)       echo "Unknown backfill-id option: $1" >&2; exit 2 ;;
  esac; done

  if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
    echo "ticket backfill-id [DRY-RESOLVE]: brand=${brand}"
    exit 0
  fi

  local pod; pod=$(_pgpod)

  _exec_sql "$pod" -v brand="$brand" <<'EOF'
UPDATE tickets.tickets
SET external_id = 'T' || LPAD(nextval('tickets.ticket_id_seq')::text, 6, '0'),
    updated_at  = now()
WHERE external_id IS NULL
  AND brand = :'brand'
RETURNING json_build_object('id', id, 'external_id', external_id, 'title', title);
EOF
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
