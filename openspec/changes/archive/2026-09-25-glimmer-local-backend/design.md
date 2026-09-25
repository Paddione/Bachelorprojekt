---
ticket_id: T900365
plan_ref: openspec/changes/glimmer-local-backend/tasks.md
status: active
date: 2026-09-25
---

# Design: glimmer-local-backend

_Ticket: T900365 · Parent-Spec: `llm-local-dev` (+ `software-factory`)_

## Kontext

Der lokale Server auf `:1919` fährt seit T900359 Qwen3.8-27B GSQ-RCO IQ3_XXS-mtp allein auf der
RTX 5070 Ti (`scripts/llm/qwen38-gsq.service`, Alias `Qwen3.8-27B-gsq`, 153600 served KV). Der
opencode-`orchestrator` plant auf Muse Spark 1.3 (`opencode-zen/muse-spark-1.3-contributor-free`,
Fallback `planner-muse` auf Go). Muse Glimmer 30B ist laut Modellkarte aus Muse Spark destilliert und
für delegierte Agenten-Teilaufgaben gebaut. Orchestrator und lokaler Executor sprechen damit dieselbe
Modellfamilie: gleicher Tokenizer, gleiche Kanal- und Tool-Call-Konventionen, gleiches
`Reasoning strength`-Vokabular.

Ausgangspunkt war eine Recherche des Operators (Dual-GPU-Deployment von Glimmer). Sie wurde gegen die
`config.json` des Modells und gegen eigene Messungen geprüft; mehrere Annahmen hielten nicht (siehe
„Verworfen“).

## Architektur des Modells (aus `meta-models/Muse-Glimmer-30B/config.json`)

- 52 Decoder-Schichten, `hidden_size` 6656, 32 Q-Köpfe, 2 KV-Köpfe, `head_dim` 128.
- `layer_types`: 39 × `sliding_attention` (Fenster 2048), 13 × `full_attention` (jede vierte Schicht).
- `max_position_embeddings` 131072.
- Folge für den KV-Cache: nur 13 Schichten halten den vollen Kontext.
  `13 × 2 × 128 × 2 (K+V)` = 6656 Elemente pro Token, mit `q8_0` (1,0625 B/Element) rund
  7,1 KB pro Token, bei 131072 Token also etwa 0,93 GB. Die 39 SWA-Schichten kommen mit rund
  43 MB pro Slot dazu. Die Recherche rechnete alle 52 Schichten mit vollem Kontext und kam so auf das
  Vierfache.

## Entscheidungen

### D1 — Quantisierung: `UD-IQ3_XXS` (13,13 GB), nur 5070 Ti

`unsloth/Muse-Glimmer-30B-GGUF` → `Muse-Glimmer-30B-UD-IQ3_XXS.gguf`. Es ist dieselbe Quant-Stufe wie das
abgelöste Qwen. `UD-Q4_K_XL` (15,88 GB) passt mit Drafter nicht auf eine Karte und zwänge zum Layer-Split.
Der kostet laut T900172 (Qwen3.8, `-ts 85,15`) rund die Hälfte des Decode-Durchsatzes, weil jeder Token
beide Karten durchläuft und die 3060 Ti die langsamere ist. Entschieden vom Operator am 2026-09-25.

### D2 — Spekulation: DFlash2-Drafter `Q4_K_M` auf derselben Karte

`incoai/Muse-Glimmer-30B-DFlash2-GGUF` → `Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf` (1,65 GB), dazu
`--spec-type draft-dflash -ngld all`. Vision (`mmproj`) entfällt, Entscheidung des Operators.

Der ursprünglich gewählte Platz auf der 3060 Ti (`-devd CUDA1`) ist **technisch ausgeschlossen**: DFlash2
teilt `output.weight` des Targets, und llama.cpp bricht beim Reservieren des Graphen ab:

```
ggml-backend.cpp:941: pre-allocated tensor (output.weight) in a buffer (CUDA0) that cannot run the operation (NONE)
```

### D3 — `--spec-draft-n-max 4`, nicht die empfohlenen 15

Die Modellkarte nennt 15 (Blockgröße 16). Bei langem Kontext verwirft das Target den Großteil der langen
Entwürfe und bezahlt trotzdem die Verifikation. Gemessen (Tabelle unten): `n_max 4` ist bei kurzem und bei
langem Kontext mindestens gleichauf und bei 117k deutlich vorn (84–89 statt 53 tok/s).

### D4 — KV-Cache `q8_0`, Kontext 131072 (Architekturmaximum)

Dank SWA kostet `q8_0` statt `q4_0` nur rund 0,45 GB, gemessen 15,09 GB statt 14,65 GB nach dem Start.
`tests/spec/local-llm-proxy/gemma-kv-quant.bats` verbietet `q4_0`-KV für GPU-Chat-Loadouts, weil es
Tool-Call-Argumente degradiert; `qwen38-gsq` stand dort auf der Ausnahmeliste. Glimmer braucht die
Ausnahme nicht mehr. Mehr als 131072 gibt das Modell nicht her. Der Kontext **sinkt** damit gegenüber
Qwen (153600).

### D5 — llama.cpp ab `e85e15cf6`

DFlash2 kam upstream mit #27816 (`spec : add DFlash2 support`), nach dem heutigen Build `0adcc3bb5`. Der
neue Build liegt in `~/opt/llama.cpp-e85e15c/build` (eigener git-worktree des Quellbaums, CUDA 13.3,
`CMAKE_CUDA_ARCHITECTURES=86;120`, `GGML_CUDA_FA_ALL_QUANTS=ON`). Die Unit ruft weiter
`%h/opt/llama-current/bin/llama-server` auf; beim Rollout wird der Symlink `llama-current` umgebogen.
Der alte Build bleibt für den Rollback liegen.

### D6 — Sampling und Reasoning nach Modellkarte

Server-Defaults `--temp 1.0 --top-p 0.95 --top-k 64`. Das eingebettete Chat-Template schreibt den
Reasoning-Level **selbst** in den System-Kopf:

```
{%- macro render_reasoning() -%}{%- set rs = reasoning_strength if reasoning_strength is defined and reasoning_strength else 'high' -%}{{- 'Reasoning strength: ' + rs + '.' -}}{%- endmacro -%}
```

Der Default ist also schon `high`, die Empfehlung der Modellkarte für Coding und agentische Aufgaben. Die
Agenten-Prompts bekommen deshalb **keine** eigene `Reasoning strength`-Zeile; eine zweite Angabe im Prompt
stünde neben der des Templates. Gesteuert wird pro Request über
`chat_template_kwargs.reasoning_strength` (`low`/`medium`/`high`/`xhigh`). Das Reasoning kommt getrennt in
`reasoning_content`, gemessen in allen Läufen. Die Agenten-`temperature` (0.3/0.4) bleibt: Ein
Request-Parameter schlägt den Server-Default, und die niedrigere Temperatur ist für Code-Edits bewusst gesetzt.

### D9 — `enable_thinking: false` wird durch `reasoning_strength: "low"` ergänzt

Das Glimmer-Template kennt `enable_thinking` nicht (0 Treffer im eingebetteten Template), und einen
Level „aus“ gibt es nicht. Wer heute Reasoning abschaltet, bekäme unter Glimmer stillschweigend `high` und
bei knappem `max_tokens` leeren `content`, also genau die Falle aus T002533. Jeder Aufrufer, der
`chat_template_kwargs.enable_thinking: false` an `:1919` schickt, setzt deshalb **zusätzlich**
`reasoning_strength: "low"`. Beide Keys bleiben stehen: Templates ignorieren unbekannte Keys, und so
funktioniert derselbe Payload für Gemma/Qwen weiter. Betroffen sind `scripts/brain-ingest-transform.sh`,
`scripts/factory-mcp-node/server.mjs`, `scripts/factory/mcp-go/main.go`, `scripts/factory/triage-body.sh`,
`scripts/plan-qa-check.sh`, `scripts/health-goals-payload.py`, `scripts/arbitration/synthesize.mjs` und
`scripts/web-audit.mjs`. Nicht angefasst werden der stillgelegte `scripts/llm-proxy/` und die
FreeToken-Bench-Skripte.

Offen und deshalb im Plan als Messschritt: ob `low` bei den dort gesetzten `max_tokens` zuverlässig
`content` liefert. Gemessen wird beim Rollout, nicht vorher, weil der Test `:1919` braucht.

### D7 — Namen folgen dem Modell

Alias und Katalog-Key `Muse-Glimmer-30B`, Unit `scripts/llm/glimmer.service`, Primary `glimmer-primary`
mit Prompt `.opencode/prompts/glimmer-primary.md`, Loadout-Slug `glimmer`. Begründung wie bei T016419:
Ein Name, der auf ein abgelöstes Modell zeigt, ist ein lügender Alias. `qwen38-gsq.service`,
`qwen38-primary` und der Key `Qwen3.8-27B-gsq` werden entfernt, nicht als Aliase behalten.

### D8 — Compaction und DCP skalieren mit dem kleineren Fenster

`limit.context = limit.input = 131072`, `output` bleibt 8192, `buffer` bleibt 33600.
Prompt-Schleife: `131072 − 33600 = 97472`. `session.next`: `131072 − max(8192, 33600) = 97472`.
DCP: `40 %` = 52429 (Nudge), `75 %` = 98304 läge **über** dem Trigger und wäre tote Konfiguration, daher
`70 %` = 91750 (5722 unter dem Trigger).

## Messung (2026-09-25)

Alle Läufe: 5070 Ti allein, `-c 131072 -fa on -np 1`, `--jinja`, Sampling nach D6, System-Prompt
`Reasoning strength: high`. Kurz = drei Läufe à 600 Token; lang = 117.097-Token-Prompt mit Needle in der Mitte.

| Variante | Decode kurz (t/s) | Decode @117k | Prefill @117k | VRAM nach Start |
|---|---|---|---|---|
| ohne Drafter, q8_0 | 52,5–52,8 | 36,0 | 1663 | 13,00 GB |
| DFlash2 n15, q4_0 | 72–92 | 82,9 | 1079 | 14,65 GB |
| DFlash2 n15, q8_0 | 65–82 | 53,1 | 1103 | 15,09 GB |
| DFlash2 n8, q8_0 | 69–79 | 72,4 | 1103 | 15,09 GB |
| DFlash2 n6, q8_0 | 71–78 | 61,1 | 1076 | 15,09 GB |
| **DFlash2 n4, q8_0** (2 Läufe) | **74–84** | **84,1 / 89,0** | **1090–1103** | **15,09 GB** |
| Qwen3.8 gsq heute (T900359) | ~96 | 55,7 @123k | 823 | 15,3 GB |

In allen Varianten wurde der Tool-Call als `tool_calls` (`get_weather`, `{"city":"Berlin"}`) geparst und
die Needle `GLIMMER-7741` bei 117k gefunden. Der Drafter kostet rund ein Drittel Prefill, weil er die
Hidden States der Target-Schichten {1, 13, 25, 37, 49} mitliest. Die Streuung der Kurzläufe kommt vom
Sampling mit `temperature 1.0`.

Nachstellen (Skripte und Rohdaten in `measurements/`):

```bash
# Stand der Messung: origin/main 7f59b744c3bfd1dfff41e90f0ae72d5fb4a9d794, llama.cpp e85e15cf6
systemctl --user stop qwen38-gsq            # :1919 faellt aus, bis die Unit wieder laeuft
bash measurements/glimmer-run1.sh 1920 131072 q8_0 4
bash measurements/glimmer-bench.sh 1920 solo-q8_0kv-n4
MATRIX='q8_0 0' bash measurements/glimmer-matrix.sh   # Baseline ohne Drafter
```

## Verworfen

- **Dual-GPU-Split `-ts 68,32` mit `Q4_K_M` (Recherche).** Unbelegtes Verhältnis; die eigene Messung in
  T900172 zeigt, dass mehr Layer auf der 3060 Ti langsamer machen. Es gibt auch keine Datei
  `Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf`; unslooths Pendant `UD-Q4_K_XL` hat 15,88 GB.
- **`--parallel 4` bei 32k Kontext (Recherche).** Ergibt vier Slots à 8192 Token, zu wenig für
  Agenten-Sessions. Wie bisher `-np 1` mit großem Kontext.
- **„KV-Cache zentral auf GPU 0“ (Recherche).** Beim Layer-Split liegt der KV bei seinen Schichten.
- **`-lzm auto` (Recherche).** Kein llama.cpp-Flag. `q8_0` ist außerdem kein FP8.
- **Drafter auf der 3060 Ti.** Siehe D2, bricht beim Laden ab.
- **`n_max 15`.** Siehe D3.
- **Vision (`mmproj`).** Entscheidung des Operators. Bei 15,09 GB wäre auch kein Platz mehr.
- **PySpark-/Apache-Spark-Pipeline (Recherche).** Betrifft Apache Spark, nicht Muse Spark; im Repo gibt
  es keinen Spark-Job.

## Rollout und Rollback

Rollout (Host, nach dem Merge, durch `dev-flow-execute`):

```bash
ln -sfn ~/opt/llama.cpp-e85e15c/build ~/opt/llama-current
systemctl --user disable --now qwen38-gsq
ln -sf ~/Bachelorprojekt/scripts/llm/glimmer.service ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now glimmer
curl -s http://127.0.0.1:1919/v1/models | jq -r '.data[].id'   # erwartet: Muse-Glimmer-30B
bash scripts/opencode-sync-agents.sh
```

Rollback: Den Symlink auf `~/opt/llama.cpp-src/build` zurücksetzen, `glimmer` stoppen und die
`qwen38-gsq.service` aus dem Commit vor dem Merge wieder einhängen. Die Qwen-Gewichte in
`~/models/Qwen3.8-27B-GSQ-RCO` bleiben liegen.

## Risiken

- **Qualität bei echten opencode-Tasks ist ungemessen.** Gemessen sind Durchsatz, Tool-Call-Parsing und
  Needle. Der Verify-Schritt im Plan lässt deshalb einen echten `local`-Dispatch laufen, bevor
  gemergt wird.
- **Kontext sinkt von 153600 auf 131072.** Die Budgets S/M/L (32k/80k/100k) des Orchestrators bleiben
  unter dem neuen Trigger von 97472 — mit Ausnahme von L, das auf 90k sinkt (Plan, Prompt `orchestrator.md`).
- **VRAM-Reserve rund 1,2 GB.** Unter WSL lagert CUDA bei Überlauf still in den Systemspeicher aus
  (T900359). Die 5070 Ti trägt keinen Desktop; ein zweites CUDA-Programm auf ihr würde das trotzdem
  kippen. Gleiche Lage wie heute.
- **Sampling `temperature 1.0` als Server-Default.** Das trifft nur Clients ohne eigene Temperatur, etwa
  brain-ingest, das Reasoning ohnehin abschaltet.
