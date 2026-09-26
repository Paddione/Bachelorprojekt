---
title: "openspec-orphan-auto-archive — Implementation Plan"
ticket_id: T900338
domains: [scripts, ci, tests]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-orphan-auto-archive — Implementation Plan

_Ticket: T900338_ · Design: `openspec/changes/openspec-orphan-auto-archive/design.md`

## File Structure

```
NEW:
scripts/openspec-orphan-archive.sh
scripts/factory/openspec-orphan-dispatch.sh
.github/workflows/openspec-orphan-archive.yml
tests/spec/openspec-workflow/orphan-archive.bats          (RED, bereits committed)
tests/spec/sdlc-isolation/orphan-archive-dispatch.bats    (RED, bereits committed)

CHANGED:
scripts/factory/github-poller.sh
components/website/src/data/test-inventory.json
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-executor.md | implement | scripts/openspec-orphan-archive.sh | |
| p2 | tasks.d/p2-dispatcher-poller.md | implement | scripts/factory/openspec-orphan-dispatch.sh, scripts/factory/github-poller.sh | |
| p3 | tasks.d/p3-workflow.md | implement | .github/workflows/openspec-orphan-archive.yml | p1 |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/openspec-workflow/orphan-archive.bats, tests/spec/sdlc-isolation/orphan-archive-dispatch.bats, components/website/src/data/test-inventory.json | |

Reihenfolge bei manueller Ausfuehrung: RED-Schritt aus p4, dann p1, p2, p3, dann GREEN und
Inventar aus p4.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Beide Testdateien liegen bereits auf dem Branch und scheitern,
      weil Executor und Dispatcher fehlen und der Poller die Aufgabe `archive` nicht kennt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow/orphan-archive.bats tests/spec/sdlc-isolation/orphan-archive-dispatch.bats
# expected: FAIL (13/13 not ok vor p1 und p2)
```

- [ ] **Fix-Step (GREEN).** p1 bis p3 umsetzen; derselbe Aufruf liefert 13/13 ok.

## Final Verification

- [ ] Neue und angrenzende Tests gruen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/openspec-workflow* tests/spec/sdlc-isolation*
```

- [ ] OpenSpec-Gate und Workflow-Syntax:

```bash
task openspec:validate
python3 -c 'import yaml; yaml.safe_load(open(".github/workflows/openspec-orphan-archive.yml"))'
```

- [ ] Mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Nach dem Merge (manuell, nicht Teil der CI): auf dem Dev-Host
      `bash scripts/factory/github-poller.sh --task archive --dry-run` ausfuehren und pruefen, dass
      der Lauf bei leerem `openspec/changes/` nichts auswaehlt und rc 0 liefert.
