#!/usr/bin/env bash
# scripts/factory/lib.sh — shared helpers for the Software Factory Dispatcher
# primitives (slots/queue/schedule/watchdog/metrics). SOURCE, do not execute.
#
#   BRAND               mentolder|korczewski → ROW FILTER (WHERE brand = …), NOT a namespace
#   FACTORY_NS          explicit namespace (default workspace)
#   FACTORY_CTX         kubectl context (default: k3d-mentolder-dev)
#   FACTORY_DRY_RESOLVE if set, callers print resolved ctx+ns and exit 0

# factory_resolve_data_ns — resolves the namespace/context of the SDLC DATABASE.
#
# [T002689] Die Brand geht hier BEWUSST NICHT in den Namespace ein. `brand` ist
# eine SPALTE in tickets.tickets, kein Ort: seit ADR-006 E3/T002626 liegen die
# SDLC-Zeilen BEIDER Brands in DERSELBEN lokalen Datenbank (korczewski|36,
# mentolder|2138). Die fruehere Abbildung brand→Namespace stammt aus der
# Zwei-Cluster-Zeit und schickte jeden korczewski-Aufruf in den nicht
# existierenden Namespace `workspace-korczewski`. Wo die Datenbank liegt, haengt
# allein am KONTEXT (FACTORY_CTX) — nicht daran, wessen Zeilen man lesen will.
# Wer die Abbildung wieder einbaut, bricht die korczewski-Brand erneut.
#
# BRAND bleibt validiert: der Zeilenfilter lebt davon, dass nur bekannte Werte
# durchgehen. Die echten Workload-Abbildungen brand→Namespace (Deploy, Promote,
# Ingress, scripts/lib/promote-phases.sh, prod-fleet/*) sind davon unberuehrt —
# dort betreiben die Brands tatsaechlich getrennte Workloads.
#
# Alle Konsumenten von FACTORY_NS/FACTORY_CTX sind `kubectl exec … -c postgres
# -- psql`, also reiner Datenpfad; ein Workload-Resolver waere ein Resolver ohne
# Aufrufer. Deshalb wird die Funktion benannt statt gespalten.
factory_resolve_data_ns() {
  case "${BRAND:-}" in
    mentolder|korczewski|"") : ;;
    *) echo '{"error":"unknown BRAND (use mentolder|korczewski)"}' >&2; exit 2 ;;
  esac
  FACTORY_NS="${FACTORY_NS:-workspace}"
  # Default-Kontext seit E3/T002626 (ADR-006): die SDLC-Daten liegen lokal.
  # Spiegelt scripts/ticket.sh und scripts/vda/ticket/_ticket-core.sh — die drei
  # Stellen zusammen aendern. FACTORY_CTX bleibt als Override gueltig.
  FACTORY_CTX="${FACTORY_CTX:-k3d-mentolder-dev}"

  # Namespace je Kontext — dieselbe Korrektur wie in scripts/ticket.sh [T002626]:
  # der SDLC-Cluster betreibt seine Datenbank in `workspace`, nicht in
  # `workspace-dev`. Der Kontextname taugt nicht als Anker dafuer.
  case "$FACTORY_CTX" in
    k3d-mentolder-dev|k3d-korczewski-dev) : ;;
    *-dev)
      case "$FACTORY_NS" in
        workspace) FACTORY_NS="workspace-dev" ;;
      esac
      ;;
  esac
}

# Alias unter dem historischen Namen — rund ein Dutzend Aufrufer (queue.sh,
# slots.sh, schedule.sh, metrics.sh, watchdog.sh, reconcile-ticket-status.sh, …)
# rufen `factory_resolve`. Sie bleiben in diesem Commit unangetastet [T002689/D3].
factory_resolve() { factory_resolve_data_ns; }

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
    # [T002689/D5] Die Meldung nennt Ort, Kontext UND den Hebel: ohne den
    # Override-Hinweis beschreibt sie nur einen Zustand, statt eine Handlung zu
    # ermoeglichen. Bleibt gueltiges JSON — Aufrufer parsen stderr mit jq.
    if [[ -n "${all// /}" ]]; then
      echo "{\"error\":\"no Running shared-db pod in namespace ${FACTORY_NS} (context ${FACTORY_CTX}); found but not Running: ${all% }; override the context with FACTORY_CTX\"}" >&2
    else
      echo "{\"error\":\"no shared-db pod found in namespace ${FACTORY_NS} (context ${FACTORY_CTX}); override the context with FACTORY_CTX\"}" >&2
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

# factory_backlog_count <brand> — Groesse des schedulebaren Backlogs einer Brand.
#
# [T002689/D4] FAIL-CLOSED: auf Erfolg genau eine Zahl auf stdout und rc=0, auf
# Fehler rc!=0 und KEINE Zahl. Der Aufrufer muss "Datenpfad unerreichbar" von
# "nichts zu tun" unterscheiden koennen.
#
# Ersetzt das Muster `queue.sh 2>/dev/null | jq 'length' 2>/dev/null || echo 0`.
# Das war doppelt defekt: queue.sh endet rc=2, jq bekommt LEEREN Input und
# liefert selbst rc=0 mit leerer Ausgabe — der `|| echo 0`-Zweig feuerte also
# nicht einmal, die Variable blieb schlicht leer. Der Ausfall einer Brand
# erschien als leerer Backlog; genau diese Klasse legte die korczewski-Brand am
# 2026-07-28 still lahm.
factory_backlog_count() {
  local brand="${1:-}" json count
  if [[ -z "$brand" ]]; then
    echo '{"error":"factory_backlog_count: brand argument required"}' >&2
    return 2
  fi
  json=$(BRAND="$brand" bash "$(dirname "${BASH_SOURCE[0]}")/queue.sh") || return $?
  count=$(printf '%s' "$json" | jq 'length') || return 3
  [[ "$count" =~ ^[0-9]+$ ]] || return 3
  printf '%s\n' "$count"
}
