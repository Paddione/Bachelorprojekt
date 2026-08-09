#!/usr/bin/env bash
# Erzeugt aus bats-junit-Reporten das Gewichts-Manifest tests/spec/.spec-runtime.tsv
# (Sekunden\tPfad, nach Pfad sortiert). [T003025]
#
# bats schreibt bei `--report-formatter junit -o <dir>` eine report.xml pro Lauf
# mit einem <testsuite>-Block je Datei. Das junit-XML nennt die Datei meist nur
# mit Basename — es gibt aber auch Laeufe, in denen bats den Pfad absolutisiert
# (Quirk mit -j: Dateien direkt im CWD). Die Zuordnung zum Repo-Pfad passiert
# ueber die Dateiliste aus `find tests/spec -name '*.bats'`: erst exakter
# Pfadmatch, dann Basename-Match. Bei Namenskollisionen (es gibt mehrere
# coverage-gate.bats) entscheidet die @test-Anzahl (tests="N" im XML gegen
# `grep -c @test`); bleibt es mehrdeutig, bricht das Skript ab.
#
# Die junit-Reporte kommen aus CI: ci.yml startet die Spec-Suite mit
# BATS_JUNIT_DIR=junit-report und laedt die XMLs als Artifakt hoch
# (spec-junit-shard-N). Fuer ein vollstaendiges Manifest die Reporte ALLER vier
# Shards EINES Full-Suite-Laufs zusammenfuehren (jede Datei liegt in genau einem
# Shard). Mehrfachmessungen derselben Datei (z.B. ueber mehrere Laeufe) ergeben
# das Maximum — konservativ in Richtung des schwereren Shards.
#
# Usage:
#   bash scripts/spec-junit-weights.sh junit-report/report.xml [weitere.xml...]
#   bash scripts/spec-junit-weights.sh shard-*/report.xml --to tests/spec/.spec-runtime.tsv
#
# Optionen:
#   --spec-dir <dir>  Wurzel der Spec-Suite (Default: tests/spec)
#   --to <file>       Manifest schreiben statt stdout
#   -h|--help

set -euo pipefail

SPEC_DIR="tests/spec"
OUT=""
XMLS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --spec-dir) SPEC_DIR="${2:-}"; shift 2 ;;
    --to) OUT="${2:-}"; shift 2 ;;
    -h|--help) grep '^# ' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) XMLS+=("$1"); shift ;;
  esac
done

if [ "${#XMLS[@]}" -eq 0 ]; then
  echo "spec-junit-weights: mindestens eine report.xml angeben" >&2
  exit 2
fi

[ -d "$SPEC_DIR" ] || { echo "spec-junit-weights: --spec-dir '$SPEC_DIR' existiert nicht" >&2; exit 2; }

# Dateiliste der Suite, deterministisch sortiert (gleicher Kontrakt wie spec-shard.sh).
mapfile -t PATHS < <(find "$SPEC_DIR" -name '*.bats' -type f | LC_ALL=C sort)

# Basename -> Pfade (newline-join) und Pfad -> @test-Anzahl.
declare -A BY_BASE
declare -A TEST_CNT
for p in "${PATHS[@]}"; do
  base=$(basename "$p")
  BY_BASE["$base"]="${BY_BASE["$base"]:+${BY_BASE["$base"]}$'\n'}$p"
  n=$(grep -c '^[[:space:]]*@test' "$p" 2>/dev/null || true)
  [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null || n=1
  TEST_CNT["$p"]="$n"
done

_resolve() { # $1 = Suite-Name aus dem XML, $2 = tests-Anzahl. Gibt den Pfad aus.
  local name="$1" tests="$2" base cands resolved="" c
  # 1) Exakter Pfadmatch (bats absolutisiert Dateien direkt im CWD).
  for p in "${PATHS[@]}"; do
    [ "$p" = "$name" ] && { echo "$p"; return 0; }
  done
  # 2) Basename-Match.
  base=$(basename "$name")
  [ -n "${BY_BASE["$base"]:-}" ] || { echo "spec-junit-weights: '$name' ist keine Spec-Datei unter $SPEC_DIR" >&2; return 1; }
  IFS=$'\n' read -r -d '' -a cands <<< "${BY_BASE["$base"]}" || true
  if [ "${#cands[@]}" -eq 1 ]; then
    echo "${cands[0]}"; return 0
  fi
  for c in "${cands[@]}"; do
    [ -n "$c" ] || continue
    if [ "${TEST_CNT["$c"]}" = "$tests" ]; then
      if [ -n "$resolved" ]; then
        echo "spec-junit-weights: Kollision unaufloesbar fuer '$name' (tests=$tests): ${cands[*]}" >&2
        return 1
      fi
      resolved="$c"
    fi
  done
  if [ -z "$resolved" ]; then
    echo "spec-junit-weights: kein Pfad matcht '$name' (tests=$tests): ${cands[*]}" >&2
    return 1
  fi
  echo "$resolved"
}

# Testsuiten aus allen XMLs sammeln (Name, @test-Anzahl, Zeit).
declare -A SECS   # Pfad -> max(gemessene Sekunden)
for xml in "${XMLS[@]}"; do
  [ -f "$xml" ] || { echo "spec-junit-weights: '$xml' nicht gefunden" >&2; exit 2; }
  while IFS=$'\t' read -r tests time name; do
    [ -n "$name" ] || continue
    resolved=$(_resolve "$name" "$tests") || exit 1
    old=${SECS["$resolved"]:-0}
    if awk -v t="$time" -v o="$old" 'BEGIN { exit !(t > o) }'; then
      SECS["$resolved"]="$time"
    fi
  done < <(grep -o '<testsuite[^>]*>' "$xml" | awk '{
      name=""; tests=""; time=""
      if (match($0, /name="[^"]*"/)) name = substr($0, RSTART+6, RLENGTH-7)
      if (match($0, /tests="[0-9]+"/)) tests = substr($0, RSTART+7, RLENGTH-8)
      if (match($0, /time="[0-9.]+"/)) time = substr($0, RSTART+6, RLENGTH-7)
      if (name != "") print tests "\t" time "\t" name
    }')
done

# Manifest schreiben: nur Dateien MIT Messwert. Ohne Eintrag faellt spec-shard.sh
# deterministisch auf die @test-Anzahl zurueck.
MISSING=0
OUT_TSV=$(
  for p in "${PATHS[@]}"; do
    if [ -n "${SECS["$p"]:-}" ]; then
      printf '%.3f\t%s\n' "${SECS["$p"]}" "$p"
    else
      MISSING=$((MISSING + 1))
      echo "spec-junit-weights: keine Messung fuer $p — faellt auf @test-Anzahl zurueck" >&2
    fi
  done | LC_ALL=C sort -k2,2
)

if [ -n "$OUT" ]; then
  printf '%s\n' "$OUT_TSV" > "$OUT"
  echo "spec-junit-weights: $OUT geschrieben ($(printf '%s\n' "$OUT_TSV" | grep -c .) von ${#PATHS[@]} Dateien gemessen, $MISSING ohne Messung)" >&2
else
  printf '%s\n' "$OUT_TSV"
fi
