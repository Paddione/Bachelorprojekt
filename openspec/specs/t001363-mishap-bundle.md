# t001363-mishap-bundle

## Purpose

SSOT spec.

## Requirements

### Requirement: dev-flow-execute verifies worktree isolation before implementing

The `dev-flow-execute` skill SHALL verify that the current working directory is a git worktree
(created via `scripts/worktree-create.sh`) before delegating implementation to a subagent. If the
current working directory is not a worktree, the skill SHALL create one before proceeding.

#### Scenario: Execute skill invoked from the main checkout

- **GIVEN** a session runs `dev-flow-execute` for a staged plan
- **WHEN** the current working directory is the main repo checkout, not a `tmp/wt-*` worktree
- **THEN** the skill invokes `scripts/worktree-create.sh <branch> tmp/wt-<slug>` before Schritt 2 (Implementierung)

#### Scenario: Execute skill invoked from an existing worktree

- **GIVEN** a session runs `dev-flow-execute` for a staged plan
- **WHEN** the current working directory is already a `tmp/wt-*` worktree for the target branch
- **THEN** the skill proceeds directly to Schritt 2 without creating a duplicate worktree

<!-- merged from change delta t001363-mishap-bundle.md on 2026-07-01 -->