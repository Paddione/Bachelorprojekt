#!/usr/bin/env bash
# scripts/openspec-orphan-archive.sh - Archivierte verwaiste OpenSpec-Changes.
#
# T900338 - CI-Executor, der ohne discretionary Flags archiviert.
# SSOT: openspec/specs/openspec-workflow.md
#   "Orphaned changes are archived by a CI executor without discretionary flags"
#
# USAGE: openspec-orphan-archive.sh --slugs <a,b,...> [--out <dir>] [--dry-run]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/.." && pwd)"
export OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO_ROOT/openspec}"

DRY_RUN=false
SLUGS=""
OUT="${RUNNER_TEMP:-/tmp}/openspec-orphan-archive"

usage() { sed -n "2,4p" "$0"; exit "${1:-0}"; }

while [[ $# -gt 0 ]]; do case "$1" in
  --slugs)   SLUGS="$2"; shift 2 ;;
  --out)     OUT="$2"; shift 2 ;;
  --dry-run) DRY_RUN=true; shift ;;
  -h|--help) usage 0 ;;
  *) echo "Unbekannte Option: $1" >&2; usage 2 ;;
esac; done

# --slugs ist Pflicht
if [[ -z "$SLUGS" ]]; then
  usage 2
fi

# Ergebnis-Verzeichnis anlegen
mkdir -p "$OUT"
: > "$OUT/archived.txt"
: > "$OUT/failed.tsv"

archived=0
failed=0

IFS="," read -ra slug_list <<< "$SLUGS"
for slug in "${slug_list[@]}"; do
  [[ -z "$slug" ]] && continue

  # Existiert das Change-Verzeichnis? (ausser archive selbst)
  if [[ "$slug" == "archive" ]] || [[ ! -d "$OPENSPEC_ROOT/changes/$slug" ]]; then
    printf "%s\t-\tnot an open change\n" "$slug" >> "$OUT/failed.tsv"
    failed=$((failed + 1))
    continue
  fi

  # Ticket-ID lesen
  ticket="-"
  if [[ -f "$OPENSPEC_ROOT/changes/$slug/.ticket" ]]; then
    ticket="$(cat "$OPENSPEC_ROOT/changes/$slug/.ticket")"
  fi

  if $DRY_RUN; then
    echo "would archive $slug ($ticket)"
    archived=$((archived + 1))
    continue
  fi

  # Archivieren mit TICKET_OFFLINE=1 (keine DB-Abfrage im CI-Kontext)
  output="$(TICKET_OFFLINE=1 bash "$HERE/openspec.sh" archive "$slug" 2>&1)" || {
    # Fehlergrund: erste Zeile mit ERROR: oder letzte nicht-leere Zeile
    reason="$(printf "%s" "$output" | grep "^ERROR:" | head -1 | sed "s/^ERROR: *//" || true)"
    if [[ -z "$reason" ]]; then
      reason="$(printf "%s" "$output" | grep -v "^$" | tail -1)"
    fi
    # Tabs und Zeilenumbruecke durch Leerzeichen ersetzen
    reason="$(printf "%s" "$reason" | tr "\n\t" "  ")"
    printf "%s\t%s\t%s\n" "$slug" "$ticket" "$reason" >> "$OUT/failed.tsv"
    failed=$((failed + 1))
    continue
  }

  archived=$((archived + 1))
  echo "$slug" >> "$OUT/archived.txt"
done

echo "archived: $archived  failed: $failed"
exit 0
