# scripts/vda/ticket/update-fields.sh — ticket update-fields subcommand
# Sourced by dispatchers.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id="" title="" description=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)          id="$2"; shift 2 ;;
      --title)       title="$2"; shift 2 ;;
      --description) description="$2"; shift 2 ;;
      *)             echo "Unknown update-fields option: $1" >&2; exit 2 ;;
    esac; done

  if [[ -z "$id" ]]; then
    echo "ERROR: --id is required." >&2
    exit 2
  fi

  if [[ -z "$title" && -z "$description" ]]; then
    echo "ERROR: At least one field (--title or --description) is required." >&2
    exit 2
  fi

  _ticket_lock_guard "$id" || exit 7

  local pod
  pod=$(_pgpod)

  _exec_sql "$pod" \
    -v ext_id="$id" \
    -v title="$title" \
    -v description="$description" <<'EOF' >/dev/null
UPDATE tickets.tickets SET
  title = COALESCE(NULLIF(:'title', ''), title),
  description = COALESCE(NULLIF(:'description', ''), description)
WHERE external_id = :'ext_id';
EOF

  echo "Ticket $id fields updated"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
