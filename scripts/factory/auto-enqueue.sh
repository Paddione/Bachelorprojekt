#!/usr/bin/env bash
# scripts/factory/auto-enqueue.sh — Lücke 3.1: plan_staged → backlog Auto-Übergang [T000730]
#
# Für jede Brand prüft dieses Skript alle Tickets in status='plan_staged' mit
# type='feature'. Wenn ALLE vier Readiness-Flags (spec_skizziert, abhaengigkeiten_klar,
# offene_fragen_geklaert, aufwand_geschaetzt) true sind, wird das Ticket via
# `ticket.sh enqueue` in 'backlog' überführt (idempotent — enqueue setzt nur wenn nötig).
#
# Usage: BRAND=<brand> bash scripts/factory/auto-enqueue.sh [--dry-run] [--help]
#
# Env:
#   BRAND              — mentolder|korczewski (required)
#   FACTORY_DRY_RESOLVE — wenn gesetzt, kurz-schließt factory_resolve() (offline-test)
#
# Rufen: wakeup.sh ruft dieses Skript VOR dem Dispatcher-Tick auf.
set -euo pipefail
HERE="$(dirname "${BASH_SOURCE[0]}")"
source "$HERE/lib.sh"

DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --help)
      echo "Usage: BRAND=<brand> bash $(basename "${BASH_SOURCE[0]}") [--dry-run]"
      echo "  auto-enqueue: plan_staged + alle Readiness-Flags true → backlog"
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# BRAND is always required
if [[ -z "${BRAND:-}" ]]; then
  echo "ERROR: BRAND env var is required (mentolder|korczewski)" >&2
  exit 1
fi

# Offline-test shortcut: wenn FACTORY_DRY_RESOLVE gesetzt, kein Cluster-Zugriff
if [[ -n "${FACTORY_DRY_RESOLVE:-}" ]]; then
  echo "auto-enqueue [DRY-RESOLVE]: ctx=dry ns=dry brand=${BRAND}"
  exit 0
fi

factory_resolve

# Readiness-vollständige plan_staged Feature-Tickets abfragen
READY_IDS=$(cat <<'SQL' | factory_psql 2>/dev/null || echo ""
SELECT COALESCE(json_agg(external_id), '[]')
FROM tickets.tickets
WHERE type='feature'
  AND status='plan_staged'
  AND (readiness->>'spec_skizziert')::boolean IS TRUE
  AND (readiness->>'abhaengigkeiten_klar')::boolean IS TRUE
  AND (readiness->>'offene_fragen_geklaert')::boolean IS TRUE
  AND (readiness->>'aufwand_geschaetzt')::boolean IS TRUE;
SQL
)

if [[ -z "$READY_IDS" || "$READY_IDS" == "[]" || "$READY_IDS" == "null" ]]; then
  echo "auto-enqueue: keine ready plan_staged Tickets für ${BRAND}" >&2
  exit 0
fi

# JSON-Array → Zeilen (eine external_id pro Zeile)
mapfile -t IDS < <(echo "$READY_IDS" | jq -r '.[]')

for ext_id in "${IDS[@]}"; do
  [[ -z "$ext_id" ]] && continue
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "auto-enqueue [DRY-RUN]: würde ${ext_id} (${BRAND}) enqueuen"
    continue
  fi
  echo "auto-enqueue: enqueue ${ext_id} (${BRAND})" >&2
  BRAND="$BRAND" bash "$(dirname "${BASH_SOURCE[0]}")/../ticket.sh" enqueue --id "$ext_id"
done

echo "auto-enqueue: fertig (${#IDS[@]} Tickets geprüft, DRY_RUN=${DRY_RUN})"
