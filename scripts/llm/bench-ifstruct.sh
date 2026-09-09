#!/usr/bin/env bash
# bench-ifstruct.sh — Misst Schema-Treue eines OpenAI-kompatiblen Endpunkts gegen
# LiquidAI/ifstruct-v1.0 (2.000 Prompts, binaere Wertung ohne constrained decoding).
#
# Warum: ifstruct prueft, ob ein Modell gueltiges JSON/YAML nach einem geforderten Schema
# erzeugt -- der Fehlermodus, an dem die Software Factory bei tool_calls scheitert.
# EINSCHRAENKUNG: gewertet wird NUR die Struktur, nicht inhaltliche Korrektheit oder
# Qualitaet -- eine Antwort kann inhaltliche Anweisungen ignorieren und trotzdem bestehen.
# Als alleiniges Qualitaetsmass taugt dieser Benchmark deshalb nicht.
#
# Architektur: dieses Skript bewertet NICHT selbst -- es treibt den offiziellen
# Liquid4All/ifstruct-Validator (`ifstruct-eval`), der den Endpunkt selbst anspricht und
# binaer bewertet (pass nur wenn ALLE Pruefungen fehlerfrei sind). Das Skript uebernimmt
# Datensatz-Caching, Sharding (= Wiederaufnahme-Einheit nach Abbruch) und Fortschritt --
# die CLI selbst kennt weder --limit/--start/--end noch dokumentiertes Resume. Bei
# 2.000 Prompts und grob 4-6 h Laufzeit pro Kandidat ist ein Verbindungsabbruch ohne
# Sharding ein Totalverlust; mit Sharding kostet er hoechstens den laufenden Shard.
#
# UNVERIFIZIERT: das exakte Feldschema von <shard>.result.json ist nicht dokumentiert
# (ifstruct-eval nennt nur "aggregate summary stats + per-sample results", keine
# Feldnamen). Die jq-Ausdruecke unten nutzen deshalb //-Fallback-Ketten
# (.summary.pass_rate // .pass_rate // "?") statt eines einzigen angenommenen Pfads und
# sind im Smoke-Lauf (SHARD_SIZE=5, siehe p5-ifstruct.md Task 3) gegen das reale Schema
# zu bestaetigen, BEVOR der volle 2.000-Zeilen-Lauf startet.
#
# Aufruf:
#     scripts/llm/bench-ifstruct.sh <port> <model-id> [label]
#
# Beispiel:
#     scripts/llm/bench-ifstruct.sh 1919 Qwen3.6-35B-A3B-NVFP4 freetoken-qwen-200k
#     scripts/llm/bench-ifstruct.sh 8194 gpt-oss-20b llamacpp-gptoss
#
# Voraussetzungen (einmalig, siehe openspec/changes/freetoken-backend-evaluation/tasks.d/p5-ifstruct.md):
#     - Liquid4All/ifstruct geklont + `uv sync` unter $IFSTRUCT_REPO
#     - py -3.14 mit huggingface_hub + pyarrow (die `hf`-CLI ist auf diesem Host ein
#       verwaister Launcher, siehe docs/runbooks/freetoken-native.md Zeile 127ff)
#
# Env-Overrides:
#     IFSTRUCT_REPO    Pfad zum geklonten Validator-Repo (Default: ~/ifstruct)
#     SHARD_SIZE       Zeilen pro Shard (Default 100 -> 20 Shards bei 2000 Zeilen)
#     N_THREADS        an ifstruct-eval durchgereicht (Default 8)
#     DATASET_CACHE    Pfad zur gecachten JSONL (Default scripts/llm/measurements/ifstruct/dataset/test.jsonl)
set -uo pipefail   # kein -e: ein einzelner Shard-Fehlschlag darf den 4-6h-Lauf nicht abbrechen

PORT="${1:?port}"
MODEL_ID="${2:?model-id}"
LABEL="${3:-$MODEL_ID}"
BASE_URL="http://127.0.0.1:${PORT}/v1"

IFSTRUCT_REPO="${IFSTRUCT_REPO:-$HOME/ifstruct}"
SHARD_SIZE="${SHARD_SIZE:-100}"
N_THREADS="${N_THREADS:-8}"
DATASET_CACHE="${DATASET_CACHE:-scripts/llm/measurements/ifstruct/dataset/test.jsonl}"
REVISION_FILE="${DATASET_CACHE%.jsonl}.revision"
OUT_DIR="scripts/llm/measurements/ifstruct/${LABEL}"

command -v uv >/dev/null || { echo "uv fehlt (Validator-Runner)" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq fehlt" >&2; exit 1; }
command -v py >/dev/null || { echo "py (Windows py-Launcher, 3.14) fehlt" >&2; exit 1; }
[ -f "$IFSTRUCT_REPO/pyproject.toml" ] || {
  echo "IFSTRUCT_REPO=$IFSTRUCT_REPO ist kein uv-Projekt -- 'git clone https://github.com/Liquid4All/ifstruct' + 'uv sync' zuerst" >&2
  exit 1
}
py -3.14 -c "import pyarrow, huggingface_hub" 2>/dev/null || {
  echo "py -3.14 fehlen Pakete -- 'py -3.14 -m pip install pyarrow huggingface_hub'" >&2
  exit 1
}
curl -sf --max-time 10 "${BASE_URL}/models" >/dev/null || {
  echo "Endpunkt ${BASE_URL}/models nicht erreichbar" >&2; exit 1
}

mkdir -p "$OUT_DIR" "$(dirname "$DATASET_CACHE")"

# --- Datensatz-Cache: einmalig herunterladen + zu JSONL konvertieren --------------
# hf-CLI ist auf diesem Host verwaist (docs/runbooks/freetoken-native.md Z.127ff) --
# huggingface_hub direkt als Bibliothek unter py -3.14 ist der funktionierende Weg.
# Keine Variablen in den Python-String interpolieren; Pfade gehen ueber os.environ.
if [ ! -s "$DATASET_CACHE" ]; then
  echo "== Datensatz-Cache fehlt, lade LiquidAI/ifstruct-v1.0 (test-Split) =="
  DATASET_CACHE="$DATASET_CACHE" REVISION_FILE="$REVISION_FILE" py -3.14 - <<'PYEOF'
import json
import os

from huggingface_hub import dataset_info, hf_hub_download
import pyarrow.parquet as pq

dataset_cache = os.environ["DATASET_CACHE"]
revision_file = os.environ["REVISION_FILE"]

info = dataset_info("LiquidAI/ifstruct-v1.0")
path = hf_hub_download(
    repo_id="LiquidAI/ifstruct-v1.0", repo_type="dataset",
    filename="default/test/0000.parquet", revision="refs/convert/parquet",
)
rows = pq.read_table(path).to_pylist()
with open(dataset_cache, "w", encoding="utf-8") as f:
    for row in rows:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
with open(revision_file, "w", encoding="utf-8") as f:
    f.write(info.sha + "\n")
print(f"geschrieben: {len(rows)} Zeilen, revision {info.sha}")
PYEOF
fi

ROWS=$(wc -l < "$DATASET_CACHE" | tr -d ' ')
# Warnung statt Abbruch: ein abweichender Cache soll auffallen, nicht den Lauf
# blockieren, falls die Ursache harmlos ist (z.B. fehlende Trailing Newline).
[ "$ROWS" -eq 2000 ] || echo "WARNUNG: $ROWS Zeilen statt 2000 im Cache -- $DATASET_CACHE pruefen" >&2

# --- Sharding: Resume-Einheit ist der Shard, nicht die Einzelzeile ---------------
SHARD_DIR="$OUT_DIR/shards"
mkdir -p "$SHARD_DIR"
if [ -z "$(ls -A "$SHARD_DIR" 2>/dev/null)" ]; then
  split -l "$SHARD_SIZE" -d -a 3 --additional-suffix=.jsonl "$DATASET_CACHE" "$SHARD_DIR/shard-"
fi
SHARDS=("$SHARD_DIR"/shard-*.jsonl)
TOTAL_SHARDS=${#SHARDS[@]}

echo "== $LABEL == model=$MODEL_ID endpoint=$BASE_URL shards=$TOTAL_SHARDS x $SHARD_SIZE"

# --- Pro Shard: bereits vorhandenes, nicht-leeres Ergebnis wird uebersprungen
#     (das IST die Wiederaufnahme). Sonst ein Versuch + genau ein Retry; scheitert
#     auch der zweite Versuch, zaehlt der Shard als offen -- der Lauf geht weiter. --
i=0
for shard in "${SHARDS[@]}"; do
  i=$((i + 1))
  name="$(basename "$shard" .jsonl)"
  result="$OUT_DIR/${name}.result.json"
  if [ -s "$result" ]; then
    echo "[$i/$TOTAL_SHARDS] $name -- bereits vorhanden, uebersprungen (Resume)"
    continue
  fi
  echo "[$i/$TOTAL_SHARDS] $name -- laeuft ..."
  ok=0
  for attempt in 1 2; do
    if (cd "$IFSTRUCT_REPO" && uv run ifstruct-eval \
          --model "$MODEL_ID" --base-url "$BASE_URL" --api-key dummy-local \
          --dataset "$shard" --results-file "$result" --n-threads "$N_THREADS") \
       >"$OUT_DIR/${name}.log" 2>&1; then
      ok=1; break
    fi
    echo "  Versuch $attempt fehlgeschlagen, siehe $OUT_DIR/${name}.log"
  done
  if [ "$ok" -eq 1 ]; then
    rate=$(jq -r '.summary.pass_rate // .pass_rate // "?"' "$result" 2>/dev/null)
    echo "  fertig -- pass_rate=$rate"
  else
    echo "  ENDGUELTIG FEHLGESCHLAGEN nach 2 Versuchen -- $name zaehlt als offen" >&2
  fi
done

# --- Aggregation + Mess-Konvention-Kopfzeile (T002717) ----------------------------
DONE=$(ls "$OUT_DIR"/*.result.json 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "== Zusammenfassung: $LABEL =="
echo "erzeugender Befehl : scripts/llm/bench-ifstruct.sh $PORT $MODEL_ID $LABEL"
echo "commit-stand       : $(git rev-parse HEAD 2>/dev/null || echo unbekannt)"
echo "endpunkt           : $BASE_URL"
echo "modell-id          : $MODEL_ID"
echo "datensatz-revision : $(cat "$REVISION_FILE" 2>/dev/null || echo unbekannt)"
echo "shards fertig      : $DONE/$TOTAL_SHARDS"
jq -s '
  [ .[] | (.summary.total // .total_samples // 0) ] as $totals
  | [ .[] | (.summary.passed // .passed // 0) ] as $passed
  | { shards: length, total: ($totals | add), passed: ($passed | add),
      pass_rate: (if ($totals|add) > 0 then (($passed|add) / ($totals|add)) else null end) }
' "$OUT_DIR"/*.result.json 2>/dev/null || echo "(Aggregation uebersprungen -- kein Shard fertig)"
