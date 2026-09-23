---
title: "worktree-remove-managed — Implementation Plan"
ticket_id: T900340
domains: [scripts, skills, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-remove-managed — Implementation Plan

_Ticket: T900340_ · Design: `openspec/changes/worktree-remove-managed/design.md`

## File Structure

```
NEW:
scripts/lib/worktree-remove.sh
tests/spec/agent-skills/worktree-remove-managed.bats     (RED, bereits committed)

CHANGED:
scripts/devflow-post-merge-finalize.sh
scripts/pr-refresh.sh
scripts/weekly-dep-schema-audit.sh
scripts/factory/cleanup.sh
.opencode/skills/git-workflow/references/worktree-cleanup.md
.opencode/skills/dev-flow-chore/SKILL.md
.claude/skills/references/dev-flow-execute-phases.md
.claude/skills/references/repo-hygiene-ops.md
components/website/src/data/test-inventory.json
```

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-lib.md | implement | scripts/lib/worktree-remove.sh | |
| p2 | tasks.d/p2-callers.md | implement | scripts/devflow-post-merge-finalize.sh, scripts/pr-refresh.sh, scripts/weekly-dep-schema-audit.sh, scripts/factory/cleanup.sh | p1 |
| p3 | tasks.d/p3-docs.md | implement | .opencode/skills/git-workflow/references/worktree-cleanup.md, .opencode/skills/dev-flow-chore/SKILL.md, .claude/skills/references/dev-flow-execute-phases.md, .claude/skills/references/repo-hygiene-ops.md | |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/agent-skills/worktree-remove-managed.bats, components/website/src/data/test-inventory.json | |

Reihenfolge bei manueller Ausfuehrung: RED-Schritt aus p4, dann p1, p2, p3, dann GREEN und
Inventar aus p4.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die Testdatei liegt bereits auf dem Branch. Ohne Helper und mit
      nacktem `worktree remove --force` in finalize Schritt 10 scheitern alle fuenf Tests; Test 4
      am Original-Fehler `cannot remove a locked working tree`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/worktree-remove-managed.bats
# expected: FAIL (5/5 not ok vor p1 und p2)
```

- [ ] **Fix-Step (GREEN).** p1 bis p3 umsetzen; derselbe Aufruf liefert 5/5 ok.

## Final Verification

- [ ] Neue und angrenzende Tests gruen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/
bash -n scripts/lib/worktree-remove.sh scripts/devflow-post-merge-finalize.sh scripts/pr-refresh.sh scripts/weekly-dep-schema-audit.sh scripts/factory/cleanup.sh
```

- [ ] Keine Anleitung entfernt noch ohne unlock:

```bash
git grep -n 'worktree remove' -- .opencode/skills .claude/skills/references | grep -v unlock
```

- [ ] Mandatory CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
