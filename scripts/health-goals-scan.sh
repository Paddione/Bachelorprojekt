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
#        bash scripts/health-goals-scan.sh [--fast] --all   (alle Ziele des Artefakts)
#        ... --values-file <values> --complete-file <marker>  (vorhandenes Messpaket übernehmen)
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
ALL=0
IDS=()
REUSE_VALUES=""; REUSE_COMPLETE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --fast) FAST=1; shift ;;
    --all)  ALL=1; shift ;;
    --values-file|--complete-file)
      [ $# -ge 2 ] || { echo "fehlendes Argument: $1" >&2; exit 2; }
      if [ "$1" = --values-file ]; then REUSE_VALUES="$2"; else REUSE_COMPLETE="$2"; fi
      shift 2 ;;
    --*)    echo "unbekanntes Flag: $1" >&2; exit 2 ;;
    *)      IDS+=("$1"); shift ;;
  esac
done

if [ "${#IDS[@]}" -eq 0 ] && [ "$ALL" -eq 0 ]; then
  echo "Usage: bash scripts/health-goals-scan.sh [--fast] (--all | <GOAL-ID> [<GOAL-ID> ...])" >&2
  exit 2
fi
if [ "$ALL" -eq 1 ] && [ "${#IDS[@]}" -gt 0 ]; then
  echo "--all und explizite Ziel-IDs schließen sich aus" >&2
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

# Vollscan: jede definierte ID wird angefordert — keine wird weggefiltert.
[ "$ALL" -eq 1 ] && mapfile -t IDS <<< "$KNOWN"

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
#
# --values-file/--complete-file übernehmen ein bereits gemessenes Paket (Nightly-
# Workflow): dann wird nicht erneut gemessen, aber nur ein vollständiges Paket
# wird akzeptiert.
if [ -n "$REUSE_VALUES" ] || [ -n "$REUSE_COMPLETE" ]; then
  if [ ! -f "$REUSE_VALUES" ] || [ ! -f "$REUSE_COMPLETE" ] || [ "$(cat "$REUSE_COMPLETE")" != complete ]; then
    echo "vorhandenes Messpaket fehlt oder ist unvollständig" >&2; exit 1
  fi
  cp "$REUSE_VALUES" "$VALUES"
else
  HG_VALUES_FILE="$VALUES" bash scripts/health-goals-check.sh "${FLAGS[@]}" >&2 || true
fi

# HG_VALUES_FILE enthält Zeilen "<id> <actual> <cmp> <target>" — nur für
# tatsächlich gemessene Ziele. Der dokumentierte Wert wird an dieser Stelle
# bewusst NICHT eingesetzt.
HG_SCAN_COMPLETION_FILE="$REUSE_COMPLETE" python3 - "$VALUES" "${IDS[@]}" <<'PY'
import datetime, json, os, sys

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

# Ein übernommenes Paket behält seine Beobachtungszeit (mtime der Marker-Datei).
completion = os.environ.get("HG_SCAN_COMPLETION_FILE")
if completion:
    observed = datetime.datetime.fromtimestamp(os.stat(completion).st_mtime, datetime.timezone.utc).isoformat()
    for item in out:
        item["measured_at"] = observed

print(json.dumps(out))
PY
