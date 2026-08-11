#!/usr/bin/env bash
# scripts/runtime-drift-check.sh — Laufzeit-Drift-Guard (T003825).
#
# Prueft, ob gemergte Fixes REAL laufen:
#   1) MCP-Prozesse laufen gegen ersetzte Binaries (alte Inode) -> Drift.
#   2) DB-Funktionen tragen die Marker ihrer Migrationen nicht  -> Drift.
#
# Der Guard MELDET nur, er greift nicht ein: kein kill, kein Migrationseinspielen.
# Exit: 0 = kein Drift, 1 = mindestens ein Drift. Unerreichbare DB oder nicht
# lesbares /proc/<pid>/exe (fremder Benutzer) werden uebersprungen und zaehlen
# nicht als Drift.
#
# Overrides:
#   RUNTIME_DRIFT_REGISTRY   mcp.yaml-Registry (default docs/agent-guide/registry/mcp.yaml)
#   RUNTIME_DRIFT_MIGRATIONS  Verzeichnis mit *.sql-Migrationen (default scripts/one-shot)
#   RUNTIME_DRIFT_CTX         kubectl-Kontext der DB (default k3d-mentolder-dev)
#   RUNTIME_DRIFT_NS          Namespace der shared-db (default workspace)
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${RUNTIME_DRIFT_REGISTRY:-$REPO_ROOT/docs/agent-guide/registry/mcp.yaml}"
MIGRATIONS_DIR="${RUNTIME_DRIFT_MIGRATIONS:-$REPO_ROOT/scripts/one-shot}"
DB_CTX="${RUNTIME_DRIFT_CTX:-k3d-mentolder-dev}"
DB_NS="${RUNTIME_DRIFT_NS:-workspace}"

DRIFT_COUNT=0

report() {
  DRIFT_COUNT=$((DRIFT_COUNT + 1))
  echo "DRIFT: $*"
}

# ── Pruefer 1: MCP-Prozesse gegen ihre Binaries ───────────────────────────
# Liest jeden clients:-Eintrag mit transport: stdio und dessen command-Feld
# aus der Registry und meldet laufende Prozesse, deren Binary ersetzt wurde.
_check_binary() {
  local name="$1" cmd="$2" bin="" pid="" exe="" base="" h1="" h2="" start=""
  if [[ "$cmd" != /* ]]; then
    bin="$(command -v "$cmd" 2>/dev/null)" || return 0
  else
    bin="$cmd"
  fi
  base="$(basename "$bin")"
  for proc in /proc/[0-9]*/exe; do
    [ -e "$proc" ] || continue
    pid="${proc#/proc/}"; pid="${pid%/exe}"
    exe="$(readlink "$proc" 2>/dev/null)" || continue
    # Drift-Signal: die Binary wurde ersetzt/geloescht, der Prozess laeuft mit
    # der alten Inode. Der Suffix steht NACH dem Pfad — erst abtrennen, dann
    # gegen die registrierte Binary vergleichen.
    if [[ "$exe" == *" (deleted)"* ]]; then
      exe="${exe% (deleted)}"
      if [ "$exe" = "$bin" ] || [[ "$exe" == */"$base" ]]; then
        start="$(ps -o lstart= -p "$pid" 2>/dev/null | sed 's/^ *//')"
        report "Prozess $pid ($start) laeuft mit ersetzter/geloeschter Binary $bin (Registry: $name) — kill $pid; der Server startet beim naechsten Tool-Aufruf neu"
        continue
      fi
      continue
    fi
    # Kein (deleted): nur Prozesse dieser Binary pruefen (exakter Pfad oder
    # Basenamen-Match, damit Wrapper/npx auf Interpretern nicht treffen).
    if [ "$exe" != "$bin" ] && [[ "$exe" != */"$base" ]]; then
      continue
    fi
    [ -f "$bin" ] || continue
    h1="$(sha256sum "/proc/$pid/exe" 2>/dev/null | awk '{print $1}')"
    h2="$(sha256sum "$bin" 2>/dev/null | awk '{print $1}')"
    if [ -n "$h1" ] && [ -n "$h2" ] && [ "$h1" != "$h2" ]; then
      start="$(ps -o lstart= -p "$pid" 2>/dev/null | sed 's/^ *//')"
      report "Prozess $pid ($start) weicht von Binary $bin ab (Registry: $name, sha256 $h1 != $h2) — kill $pid; der Server startet beim naechsten Tool-Aufruf neu"
    fi
  done
}

check_processes() {
  [ -f "$REGISTRY" ] || { echo "Uebersprungen: Registry $REGISTRY nicht gefunden"; return 0; }
  local section="" name="" cmd="" transport=""
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%$'\r'}"
    case "$line" in
      'clients:')
        section="clients"; continue;;
      ''|'#'*)
        continue;;
      [a-z]*)
        section=""; continue;;
    esac
    [ "$section" = "clients" ] || continue
    if [[ "$line" =~ ^[[:space:]]{2}([a-z0-9_-]+):[[:space:]]*$ ]]; then
      name="${BASH_REMATCH[1]}"; cmd=""; transport=""
      continue
    fi
    if [[ "$line" =~ ^[[:space:]]{4}transport:[[:space:]]*(stdio|http|sse).*$ ]]; then
      transport="${BASH_REMATCH[1]}"
    elif [[ "$line" =~ ^[[:space:]]{4}command:[[:space:]]*([^#].*)$ ]]; then
      [ -n "$name" ] || continue
      cmd="${BASH_REMATCH[1]% *}"
      if [ "$transport" = "stdio" ]; then
        _check_binary "$name" "$cmd"
      fi
    fi
  done < "$REGISTRY"
}

# ── Pruefer 2: DB-Funktionen gegen ihre Migrationen ───────────────────────
# Sucht in scripts/one-shot/*.sql Kommentarzeilen der Form
#   -- RUNTIME-CHECK: function=<schema>.<funktion> marker=<substring>
# und prueft, ob pg_proc.prosrc der Funktion den Marker traegt.
_db_pod() {
  command -v kubectl >/dev/null 2>&1 || return 1
  kubectl get pod -n "$DB_NS" --context "$DB_CTX" --request-timeout=5s \
    -l app=shared-db -o name 2>/dev/null | head -1
}

_db_has_marker() {
  local pod="$1" schema="$2" fn="$3" marker="$4"
  local out
  out="$(kubectl exec "$pod" -n "$DB_NS" --context "$DB_CTX" --request-timeout=15s \
      -c postgres -- psql -U postgres -d website -qtAc \
      "SELECT prosrc LIKE '%${marker}%' FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${schema}' AND p.proname = '${fn}';" 2>/dev/null)"
  [ "$out" = "t" ]
}

check_db() {
  [ -d "$MIGRATIONS_DIR" ] || { echo "Uebersprungen: Migrationsverzeichnis $MIGRATIONS_DIR nicht gefunden"; return 0; }
  local pod="" file="" line="" schema="" fn="" marker=""
  pod="$(_db_pod)" || { echo "Uebersprungen: keine erreichbare shared-db (ctx=$DB_CTX ns=$DB_NS)"; return 0; }
  [ -n "$pod" ] || { echo "Uebersprungen: kein shared-db-Pod (ctx=$DB_CTX ns=$DB_NS)"; return 0; }
  while IFS= read -r -d '' file; do
    while IFS= read -r line; do
      [[ "$line" == *"RUNTIME-CHECK:"* ]] || continue
      [[ "$line" =~ function=([a-z_]+)\.([a-z_]+)[[:space:]]+marker=([^ ]+) ]] || continue
      schema="${BASH_REMATCH[1]}"; fn="${BASH_REMATCH[2]}"; marker="${BASH_REMATCH[3]}"
      if ! _db_has_marker "$pod" "$schema" "$fn" "$marker"; then
        report "DB-Funktion $schema.$fn traegt Marker '$marker' nicht (Migration: $file)"
      fi
    done < "$file"
  done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' -print0)
}

# ── Hauptlauf ─────────────────────────────────────────────────────────────
echo "runtime-drift-check: Registry=$REGISTRY Migrations=$MIGRATIONS_DIR"
check_processes
check_db
if [ "$DRIFT_COUNT" -gt 0 ]; then
  echo "runtime-drift-check: $DRIFT_COUNT Drift-Befund(e) — meldend, kein Eingriff."
  exit 1
fi
echo "runtime-drift-check: kein Laufzeit-Drift."
exit 0
