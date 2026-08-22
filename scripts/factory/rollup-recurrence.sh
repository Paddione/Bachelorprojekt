#!/usr/bin/env bash
# scripts/factory/rollup-recurrence.sh — findet Mishap-Eintraege, die ueber
# Rollup-Zyklen hinweg wiederkehren [T013305 Mechanismus A].
#
# Warum: Der Dedupe beim Melden prueft nur offene Tickets + Buffer, nie die
# Batch-Historie — der SCS-Embed-Fehler (localhost:8081) fiel in Batch 08-20
# UND 08-22 ohne Korrelation. Dieses Skript liest den Verlaufs-Strom ALLER
# Container-Batches (inkl. geschlossener Container) und gruppiert Eintraege
# nach normalisiertem Component+Titel.
#
# Eingabe-Format auf stdin (wie mishap-rollup.sh es aus ticket_comments liest):
#   <<<ROLLUP-CYCLE>>>\t<container-id>   wechselt den aktuellen Zyklus
#   <<<ROLLUP-COMMENT>>>                 Kommentargrenze (Sentinel wie in
#                                        rollup-plan-tasks.sh)
#   Batch-Bodies mit '### Mishap-Rollup'-Header; Eintraege im Muster
#   '**N. Titel** (typ, komponente)'.
#
# Usage: rollup-recurrence.sh [--all] < verlauf
#          --all   alle Rezurrenz-Paare als '<count>\t<title>\t<meta>\t<slug1,slug2>'
#                  (count = Anzahl Zyklen, >= 2; Slugs sortiert nach Zyklus-Reihenfolge)
# Exit: 0 = Ausgabe erzeugt | 3 = keine Rezurrenz | 2 = Aufruffehler
set -euo pipefail

usage() {
  sed -n 's/^# \(Usage:.*\)$/\1/p; s/^#          \( *--all.*\)$/  \1/p' "$0"
}

MODE="all"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)  MODE="all"; shift ;;
    --help) usage; exit 0 ;;
    *) echo "rollup-recurrence: unbekanntes Argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

_cycle=""
declare -A OCC_COUNT=()   # key -> Anzahl Zyklen
declare -A OCC_SLUGS=()   # key -> kommagetrennte Container-IDs
declare -A OCC_TITLE=()   # key -> Titel der ersten Schreibweise
declare -A OCC_META=()    # key -> Meta der ersten Schreibweise

_norm() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' '; }

while IFS= read -r line; do
  case "$line" in
    '<<<ROLLUP-CYCLE>>>'*)
      _cycle="${line#<<<ROLLUP-CYCLE>>>$'\t'}"
      _cycle="$(printf '%s' "${line#<<<ROLLUP-CYCLE>>>}" | sed 's/^[[:space:]]*//')"
      continue ;;
    '<<<ROLLUP-COMMENT>>>'|'### '*) continue ;;
    \*\*[0-9]*.\ *)
      # '**N. Titel** (typ, komp)'
      entry="$(printf '%s' "$line" | grep -E '^\*\*[0-9]+\. .+\)$' || true)"
      [[ -n "$entry" ]] || continue
      title="$(printf '%s\n' "$entry" | sed -E 's/^\*\*[0-9]+\. (.*)\*\* \(.*\)$/\1/')"
      meta="$(printf '%s\n' "$entry"  | sed -E 's/^\*\*[0-9]+\. .*\*\* \((.*)\)$/\1/')"
      [[ -n "$title" && -n "$meta" && -n "$_cycle" ]] || continue
      key="$(_norm "$title")|$(_norm "$meta")"
      if [[ -z "${OCC_COUNT[$key]:-}" ]]; then
        OCC_COUNT[$key]=0
        OCC_SLUGS[$key]=""
      fi
      # Mehrfachnennung im selben Zyklus zaehlt einmal.
      if [[ ";${OCC_SLUGS[$key]};" != *";${_cycle};"* ]]; then
        OCC_COUNT[$key]=$(( ${OCC_COUNT[$key]} + 1 ))
        OCC_SLUGS[$key]="${OCC_SLUGS[$key]},${_cycle}"
      fi
      # Titel/Meta der ERSTEN Schreibweise behalten (Anzeige-Kanonik).
      if [[ -z "${OCC_TITLE[$key]:-}" ]]; then
        OCC_TITLE[$key]="$title"
        OCC_META[$key]="$meta"
      fi
      ;;
  esac
done

found=0
while IFS= read -r outline; do
  printf '%s\n' "$outline"
  found=1
done < <(
  for key in "${!OCC_COUNT[@]}"; do
    n="${OCC_COUNT[$key]}"
    [[ "$n" -ge 2 ]] || continue
    slugs="${OCC_SLUGS[$key]#,}"
    printf '%d\t%s\t%s\t%s\n' "$n" "${OCC_TITLE[$key]}" "${OCC_META[$key]}" "$slugs"
  done | sort -t$'\t' -k4
)
[[ "$found" -eq 1 ]] || exit 3
exit 0
