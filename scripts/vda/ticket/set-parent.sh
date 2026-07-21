# scripts/vda/ticket/set-parent.sh — ticket set-parent subcommand
# Sourced by dispatchers.
#
# set-parent --id <external_id> --product-id <uuid-or-external_id> [--brand <brand>]
#
# Resolves --product-id through the shared _resolve_product_id() helper (same
# validation as create.sh --product-id: must exist, type='project', matching
# brand) and UPDATEs tickets.tickets.parent_id for the ticket at --id.
# Used by prepare_feature (ticket-mcp) so the validation lives in one place.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" product_id="" brand=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)         id="$2"; shift 2 ;;
      --product-id) product_id="$2"; shift 2 ;;
      --brand)      brand="$2"; shift 2 ;;
      *)            echo "Unknown set-parent option: $1" >&2; exit 2 ;;
    esac; done

  if [[ -z "$id" || -z "$product_id" ]]; then
    echo "ERROR: --id and --product-id are required." >&2
    exit 2
  fi

  local pod; pod=$(_pgpod)

  if [[ -z "$brand" ]]; then
    brand=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT brand FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
)
    if [[ -z "$brand" ]]; then
      echo "ERROR: ticket '$id' not found" >&2
      exit 2
    fi
  fi

  local parent_uuid
  parent_uuid=$(_resolve_product_id "$pod" "$product_id" "$brand") || exit 2

  _exec_sql "$pod" -v ext_id="$id" -v parent="$parent_uuid" <<'EOF' >/dev/null
UPDATE tickets.tickets SET parent_id = :'parent'::uuid WHERE external_id = :'ext_id';
EOF

  echo "Ticket $id parent_id set to $parent_uuid"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
