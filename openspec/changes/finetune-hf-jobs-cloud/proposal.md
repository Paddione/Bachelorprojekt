# Proposal: finetune-hf-jobs-cloud

## Why

Die Unsloth-Venvs (~/.venvs im WSL-Dev-Host) verlieren mit dem WSL-Exit
(T016423, ADR-007) ihr Zuhause: Die Fleet-Worker-Nodes sind 4 vCPU/8 GB ohne
GPU. Der Trainingspfad wandert auf HF Jobs Cloud (Muster: Skills
`huggingface-llm-trainer`/`unsloth-buddy`, UV-Scripts mit PEP-723-Inline-
Metadaten). Priorität niedrig — blockiert nichts im Epic; es geht um Doku +
Taskfile-Targets, nicht um erzwungene Läufe [T016438].

## What

1. **Doku:** `scripts/finetune/README.md` um Abschnitt „HF Jobs Cloud
   (WSL-Exit)“ erweitern: UV/PEP-723-Muster, `hf jobs`-Aufruf für SFT/
   LoRA-Läufe, Trackio-Monitoring, GGUF-Export zurück in den Modell-
   Registry-Pfad (`scripts/finetune/model-registry.sh`,
   `registry-db.sql` unverändert).
2. **Targets:** `taskfiles/Taskfile.finetune.yml` um Cloud-Ziele ergänzen
   (`train:cloud`, `export:cloud` — Namen final beim Implementieren an die
   bestehende Namensgebung angeglichen), die auf die UV-/hf-jobs-Aufrufe
   münden; lokale Targets bleiben funktionsfähig, erhalten aber einen
   Deprecated-Hinweis in der Beschreibung.
3. **Explizit nicht:** keine Skript-Rewrites, kein GPU-Zwang, keine
   Migrationspfade für die WSL-Venvs selbst (sterben mit dem Host).

Keine Änderungen an Messskripten (measure_corpus.py etc.) — sie laufen
CPU-seitig weiter; Cloud-Fähigkeit ist dokumentiert, nicht refactored.

_Ticket: T016438_
