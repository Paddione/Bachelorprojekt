# superpowers-executing-plans

## Purpose

Der Plan-Ausführungs-Skill — ein eingebauter Claude-Code-Superpower, der in opencode/agy
als Stub-Redirect auf den `dev-flow-execute`-Skill weiterleitet. Der Skill definiert die
Disziplin für die Umsetzung von Implementierungsplänen inklusive Worktree-Isolation,
Branch-Guard, PR-Erstellung und Auto-Merge.

---

## Requirements

### Requirement: Stub Redirect for Non-Claude-Code Frameworks

The system SHALL provide `.claude/skills/superpowers-executing-plans/SKILL.md` as a stub
file that redirects to `dev-flow-execute/SKILL.md` for opencode and agy users. The stub
SHALL contain a `[STUB]` marker in its description frontmatter and a framework mapping
table documenting availability per framework.

#### Scenario: Stub file exists with correct frontmatter

- **GIVEN** the repository checkout
- **WHEN** reading `.claude/skills/superpowers-executing-plans/SKILL.md`
- **THEN** the frontmatter contains `name: superpowers:executing-plans` and `description:` includes `[STUB]`

#### Scenario: Stub contains framework mapping table

- **GIVEN** the stub SKILL.md
- **WHEN** reading the body
- **THEN** it contains a framework mapping table with rows for Claude Code, opencode, and agy

### Requirement: Worktree Isolation Check

The `dev-flow-execute` skill SHALL verify that the current working directory is inside
a `.worktrees/*` worktree before executing. If running in the main checkout, it SHALL
create an isolated worktree via `scripts/worktree-create.sh`.

#### Scenario: Execute detects non-worktree checkout

- **GIVEN** the current PWD is not inside `.worktrees/`
- **WHEN** `dev-flow-execute` runs the Worktree-Isolation-Check
- **THEN** it warns and creates an isolated worktree

### Requirement: Branch Guard

The `dev-flow-execute` skill SHALL verify that a valid branch is checked out (not
detached HEAD) before proceeding. If no branch is detected, it SHALL abort with
an error message.

#### Scenario: Detached HEAD aborts execution

- **GIVEN** `git branch --show-current` returns empty or `HEAD`
- **WHEN** `dev-flow-execute` runs the Branch-Guard
- **THEN** it exits with an error message

### Requirement: Main-Branch Sync (Pull-First)

The `dev-flow-execute` skill SHALL synchronize `main` in the primary repo before
executing, using `git fetch origin main && git pull --rebase origin main`.

#### Scenario: Main branch is synced before execution

- **GIVEN** `dev-flow-execute` starts
- **WHEN** Step -1 runs
- **THEN** `origin/main` is fetched and pulled with rebase

### Requirement: PR Creation and Auto-Merge

The `dev-flow-execute` skill SHALL create a PR with the `gh pr create` command,
then enable auto-merge with `--squash --delete-branch`. The PR title SHALL follow
Conventional Commits format with a ticket ID.

#### Scenario: PR is created with squash merge

- **GIVEN** implementation is complete and verified
- **WHEN** the PR step runs
- **THEN** `gh pr merge --auto --squash --delete-branch` is enabled

### Requirement: Real Logic Location

The actual execution workflow (worktree isolation, branch guard, implement, verify,
PR, auto-merge, deploy, ticket closure) lives in `dev-flow-execute/SKILL.md`, not in
the superpowers stub. For Claude Code users, the built-in superpower is invoked directly.

#### Scenario: dev-flow-execute contains the full workflow

- **GIVEN** `.claude/skills/dev-flow-execute/SKILL.md`
- **WHEN** reading the skill body
- **THEN** it contains steps for worktree isolation, branch guard, implement, verify, PR, and merge

---

## Key Files

- `.claude/skills/superpowers-executing-plans/SKILL.md` — stub redirect (27 lines)
- `.claude/skills/dev-flow-execute/SKILL.md` — real logic (492 lines)

---

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-07-21 -->
