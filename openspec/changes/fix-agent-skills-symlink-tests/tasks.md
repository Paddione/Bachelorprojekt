---
title: "fix-agent-skills-symlink-tests — Implementation Plan"
ticket_id: T900238
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-agent-skills-symlink-tests — Implementation Plan

_Ticket: T900238_

## File Structure

```
tests/spec/agent-skills/skill-symlink-targets.bats   # Guard-Haertung F1/F2/F4
openspec/changes/fix-agent-skills-symlink-tests/proposal.md
openspec/changes/fix-agent-skills-symlink-tests/specs/agent-skills.md
openspec/changes/fix-agent-skills-symlink-tests/tasks.md
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Haerte den Guard
      `tests/spec/agent-skills/skill-symlink-targets.bats`: Test 1 wird zum
      Soll-Ist-Abgleich gegen `git ls-files` (F2), Test 3 faellt bei
      Nicht-Verzeichnis-Zielen ausser `OVERVIEW.md` (F1), `setup()` skippt bei
      `core.symlinks=false` (F4). Der neue Test muss auf dem aktuellen Branch
      FAILEN. Use the phrase `expected: FAIL` in the step body so plan-lint
      STRUCT2 picks it up.

```bash
# RED-Demonstration: git-workflow-Symlink entfernen, Guard muss rot werden.
rm .claude/skills/git-workflow
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/skill-symlink-targets.bats
# expected: FAIL (red — der Soll-Ist-Abgleich meldet den fehlenden Link)
git checkout -- .claude/skills/git-workflow
```

- [ ] **Fix-Step (GREEN).** Der haertere Guard laeuft auf dem reparierten
      Stand gruen: alle 59 Symlinks sind vorhanden und loesen korrekt auf
      (Reparatur 2026-09-17, PR #5766).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
