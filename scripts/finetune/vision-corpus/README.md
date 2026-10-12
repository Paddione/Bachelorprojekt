# Vision-Korpus — Qwen3-VL-4B-Instruct bnb-4bit Pilot (T900516)

Pilot-Korpus fuer bildgestuetzte Repo-Aufgaben (Screenshots, UI-Zustaende, Logs
in Bildern). Modell: `unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit`, Snapshot
`24b9da6f9f8fddac102e2240fa0d073f98c65b75` (`model_type=qwen3_vl`, verifiziert).
Format: siehe `scripts/finetune/README.md` (Bildpfade relativ zur Korpusdatei).

## Dateien

- `train.jsonl` — 6 Zeilen, Familien F1–F6 (Build-/Tool-Fehler, GPU-Status,
  Login-UI, Gruenfall ohne Aktion, CLI-Fehlbedienung, Repo-Log).
- `eval.jsonl` — 4 Zeilen, Familien F7–F10, disjunkt zu Train (Vollseiten-UI,
  pytest-Fehlbedienung, abgeschnittene Ausgabe, Gruenfall auf anderer Datei).
- `screenshots/` — 8 gerenderte Terminal-Screenshots (754 px breit, keine
  Skalierung beim Laden). F3/F7 referenzieren bestehende Design-Assets unter
  `assets/design-overviews/` (keine Duplikate).
- `sources/` — rohe, unveraenderte Befehlsausgaben je Render (Provenienz).

## Provenienz (alle Ausgaben echt, 2026-10-11, Host PK-Desktop/WSL)

| Familie | Befehl (exakt) | Split |
|---|---|---|
| F1 | `python3 -c "import PIL"` | train |
| F2 | `nvidia-smi --query-gpu=index,name,memory.total,memory.free --format=csv` | train |
| F3 | `assets/design-overviews/ops-login.png` (800x461, Bestand) | train |
| F4 | `python3 scripts/finetune/eval_scoring.py validate-testset scripts/finetune/testsets/agent-actions.jsonl` (rc=0) | train |
| F5 | `bash scripts/ticket.sh get --id T900516 --brand mentolder` | train |
| F6 | `git log --oneline -8` | train |
| F7 | `assets/design-overviews/korczewski-home.png` (1280x5744, Bestand) | eval |
| F8 | `python3 -m pytest --bogus-flag tests/py/unit -q` | eval |
| F9 | `nvidia-smi \| head -n 7` | eval |
| F10 | `... validate-testset scripts/finetune/testsets/instruct-worker.jsonl` (rc=0) | eval |

Render: 80-Spalten-Terminalemulation (DejaVuSansMono 15 px, `#1e1e1e`/`#d4d4d4`,
Befehlszeile `$ ...` + verbatim Ausgabe). Jede Antwort wurde gegen die
tatsaechlichen Pixel geprueft.

## Safety-Review (2026-10-11)

Alle Quellen und Pixel auf Secrets/Private Daten geprueft: keine Tokens, keine
Passwoerter, keine privaten Inhalte. `ops-login.png` zeigt den Benutzernamen
`patrick` (bestehendes, committetes Design-Asset, keine neue Exposition) bei
maskiertem Passwort; die Antwort behandelt das Passwort als unbekannt.

## Resize-/Lesbarkeit (768x768-Regel aus `train_vision.py`)

- Alle 8 Render sind 754 px breit und unter 768 px hoch → keine Skalierung.
- F3 (800x461) → 768x443, Texte gross, lesbar (visuell verifiziert).
- F7 (1280x5744) → 171x768, Kleingedrucktes nicht lesbar — bewusst als
  Eval-Halluzinationsprobe (erwartete Antwort: grob beschreiben, Zoom anfordern).
- Alle 8 Render wurden als Bild geoeffnet und auf Lesbarkeit geprueft.

## Dry-Run-Protokoll (2026-10-11, ohne GPU-Last)

```
task finetune:train-vision CORPUS=scripts/finetune/vision-corpus/train.jsonl \
  MODEL=/mnt/f/models/hub/models--unsloth--Qwen3-VL-4B-Instruct-unsloth-bnb-4bit/snapshots/24b9da6f9f8fddac102e2240fa0d073f98c65b75 \
  MAX_SEQ_LENGTH=2048 EVAL_CORPUS=scripts/finetune/vision-corpus/eval.jsonl DRY_RUN=1
→ vision corpus: 6 rows, 6 images
→ OK: vision corpus and model route validated; GPU not loaded
```

## VRAM-/Versions-Protokoll (Messung 2026-10-11 ~00:13 UTC+2)

- RTX 5070 Ti: 591 MiB frei / 16303 MiB (Serving-Last, kein Trainingsfenster).
- RTX 3060 Ti: ~3382 MiB frei / 8192 MiB (unter 10-GiB-Minimum).
- NVIDIA-SMI 615.78.05, KMD 617.42, CUDA UMD 13.4.
- WSL-Python 3.12.3, pytest 9.1.1, Repo-HEAD `24eda4aebc391ae10`.
- torch/Unsloth/TRL im WSL-System-Python nicht installiert (PEP 668);
  Trainingshost ist das Windows-`unsloth-train`-Venv (siehe `README.md`).

## Pilot-Entscheidungen

- `MAX_SEQ_LENGTH=2048`: Texte sind kurz (<200 Tokens geschaetzt), ein Bild
  passt bei 768-px-Kappe bequem dazu; auf dem Trainingshost per Measure-Lauf
  bestaetigen.
- Vision-Layers: Default trainieren (`finetune_vision_layers=True`);
  `FREEZE_VISION_LAYERS`-Vergleich nur bei Bedarf nach dem Pilot.
- Basislinie des unberuehrten VLM auf `eval.jsonl`: offen bis GPU-Fenster.

## GPU-Fenster (nach Freigabe der 5070 Ti)

```bash
export CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4
task finetune:train-vision CORPUS=scripts/finetune/vision-corpus/train.jsonl \
  MODEL=<snapshot-oben> MAX_SEQ_LENGTH=2048 \
  EVAL_CORPUS=scripts/finetune/vision-corpus/eval.jsonl DRY_RUN=1
task finetune:train-vision CORPUS=... MODEL=... MAX_SEQ_LENGTH=2048 \
  EVAL_CORPUS=scripts/finetune/vision-corpus/eval.jsonl
```

Default sind 60 Pilot-Schritte (`--max-steps`), Adapter unter
`scripts/finetune/outputs/vision/adapter` (nicht committen). Kein Serving-Cutover.

## Eval-Rubrik (bildgestuetztes Held-out)

Je Eval-Zeile: Korrektheit der Bildbeschreibung, keine Halluzination
(F7/F9 muessen Wissensluecken zugeben), sinnvolle naechste Tool-Entscheidung.
Text-only-Tests bleiben getrennt.
