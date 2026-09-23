---
title: "archive-regen-spec-atlas — Implementation Plan"
ticket_id: T900341
domains: [scripts, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# archive-regen-spec-atlas — Implementation Plan

_Ticket: T900341_ · Design: `openspec/changes/archive-regen-spec-atlas/design.md`

## File Structure

```
NEW:
tests/spec/openspec-workflow/archive-regen-spec-atlas.bats   (RED, bereits committed)

CHANGED:
scripts/openspec.sh
components/website/src/data/test-inventory.json
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-openspec-sh.md | implement | scripts/openspec.sh | |
| p2 | tasks.d/p2-tests.md | tests | tests/spec/openspec-workflow/archive-regen-spec-atlas.bats, components/website/src/data/test-inventory.json | |

Reihenfolge: RED aus p2, dann p1, dann GREEN und Inventar aus p2.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/archive-regen-spec-atlas.bats
# expected: FAIL (Tests 1 und 2 not ok vor p1)
```

- [ ] **Fix-Step (GREEN).** p1 umsetzen; derselbe Aufruf liefert 3/3 ok.

## Final Verification

- [ ] Angrenzende Tests gruen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow/
bash -n scripts/openspec.sh
```

- [ ] Mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
