# qwen35-planner-9b (T901060)

QLoRA-Finetune von Qwen3.5-9B zum Planner des Bachelorprojekts, lokal auf der RTX 5070 Ti, 0 €.
Spec: `docs/superpowers/specs/2026-10-04-qwen35-9b-planner-finetune-design.md`,
Plan: `.agents/plans/qwen35-9b-planner/tasks.md`. Zahlen jedes Laufs: `data/stats.json`.

## Orte

| Was | Wo |
|---|---|
| Code und Tests | dieses Verzeichnis |
| Daten, Checkpoints, GGUFs, Logs | `$QWEN35_PLANNER_HOME` (Standard `~/ml-data/qwen35-planner-9b`), außerhalb des Worktrees, weil der gitleaks-Pre-Commit-Scan mit `--no-git` den ganzen Baum liest |
| Pipeline-Env (ohne GPU-Stack) | `UV_PROJECT_ENVIRONMENT=~/.cache/uv-envs/qwen35-planner-9b` |
| Trainings-Env | `~/Bachelorprojekt/ml/qwen35-training/train/.venv` (unsloth 2026.9.14, torch 2.12.1) |
| Basis-Checkpoint | `hf download unsloth/Qwen3.5-9B` (identische 775 Tensoren wie `Qwen/Qwen3.5-9B`, inkl. MTP und Vision) |

```bash
export UV_PROJECT_ENVIRONMENT=~/.cache/uv-envs/qwen35-planner-9b PYTHONDONTWRITEBYTECODE=1
REPO=~/Bachelorprojekt/.worktrees/qwen35-9b-planner      # fester Commit für plan-lint
TRAIN_PY=~/Bachelorprojekt/ml/qwen35-training/train/.venv/bin/python
SNAP=$(ls -d ~/.cache/huggingface/hub/models--unsloth--Qwen3.5-9B/snapshots/*)
GPU="CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=1"   # 5070 Ti
uv run pytest -q
```

## Ablauf

1. **Prompts und Gold** (CPU, ~6 min):
   `uv run python -m planner.prompts --repo $REPO --heldout-areas security,website,ci`
   `uv run python -m planner.gold --repo $REPO`
2. **Generierungs-Server** (5070 Ti):
   `env $GPU llama-server -m <Qwen3.5-9B-Q4_K_M.gguf> --mmproj <mmproj> -ngl 999 -c 131072 -np 8 --port 19300 --jinja --reasoning-budget 3072 -fa on`
3. **RFT-Kandidaten** (~15 h für 800 Prompts, setzt per Resume fort):
   `uv run python -m planner.generate --repo $REPO --slots 8 --k 3 --stop-on-pass --limit 765`
4. **Replay** (parallel zu 3): `uv run python -m planner.replay --text-n 700 --vision-n 480 --slots 2`
5. **Verifier**: `uv run python -m planner.verify --repo $REPO`
6. **Mix** (Exit 2 mit Zahlen, wenn Gold < 1500 oder RFT < 500): `uv run python -m planner.mix`
7. **Server stoppen**, dann Training:
   `env $GPU $TRAIN_PY planner/train.py --dry-run` → `--max-steps 5` (Smoke, schreibt `out/smoke.json`) → voller Lauf ohne `--max-steps`.
8. **Export**: `env $GPU $TRAIN_PY planner/export.py --original $SNAP --adapter $QWEN35_PLANNER_HOME/out/lora`
   (Basis-Export ohne `--adapter` liegt bereits unter `out/base-gguf/`.)
9. **Gates**: `uv run python -m planner.evaluate --repo $REPO --gguf out/base-gguf --label base`,
   dasselbe mit `--gguf out/gguf --label tuned`, dann `--compare`.

Kaggle-Ausweichpfad für Schritt 7, falls lokal OOM bei 8k Kontext: Notebook-Vorlagen in
`ml/qwen35_pipe_2026_10_04/notebooks/` (2×T4, fp16 statt bf16).

## Abweichungen vom Spec (begründet)

- **Gold aus der ganzen Historie mit Begleitdokumenten:** Auftrag = Ticketbeschreibung > OpenSpec-`proposal.md`/`design.md` bzw. Superpowers-`spec_ref` > Einleitung des Plans. Das reine Ziel-Muster traf nur 901 von 2372 Plänen.
- **RFT-Prompt-Pool erweitert:** 655 Ticket-Prompts plus 581 Aufträge aus der Historie, weil 655 Prompts bei ~50 % Annahme unter der 500er-Grenze geblieben wären.
- **Context-Distillation:** Bei der Generierung stehen die plan-lint-Regeln und ein lint-sauberer Beispielplan (`.agents/plans/k3-health-monitoring/tasks.md`) im System-Prompt, im Trainingssample nicht.
- **Strengerer Verifier:** plan-lint PASS **und** höchstens 20 % 8-Gramm-Kopie aus dem Beispiel **und** mindestens 60 % der genannten Repo-Pfade existieren (oder ihr Elternordner). Ohne diese Filter bestanden auch Pläne mit erfundenen Pfaden.
- **k=3 mit Stopp beim ersten angenommenen Kandidaten**, eine lint-geführte Reparaturrunde. Reparierte Pläne gehen ohne Denkspur ins Training, weil diese sich auf die lint-Meldung bezieht.
- **Nur die 5070 Ti:** Die 3060 Ti ist durch Windows-Prozesse mit 7,2 von 8 GB belegt, ein zweiter Server lief dort mit 23 Tokens/s (Shared-Memory-Spill).
- **Special-Token-Filter im Mix:** Samples mit `<|im_start|>`, `<think>` u. ä. im Inhalt werden verworfen. Der eigene Plan dieser Pipeline lag sonst über `git log --all` in Gold.
