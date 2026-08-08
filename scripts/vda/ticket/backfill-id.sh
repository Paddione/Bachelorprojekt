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

  local output
  output="$(_exec_sql "$pod" -v brand="$brand" <<'EOF'
UPDATE tickets.tickets
SET external_id = 'T' || LPAD(nextval('tickets.external_id_seq')::text, 6, '0'),
    updated_at  = now()
WHERE external_id IS NULL
  AND brand = :'brand'
RETURNING json_build_object('id', id, 'external_id', external_id, 'title', title);
EOF
  )"

  # Always print the RETURNING output unchanged.
  if [[ -n "$output" ]]; then
    printf '%s\n' "$output"
  fi

  # Count updated rows from the actual RETURNING output.
  local count
  if [[ -n "$output" ]]; then
    count=$(printf '%s\n' "$output" | grep -c .)
  else
    count=0
  fi

  if [[ "$count" -eq 0 ]]; then
    echo "backfill-id: 0 Zeilen ohne external_id - nichts zu tun"
  else
    echo "backfill-id: ${count} Zeile(n) nachgetragen"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
