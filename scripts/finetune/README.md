# scripts/finetune/ — LLM-Finetuning-Pipeline (Unsloth/TRL)

Ersetzt den Vorversuch unter `unsloth_training_setup/` (T002587). Ein einziges parametrisiertes
Trainingsskript statt drei kopierter Fassungen, plus die Vorbedingungen, die der Vorversuch
teuer gelernt hat: ein geratenes `max_seq_length` kuerzte 45% des Korpus, ein driftendes
Chat-Template kostete Trainings-/Serving-Konsistenz.

Fuer Unsloth/TRL-Fachfragen (LoRA-Parameter, VRAM-Optimierung, aktuelle API-Signaturen) siehe
das Skill `unsloth-buddy` — dieses Verzeichnis kopiert dessen Code nicht.

## Reihenfolge

```
1. measure_corpus.py     Token-Laengenverteilung + VRAM-Machbarkeitsmatrix (IMMER zuerst)
2. template_guard.py     Byte-Gleichheit Hub- vs. gepatchtes Chat-Template (vor jedem Training)
3. train.py               Trainingslauf (bricht ab, wenn 1./2. fehlen/nicht bestanden)
4. export_gguf.py         Merge + GGUF-Export (Speichercheck vor dem fp16-Merge)
```

`collect_factory_traces.py` ist ein optionaler Korpus-Beschaffungsschritt vor Schritt 1: er
rendert erfolgreiche Ticket-Laeufe aus `tickets.factory_phase_events` ins gleiche
Korpusformat wie ein extern beschaffter Korpus.

Alle Schritte sind zusaetzlich als Taskfile-Tasks verfuegbar (`Taskfile.finetune.yml`,
Namespace `finetune:`):

```bash
task finetune:measure CORPUS=<jsonl> MODEL=<label> TEMPLATE_FILE=<jinja> OUT=<report.json>
task finetune:guard   HUB_TEMPLATE=<hub.jinja> PATCHED_TEMPLATE=<patched.jinja> CORPUS=<jsonl>
task finetune:train    CORPUS=<jsonl> MODEL=<hf-id> MEASURE_REPORT=<report.json> [DRY_RUN=1]
task finetune:traces   ROWS_JSON=<mcp-postgres-export.json> OUT=<jsonl> [WITH_CONTEXT=1 COMMENTS_JSON=<kommentare.json>]
task finetune:export   ADAPTER_DIR=<dir> SLOT_NAME=<name> HUB_TEMPLATE=<hub.jinja> [DRY_RUN=1]
```

## Korpusformat

JSONL, eine Trainingszeile pro Zeile, TRL-Chat-Format:

```json
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

`measure_corpus.py`, `template_guard.py`, `train.py` und `collect_factory_traces.py` teilen
dieses Format — derselbe Korpus laeuft unveraendert durch alle Schritte. Mit
Kontext-Anreicherung enthaelt `messages` zusaetzlich `user`/`assistant`-Turns fuer
Beschreibung und Kommentare, chronologisch vor dem abschliessenden Assistant-Turn mit den
Phase-Event-Zeilen.

## Vorbedingungen (hart erzwungen von `train.py`)

- **Messbericht** unter dem per `--measure-report`/`MEASURE_REPORT` angegebenen Pfad muss
  existieren (Ausgabe von `measure_corpus.py`).
- **Template-Guard** muss bestanden sein, wenn `--hub-template`/`--patched-template` gesetzt
  sind — `train.py` ruft `template_guard.py` selbst als Vorbedingung auf.

Referenz beim Template-Guard ist immer das **Hub-Template** (vom Hugging Face Hub geladen),
NICHT das vom Trainings-Framework in ein Adapterverzeichnis geschriebene — im Vorversuch
unterschieden sich beide um mehr als 1000 Zeichen.

Der Guard parst den Generation-Marker `{% generation %}...{% endgeneration %}` als
Pass-through-Tag (transformers-AssistantTracker-Semantik): das Paar rendert seinen Body
unveraendert und markiert nur die Region fuer assistant-only Loss. Ein gepatchtes Template
darf sich also vom Hub-Template ausschliesslich um den Marker unterscheiden — die
Byte-Pruefung stellt genau das sicher. Zwei Qwen3.5-Hub-Templates (offiziell und
Text-Variante) enthalten den Marker NICHT; ohne gepatchtes Template liefert
`return_assistant_tokens_mask=True` keine Masken und train.py verwirft alle Zeilen
(Befund T006252, siehe Messbericht).

## Ohne GPU/transformers testen

Dieses Repo-Worktree/CI haelt keine ML-Abhaengigkeiten (unsloth/trl/torch/transformers) vor.
`measure_corpus.py` und `template_guard.py` funktionieren trotzdem vollstaendig ueber
Jinja2-Templates + eine heuristische Tokenlaengenschaetzung (dokumentierte Abweichung, siehe
Docstrings). `train.py`/`export_gguf.py` unterstuetzen `--dry-run`: Vorbedingungen und
Konfiguration/Speichercheck werden geprueft, ohne die schweren Abhaengigkeiten zu importieren.
Ein echter Trainingslauf braucht den GPU-Host (siehe unsloth-buddy) und ist Teil der
Vollabnahme in T002606 — nicht Teil dieses Subsystems.

## Assistant-only Loss

`train.py` tokenisiert selbst vor und liefert `input_ids` + `assistant_masks` statt einer
`tools`-Spalte: TRL nimmt Tools nur als globales `SFTConfig`-Argument entgegen, nicht je Zeile.
Zeilen, die nach Kuerzung kein Lernsignal mehr haben (assistant_masks komplett 0), werden
verworfen und gezaehlt; der Anteil des Lernsignals wird vor dem ersten Trainingsschritt
ausgegeben.

## Slot-Registrierung nach dem Export

`export_gguf.py` benennt die GGUF-Datei nach `--slot-name` (`<output-dir>/<slot-name>.gguf`),
damit `llm-proxy` sie als benannten Slot aufnehmen kann. Die Registrierung selbst ist ein
manueller Schritt (llm-proxy-Konfiguration aktualisieren) — der automatische Austausch eines
laufenden Factory-Slots gehoert nicht in einen Trainingslauf.

## Factory-Traces als Korpus

`collect_factory_traces.py` baut selbst keine DB-Verbindung auf. Zeilen kommen aus einem
vorgeschalteten `mcp__mcp-postgres__query`-Aufruf gegen `tickets.factory_phase_events`
(siehe `.claude/skills/references/mcp-tool-guide.md`), als JSON-Datei via `--rows-json`
uebergeben (`--fixture` ist der identische Pfad fuer Tests). Nur Ticket-Laeufe mit einem
`verify`/`done`-Event werden uebernommen; bekannte Secret-Muster im `detail`-Feld werden vor
dem Schreiben redigiert.

`--with-context` (zusammen mit `--comments-json`) nimmt zusaetzlich die Ticket-Beschreibung
und die Kommentare als chronologische Turns in den Korpus auf: Autoren `claude-code`/
`factory` werden `assistant`-Turns, alle uebrigen `user`-Turns (E7-Konvention). Die
Secret-Redaktion gilt auch fuer Beschreibung und Kommentar-Body. Ohne das Flag ist die
Ausgabe byte-identisch zum bisherigen Verhalten. `--comments-json` ist wie `--fixture`
der identische Pfad fuer Tests (Kommentarzeilen: `{"ticket_id": <int>, "author": "...",
"body": "...", "created_at": "ISO-8601"}`).

## Trainingsartefakte

`outputs/`, `*.gguf` und Unsloth-Kompilat-Caches sind ueber `scripts/finetune/.gitignore`
ausgeschlossen (umgezogen aus dem entfernten `unsloth_training_setup/.gitignore`).
