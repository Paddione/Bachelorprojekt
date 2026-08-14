---
title: Restore staged-task requirement in software-factory SSOT
ticket_id: T005308
domains: [factory, test]
status: planning
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Restore staged-task requirement in software-factory SSOT — Implementation Plan

Der MODIFIED-Delta von `sf-scheduling-test-drift` (archiviert via PR #4440) ersetzte das
Requirement `The Software Factory picks up staged task tickets` in
`openspec/specs/software-factory.md` durch einen additiven Partialtext — sechs Szenarien und
die Kern-Prosa gingen verloren (591 → 586 Szenarien). Dieser Change stellt den vollständigen
Text wieder her (Pre-Stand 975b3295a + das neue is_test_data-Szenario), sichert die
Vollständigkeit per BATS-Guard und dokumentiert die MODIFIED-Semantik in
`openspec/config.yaml`.

## File Structure

- `openspec/specs/software-factory.md` — Sektion des Requirements wiederherstellen (Task 2)
- `openspec/config.yaml` — Konventionsregel MODIFIED=Ersatztext ergänzen (Task 3)
- `tests/spec/software-factory/ssot-staged-task-requirement.bats` — Guard (Task 1)

## Task 1 — RED: Vollständigkeits-Guard schreiben und rot nachweisen

1. Lege `tests/spec/software-factory/ssot-staged-task-requirement.bats` an (Prüfmodus:
   Source-Grep auf die SSOT-Spec, T002448-M4-Ausnahme; Positiv-Anker vor Negativ-Aussage,
   T002356-M1).
2. Der Guard prüft: Requirement-Header existiert; alle 7 Szenario-Titel vorhanden
   (6 wiederherzustellende + `queue.sh never surfaces is_test_data fixtures`); Kern-Prosa-Anker
   (`type <> 'project'`, `Staged tickets SHALL NOT require`, `chore/<slug>` work,
   `is_test_data = true`).
3. Rot nachweisen auf dem aktuellen Stand (6 Szenarien fehlen):
   `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/ssot-staged-task-requirement.bats`
   — erwartet: FAIL (`expected: FAIL`, 2 der 3 Tests rot, nur der Header-Test grün).

## Task 2 — GREEN: Requirement-Sektion in openspec/specs/software-factory.md wiederherstellen

1. Die Sektion `### Requirement: The Software Factory picks up staged task tickets` ersetzen
   durch den vollständigen Text aus dem Delta `openspec/changes/staged-task-requirement-restore/
   specs/software-factory.md` (identischer Wortlaut — das Delta trägt den finalen Ersatztext).
   Quelle für die 6 Szenarien: `git show 975b3295a:openspec/specs/software-factory.md`
   (Sektion ab Zeile 1271).
2. Prüfen: kein anderer Teil der Spec verändert; das nachfolgende Requirement
   `Semi-automatic eval fixture generator` bleibt unberührt.
3. Guard grün fahren: derselbe bats-Aufruf wie in Task 1 — erwartet: 3/3 PASS.

## Task 3 — Konventionsregel in openspec/config.yaml

Unter `rules.specs` ergänzen: „MODIFIED-Deltas tragen den vollständigen Ersatztext des
Requirements (Prosa + alle Szenarien) — kein additiver Partialtext. Die Archivierung ersetzt
die Sektion vollständig."

## Task 4 — Verifikation

- `task test:changed` — Guard und umliegende Spec-Tests grün
- `task freshness:regenerate` + `task freshness:check` — generierte Artefakte aktuell
- `bash scripts/openspec.sh validate <slug>` — Delta valide
