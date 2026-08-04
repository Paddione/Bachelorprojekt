---
name: finetune-run
description: 'Repo-Trainingslauf fuer LLM-Finetuning im Bachelorprojekt (Unsloth/TRL, scripts/finetune/). Triggers on: LLM finetunen, Modell trainieren, LoRA training, GGUF export, scripts/finetune/, Taskfile.finetune.yml, finetune:measure/guard/train/traces/export, T002587, T002606. Verbindet die Repo-Konventionen (Ticket, Worktree, Vorbedingungs-Gates) mit dem unsloth-buddy-Plugin — ruft dessen Referenzwissen auf, statt dessen Code zu kopieren.'
---

# finetune-run — Repo-Trainingslauf mit Unsloth/TRL

## Wann diese Skill greift

Ein Trainingslauf **innerhalb dieses Repos** — nicht eine allgemeine Unsloth/TRL-API-Frage
(dafuer direkt das Plugin-Skill `unsloth-buddy` konsultieren, siehe unten). Signale: `scripts/finetune/`,
`Taskfile.finetune.yml`, `finetune:*`-Tasks, "Modell trainieren/finetunen", GGUF-Export fuer
`llm-proxy`.

## Warum ein eigenes Repo-Skill statt direkt unsloth-buddy

`unsloth-buddy` kennt Unsloth/TRL, aber nicht die Vorbedingungen, die der Vorversuch
(`unsloth_training_setup/`, siehe T002587) teuer gelernt hat: ein geratenes `max_seq_length`
kuerzte 45% des Korpus, ein driftendes Chat-Template kostete Trainings-/Serving-Konsistenz.
Dieses Skill erzwingt die Reihenfolge; die eigentliche Unsloth/TRL-Fachkompetenz kommt vom
Plugin.

## Ablauf

1. **Ticket + Worktree.** Trainingslaeufe sind Chore/Feature-Arbeit wie jede andere — Ticket
   vorhanden, Arbeit im Worktree (`scripts/worktree-create.sh`), niemals im Hauptcheckout.
2. **Messschritt zuerst, IMMER vor der Modellwahl.**
   ```bash
   task finetune:measure CORPUS=<jsonl> MODEL=<label> TEMPLATE_FILE=<jinja> OUT=outputs/measure/<korpus>__<modell>.json
   ```
   Die Perzentile und die Machbarkeitsmatrix im Bericht entscheiden `max_seq_length` und die
   Modellgroesse — nicht eine Vermutung.
3. **Template-Guard vor jedem Training.**
   ```bash
   task finetune:guard HUB_TEMPLATE=<hub.jinja> PATCHED_TEMPLATE=<patched.jinja> CORPUS=<jsonl>
   ```
   Referenz ist immer das **Hub-Template** (vom Hugging Face Hub geladen), nicht das vom
   Framework in ein Adapterverzeichnis geschriebene. Bei Unklarheit ueber Unsloth/TRL-APIs zum
   Laden des Hub-Templates: `unsloth-buddy` konsultieren, nicht raten — die APIs aendern sich
   haeufig.
4. **Trainingslauf.**
   ```bash
   task finetune:train CORPUS=<jsonl> MODEL=<hf-id> MEASURE_REPORT=<report.json> [DRY_RUN=1]
   ```
   `DRY_RUN=1` validiert nur Vorbedingungen und Konfiguration (kein GPU/unsloth/trl noetig) —
   nuetzlich, um die Aufrufkette lokal zu pruefen, bevor der eigentliche GPU-Lauf startet.
5. **Optional: Factory-Traces als Korpus.**
   ```bash
   task finetune:traces ROWS_JSON=<mcp-postgres-export.json> OUT=<jsonl>
   ```
   Nur erfolgreiche Ticket-Laeufe (verify/pass) werden uebernommen; Secret-Muster werden
   redigiert. `ROWS_JSON` kommt aus einem vorgeschalteten `mcp__mcp-postgres__query`-Aufruf
   (siehe `.claude/skills/references/mcp-tool-guide.md`) — dieses Skript baut selbst keine
   DB-Verbindung auf.
6. **Export + Slot-Registrierung.**
   ```bash
   task finetune:export ADAPTER_DIR=<dir> SLOT_NAME=<name> HUB_TEMPLATE=<hub.jinja> [DRY_RUN=1]
   ```
   Der Export prueft den freien Speicher gegen den fp16-Merge-Bedarf, bevor er startet. Die
   Slot-Registrierung bei `llm-proxy` bleibt danach ein manueller Schritt (siehe
   `scripts/finetune/README.md`) — kein automatischer Austausch eines laufenden Factory-Slots.

## Fuer Unsloth/TRL-Fachfragen

Rufe `unsloth-buddy` (Skill) direkt auf fuer: LoRA-Parameter-Feinschliff, VRAM-Optimierung,
Vision/Multimodal-Finetuning, GGUF/vLLM/Ollama-Deployment-Details, aktuelle Unsloth/TRL-API-
Signaturen. Dieses Skill kopiert dessen Code nicht — es ruft es bei Bedarf auf.

## Vollabnahme

Ein echter GPU-Trainingslauf gegen das Basismodell ist Teil der Vollabnahme (T002606), nicht
dieses Skills. Ein Adapter ohne diese Messung wird nicht als Factory-Slot ausgeliefert.
