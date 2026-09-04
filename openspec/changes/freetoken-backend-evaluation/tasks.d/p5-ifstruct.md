# p5-ifstruct — IFStruct-v1.0 Schema-Treue-Benchmark

Rolle: `ops`. Liefert `scripts/llm/bench-ifstruct.sh`: Handwerkzeug im Muster der fünf
bestehenden `scripts/llm/bench-*.sh` (Referenz: `scripts/llm/bench-decode.sh` — Aufrufkonvention
`<port> [label]`, Kopfkommentar mit Warum/Aufruf/Beispiel, `set -uo pipefail`, `echo "== $LABEL =="`
als Abschnittsmarker). **Kein** Taskfile-Target, **kein** CI-Bezug, **kein** BATS-Guard: der
externe `Liquid4All/ifstruct`-Validator ist in CI nicht vorhanden, und ein CI-gebundener Test
würde die Ausstattung des Runners messen statt den Zustand des Codes (vgl. T002820). Keins der
fünf Geschwisterskripte hat ein Taskfile-Target — ein neues Muster für diesen Einzelfall wäre
unbegründet. **Kein** `task test:*`-Final-Verify (lebt im `tasks.md`-Index), **kein**
RED-Failing-Test-Step (dieser Change enthält keine BATS-Domäne für dieses Partial — die
Verifikation läuft über `bash -n` + einen echten Smoke-Lauf, siehe Task 3).

## S1-Zeilenbudget (wirksame Schwelle)

| `path` | Ist | Budget |
| --- | --- | --- |
| `scripts/llm/bench-ifstruct.sh` | 0 | 800 |

Neue Datei, `.sh`-Limit laut `docs/code-quality/gates.yaml` → `s1.limits` ist 800 (siehe
`.claude/skills/references/plan-quality-gates.md`). Kein Verkleinerungs- oder Split-Zwang.

---

## Task 1: Vorbedingungen klären — Validator-Checkout, Python-Pakete, Datensatzquelle

Die `hf`-CLI ist auf diesem Host ein verwaister Launcher (`docs/runbooks/freetoken-native.md`
Zeile 127ff: `hf --help` endet wortlos mit `rc=1`, weil der verlinkte Python-Interpreter nicht
mehr existiert). Der funktionierende Weg ist `huggingface_hub` als Bibliothek unter `py -3.14`
— exakt das Muster, das der Runbook für den `gpt-oss-20b`-Download bereits verwendet
(`py -3.14 -c "from huggingface_hub import snapshot_download; …"`).

Der Validator selbst ist kein Bewertungscode, den dieses Skript nachbaut — `Liquid4All/ifstruct`
liefert die CLI `ifstruct-eval` (`uv run ifstruct-eval --model … --base-url … --api-key … --dataset
data/test.jsonl --results-file … --n-threads …`), die den Endpunkt selbst anspricht und binär
bewertet ("a sample passes only if all checks produce zero errors"). Das Skript in Task 2 treibt
diese CLI, statt die Schema-Prüfung neu zu implementieren — sonst würde nicht mehr LiquidAIs
Referenzimplementierung gemessen, sondern eine eigene, unabgeglichene Nachbildung.

- [ ] `Liquid4All/ifstruct` einmalig klonen und mit `uv sync` vorbereiten (liefert `ifstruct-eval`
      im `uv run`-Kontext des geklonten Repos).
- [ ] Prüfen, dass `py -3.14` die Pakete `pyarrow` und `huggingface_hub` importieren kann —
      **nicht** `pandas` voraussetzen, das Skript in Task 2 liest die Datensatz-Parquet-Datei
      direkt über `pyarrow.parquet`, um keine ungeprüfte Zusatzabhängigkeit einzuführen.
- [x] Bestätigt (Vorrecherche dieses Plans, `hub_repo_details` gegen `LiquidAI/ifstruct-v1.0`):
      Split `test`, 2.000 Zeilen, 10 Spalten — `doc_id, entity_type, prompt, output_format,
      top_level_count, top_level_key, require_wrapper_key, require_code_block,
      require_no_commentary, json_schema`. `top_level_count` und `json_schema` sind bereits als
      JSON-kodierte Strings gespeichert (Parquet-`dtype: string`) — das Skript in Task 2 lässt sie
      unverändert, `ifstruct-eval` erwartet dieselbe Kodierung wie im offiziellen `test.jsonl`.

```bash
git clone https://github.com/Liquid4All/ifstruct "$HOME/ifstruct"
cd "$HOME/ifstruct" && uv sync
py -3.14 -c "import pyarrow, huggingface_hub; print('ok')"
```

**Verify:**

```bash
cd "$HOME/ifstruct" && uv run ifstruct-eval --help >/dev/null
# erwartet: exit 0 -- CLI ist im uv-Projekt aufrufbar
```

---

## Task 2: `scripts/llm/bench-ifstruct.sh` neu anlegen

Architekturentscheidung, die im Kopfkommentar der Datei stehen muss: das Skript bewertet **nicht
selbst** — es treibt `ifstruct-eval` je Shard und übernimmt drei Dinge, die die CLI laut
Vorrecherche nicht mitbringt (kein `--limit`/`--start`/`--end`, kein dokumentiertes
Resume-Verhalten): Datensatz-Caching, Sharding als Wiederaufnahme-Einheit, Fortschrittsausgabe.
Bei 2.000 Prompts und grob 4–6 h Laufzeit pro Kandidat ist ein Verbindungsabbruch ohne Sharding
ein Totalverlust — mit Sharding kostet er höchstens den laufenden Shard.

- [x] Argumente `<port> <model-id> [label]` (label default = model-id), `BASE_URL` daraus
      zusammensetzen.
- [x] Preflight: `uv`, `jq`, `py` vorhanden; `IFSTRUCT_REPO` ist ein `uv`-Projekt (Task 1);
      `${BASE_URL}/models` erreichbar. Klarer Fehler + `exit 1` statt stillem Weiterlaufen.
- [x] Datensatz-Cache: falls `$DATASET_CACHE` fehlt oder leer ist, per `py -3.14 - <<'PYEOF'`
      (Heredoc-Muster aus `docs/runbooks/freetoken-native.md` Zeile 370, keine Variablen in den
      Python-String interpolieren — Pfade über `os.environ`) `hf_hub_download` gegen die
      Parquet-Datei (`default/test/0000.parquet`, `revision=refs/convert/parquet`) ausführen, mit
      `pyarrow.parquet` einlesen, zeilenweise als JSONL schreiben, `dataset_info(...).sha` in eine
      `.revision`-Begleitdatei schreiben.
- [x] Zeilenzahl-Check (`wc -l` = 2000) mit Warnung statt Abbruch — ein abweichender Cache soll
      auffallen, nicht den Lauf blockieren, falls die Ursache harmlos ist (z. B. Trailing Newline).
- [x] Sharding: `split -l "$SHARD_SIZE" -d -a 3` in `$OUT_DIR/shards/`; nur ausführen, wenn das
      Shard-Verzeichnis leer ist (sonst würden zweite Läufe die Resume-Dateinamen verschieben).
- [x] Pro Shard: `$OUT_DIR/<shard>.result.json` bereits nicht-leer vorhanden → überspringen
      (das **ist** die Wiederaufnahme nach Abbruch). Sonst `cd "$IFSTRUCT_REPO" && uv run
      ifstruct-eval …` mit **einem** Retry bei Fehlschlag; scheitert auch der zweite Versuch, wird
      der Shard als offen protokolliert und der Lauf setzt mit dem nächsten Shard fort (`set -uo
      pipefail`, bewusst **ohne** `-e` — ein einzelner Shard-Fehler darf den mehrstündigen Lauf
      nicht beenden).
- [x] Fortschrittsausgabe je Shard: `[i/N] <shard> -- fertig -- pass_rate=…`.
- [x] Abschlusszeile mit Mess-Konvention (T002717): erzeugender Befehl, `git rev-parse HEAD`,
      Endpunkt, Modell-ID, Datensatz-Revision, Anzahl fertiger Shards, aggregierte `jq -s`-Summe
      über alle `*.result.json`.
- [x] Kopfkommentar dokumentiert die Einschränkung wörtlich: ifstruct prüft **nur** die Struktur
      (gültiges JSON/YAML nach Schema), nicht inhaltliche Korrektheit oder Qualität — eine Antwort
      kann inhaltliche Anweisungen ignorieren und trotzdem bestehen. Als alleiniges Qualitätsmaß
      taugt der Benchmark deshalb nicht; er misst die eine Dimension, die für `tool_calls`
      entscheidet.
- [x] Kopfkommentar dokumentiert zusätzlich unverifiziert: das exakte Feldschema von
      `<shard>.result.json` (`ifstruct-eval` dokumentiert nur "aggregate summary stats + per-sample
      results", keine Feldnamen) ist gegen die Aggregations-`jq`-Pfade **erst im Smoke-Lauf** (Task
      3) zu bestätigen — die `jq`-Ausdrücke in diesem Skript nutzen deshalb `//`-Fallback-Ketten
      (`.summary.pass_rate // .pass_rate // "?"`) statt eines einzigen angenommenen Pfads.

```bash
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
# die CLI selbst kennt weder --limit/--start/--end noch dokumentiertes Resume.
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
echo "endpunkt            : $BASE_URL"
echo "modell-id           : $MODEL_ID"
echo "datensatz-revision  : $(cat "$REVISION_FILE" 2>/dev/null || echo unbekannt)"
echo "shards fertig       : $DONE/$TOTAL_SHARDS"
jq -s '
  [ .[] | (.summary.total // .total_samples // 0) ] as $totals
  | [ .[] | (.summary.passed // .passed // 0) ] as $passed
  | { shards: length, total: ($totals | add), passed: ($passed | add),
      pass_rate: (if ($totals|add) > 0 then (($passed|add) / ($totals|add)) else null end) }
' "$OUT_DIR"/*.result.json 2>/dev/null || echo "(Aggregation uebersprungen -- kein Shard fertig)"
```

**Verify:**

```bash
bash -n scripts/llm/bench-ifstruct.sh
# erwartet: exit 0 -- keine Syntaxfehler
wc -l scripts/llm/bench-ifstruct.sh
# erwartet: deutlich unter 800 (S1-Limit .sh)
chmod +x scripts/llm/bench-ifstruct.sh
```

---

## Task 3: Smoke-Lauf gegen einen laufenden Endpunkt (5 Zeilen) vor dem vollen Lauf

> **OFFEN — bewusst nicht ausgefuehrt (Scope-Grenze T900087-Lauf 2026-09-04).**
> Weder `$HOME/ifstruct` (Validator-Klon) noch ein Endpunkt existiert auf diesem
> Host: `:8194` und `:1919` sind tot, RTX 5070 Ti bei 0 MiB Belegung. Belegt ist
> stattdessen, dass der Preflight fail-loud greift statt still weiterzulaufen:
>
> ```bash
> bash scripts/llm/bench-ifstruct.sh 8194 gpt-oss-20b smoke-gptoss
> # -> IFSTRUCT_REPO=/c/Users/PatrickKorczewski/ifstruct ist kein uv-Projekt ...
> # -> exit 1
> ```

Bestätigt vor dem 4–6-h-Lauf pro Kandidat zwei unverifizierte Annahmen aus Task 2: dass
`--api-key dummy-local` von `ifstruct-eval` gegen einen lokalen Server akzeptiert wird, und dass
die `jq`-Pfade in der Aggregationszeile das tatsächliche `<shard>.result.json`-Schema treffen.
Läuft gegen einen bereits gestarteten llama-server oder FreeToken auf einem Scratch-Port (siehe
`proposal.md` Stufe 1/2 — dieses Partial startet keinen Server selbst, das ist P1/P4).

- [ ] `SHARD_SIZE=5` gegen einen laufenden, bereits verifizierten Endpunkt ausführen (kleinster
      sinnvoller Smoke — ein einzelner Shard).
- [ ] `<shard>.result.json` mit `jq .` real ansehen; weicht das Feldschema von den in Task 2
      angenommenen Pfaden ab, die `jq`-Ausdrücke in `scripts/llm/bench-ifstruct.sh` in einem
      Folge-Commit an das reale Schema anpassen, bevor der volle 2.000-Zeilen-Lauf startet.
- [ ] Log der Smoke-Shard (`$OUT_DIR/shard-000.log`) auf HTTP-Fehler wie `401`/`403` prüfen — das
      wäre das Signal, dass der Dummy-API-Key vom Validator zurückgewiesen wird und `.env`/
      `--api-key` einen echten (ggf. beliebigen nicht-leeren) Wert braucht.

```bash
SHARD_SIZE=5 scripts/llm/bench-ifstruct.sh 8194 gpt-oss-20b smoke-gptoss
jq . scripts/llm/measurements/ifstruct/smoke-gptoss/shard-000.result.json
```

**Verify:**

```bash
test -s scripts/llm/measurements/ifstruct/smoke-gptoss/shard-000.result.json
# erwartet: Datei existiert und ist nicht leer -- ifstruct-eval hat den Endpunkt erreicht
# und ein Ergebnis geschrieben (unabhaengig vom konkreten pass_rate-Wert)
```
