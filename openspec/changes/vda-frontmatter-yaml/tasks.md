---
title: vda.sh frontmatter versteht YAML-List-Form
ticket_id: T005563
status: planning
domains: [scripts, test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# vda-frontmatter-yaml — Implementation Plan

## File Structure

- `scripts/plan-lint.sh` — `fm_field()` list-form-aware (`M`)
- `scripts/vda/frontmatter.sh` — `_fm_field()` + Repair-Konvertierung List→Flow (`M`)
- `tests/unit/vda-frontmatter.bats` — 2 Rot-Tests (bereits committet) (`M`)

## Partials

### p1 — Frontmatter-Reader list-form-aware + Tests (Tests-Rolle)

**target_files:** `scripts/plan-lint.sh`, `scripts/vda/frontmatter.sh`, `tests/unit/vda-frontmatter.bats`

1. Rot-Beweis: Die bereits committeten Tests `T005563: frontmatter --validate akzeptiert
   domains als YAML-Liste` und `T005563: frontmatter-Repair konvertiert domains-Liste nach
   Flow-Form ohne Raterei` laufen mit dem Testrunner bats — **expected: FAIL** (Reader lesen
   nur die Flow-Form):
   ```bash
   ./tests/unit/lib/bats-core/bin/bats tests/unit/vda-frontmatter.bats
   ```
2. `scripts/plan-lint.sh` `fm_field()`: Wenn die erste Zeile nach `domains:` keinen Inline-Wert
   trägt, die folgenden `  - <item>`-Zeilen einsammeln und als `[item1, item2]` zurückgeben.
3. `scripts/vda/frontmatter.sh` `_fm_field()`: analog (List-Form lesen). Repair-Pfad: bei
   List-Form die Werte in Flow-Form schreiben, den List-Rest entfernen, KEINE Neu-Ableitung.
4. Grün-Nachweis: derselbe bats-Lauf endet mit `ok` für beide T005563-Tests (Status 0).
5. `bash scripts/plan-lint.sh openspec/changes/vda-frontmatter-yaml/tasks.md` → PASS
6. `bash scripts/openspec.sh validate` → PASS
7. `task test:changed; task freshness:regenerate; task freshness:check`
