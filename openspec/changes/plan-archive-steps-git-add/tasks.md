---
title: Plan: git add-Liste der plan-archive-steps-Referenz deckt openspec/specs/ ab (T004271)
ticket_id: T004271
domains: [docs, test]
status: plan_staged
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-archive-steps-git-add Implementation Plan — git add-Liste deckt openspec/specs/ ab (T004271)

## File Structure

| Datei | Aktion |
|---|---|
| `.claude/skills/references/plan-archive-steps.md` | modifizieren (git add-Liste, Zeile 90) |
| `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats` | neu (Guard, im Stage-Commit enthalten) |
| `openspec/changes/plan-archive-steps-git-add/specs/openspec-workflow.md` | neu (Delta, im Stage-Commit enthalten) |
| `openspec/changes/plan-archive-steps-git-add/design.md` | neu (Design, im Stage-Commit enthalten) |

S1-Budgets: keine der Dateien ist in `docs/code-quality/baseline.json` gebaselined
(`nicht-baselined`), die Referenz ändert sich zeilenneutral (eine bestehende Zeile
wird ergänzt), die Testdatei ist neu — keine Ratchet-Beschränkung.

## Task 1: RED — Guard-Test gegen die git add-Liste der Referenz (im Stage-Commit enthalten)

- Datei: `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats` (neu)
- Zwei Tests: (1) Positiv-Anker, dass die Referenz eine `git add`-Zeile mit
  `openspec/changes/` trägt; (2) die `git add`-Liste deckt jeden vom Archiv-Verb
  mutierten Pfad ab (`openspec/changes/`, `openspec/changes/archive/`,
  `openspec/specs/`, `website/src/data/openspec-status.json`).
- Prüfmodus: Querschnitts-Doku-Guard (Ausnahme T002448-M4, im Test-Header
  dokumentiert) — das Ergebnis manifestiert sich ausschließlich im Quelltext
  der Referenz.
- Testlauf (echter Testrunner):
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats
  ```
- expected: FAIL — Test 2 schlägt fehl, weil `openspec/specs/` in der
  `git add`-Liste der Referenz fehlt (`git add-Liste deckt den vom
  Archiv-Verb mutierten Pfad 'openspec/specs/' nicht ab`). Verifiziert am
  2026-08-14 im Stage-Commit-Zustand.

## Task 2: GREEN — Referenz um openspec/specs/ ergänzen

- Datei: `.claude/skills/references/plan-archive-steps.md` (Zeile 90)
- Die `git add`-Liste vor dem Archiv-Commit ergänzen — analog zur
  openspec-status.json-Zeile:
  ```bash
  git add openspec/changes/ openspec/changes/archive/ openspec/specs/ website/src/data/openspec-status.json
  ```
- `git add <dir>/` staged Modifikationen und Löschungen innerhalb des
  Verzeichnisses — die zweite Zeile (`git add -u -- website/... docs`) bleibt
  unberührt; kein Eingriff in `scripts/openspec.sh cmd_archive` (dessen
  eigenes Staging der Status-Map bleibt, T003136).
- Testlauf (echter Testrunner):
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats
  ```
- expected: PASS — beide Tests grün.

## Task 3: Verify

- `task test:changed` — CI-Äquivalent offline (mindestens die neue BATS-Datei
  und die bestehenden Referenz-Guards in `tests/spec/openspec-workflow*`).
- `task freshness:regenerate` — OpenSpec-Status/Test-Inventar aktualisieren.
- `task freshness:check` — Konsistenz der generierten Artefakte.
- Zusätzlich: `tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow*`
  (beide Formen, T002696).
