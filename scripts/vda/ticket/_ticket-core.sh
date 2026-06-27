#!/usr/bin/env bash
# scripts/vda/ticket/_ticket-core.sh
# Shared PG helpers for ticket subcommands. Sourced by ticket.sh and vda/ticket/*.sh.
# Expects: NS, CTX, DB, USER from sourcing context; defaults from TICKET_* env vars.

: "${NS:=${TICKET_NS:-workspace}}"
: "${CTX:=${TICKET_CTX:-fleet}}"
: "${DB:=website}"
USER="${TICKET_USER:-website}"

_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$NS" --context "$CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "ERROR: no shared-db pod found in namespace $NS (context $CTX)" >&2
    exit 1
  fi
  echo "$pod"
}

_exec_sql() {
  local pod="$1"; shift
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "${USER:-website}" -d "${DB:-website}" -qtA -v ON_ERROR_STOP=1 "$@"
}
