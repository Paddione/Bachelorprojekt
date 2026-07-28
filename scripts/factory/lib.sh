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

  # If context is a dev cluster, append -dev to namespace
  if [[ "$FACTORY_CTX" == k3d-* || "$FACTORY_CTX" == *-dev ]]; then
    if [[ "$FACTORY_NS" == "workspace" ]]; then
      FACTORY_NS="workspace-dev"
    elif [[ "$FACTORY_NS" == "workspace-korczewski" ]]; then
      FACTORY_NS="workspace-korczewski-dev"
    fi
  fi
}

# [T002386] Serverseitig auf Phase Running filtern. kubectl sortiert nach Name,
# also kann ein liegengebliebener Succeeded/Failed-Pod (Rollout, Node-Drain,
# Eviction) vor dem lebenden sortieren; `head -1` traf dann zuverlaessig den
# toten, und jeder Aufruf starb einen Schritt spaeter in `kubectl exec` mit
# "cannot exec into a container in a completed pod".
#
# Das hat am 2026-07-28 die GESAMTE korczewski-Brand fuer den Dispatcher blind
# gemacht: queue.sh, slots.sh und schedule.sh scheiterten dort ausnahmslos.
# Sichtbar wurde es nicht, weil schedule.sh den count-Aufruf als
# `2>/dev/null || echo 0` absichert und den Ausfall damit als "0 belegte Slots"
# wertet.
#
# Dies ist eine eigenstaendige Kopie neben scripts/vda/ticket/_ticket-core.sh —
# der T002307-Fix dort erreichte diesen Pfad nicht. Guard gegen weitere Kopien:
# scripts/check-pod-phase-filter.sh (seit T002439 ein eigenes Skript statt inline
# im Test; prueft pro Treffer statt pro Datei und deckt scripts/ UND tests/ ab).
# Aufrufbar als `task quality:pod-phase-filter`.
factory_pgpod() {
  local pod all
  pod=$(kubectl get pod -n "$FACTORY_NS" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' \
    --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    # Nur auf dem Fehlerpfad nochmal ungefiltert fragen, um "gar kein Pod" von
    # "Pods da, keiner Running" zu unterscheiden. Der Happy Path bleibt ein Call.
    all=$(kubectl get pod -n "$FACTORY_NS" --context "$FACTORY_CTX" -l 'app in (shared-db, shared-db-dev)' -o name 2>/dev/null | tr '\n' ' ')  # pod-phase-filter: intentional-unfiltered
    if [[ -n "${all// /}" ]]; then
      echo "{\"error\":\"no Running shared-db pod in ${FACTORY_NS}; found but not Running: ${all% }\"}" >&2
    else
      echo '{"error":"no shared-db pod found"}' >&2
    fi
    exit 2
  fi
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
