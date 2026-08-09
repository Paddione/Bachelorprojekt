#!/usr/bin/env bash
# scripts/sdlc/migrate-customer-projects.sh — E4/T002722, ADR-006 Etappe 4.
#
# Kopiert die 41+23 Projekt-/Aufgaben-Zeilen aus tickets.tickets in
# public.customer_projects und haengt die FK-Kanten um.
#
# Vorbedingungen:
#   - App-Schicht bereits auf public.customer_projects umgestellt (dieser PR)
#   - FK-Kanten unbelegt (0 Zeilen — im SQL geprueft, nicht hier)
#   - Fleet-Cluster erreichbar (Kontext fleet, Namespace workspace)
#
# Unterbefehle:
#   copy     Fuehrt das Migrations-SQL aus (fleet, workspace)
#   verify   Zeilenzahl-Abgleich: 64 erwartet (41 Projekte + 23 Aufgaben)
#   status   Zeigt Zeilenzahlen beider Tabellen nebeneinander
#
# Globale Flags:
#   --dry-run   zeigt das auszufuehrende SQL, sendet nichts
set -euo pipefail

SRC_CTX="${SDLC_SRC_CTX:-fleet}"
SRC_NS="${SDLC_SRC_NS:-workspace}"
DB="${SDLC_DB:-website}"
DB_USER="${SDLC_DB_USER:-website}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$SCRIPT_DIR/../migrations/2026-08-09-customer-projects-copy.sql"
DRY_RUN=false

usage() {
  sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# Cluster-Zugriff (gleicher _pgpod wie migrate-tickets.sh)
_pod() {
  local ctx="$1" ns="$2" pod
  pod=$(kubectl get pod -n "$ns" --context "$ctx" \
          -l 'app in (shared-db, shared-db-dev)' \
          --field-selector status.phase=Running -o name 2>/dev/null | head -1)
  if [[ -z "$pod" ]]; then
    echo "ERROR: kein laufender shared-db-Pod in $ns (Kontext $ctx)" >&2
    return 1
  fi
  echo "$pod"
}

_psql() {
  local ctx="$1" ns="$2"; shift 2
  local pod; pod=$(_pod "$ctx" "$ns")
  kubectl exec -i "$pod" -n "$ns" --context "$ctx" -c postgres -- \
    psql -U "$DB_USER" -d "$DB" -qtA -v ON_ERROR_STOP=1 "$@"
}

cmd_copy() {
  if $DRY_RUN; then
    echo "[dry-run] Auf fleet/workspace auszufuehrendes SQL:"
    cat "$SQL_FILE"
    return 0
  fi

  # Prod-Write-Guard vor jeder schreibenden Prod-Operation
  if [[ -x "$SCRIPT_DIR/../prod-write-guard.sh" ]]; then
    bash "$SCRIPT_DIR/../prod-write-guard.sh" || return 1
  fi

  echo "== Fuehre Migrations-SQL aus (fleet/workspace) =="
  _psql "$SRC_CTX" "$SRC_NS" -f - < "$SQL_FILE"
  echo "Migration abgeschlossen."
}

cmd_verify() {
  if $DRY_RUN; then
    echo "[dry-run] Zeilenzahl-Abgleich: 64 erwartet (41 Projekte + 23 Aufgaben)"
    return 0
  fi

  local n
  n=$(_psql "$SRC_CTX" "$SRC_NS" -c \
    "SELECT count(*) FROM public.customer_projects")
  echo "customer_projects: $n Zeilen (erwartet: 64 — 41 Projekte + 23 Aufgaben)"
  if [[ "$n" -eq 64 ]]; then
    echo "✅ Zeilenzahl stimmt."
  else
    echo "⚠️  Zeilenzahl weicht ab (erwartet 64, ist $n) — bitte pruefen."
    return 1
  fi

  echo ""
  echo "== Feldvergleich pro id (erste 5 Zeilen als Stichprobe) =="
  _psql "$SRC_CTX" "$SRC_NS" -c \
    "SELECT cp.id, cp.title, cp.status, cp.type, cp.brand,
            t.title AS old_title, t.status AS old_status, t.type AS old_type
       FROM public.customer_projects cp
       JOIN tickets.tickets t ON t.id = cp.id
      ORDER BY cp.created_at
      LIMIT 5"
}

cmd_status() {
  echo "== tickets.tickets (type='project' oder type='chore' mit project-parent) =="
  _psql "$SRC_CTX" "$SRC_NS" -c \
    "SELECT brand, count(*) FROM tickets.tickets
      WHERE type='project'
         OR (type='chore' AND parent_id IN (SELECT id FROM tickets.tickets WHERE type='project'))
      GROUP BY brand"
  echo ""
  echo "== public.customer_projects =="
  _psql "$SRC_CTX" "$SRC_NS" -c \
    "SELECT brand, type, count(*) FROM public.customer_projects GROUP BY brand, type ORDER BY brand, type"
}

# --- main --------------------------------------------------------------------
CMD=""
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)   DRY_RUN=true; shift ;;
    -h|--help)   usage 0 ;;
    -*)          echo "Unbekannte Option: $1" >&2; usage 2 ;;
    *)           if [[ -z "$CMD" ]]; then CMD="$1"; else ARGS+=("$1"); fi; shift ;;
  esac
done

case "$CMD" in
  copy)    cmd_copy ;;
  verify)  cmd_verify ;;
  status)  cmd_status ;;
  ""|help) usage 0 ;;
  *)       echo "Unbekannter Befehl: $CMD" >&2; usage 2 ;;
esac
