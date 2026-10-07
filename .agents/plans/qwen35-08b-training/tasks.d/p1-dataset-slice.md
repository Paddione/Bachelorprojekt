---
id: P1
role: impl
ticket: T900979
depends_on: []
target_files:
  - .agents/training/generate_dataset.py
  - .agents/training/dataset_stats.json
---

# P1 — 0.8B Minimal Slice Definition & Stats (T900979)

## Ziel

Definition und Extraktion eines minimalen Trainings-Slices für triviale mechanische Arbeiten (Renames, Lockfile-Bumps, reine Doc-Syncs, CLI-Basics).
Filterung über ein `--slice-08b` Flag in `.agents/training/generate_dataset.py`.

## Betroffene Dateien

- `.agents/training/generate_dataset.py` (Zweig `--slice-08b` mit mechanischem Domain-Filter & Ankern)
- `.agents/training/dataset_stats.json` (Regenerierte Statistiken)

## Concrete Steps

1. In `generate_dataset.py` die Domain-Auswahl `SLICE_08B_DOMAINS` definieren (mechanische Aufgaben: `cli`, `boilerplate`, `gotchas`).
2. Filter-Funktion `is_slice_08b` und `apply_slice_08b` implementieren, die sicherstellt, dass nur exakt geankerte mechanische Paare in das 0.8B-Dataset gelangen.
3. Generierungsausgabe auf `dataset_08b.jsonl`, `dataset_08b_train.jsonl` und `dataset_08b_val.jsonl` leiten, wenn `--slice-08b` gesetzt ist.
4. `dataset_stats.json` um `slice_08b` Metriken erweitern.

## Gate

- `python3 .agents/training/generate_dataset.py --slice-08b` läuft fehlerfrei durch.
- `dataset_08b_train.jsonl` und `dataset_08b_val.jsonl` werden erzeugt.
