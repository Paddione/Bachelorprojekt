---
title: Archive-Status-Sed deckt planning ab
ticket_id: T005564
status: planning
domains: [scripts, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-status-sed-planning — Implementation Plan

## File Structure

- `.claude/skills/references/plan-archive-steps.md` — Sed-Muster Schritt 7 (`M`)
- `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats` — Rot-Grün-Guard (`M`)

## Partials

### p1 — Reference + Guard (Tests-Rolle)

**target_files:** `.claude/skills/references/plan-archive-steps.md`, `tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats`

1. Rot-Beweis: Der bereits committete Test `T005564: das Status-Sed-Muster deckt 'planning' ab`
   läuft mit dem Testrunner bats — **expected: FAIL** (Referenz trägt das planning-Muster noch
   nicht):
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/plan-archive-git-add-coverage.bats
   ```
2. `.claude/skills/references/plan-archive-steps.md` Schritt 7: Sed-Muster um `planning`
   erweitern:
   ```bash
   sed -E -i 's/^status: (active|plan_staged|in_progress|planning)$/status: completed/' "$PLAN_FILE"
   ```
3. Grün-Nachweis: derselbe bats-Lauf endet jetzt mit `ok` für den T005564-Test (Status 0).
4. `bash scripts/plan-lint.sh openspec/changes/archive-status-sed-planning/tasks.md` → PASS
5. `bash scripts/openspec.sh validate` → PASS
6. `task test:changed; task freshness:regenerate; task freshness:check`
