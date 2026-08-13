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
# Gewichtung: gemessene Laufzeit (Sekunden) aus tests/spec/.spec-runtime.tsv,
# nicht die @test-Anzahl. Die Anzahl ist ein unzuverlaessiger Proxy — eine
# Datei mit wenigen, aber schweren Tests (setup()/sleeps/Netz-Wartezeit)
# verzerrt den Shard sonst, und die Shards liefen messbar ungleich (gemessen
# 2026-08-09: 131s..262s Wanduhr ueber 4 Shards, Faktor 2). [T003025]
# Das Manifest erzeugt `task test:spec:timing` (oder aus den CI-junit-Artifakten,
# siehe scripts/spec-junit-weights.sh); fehlt eine Datei darin (neu/umbenannt),
# faellt das Gewicht deterministisch auf die @test-Anzahl zurueck.
#
# Der Algorithmus (LPT: longest processing time first) MUSS deterministisch sein.
# Jeder der M CI-Jobs berechnet die Partition unabhaengig aus demselben Repo-Stand;
# waeren die Ergebnisse nicht bitgleich, liefen Dateien doppelt oder — schlimmer —
# gar nicht, und der Lauf saehe trotzdem gruen aus.
#
# --seed rotiert die Startbucket-Wahl [T004024]. Ohne Seed landet die eine
# schwerste Datei per LPT immer in Bucket 1 — bei diff-gescopten Laeufen (PR /
# Merge-Delta) ist Shard 1 damit strukturell der Tail (gemessen PR #4332: 4m50s
# vs 1m26s, dominiert von einer einzigen Datei). Mit Seed starten alle Buckets
# mit winzigen, deterministisch aus dem Seed gehashten Offsets (< 1e-9), sodass
# die schwerste Datei je nach Commit auf einem anderen Shard landet. Die Offsets
# sind so klein, dass die Balance unveraendert bleibt; die Rotation ist rein
# kosmetisch — sie verkuerzt keine Wanduhr, verteilt aber den Tail ueber die
# Zeit auf alle Shards. CI reicht die HEAD-SHA als Seed durch (Taskfile.yml),
# damit alle Matrix-Legs desselben Commits identisch partitionieren.
#
# Usage:
#   find tests/spec -name '*.bats' | bash scripts/spec-shard.sh --shard 2 --of 4
#   find tests/spec -name '*.bats' | bash scripts/spec-shard.sh --verify --of 4
#   find tests/spec -name '*.bats' | bash scripts/spec-shard.sh --shard 1 --of 4 --seed "$(git rev-parse HEAD | cut -c1-12)"

set -euo pipefail

SHARD=""
TOTAL=""
VERIFY=false
WEIGHTS_FILE=""
SEED=""

while [ $# -gt 0 ]; do
  case "$1" in
    --shard) SHARD="${2:-}"; shift 2 ;;
    --of)    TOTAL="${2:-}"; shift 2 ;;
    --weights) WEIGHTS_FILE="${2:-}"; shift 2 ;;
    --seed)  SEED="${2:-}"; shift 2 ;;
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

# Manifest-Standardpfad, falls kein --weights gesetzt. Determinismus: alle
# CI-Jobs desselben Commits sehen dieselbe Datei — oder eben keine.
if [ -z "$WEIGHTS_FILE" ] && [ -f "tests/spec/.spec-runtime.tsv" ]; then
  WEIGHTS_FILE="tests/spec/.spec-runtime.tsv"
fi

# Basisgewicht je Datei = Anzahl @test-Bloecke, mindestens 1. Eine nicht lesbare
# oder testfreie Datei faellt so nicht aus der Partition heraus — sie wiegt nur
# wenig. Manifest-Eintraege (Sekunden) ersetzen dieses Basisgewicht; negative
# oder leere Werte im Manifest fallen auf das Basisgewicht zurueck.
WEIGHTED=$(
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$(grep -c '^[[:space:]]*@test' "$f" 2>/dev/null || true)
    [ -n "$n" ] && [ "$n" -gt 0 ] 2>/dev/null || n=1
    printf '%s\t%s\n' "$n" "$f"
  done <<< "$INPUT"
)

RESOLVED=$(
  if [ -n "$WEIGHTS_FILE" ] && [ -f "$WEIGHTS_FILE" ]; then
    # NR==FNR: erstes File ist das Manifest (Sekunden\tPfad), dann stdin.
    printf '%s\n' "$WEIGHTED" \
      | awk -v wf="$WEIGHTS_FILE" '
          NR == FNR { sec[$2] = $1; next }
          { w = ($2 in sec) ? sec[$2] : $1; if (w + 0 <= 0) w = $1; print w "\t" $2 }
        ' "$WEIGHTS_FILE" -
  else
    printf '%s\n' "$WEIGHTED"
  fi
)

# LPT-Greedy in awk: absteigend nach Gewicht, jede Datei in den aktuell
# leichtesten Bucket. Bei Gewichtsgleichheit entscheidet der Pfad (sort -k2),
# bei Bucket-Gleichstand der niedrigste Index — beides rein deterministisch.
# Zeilenformat: <bucket>\t<gewicht>\t<pfad> (Gewicht bleibt fuer --verify
# erhalten und wird nicht nur fuer die Sortierung benutzt).
#
# [T004024] Seed-Offsets: mit --seed starten die Buckets mit winzigen, aus dem
# Seed-String gehashten Startlasten ((s+i) % total / 1e9). Fuer i = 1..total
# ist genau ein Rest 0 — die erste (schwerste) Datei landet damit deterministisch
# in einem vom Seed abhaengigen Bucket statt immer in Bucket 1. Leerer Seed
# ergibt Offsets von 0 und damit exakt das alte Verhalten. Der Hash ist bewusst
# POSIX-awk (tolower/substr/index auf Hex-Ziffern), kein strtonum (gawk-only).
PARTITION=$(
  printf '%s\n' "$RESOLVED" \
    | LC_ALL=C sort -k1,1nr -k2,2 \
    | awk -v total="$TOTAL" -v seed="$SEED" '
        BEGIN {
          FS = "\t"
          for (i = 1; i <= total; i++) load[i] = 0
          if (length(seed) > 0) {
            s = 0
            for (j = 1; j <= length(seed); j++) {
              c = index("0123456789abcdef", tolower(substr(seed, j, 1)))
              if (c == 0) c = 1
              s = (s * 31 + c) % 1000003
            }
            for (i = 1; i <= total; i++) load[i] = ((s + i) % total) / 1000000000
          }
        }
        {
          best = 1
          for (i = 2; i <= total; i++) if (load[i] < load[best]) best = i
          load[best] += $1
          print best "\t" $1 "\t" $2
        }
      '
)

# Extraktion eines Shards aus der Partition. Bewusst als Funktion, damit
# --verify EXAKT denselben Pfad prueft, den CI spaeter benutzt. Verifizierte
# man stattdessen die interne Partition, bliebe ein Fehler in genau diesem
# Filter unentdeckt — und der aeussert sich als stiller Dateiverlust: der Shard
# laeuft gruen durch, weil die verschluckten Tests nie ausgefuehrt wurden.
_extract_shard() { # $1 = Shard-Index
  printf '%s\n' "$PARTITION" | awk -F'\t' -v s="$1" '$1 == s { print $3 }'
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
  echo "spec-shard: Gewichtsquelle: ${WEIGHTS_FILE:-@test-Anzahl (kein Manifest)}"
  echo "spec-shard: Seed: ${SEED:-<keiner>}"
  max_load=0
  min_load=""
  for i in $(seq 1 "$TOTAL"); do
    shard_files=$(printf '%s\n' "$PARTITION" | awk -F'\t' -v s="$i" '$1 == s')
    n=$(printf '%s\n' "$shard_files" | awk -F'\t' '$3 != "" { c++ } END { print c + 0 }')
    sum=$(printf '%s\n' "$shard_files" | awk -F'\t' '$3 != "" { s += $2 } END { printf "%.1f", s }')
    echo "  shard $i: $n Dateien, Gewicht $sum"
    if awk -v s="$sum" -v m="$max_load" 'BEGIN { exit !(s > m) }'; then max_load="$sum"; fi
    if [ -z "$min_load" ] || awk -v s="$sum" -v m="$min_load" 'BEGIN { exit !(s < m) }'; then min_load="$sum"; fi
  done
  awk -v mx="$max_load" -v mn="${min_load:-0}" 'BEGIN { if (mx + 0 > 0) printf "spec-shard: Balance %d%% (min/max)\n", (mn / mx) * 100 }'
  exit 0
fi

_extract_shard "$SHARD"
