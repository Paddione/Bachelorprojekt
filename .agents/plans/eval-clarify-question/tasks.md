---
title: "Eval-Clarify: Rückfrage als 1.0 werten"
ticket_id: T901271
domains: [finetune, tests]
status: active
file_locks: [scripts/finetune/eval_harness.py, scripts/finetune/eval_scoring.py, tests/spec/unsloth-eval-harness/clarify-question.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# eval-clarify-question — Implementation Plan

Fixt T901271 (Bug): `score_clarify_case` belohnt nur Schweigen; eine korrekte
Rückfrage parst zu `[__malformed__]` und kassiert 0.0. Design und verworfene
Option stehen in `proposal.md` im selben Ordner (User-Entscheidungen vom
2026-10-08, Ticket-Timeline).

## File Structure

- `scripts/finetune/eval_harness.py` (307 Zeilen, kein S1-Baseline-Eintrag):
  `parse_action_output` meldet Frage-ähnlichen Rohtext als
  `[{"name": "__question__", "params": {}}]` (neue Konstante
  `QUESTION_ACTION_NAME` neben `MALFORMED_ACTION_NAME`). Delta ~10 Zeilen.
- `scripts/finetune/eval_scoring.py` (205 Zeilen, kein S1-Baseline-Eintrag):
  `score_clarify_case` wertet `[]` oder `[__question__]` mit 1.0, sonst 0.0.
  `_is_well_formed_action` und beide anderen Scorer unverändert. Delta ~8 Zeilen.
- `tests/spec/unsloth-eval-harness/clarify-question.bats` (neu, bereits RED):
  4 Fälle über die echte Kette (Frage→clarify 1.0; erfundene Action→0.0;
  Frage→action 0.0; Frage→no_action 0.0).

## Quality budgets

Keine geänderte Datei in `docs/code-quality/baseline.json` (leere
Finetune-Sektion) — keine S1-Schwelle betroffen. `.py` ohne S1-Limit hier;
Deltas je <20 Zeilen. S2: keine TS-Imports. S3: keine Brand-Literale
(Testtexte sind generische Meeting-Fragen). S4: Skripte weiter über
`eval-runner.sh`/CLI erreichbar, kein Orphan. Keine Ignore-Ausnahme nötig.

## Tasks

- [ ] **1. Failing-Test laufen lassen und FAIL erwarten (RED bereits vorhanden).** `tests/spec/unsloth-eval-harness/clarify-question.bats`
  mit `tests/unit/lib/bats-core/bin/bats` laufen lassen — expected FAIL in
  Fall 1 (Frage→clarify aktuell 0.0 statt 1.0); Fälle 2–4 PASS als Pins. Beleg ins Ticket.
- [ ] **2. Parse-Marker implementieren.** In `eval_harness.py`
  `QUESTION_ACTION_NAME = "__question__"` ergänzen; `parse_action_output`
  gibt für Frage-ähnlichen Text (`strip()` nicht-leer, kein JSON-Listen-Parse,
  endet mit `?`, beginnt nicht mit `[`/`{`/`` ``` ``) `[__question__]` zurück.
  Ablauf-Fences und Halbsätze ohne `?` bleiben `__malformed__`.
- [ ] **3. Scorer-Regel implementieren.** In `eval_scoring.py`
  `score_clarify_case`: `actual == []` oder genau `[__question__]` → 1.0,
  sonst 0.0 mit bisheriger Reason. Docstring-Satz präzisieren
  (Frage ODER Schweigen). Keine Änderung an den anderen beiden Scorern.
- [ ] **4. GREEN + Suite.** RED-Datei grün laufen lassen; danach volle
  Harness-Suites (`unsloth-eval-harness/`, `agent-bench/scoring.bats`)
  ohne neue Fails. `task test:changed` als Gate.
- [ ] **5. Verify und Fixture-Rescore (Beleg, kein Commit).** In `/tmp` die
  vorhandenen Fixtures (`tune-*-fixed`, `baseline-35instruct`) mit dem
  gefixten Scorer neu werten und das clarify-Delta ins Ticket schreiben.
  Erwartung: aktuelle Adapter bleiben bei clarify 0.0 (sie stellen Aktionen,
  keine Fragen) — der Fix macht künftiges Clarify-Training erst messbar.
  `task freshness:regenerate` + `task freshness:check` zum Abschluss.
