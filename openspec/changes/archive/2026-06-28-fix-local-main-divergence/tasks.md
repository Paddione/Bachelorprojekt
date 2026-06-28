---
title: "Fix: Divergence guard for local main"
ticket_id: T001302
domains: [infra, git/repository]
status: plan_staged
---

# fix-local-main-divergence — Implementation Plan

## File Structure

- `scripts/worktree-create.sh` — add divergence guard at the top (after shebang+usage)
- `tests/spec/divergence-guard.bats` — failing test (already committed)

## 1. Divergence Guard Implementation

- [ ] 1.1 Add a guard at the top of `scripts/worktree-create.sh` (after `set -euo pipefail` but before `BRANCH=…`) that runs `git merge-base --is-ancestor origin/main main` and exits with a clear error message if the check fails, including the recovery command `git reset --hard origin/main`

## 2. Verification

- [ ] 2.1 Run `bats tests/spec/divergence-guard.bats` — must PASS (expected: FAIL → PASS)
- [ ] 2.2 Run `task test:changed` — must not regress any other test
- [ ] 2.3 Run `task freshness:regenerate` and `task freshness:check`