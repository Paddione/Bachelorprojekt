#!/usr/bin/env bash
# scripts/factory/lib.sh — shared helpers for the Software Factory Dispatcher
# primitives (slots/queue/schedule/watchdog/metrics). SOURCE, do not execute.
#
#   BRAND               mentolder|korczewski → resolves FACTORY_NS
#   FACTORY_NS          explicit namespace (used when BRAND unset; default workspace)
#   FACTORY_CTX         kubectl context (default: fleet)
#   FACTORY_DRY_RESOLVE if set, callers print resolved ctx+ns and exit 0

factory_resolve() {
  case "${BRAND:-}" in
    mentolder)   FACTORY_NS="workspace" ;;
    korczewski)  FACTORY_NS="workspace-korczewski" ;;
    "")          : ;;
    *)           echo '{"error":"unknown BRAND (use mentolder|korczewski)"}' >&2; exit 2 ;;
  esac
  FACTORY_NS="${FACTORY_NS:-workspace}"
  FACTORY_CTX="${FACTORY_CTX:-fleet}"
}

factory_pgpod() {
  local pod
  pod=$(kubectl get pod -n "$FACTORY_NS" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then echo '{"error":"no shared-db pod found"}' >&2; exit 2; fi
  echo "$pod"
}

# factory_psql — reads SQL from stdin, returns tab-less single-column rows.
# Forwards any extra args to psql (e.g. -v ext_id=… for bound params), mirroring
# ticket.sh's _exec_sql so callers can avoid interpolating into SQL.
factory_psql() {
  local pod; pod=$(factory_pgpod)
  kubectl exec -i "$pod" -n "$FACTORY_NS" --context "$FACTORY_CTX" -c postgres -- \
    psql -U website -d website -qtA -v ON_ERROR_STOP=1 "$@"
}
