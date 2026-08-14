#!/usr/bin/env bash
# scripts/factory/mishap-rollup-artifacts.sh — erzeugt .ticket + specs-Delta fuer
# den Zyklus-Change des Mishap-Rollup-Generators [T005031].
#
# Der Generator (mishap-rollup.sh) erzeugt pro Zyklus einen Change-Ordner unter
# openspec/changes/ mit proposal.md und tasks.md. Damit der Change
# openspec-validierbar ist (openspec.sh validate ist fail-closed: missing specs/
# delta dir, no .ticket link), schreibt dieses Skript die beiden fehlenden
# Artefakte:
#   - <dir>/.ticket          Container-Ticket-ID (T002836-Konvention)
#   - <dir>/specs/<slug>.md  ADDED-Requirements-Delta aus den Batch-Eintraegen
#
# Die Batch-Eintraege kommen via stdin (Kommentar-Body des Flushers, Eintraege im
# Format "**N. Titel** (typ, komponente)"); leere Eingabe bzw. keine Eintraege
# sind ein Fehler (Exit 1), damit nie ein leeres Delta entsteht.
#
# Usage: mishap-rollup-artifacts.sh --slug <slug> --change-dir <dir> --container <id> < batch
# Exit: 0 = Artefakte geschrieben | 1 = keine Eintraege | 2 = Aufruffehler
set -euo pipefail

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^# \( *mishap-rollup-artifacts.sh --help\)$/\1/p' "$0"
}

if [[ "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SLUG="" CHANGE_DIR="" CONTAINER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) SLUG="$2"; shift 2 ;;
    --change-dir) CHANGE_DIR="$2"; shift 2 ;;
    --container) CONTAINER="$2"; shift 2 ;;
    *) echo "mishap-rollup-artifacts: unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ -z "$SLUG" || -z "$CHANGE_DIR" || -z "$CONTAINER" ]]; then
  echo "mishap-rollup-artifacts: --slug, --change-dir und --container sind Pflicht" >&2
  usage >&2
  exit 2
fi

# ── Batch-Eintraege aus stdin parsen ─────────────────────────────────────────
mapfile -t ENTRIES < <(grep -E '^\*\*[0-9]+\. .+\)$' || true)
if [[ "${#ENTRIES[@]}" -eq 0 ]]; then
  echo "mishap-rollup-artifacts: FEHLER — keine Batch-Eintraege in der Eingabe (leerer Batch?)" >&2
  exit 1
fi

# ── Artefakte schreiben ──────────────────────────────────────────────────────
mkdir -p "$CHANGE_DIR/specs"

printf '%s' "$CONTAINER" > "$CHANGE_DIR/.ticket"

{
  printf -- '---\ntitle: "%s — Mishap-Bundle"\nticket_id: %s\n---\n\n' "$SLUG" "$CONTAINER"
  printf -- '## ADDED Requirements\n'
  for entry in "${ENTRIES[@]}"; do
    title="$(printf '%s\n' "$entry" | sed -E 's/^\*\*[0-9]+\. (.*)\*\* \(.*\)$/\1/')"
    meta="$(printf '%s\n' "$entry" | sed -E 's/^\*\*[0-9]+\. .*\*\* \((.*)\)$/\1/')"
    printf '\n### Requirement: %s\n\n' "$title"
    printf 'The rollup bundle SHALL address the mishap "%s" (%s).\n\n' "$title" "$meta"
    printf '#### Scenario: %s is covered by the bundle\n\n' "$title"
    printf -- '- **GIVEN** a batch entry "%s" (%s) on the rollup container ticket\n' "$title" "$meta"
    printf -- '- **WHEN** the rollup generator produces the cycle change\n'
    printf -- '- **THEN** the bundle SHALL cover the mishap\n'
  done
} > "$CHANGE_DIR/specs/$SLUG.md"

echo "mishap-rollup-artifacts: ${#ENTRIES[@]} Eintraege → ${CHANGE_DIR}/.ticket + ${CHANGE_DIR}/specs/${SLUG}.md"
