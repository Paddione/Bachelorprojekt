#!/usr/bin/env bash
# checks/run.sh — Exit 0 = gruen. Nur offline: kein Cluster, kein Netz, kein Modell.
# Geprueft wird das ERGEBNIS (readout.md) gegen das erwartete Bild, nicht der Quelltext.
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CASE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
IMG="$SCRIPT_DIR/topology.svg"
EXP="$SCRIPT_DIR/expected.json"
OUT="${BENCH_OUT:-$CASE_DIR/readout.md}"
fails=0
note() { printf 'FAIL %s\n' "$1" >&2; fails=$((fails + 1)); }
ok()   { printf 'ok   %s\n' "$1"; }

# (1) Bild vorhanden und nicht leer.
if [ -s "$IMG" ]; then ok "bild vorhanden: $(basename "$IMG")"
else note "bild fehlt oder leer: $IMG"; fi
case "$(basename "$IMG" | tr 'A-Z' 'a-z')" in
  *.svg) grep -q '<svg' "$IMG" 2>/dev/null && ok 'svg-wurzel vorhanden' || note 'kein <svg>-element' ;;
esac

# (2) expected.json lesbar und vollstaendig. Reines awk, kein python/json-Tool noetig.
json_array() {  # $1 = key; liefert einen Eintrag pro Zeile
  awk -v key="\"$1\"" '
    index($0, key) { f = 1; next }
    f {
      last = (index($0, "]") > 0)   # vor gsub pruefen: gsub entfernt die ]
      gsub(/[][",]/, "\n")
      print
      if (last) exit
    }
  ' "$EXP" | sed '/^[[:space:]]*$/d'
}
fields_json="$(json_array fields)"
forb_json="$(json_array forbidden)"
[ -n "$fields_json" ] && ok "expected.json fields: $(printf '%s\n' "$fields_json" | wc -l | tr -d ' ') eintraege" || note 'expected.json: fields leer'
[ -n "$forb_json" ]   && ok "expected.json forbidden: $(printf '%s\n' "$forb_json" | wc -l | tr -d ' ') eintraege" || note 'expected.json: forbidden leer'

# (3) Bildbindung: jedes Feld muss im Bild stehen, jeder Anker darf NICHT im Bild stehen.
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if grep -qF -- "$f" "$IMG" 2>/dev/null; then ok "feld im Bild: $f"
  else note "feld fehlt im Bild (expected.json widerspricht dem Asset): $f"; fi
done <<< "$fields_json"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if grep -qF -- "$f" "$IMG" 2>/dev/null; then note "verbotener Anker im Bild: $f"
  else ok "verbotener Anker nicht im Bild: $f"; fi
done <<< "$forb_json"

# (4) Ergebnis: Readout muss jedes Feld nennen und keinen Anker erfinden.
if [ -s "$OUT" ]; then ok "readout vorhanden: $OUT"
else note "kein Readout: $OUT (Ausgangszustand)"; fi
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if grep -qF -- "$f" "$OUT" 2>/dev/null; then ok "readout nennt $f"
  else note "readout nennt $f nicht"; fi
done <<< "$fields_json"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if grep -qF -- "$f" "$OUT" 2>/dev/null; then note "readout erfindet Anker: $f"
  else ok "readout ohne Anker $f"; fi
done <<< "$forb_json"

[ "$fails" -eq 0 ] || { printf '%s Invariante(n) verletzt\n' "$fails" >&2; exit 1; }
printf 'green: Bild und Readout konsistent\n'
