#!/usr/bin/env bash
#
# health-goals-scan.sh — gezielter Rescan einzelner Health-Ziele (T013306)
#
# Misst die übergebenen Ziel-IDs über scripts/health-goals-check.sh und liefert
# die FRISCH gemessenen Werte als JSON auf stdout.
#
# Read-only gegenüber der SSOT (REQ-HEALTH-GOALS-011): .claude/lib/goals.md und
# components/website/src/lib/sdlc/goals-data.generated.json werden weder
# geändert noch regeneriert — der frische Wert lebt ausschließlich in dieser
# Ausgabe. Insbesondere wird scripts/health-goals-update.sh hier NICHT aufgerufen.
#
# Usage: bash scripts/health-goals-scan.sh [--fast] <GOAL-ID> [<GOAL-ID> ...]
#
# stdout: JSON-Array, ein Objekt je ANGEFORDERTER ID, Reihenfolge wie übergeben:
#   [{"id":"G-CQ06","measurable":true,"actual":0,"cmp":"le","target":1},
#    {"id":"G-IF01","measurable":false}]
#
# Exit-Codes:
#   0  Messlauf durchgeführt (auch wenn einzelne Ziele nicht messbar waren)
#   2  Eingabefehler: fehlende oder unbekannte ID / unbekanntes Flag;
#      die Meldung auf stderr nennt die abgelehnte ID

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "kein git-Repo" >&2; exit 2; }

FAST=0
IDS=()
for a in "$@"; do
  case "$a" in
    --fast) FAST=1 ;;
    --*)    echo "unbekanntes Flag: $a" >&2; exit 2 ;;
    *)      IDS+=("$a") ;;
  esac
done

if [ "${#IDS[@]}" -eq 0 ]; then
  echo "Usage: bash scripts/health-goals-scan.sh [--fast] <GOAL-ID> [<GOAL-ID> ...]" >&2
  exit 2
fi

# Gültige Menge = id-Felder aus dem generierten Artefakt — dieselbe Liste, die
# das Dashboard anzeigt (REQ-HEALTH-GOALS-013). Eine reine Zeichen-Whitelist
# genügt nicht: sie ließe wohlgeformte, aber unbekannte IDs an --only= durch.
ARTIFACT="components/website/src/lib/sdlc/goals-data.generated.json"
KNOWN="$(python3 -c "
import json, sys
try:
    print('\n'.join(g['id'] for g in json.load(open('$ARTIFACT'))))
except Exception as exc:
    print(f'Artefakt nicht lesbar: {exc}', file=sys.stderr); sys.exit(3)")"
if [ $? -ne 0 ]; then
  echo "Kann gültige Ziel-IDs nicht laden: $ARTIFACT" >&2
  exit 2
fi

for id in "${IDS[@]}"; do
  printf '%s\n' "$KNOWN" | grep -qxF -- "$id" || {
    echo "unbekannte Ziel-ID (nicht im generierten Artefakt): $id" >&2
    exit 2
  }
done

VALUES="$(mktemp)"
trap 'rm -f "$VALUES"' EXIT

ONLY_CSV="$(IFS=,; echo "${IDS[*]}")"
FLAGS=(--quiet "--only=$ONLY_CSV")
[ "$FAST" -eq 1 ] && FLAGS+=(--fast)

# Report-Text gehört nicht auf stdout — dort steht ausschließlich das JSON.
# set -e bewusst NICHT gesetzt: der Checker endet bei verfehlten Zielen mit
# Exit ungleich 0, und das ist hier kein Fehler. Fehlende Zeilen in der
# Werte-Datei werden unten als measurable:false ausgewiesen (sichtbarer
# stiller Ausfall, Lehre aus T002648).
HG_VALUES_FILE="$VALUES" bash scripts/health-goals-check.sh "${FLAGS[@]}" >&2 || true

# HG_VALUES_FILE enthält Zeilen "<id> <actual> <cmp> <target>" — nur für
# tatsächlich gemessene Ziele. Der dokumentierte Wert wird an dieser Stelle
# bewusst NICHT eingesetzt.
python3 - "$VALUES" "${IDS[@]}" <<'PY'
import json, sys

values_path = sys.argv[1]
ids = sys.argv[2:]

measured = {}
with open(values_path) as fh:
    for line in fh:
        parts = line.split()
        if len(parts) < 4:
            continue
        gid, actual, cmp_, target = parts[0], parts[1], parts[2], parts[3]
        if cmp_ not in ("le", "ge", "eq"):
            continue
        try:
            actual_num = float(actual)
            target_num = float(target)
        except ValueError:
            continue
        if actual_num.is_integer():
            actual_num = int(actual_num)
        if target_num.is_integer():
            target_num = int(target_num)
        measured[gid] = {"actual": actual_num, "cmp": cmp_, "target": target_num}

out = []
for gid in ids:
    m = measured.get(gid)
    if m is None:
        out.append({"id": gid, "measurable": False})
    else:
        out.append({"id": gid, "measurable": True, **m})

print(json.dumps(out))
PY
