# scripts/vda/ticket/plan-get.sh — ticket plan-get subcommand
# Sourced by dispatchers.
#
# [T901719] Liest den gestagten Plan-Body aus tickets.ticket_plans (DB-SSOT).
# Fail-closed: keine Row -> Exit 1, kein Disk-Fallback.

source "$(dirname "${BASH_SOURCE[0]}")/_ticket-core.sh"

main() {
  local id=""
  while [[ $# -gt 0 ]]; do case "$1" in
      --id) id="$2"; shift 2 ;;
      -*)   echo "Unknown plan-get option: $1 (valid: --id <ID>)" >&2; exit 2 ;;
      *)    if [[ -z "$id" ]]; then id="$1"; shift; else echo "Unexpected argument: $1 (valid: --id <ID>)" >&2; exit 2; fi ;;
    esac; done
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  if _ticket_offline_refuse_read "plan-get" "--id" "$id"; then exit 9; fi
  local pod; pod=$(_pgpod)
  # Neueste Row zuerst (staged, dann archiviert): ein Ticket hat höchstens
  # eine offene Staged-Row pro Slug; ORDER BY macht die Auswahl stabil.
  local _row
  _row=$(_exec_sql "$pod" -v ext_id="$id" <<'EOF'
SELECT tp.content FROM tickets.ticket_plans tp
  JOIN tickets.tickets t ON t.id = tp.ticket_id
 WHERE t.external_id = :'ext_id'
 ORDER BY tp.archived_at DESC, tp.id DESC LIMIT 1;
EOF
)
  if [[ -z "${_row//[[:space:]]/}" ]]; then
    echo "ERROR: no staged plan for $id." >&2
    exit 1
  fi
  printf '%s\n' "$_row"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
