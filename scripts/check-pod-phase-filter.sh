#!/usr/bin/env bash
# check-pod-phase-filter.sh — jede shared-db-Pod-Selektion muss auf Phase Running filtern.
#
# Warum: eine Selektion ohne --field-selector status.phase=Running kann einen Completed- oder
# Terminating-Pod liefern; das nachfolgende `kubectl exec` scheitert dann mit Exit-Code 1.
# Beobachtet im Verify von T002418 als "DB-Nachweis rc=1".
#
# Der Vorgaenger dieses Guards (T002386, inline in tests/spec/software-factory.bats) hatte zwei
# Blindstellen, die dieses Skript beseitigt:
#
#   1. Er scannte nur scripts/ mit --include='*.sh'. Sieben Dateien unter tests/ blieben
#      ungeprueft.
#   2. Er zaehlte PRO DATEI: enthielt eine Datei den Filter-String irgendwo, galt sie als sauber.
#      tests/spec/software-factory.bats fuehrte den String in seinem eigenen Guard-Testtext und
#      entkam damit trotz vier ungefilterter Selektionen.
#
# Die Datei-Granularitaet war damals damit begruendet, dass die Selektion ueber mehrere Zeilen
# umgebrochen sein darf (so steht sie in scripts/vda/ticket/_ticket-core.sh). Dieses Skript
# faltet Backslash-Fortsetzungen zu logischen Zeilen zusammen und prueft dann pro Treffer —
# damit ist der umgebrochene Fall abgedeckt, ohne die restliche Datei mitzuentschuldigen.
#
# Eine bewusst ungefilterte Selektion traegt den Marker `pod-phase-filter: intentional-unfiltered`
# auf derselben logischen Zeile. Ein Opt-out pro DATEI gaebe es nicht — das waere die
# Datei-Granularitaet durch die Hintertuer.
#
# Verwendung:
#   scripts/check-pod-phase-filter.sh [<wurzel> ...]   # ohne Argumente: scripts/ und tests/
#   scripts/check-pod-phase-filter.sh --print-roots    # gibt die Standardwurzeln aus
#
# Exit: 0 sauber, 1 mindestens eine ungefilterte Selektion, 2 Aufruffehler.

set -uo pipefail

DEFAULT_ROOTS=(scripts tests)

SELECTOR_PATTERN='app in (shared-db'   # pod-phase-filter: intentional-unfiltered
PHASE_FILTER='status.phase=Running'
OPT_OUT='pod-phase-filter: intentional-unfiltered'

usage() {
  echo "Usage: ${0##*/} [<wurzel> ...] | --print-roots" >&2
  echo "  Ohne Wurzeln werden die Repo-Standardwurzeln geprueft: ${DEFAULT_ROOTS[*]}" >&2
}

repo_root() { git rev-parse --show-toplevel 2>/dev/null || pwd; }

case "${1:-}" in
  --print-roots) printf '%s\n' "${DEFAULT_ROOTS[@]}"; exit 0 ;;
  -h|--help)     usage; exit 0 ;;
  --*)           echo "Unbekannte Option: $1" >&2; usage; exit 2 ;;
esac

roots=()
if [[ $# -gt 0 ]]; then
  roots=("$@")
else
  root="$(repo_root)"
  for r in "${DEFAULT_ROOTS[@]}"; do
    [[ -d "$root/$r" ]] && roots+=("$root/$r")
  done
fi
[[ ${#roots[@]} -gt 0 ]] || { echo "Keine existierende Scan-Wurzel gefunden." >&2; exit 2; }

# Backslash-Fortsetzungen zu logischen Zeilen falten und jede Selektion ohne Phasenfilter
# und ohne Opt-out-Marker als "<datei>:<zeile>: <inhalt>" melden. Gemeldet wird die Zeilennummer,
# an der die logische Zeile BEGINNT — dort steht die Selektion, die korrigiert werden muss.
offenders="$(
  find "${roots[@]}" -type f \( -name '*.sh' -o -name '*.bats' \) -print0 2>/dev/null \
    | xargs -0 -r awk -v sel="$SELECTOR_PATTERN" -v filt="$PHASE_FILTER" -v opt="$OPT_OUT" '
      function flush(  trimmed) {
        if (buf == "") return
        if (index(buf, sel) > 0 && index(buf, filt) == 0 && index(buf, opt) == 0) {
          trimmed = buf
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", trimmed)
          printf "%s:%d: %s\n", FILENAME, start, trimmed
        }
        buf = ""
      }
      FNR == 1 { flush() }                 # Dateiwechsel: offenen Puffer nicht mitschleppen
      { if (buf == "") start = FNR
        line = $0
        if (line ~ /\\[[:space:]]*$/) {    # Fortsetzung: Backslash weg, weitersammeln
          sub(/\\[[:space:]]*$/, " ", line)
          buf = buf line
          next
        }
        buf = buf line
        flush()
      }
      END { flush() }
    '
)"

if [[ -n "$offenders" ]]; then
  echo "Pod-Selektion ohne Phasenfilter (--field-selector ${PHASE_FILTER}):" >&2
  printf '%s\n' "$offenders" >&2
  echo >&2
  echo "Entweder den Filter ergaenzen, oder — wenn die Selektion bewusst ungefiltert ist —" >&2
  echo "den Marker '${OPT_OUT}' auf dieselbe logische Zeile setzen." >&2
  exit 1
fi

exit 0
