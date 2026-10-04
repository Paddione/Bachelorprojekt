---
id: P3
role: impl
ticket: T901014
depends_on: []
target_files:
  - scripts/plan-lint.sh
---

# P3 — Validierung ohne .md-Reste

## Ziel

Fail-closed Gate in `plan-lint.sh`: Plaene ohne `.md`-Reste validieren.
Statt Rest-Dateien als Ablage zu dulden, schlaegt das Gate fehl, sobald
das Maschinen-Format unvollstaendig ist. Kein neues `.md`-Artefakt.

## Betroffene Datei

- `scripts/plan-lint.sh` (716 LOC, Restbudget 84 — nur Gate-Logik, kein Split)

## Concrete-Steps

1. Relevante Gate-Funktionen in `scripts/plan-lint.sh` lesen (`_manifest_rows`, `_check_intel_completeness`, `emit_verdict`).
2. Harte Pruefung ergaenzen: fehlende `intel.json`-Abdeckung pro Partial-Target -> FAIL (kein Warn-Fallback).
3. Pruefung ergaenzen: Partial ohne maschinenlesbares Manifest-Feld -> FAIL statt `.md`-Rest zu akzeptieren.
4. Disjoint-Gate D1/D2 unveraendert lassen, nur Fehlermeldung mit Partial-ID und Pfad praezisieren.
5. `emit_verdict`-Ausgabe pruefen: FAIL-Reason nennt Datei + verletzte Regel, keine leeren Gruende.
6. `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` -> PASS nach Aenderung.
7. Betroffene BATS laufen lassen: `tests/spec/llm-local-dev/` (plan-lint-nahe Specs) -> exit 0.

## Gate

- `bash scripts/plan-lint.sh .agents/plans/worker-machine-format/tasks.md` -> PASS (auf sich selbst anwendbar).
- BATS der betroffenen Specs (`tests/spec/llm-local-dev/`) -> exit 0.

## Disjunktheit

- P1: `workers.mjs` + Runner-Dispatch. P2: `plan.mjs`-Manifest/Prompt-Bau. P4: Tests/Fixtures. P3 fasst nur `plan-lint.sh` an, keine Ueberschneidung.
