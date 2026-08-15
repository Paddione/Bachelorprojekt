---
title: plan-archive-freshness-check
ticket_id: T006369
domains: [website, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# plan-archive-freshness-check — Implementation Plan

## File Structure

- `.claude/skills/references/plan-archive-steps.md` — zu härten (Schritt 7, Sequenz zwischen cherry-pick und push)
- `tests/spec/openspec-workflow/plan-archive-freshness-check.bats` — RED-Guard (liegt im Branch vor)
- `openspec/changes/plan-archive-freshness-check/specs/openspec-workflow.md` — ADDED-Delta (liegt im Branch vor)

## Task 1 — RED: Der Guard-Test liegt vor und ist rot

**Status im Stage-Commit bereits erbracht; der Implementer verifiziert den roten Zustand erneut.**

Der Querschnitts-Doku-Guard `tests/spec/openspec-workflow/plan-archive-freshness-check.bats`
(T006369) liegt im Branch vor und ist rot — die Referenz
`.claude/skills/references/plan-archive-steps.md` trägt zwischen `git cherry-pick "$ARCHIVE_COMMIT"`
und `git push -u origin "$ARCHIVE_BRANCH"` noch keinen `task freshness:check`-Aufruf und keinen
Amend-Pfad.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/plan-archive-freshness-check.bats
# expected: FAIL (beide Tests rot: "keine freshness:check-Verifikation zwischen
# cherry-pick und push", "kein git commit --amend im Drift-Pfad ...")
```

Prüfmodus (T002448-M4): Querschnitts-Doku-Guard — Source-Grep ist das angemessene Mittel, weil
die Referenz die ausführbare Prozedur IST (kein Laufzeitverhalten messbar). Positions-Check
per awk-Bereichsmuster (T003104), Positiv-Anker im ersten Test (T002356-M1).

## Task 2 — GREEN: plan-archive-steps.md um Pre-Push-Freshness-Verifikation härten

In `.claude/skills/references/plan-archive-steps.md` zwischen Zeile `git cherry-pick "$ARCHIVE_COMMIT"`
und `git push -u origin "$ARCHIVE_BRANCH"` die Verifikation einfügen:

```bash
# Freshness-Verifikation VOR dem Push (T006369): freshness:check regeneriert
# (Phase 0) und diffet gegen HEAD; meldet er Drift (Exit != 0), ist das
# committete openspec-status.json stale (beobachtet bei PR #4552: Regeneration
# lief, bevor die Archiv-Verschiebung sichtbar war). Dann die regenerierten
# Artefakte stagen und den Archiv-Commit amenden — BEVOR der Push den
# Archiv-Branch nach aussen traegt.
if ! task freshness:check; then
  echo "freshness:check meldet Drift — regenerierte Artefakte stagen und Archiv-Commit amenden" >&2
  git add openspec/changes/ openspec/changes/archive/ openspec/specs/ website/src/data/openspec-status.json
  git add -u -- website/src/data website/src/lib website/public/learning-assets docs
  git commit --amend --no-edit
  task freshness:check
fi
```

Danach:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/plan-archive-freshness-check.bats
# expected: PASS
```

## Task 3 — SSOT-Delta ist geschrieben (Verifikation)

Das ADDED-Delta `openspec/changes/plan-archive-freshness-check/specs/openspec-workflow.md`
("Der Archiv-Flow verifiziert die Status-Map vor dem Push") liegt im Branch vor. Der
Implementer verifiziert, dass es beim Archivieren auf `openspec/specs/openspec-workflow.md`
merge-fähig ist (kein bestehendes Requirement mit demselben Namen, Szenarien mit GIVEN/WHEN/THEN):

```bash
grep -c "Der Archiv-Flow verifiziert die Status-Map vor dem Push" openspec/specs/openspec-workflow.md
# expected: 0 (SSOT traegt das Requirement erst nach dem Archive-Merge)
```

## Task 4 — Beide Richtungen belegen

- **Rot-Richtung:** `git stash` der Referenz-Änderung (oder `git show HEAD:.claude/skills/references/plan-archive-steps.md` gegen die Arbeitsbaum-Version vergleichen) — der Guard muss ohne die Härtung rot sein. Der RED-Beweis aus Task 1 ist der Beleg; ein erneuter Lauf gegen den ungehärteten Stand dokumentiert die Gegenrichtung.
- **Grün-Richtung:** mit gehärteter Referenz:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow*
# expected: PASS (auch Bestandsdateien plan-archive-git-add-coverage.bats usw.)
```

## Task 5 — Abschluss-Verifikation

```bash
task test:changed        # Offline-Tests inkl. neuer Guard
task freshness:regenerate && task freshness:check   # Artefakte aktuell, kein Drift
task test:inventory      # Test-Inventar regenerieren (CI-Gate)
```

`website/src/data/test-inventory.json` muss die neue Testdatei enthalten; bei Änderung wird sie
im selben Commit mitgeführt. `git status` zeigt danach nur die intendierten Dateien:
`.claude/skills/references/plan-archive-steps.md`, `tests/spec/openspec-workflow/plan-archive-freshness-check.bats`,
`website/src/data/test-inventory.json`, `openspec/changes/plan-archive-freshness-check/` und
deren Delta.
