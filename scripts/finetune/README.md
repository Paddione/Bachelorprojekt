# scripts/finetune/ — LLM-Finetuning-Pipeline (Unsloth/TRL)

Ersetzt den Vorversuch unter `unsloth_training_setup/` (T002587). Ein einziges parametrisiertes
Trainingsskript statt drei kopierter Fassungen, plus die Vorbedingungen, die der Vorversuch
teuer gelernt hat: ein geratenes `max_seq_length` kuerzte 45% des Korpus, ein driftendes
Chat-Template kostete Trainings-/Serving-Konsistenz.

Fuer Unsloth/TRL-Fachfragen (LoRA-Parameter, VRAM-Optimierung, aktuelle API-Signaturen) siehe
die Unsloth/TRL-Upstream-Referenz — im Harness ueber `context7` (`resolve-library-id` →
`query-docs`). Dieses Verzeichnis kopiert deren Code nicht.

## Reihenfolge

```
1. measure_corpus.py     Token-Laengenverteilung + VRAM-Machbarkeitsmatrix (IMMER zuerst)
2. template_guard.py     Byte-Gleichheit Hub- vs. gepatchtes Chat-Template (vor jedem Training)
3. train.py               Trainingslauf (bricht ab, wenn 1./2. fehlen/nicht bestanden)
4. export_gguf.py         Merge + GGUF-Export (Speichercheck vor dem fp16-Merge)
```

Historische Ticket-Laeufe aus `tickets.factory_phase_events` haben keinen Render-Pfad
mehr (der DB-Renderer wurde mit der Factory stillgelegt); neue Trajektorien liefert der
`agent-bench` (`export-corpus`, T900561), bewusst konstruierte Grenzfaelle
`collect_teacher_traces.py`.

## Aktueller 4B-Trainingsmodus (September 2026)

### Die drei lokal vorhandenen Modell-Snapshots

Die am 2026-09-27 unter `F:\models\hub` geprueften Snapshots entsprechen:

| Hub-ID | Gewichte | Trainingspfad |
|---|---|---|
| `unsloth/Qwen3.5-4B` | volle Gewichte, Qwen3.5 Text | `finetune:train` mit 16-bit LoRA (Quantisierung beim Laden); erster Kandidat fuer Tool-Use/Repo-Workflow |
| `unsloth/Qwen3.5-4B-MTP-GGUF` (`Qwen3.5-4B-UD-Q4_K_XL.gguf`) | GGUF Q4_K_XL, Qwen3.5 Text | Deploy-/Serving-Referenz (:8080-Pool, 98304 ctx, Windows-nativ) |
| `unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit` | BNB 4-bit, Qwen3-VL | `finetune:train-vision` mit Screenshot-/Bild-Beispielen |

Nur der Vision-Snapshot ist BNB 4-bit; die Qwen3.5-Text-Snapshots sind unquantisiert (16-bit-LoRA-Default). Der Text-Trainer verweigert
Qwen3-VL bewusst, auch bei einem lokalen Snapshot-Pfad. Fuer den Vision-Lauf
nutzt `train_vision.py` `FastVisionModel` und `UnslothVisionDataCollator` statt
des Text-Collators. Ein Text-only-Verhaltensziel gehoert zuerst auf das
Qwen3.5-4B-Basismodell; fuer den VLM-Lauf braucht es Bild-Daten und eine eigene
Bild-/Text-Evaluation. Die Snapshot-Verzeichnisse koennen als `MODEL=` direkt
verwendet werden, wenn der Python-Prozess dasselbe Laufwerk sieht. Auf HF Jobs
ist der lokale `F:`-Cache nicht vorhanden; dort Hub-IDs verwenden.

Vision-Korpus (JSONL, Bildpfade relativ zur Korpusdatei):

```json
{"messages":[{"role":"user","content":[{"type":"text","text":"Beschreibe den Fehler im Screenshot und den naechsten sicheren Tool-Schritt."},{"type":"image","image":"screenshots/example.png"}]},{"role":"assistant","content":[{"type":"text","text":"Der Build zeigt einen fehlenden Import. Ich pruefe zuerst die betroffene Datei und die Importpfade."}]}]}
```

`task finetune:train-vision CORPUS=<jsonl> MODEL=unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit MAX_SEQ_LENGTH=1024 DRY_RUN=1`
validiert Format und Bildpfade ohne GPU-Last. Der echte Lauf braucht mindestens
10 GiB frei auf der sichtbaren CUDA-GPU (Startwert, per CLI aenderbar); die
aktuelle 5070 Ti war bei der Inspektion belegt. Bilder werden beim Laden auf
maximal 768 × 768 Pixel verkleinert. Screenshots mit Code, Logs und UI-Zustaenden
duerfen vor dem Training keine Secrets enthalten. Die Bildbeispiele getrennt
von den Text-Traces evaluieren; ein niedriger Trainings-Loss allein genuegt nicht.

* **Qwen3.5-4B:** 16-bit/bf16 LoRA auf einem unquantisierten Basismodell. Unsloth
  [raet von QLoRA fuer Qwen3.5 ab](https://unsloth.ai/docs/models/qwen3.5/fine-tune),
  weil dessen Quantisierungsabweichung erhoeht ist. Ein bereits heruntergeladenes
  `bnb-4bit`-Repo ist kein 16-bit-Basismodell. `--allow-qwen35-4bit` ist nur fuer
  einen bewusst evaluierten Vergleichslauf vorgesehen.
* **Qwen3.5-4B-Vorgaben:** 16-bit LoRA bleibt der
  Default. Das Windows-Experiment unter `windows-native/` ist ein historisches
  Beispiel; seine gemessenen 8.97 GB Peak-VRAM gelten fuer genau dessen 2048er
  Korpus, Batch und Modell, nicht als allgemeine 4B-Garantie.
* `train.py` benutzt TRLs aktuelle `SFTConfig(max_length=...)`- und
  `SFTTrainer(processing_class=...)`-Schnittstellen. Ein separates
  `--eval-corpus` aktiviert Validierungsverlust. Verhalten muss danach mit
  `eval_harness.py` gegen das Basismodell gemessen werden.

### Zwei lokale GPUs

`--gpu-mode single` ist der Default. Auf der RTX 5070 Ti (16 GB) einen 4B-Lauf
zuerst allein messen; die RTX 3060 Ti (8 GB) kann waehrenddessen eigene Dienste
tragen. **VRAM addiert sich nicht zu einem 24-GB-Geraet.** `--gpu-mode balanced`
setzt Unsloths `device_map="balanced"` fuer einen einzelnen Prozess und verteilt
Modellteile auf beide sichtbaren CUDA-GPUs. Dieser Modus ist experimentell und
braucht einen realen Kurzlauf mit Peak-VRAM- und Durchsatzmessung. Wegen der
ungleichen Karten kann die 8-GB-Karte zuerst voll sein oder den Lauf bremsen.
DDP/`torchrun` repliziert das Modell je GPU und ist keine VRAM-Zusammenlegung;
`balanced` wird deshalb nicht mit DDP kombiniert. Siehe
[Unsloth Multi-GPU](https://unsloth.ai/docs/basics/multi-gpu-training-with-unsloth).

Vor einem lokalen Lauf `nvidia-smi -L` und `CUDA_VISIBLE_DEVICES` pruefen. Die
WSL-Defaultmaske zeigt laut `docs/runbooks/freetoken-native.md` nur die 3060 Ti;
fuer die 5070 Ti deren UUID explizit setzen. Auf Windows ist im historischen
`unsloth-train`-Venv bereits ein funktionierender PyTorch/Unsloth-Stack belegt.
Am 2026-09-27 sah dieses Venv standardmaessig nur die 3060 Ti. Eine
**prozesslokale** PowerShell-Maske mit beiden UUIDs liess PyTorch beide Karten
in der Reihenfolge 5070 Ti, 3060 Ti erkennen. Die 5070 Ti hatte zum Messzeitpunkt
nur 337 MiB frei; vor einem Training muss ihr laufender Dienst beendet sein.

```powershell
# UUIDs fuer den eigenen Host mit nvidia-smi -L ermitteln; nur diese Shell aendern.
$env:CUDA_VISIBLE_DEVICES = 'GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4,GPU-6b9ac882-e9e9-a364-4423-92d838536b86'
python -c 'import torch; print([(torch.cuda.get_device_name(i), round(torch.cuda.get_device_properties(i).total_memory / 2**30, 1)) for i in range(torch.cuda.device_count())])'
```

Erst `torch.cuda.is_available()` und beide Geraetenamen pruefen, dann bei Bedarf
mit [Unsloths Windows-Anleitung](https://unsloth.ai/docs/get-started/install/windows-installation)
aktualisieren. Ein 16-bit-LoRA-Lauf auf Qwen3.5 braucht nach Unsloths Messung
etwa 10 GB VRAM bei kurzer Sequenz; Korpuslaenge, Batch und belegter VRAM koennen
mehr erfordern.

### Repo-Verhalten als Trainingsziel

Der Korpus soll **beobachtete, erfolgreiche Handlungen** lehren: Dispatch-Paket
lesen, passende Tools waehlen, echte Tool-Ergebnisse verarbeiten, kleine Edits
verifizieren und ein knappes Status-/Dateien-/Befund-Ergebnis liefern.
Fruehere Korpora enthielten historische Laeufe (bis T900399);
`collect_teacher_traces.py` kann bewusst konstruierte Grenzfaelle erzeugen.
Jede Zeile muss zum *tatsaechlichen* Tool-Schema und Prompt des Ziel-Slots passen.
Bei Tool-Use-Beispielen gehoeren auch Faelle **ohne** Tool-Aufruf, fehlgeschlagene
Tools, unpassende Tools und knappe Budgetgrenzen dazu. Im Windows-Vorversuch
fuehrten 84 % Tool-Demos zu unnoetigen Tool-Aufrufen; ein ausgewogenes Set und
gleiche Tool-Kontexte bei positiven/negativen Beispielen waren entscheidend.

Vor dem Training: Secrets und private Inhalte entfernen, duplizierte Episoden
entfernen, Train/Validation nach Ticket oder Szenario trennen, Beispieldialoge
manuell pruefen und den unveraenderten Basismodell-Score auf
`testsets/agent-actions.jsonl` festhalten. Trainings-Loss allein ist kein
Akzeptanzkriterium. Modell-Chat-Template und produktiver Systemprompt muessen
bei Training und Evaluation uebereinstimmen.

Alle Schritte sind zusaetzlich als Taskfile-Tasks verfuegbar (`Taskfile.finetune.yml`,
Namespace `finetune:`):

```bash
task finetune:measure CORPUS=<jsonl> MODEL=<label> TEMPLATE_FILE=<jinja> OUT=<report.json>
task finetune:guard   HUB_TEMPLATE=<hub.jinja> PATCHED_TEMPLATE=<patched.jinja> CORPUS=<jsonl>
task finetune:train    CORPUS=<jsonl> MODEL=<hf-id> MEASURE_REPORT=<report.json> MAX_SEQ_LENGTH=<n> [DRY_RUN=1]
task finetune:traces   ROWS_JSON=<mcp-postgres-export.json> OUT=<jsonl> [WITH_CONTEXT=1 COMMENTS_JSON=<kommentare.json>]
task finetune:export   ADAPTER_DIR=<dir> SLOT_NAME=<name> HUB_TEMPLATE=<hub.jinja> [DRY_RUN=1]
```

## Korpusformat

JSONL, eine Trainingszeile pro Zeile, TRL-Chat-Format:

```json
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

`measure_corpus.py`, `template_guard.py`, `train.py` und `collect_teacher_traces.py` teilen
dieses Format — derselbe Korpus laeuft unveraendert durch alle Schritte. Mit
Kontext-Anreicherung enthaelt `messages` zusaetzlich `user`/`assistant`-Turns fuer
Beschreibung und Kommentare, chronologisch vor dem abschliessenden Assistant-Turn mit den
Phase-Event-Zeilen.

## Vorbedingungen (hart erzwungen von `train.py`)

- **Messbericht** unter dem per `--measure-report`/`MEASURE_REPORT` angegebenen Pfad muss
  existieren (Ausgabe von `measure_corpus.py`).
  Ein echter Trainingslauf verlangt `tokenizer_source=transformers` und eine explizite
  `MAX_SEQ_LENGTH` aus der gemessenen Verteilung; der heuristische CI-Fallback
  und ein geratenes 2048er-Default sind kein Trainingsnachweis.
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
Ein echter Trainingslauf braucht den GPU-Host (siehe Unsloth/TRL-Upstream) und ist Teil der
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
laufenden Slots gehoert nicht in einen Trainingslauf.

## Trainingsartefakte

`outputs/`, `*.gguf` und Unsloth-Kompilat-Caches sind ueber `scripts/finetune/.gitignore`
ausgeschlossen (umgezogen aus dem entfernten `unsloth_training_setup/.gitignore`).
Die Trainer schreiben jetzt pro Lauf eine `run-manifest-<uuid>.json` und
`trainer-metrics-<uuid>.jsonl` in ihren Output-Ordner. Die Default-Ordner liegen
unter `scripts/finetune/outputs/train` bzw. `scripts/finetune/outputs/vision`.

### Langfuse fuer Unsloth-Laeufe

Die Integration nutzt die aktuelle Python-SDK-v4-API. Im GPU-Venv `pip install
'langfuse>=4.7,<5'` ausfuehren und `LANGFUSE_PUBLIC_KEY` sowie
`LANGFUSE_SECRET_KEY` als Umgebungsvariablen setzen; fuer eine eigene Instanz
zusaetzlich `LANGFUSE_BASE_URL`. Beide Keys zusammen aktivieren Tracking automatisch.
Bei gesetzten Keys werden SDK-Installation und Authentisierung **vor** dem
GPU-Lauf geprueft. Ohne Keys laufen Training und Evaluation lokal weiter.

Langfuse erhaelt einen Trace pro Text- oder Vision-Lauf: Modell-ID/Revision,
Git-Commit, Paketversionen, gewaehlte Hyperparameter, Korpus- und
Messbericht-SHA256 samt Zeilenzahlen, bei Vision auch einen Sammel-Hash der
Bilddateien, GPU-Namen/Kapazitaet, Lernsignal-Anteil (Text), finale
Trainings-/Validierungsmetriken und Adapter-Datei-Fingerprints. Die komplette
Metrik-Zeitreihe bleibt lokal im JSONL; auf HF Jobs wird sie zusammen mit einem
bereinigten Manifest unter `training-runs/<run-id>/` im Adapter-Hub-Repo
gesichert. `eval_harness.py` sendet bei echten Modell-Laeufen aggregierte
Base/Tuned-Scores und Regressionen als separaten Trace. Lokale Fixture-Tests
werden nicht gesendet. Die Testset-Version wird per SHA256 festgehalten.

Rohkorpora, Screenshots, Prompts, Modellantworten und Gewichte werden nicht an
Langfuse gesendet. Das Hub-Manifest enthaelt keinen lokalen Adapter-Pfad.
Langfuse ersetzt weder den privaten Trainingsdatenspeicher noch das Adapter-Repo.
Ein Langfuse-Datensatz mit einzelnen Testfaellen erfordert eine separate,
bewusst freigegebene Datenfreigabe. Die Evaluations-Scores lassen sich nach
identischem Testset-Hash vergleichen; die Vision-Bewertung braucht weiterhin
ein eigenes Bild-Testset.

## Trainingspfad nach dem WSL-Exit: HF Jobs Cloud (primär)

Mit dem WSL-Exit (ADR-007) verlieren die lokalen Unsloth-Venvs (~/.venvs) ihr
Zuhause — Fleet-Worker haben keine GPU. Der primäre Trainingspfad ist jetzt
**HF Jobs Cloud**:

```bash
# Voraussetzung: HF_TOKEN exportiert (write-Scope fuer Adapter/GGUF)
task finetune:hf-jobs:train CORPUS=<jsonl> MODEL=<hf-id> MEASURE_REPORT=<json> MAX_SEQ_LENGTH=<n> HUB_MODEL_ID=<user/adapter-repo> FLAVOR=l4x1
# Nach abgeschlossenem Trainingsjob und bestandener Evaluation:
task finetune:hf-jobs:export ADAPTER_REPO=<user/adapter-repo> GGUF_REPO=<user/gguf-repo> FLAVOR=l4x1
hf download <user/gguf-repo> --local-dir <registry-pfad>
```

* Das Trainings-Target packt nur Skripte, Messbericht und angegebene Korpora
  in ein temporaeres Input-Bundle. Es laedt das Modell im Job neu; lokale
  Modell-Caches stehen dort nicht zur Verfuegung. Der Hub-Adapter bleibt nach
  Job-Ende erhalten. Keine ungeprueften oder vertraulichen Korpora hochladen.
* GPU-Job und GGUF-Export sind asynchron und kostenpflichtig. `--timeout 2h`
  ist ein Startwert; Laenge und Kosten vor dem Start anhand Korpus und Flavor
  einschaetzen. **Trackio** sammelt Trainingsmetriken; Langfuse erfasst bei
  gesetzten Keys den Lauf und die spaeteren Vergleichs-Scores. Das Job-Target
  gibt die Langfuse-Keys als HF-Job-Secrets weiter, niemals als CLI-Werte.
* Das GGUF landet zuerst im separaten Hub-Repo. Nach Job-Ende per `hf download`
  in den Registry-Pfad holen und `eval_harness.py` gegen das Basismodell laufen
  lassen. Die Modell-Registry wird erst nach dieser Pruefung aktualisiert.
* Die lokalen Targets (`finetune:train/export` mit gpu-lock.sh) bleiben
  funktionsfähig, sind aber **deprecated**: sie setzen eine WSL/GPU-Laufzeit
  voraus, die es nach dem WSL-Shutdown nicht mehr gibt.
