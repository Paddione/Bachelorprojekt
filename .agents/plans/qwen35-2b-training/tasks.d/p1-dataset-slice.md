---
id: P1
role: impl
ticket: T900978
depends_on: []
target_files:
  - .agents/training/generate_dataset.py
  - .agents/training/dataset_stats.json
---

# P1 — 2B-Dataset-Slice (T900978)

## Ziel

2B-Pilot-Slice aus `.agents/training/dataset.jsonl` (Stand: 279 Eintraege)
ableiten: single-file edits, config- und boilerplate-Paare mit exakten
Ankern (Befehl, Overlay, Context); Near-Dedup (Jaccard >= 0.60) plus
Antwort-Kappe und 95/5-Val-Split beibehalten; Stats neu erzeugen.

## Betroffene Dateien

- `.agents/training/generate_dataset.py` (einzige Logik-Aenderung)
- `.agents/training/dataset_stats.json` (regeneriertes Artefakt)

## Steps

1. `FACTS`-Basis lesen (DATASET_PLAN.md §1–§3) und Slice-Regel festlegen:
   2B-relevante Domains (cli, config, boilerplate, gotchas) filtern, Rest
   verwerfen; keine neuen fremden Quellen, `ml/`-Dirs nie anfassen.
2. Filter in `generate_dataset.py` einbauen (Flag `--slice-2b`, Default aus):
   Domain-Auswahl plus Anker-Pflicht (Antwort muss Befehl/Pfad/Overlay
   enthalten, sonst Drop); Dedup-Konstanten unveraendert lassen.
3. Generator laufen lassen und Split pruefen:
   `python3 .agents/training/generate_dataset.py --slice-2b`
   Danach `dataset_stats.json`: total_unique, by_domain, dropped_zaehler
   und train/val-Verhaeltnis ablesen.
4. Slice-Stats verifizieren: Summe by_domain == total_unique, train+val ==
   total, val ca. 5 %; bei Drift Filter nachschaerfen, kein Hand-Edit der Stats.
5. Scope-Guard: `git status --short` zeigt nur dieses Partial plus die zwei
   Target-Files; keine `ml/`-Aenderung, kein Commit, kein Push.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/qwen35-2b-training/tasks.md` = PASS.
- Slice-Stats verifizierbar: `dataset_stats.json` enthaelt gueltige
  total_unique/by_domain/train/val-Werte fuer den 2B-Slice.

## Disjunktheit

P1 owns Generator+Stats. P2 (train-config), P3 (eval), P4 (export) und
P5 (tests) bauen darauf auf und editieren keine P1-Dateien.
