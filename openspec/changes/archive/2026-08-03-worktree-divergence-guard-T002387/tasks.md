---
title: "worktree-divergence-guard-T002387 — Implementation Plan"
ticket_id: T002387
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# worktree-divergence-guard-T002387 — Implementation Plan

_Ticket: T002387_

## File Structure

```
CHANGED:
  scripts/worktree-create.sh  — replace git fetch origin main:main with safe alternative
```

## Tasks

### 1. Failing Test (RED)

BATS-Test der das FATAL bei Worktree + behind main nachweist.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/worktree-divergence-guard-T002387.bats
# expected: FAIL
```

### 2. Divergence-Guard fixen (GREEN)

Ersetze `git fetch origin main:main` durch `git fetch origin +refs/heads/main:refs/remotes/origin/main`. So wird kein lokaler Branch aktualisiert, der in einem anderen Worktree ausgecheckt sein könnte.

### 3. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
