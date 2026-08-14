---
title: "mishap-incident-rollup-2026-08-14-T004899 — erster Zyklus des ephemeren Rollup"
ticket_id: T004899
---

## ADDED Requirements

### Requirement: plan-preflight pre-commit accepts the staged plan set

The pre-commit invocation of `scripts/plan-preflight.sh` SHALL pass when the working tree
contains exactly the staged plan artifacts (RED test and change files). The guard SHALL
evaluate the staged set for the checks it enforces (branch, ticket claim) instead of
requiring a fully clean working tree before the plan-stage commit.

#### Scenario: plan-stage commit with staged plan artifacts passes

- **GIVEN** a fix branch whose plan artifacts are staged and nothing else differs
- **WHEN** `scripts/plan-preflight.sh pre-commit --ticket <id>` runs
- **THEN** the guard SHALL exit 0
- **AND** the branch and ticket-claim checks SHALL still be enforced

### Requirement: Worktrees claimed by a live session survive foreign cleanups

A registered worktree under `.worktrees/` whose branch holds an active agent-lock claim
SHALL NOT be removed by foreign cleanup runs while work is in progress.

#### Scenario: claimed worktree is preserved by foreign cleanups

- **GIVEN** a worktree whose branch is claimed via `scripts/agent-lock.sh`
- **WHEN** a foreign cleanup or reaper run inspects the worktree
- **THEN** the worktree SHALL be preserved
- **AND** the claim SHALL remain valid until released by the holding session
