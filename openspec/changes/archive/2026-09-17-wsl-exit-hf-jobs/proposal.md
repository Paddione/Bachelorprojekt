# Proposal: wsl-exit-hf-jobs

## Why

Die Unsloth-Trainingsvenvs liegen unter `~/.venvs` in WSL. Nach dem WSL-Exit
haben sie kein Zuhause mehr: Fleet-Worker sind 4 vCPU / 8 GB ohne GPU, und ein
eigener GPU-Node bleibt später optional. Der Trainingspfad wandert auf HF Jobs
Cloud (Muster: huggingface-llm-trainer / unsloth-buddy Skills, UV-Scripts nach
PEP 723), damit `finetune-run` ohne lokale Laufzeit funktioniert.

_Ticket: T016438_ · Parent-Epic: T016422 · prio niedrig, blockiert nichts.

## What Changes

1. **Doku**: Trainingspfad HF Jobs in `scripts/finetune/README.md` (bzw.
   bestehender Doku-Stelle) — UV-Inline-Metadaten, Trackio-Monitoring,
   GGUF-Export in den Modell-Registry-Pfad.
2. **Taskfile-Anpassung** `Taskfile.finetune.yml`: Targets so umbauen, dass
   Läufe via HF Jobs gestartet werden (CLI-Aufrufe); lokale Targets als
   deprecated markiert bleiben funktionsfähig, solange WSL existiert.
3. **Keine Code-Zwänge**: Messreihen-Skripte werden cloud-fähig dokumentiert;
   tatsächliche Läufe nur bei Bedarf.

## Impact

- Affected specs: `modell-registry-training-grounds`
- Affected code: `scripts/finetune/`, `Taskfile.finetune.yml`
- GPU-Node im Cluster bleibt explizit ausgenommen (später optional).
