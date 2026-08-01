#!/usr/bin/env bash
# Partitioniert eine Liste von .bats-Dateien (stdin, eine pro Zeile) in
# --of M gleich schwere Buckets und gibt die Dateien von --shard N aus.
#
# Warum ueberhaupt: `Factory + OpenSpec + Guards` war mit ~400s der kritische
# Pfad jedes PRs (zweitlaengster Job: 165s). Die Suite ist durchsatz-, nicht
# tail-gebunden — rund 537s CPU-Arbeit. Mehr `bats -j` auf EINEM Runner ist
# damit ausgereizt (gemessen: zusaetzliche Within-File-Parallelisierung machte
# den Lauf 7% langsamer, weil die Maschine auf Datei-Ebene schon saettigt).
# Der einzige verbleibende Hebel sind mehr Runner, also Sharding. [T002500]
#
# Gewichtung nach `@test`-Anzahl, nicht nach Dateizahl: tests/spec/software-factory.bats
# haelt allein 495 der ~2300 Testfaelle (115s seriell). Ein Round-Robin ueber
# Dateinamen wuerde die schweren Dateien zufaellig verteilen, und der unglueckliche
# Shard bestimmt dann die Wall-Clock des gesamten Jobs — das Sharding brraechte
# dann fast nichts.
#
# Der Algorithmus (LPT: longest processing time first) MUSS deterministisch sein.
# Jeder der M CI-Jobs berechnet die Partition unabhaengig aus demselben Repo-Stand;
# waeren die Ergebnisse nicht bitgleich, liefen Dateien doppelt oder — schlimmer —
# gar nicht, und der Lauf saehe trotzdem gruen aus.
#
# Usage:
#   find tests/spec -name '*.bats' | bash scripts/spec-shard.sh --shard 2 --of 4
#   find tests/spec -name '*.bats' | bash scripts/spec-shard.sh --verify --of 4

set -euo pipefail

SHARD=""
TOTAL=""
VERIFY=false

while [ $# -gt 0 ]; do
  case "$1" in
    --shard) SHARD="${2:-}"; shift 2 ;;
    --of)    TOTAL="${2:-}"; shift 2 ;;
    --verify) VERIFY=true; shift ;;
    -h|--help)
      grep '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "spec-shard: unbekanntes Argument '$1'" >&2; exit 2 ;;
  esac
done

if [ -z "$TOTAL" ] || ! [[ "$TOTAL" =~ ^[0-9]+$ ]] || [ "$TOTAL" -lt 1 ]; then
  echo "spec-shard: --of <positive Zahl> erforderlich" >&2
  exit 2
fi

if ! $VERIFY; then
  if [ -z "$SHARD" ] || ! [[ "$SHARD" =~ ^[0-9]+$ ]] || [ "$SHARD" -lt 1 ] || [ "$SHARD" -gt "$TOTAL" ]; then
    echo "spec-shard: --shard muss zwischen 1 und $TOTAL liegen (war: '${SHARD:-}')" >&2
    exit 2
  fi
fi

# Eingabe einlesen, leere Zeilen weg, sortieren. Das Sortieren ist Teil des
# Determinismus-Kontrakts: `find` liefert Verzeichniseintraege in Inode-Reihenfolge,
# die zwischen zwei Checkouts derselben Commit-SHA abweichen kann.
INPUT=$(grep -v '^[[:space:]]*$' | LC_ALL=C sort -u || true)

if [ -z "$INPUT" ]; then
  exit 0
fi

# Gewicht je Datei = Anzahl @test-Bloecke, mindestens 1. Eine nicht lesbare oder
# testfreie Datei faellt so nicht aus der Partition heraus — sie wiegt nur wenig.
WEIGHTED=$(
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$(grep -c '^[[:space:]]*@test' "$f" 2>/dev/null || true)
    [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null || n=1
    printf '%s\t%s\n' "$n" "$f"
  done <<< "$INPUT"
)

# LPT-Greedy in awk: absteigend nach Gewicht, jede Datei in den aktuell
# leichtesten Bucket. Bei Gewichtsgleichheit entscheidet der Pfad (sort -k2),
# bei Bucket-Gleichstand der niedrigste Index — beides rein deterministisch.
PARTITION=$(
  printf '%s\n' "$WEIGHTED" \
    | LC_ALL=C sort -k1,1nr -k2,2 \
    | awk -v total="$TOTAL" '
        BEGIN { FS = "\t"; for (i = 1; i <= total; i++) load[i] = 0 }
        {
          best = 1
          for (i = 2; i <= total; i++) if (load[i] < load[best]) best = i
          load[best] += $1
          print best "\t" $2
        }
      '
)

# Extraktion eines Shards aus der Partition. Bewusst als Funktion, damit
# --verify EXAKT denselben Pfad prueft, den CI spaeter benutzt. Verifizierte
# man stattdessen die interne Partition, bliebe ein Fehler in genau diesem
# Filter unentdeckt — und der aeussert sich als stiller Dateiverlust: der Shard
# laeuft gruen durch, weil die verschluckten Tests nie ausgefuehrt wurden.
_extract_shard() { # $1 = Shard-Index
  printf '%s\n' "$PARTITION" | awk -F'\t' -v s="$1" '$1 == s { print $2 }'
}

if $VERIFY; then
  in_count=$(printf '%s\n' "$INPUT" | grep -c .)
  union=$(for i in $(seq 1 "$TOTAL"); do _extract_shard "$i"; done)
  union_lines=$(printf '%s\n' "$union" | grep -c .)
  union_uniq=$(printf '%s\n' "$union" | LC_ALL=C sort -u | grep -c .)

  if [ "$in_count" -ne "$union_lines" ] || [ "$in_count" -ne "$union_uniq" ]; then
    echo "spec-shard: FEHLER — Shard-Ausgaben unvollstaendig oder ueberlappend (in=$in_count ausgegeben=$union_lines eindeutig=$union_uniq)" >&2
    exit 1
  fi
  if [ "$(printf '%s\n' "$union" | LC_ALL=C sort)" != "$(printf '%s\n' "$INPUT")" ]; then
    echo "spec-shard: FEHLER — Vereinigung der Shards weicht von der Eingabemenge ab" >&2
    exit 1
  fi

  echo "spec-shard: OK — $in_count Dateien restlos und ueberschneidungsfrei auf $TOTAL Shards verteilt"
  for i in $(seq 1 "$TOTAL"); do
    echo "  shard $i: $(_extract_shard "$i" | grep -c .) Dateien"
  done
  exit 0
fi

_extract_shard "$SHARD"
