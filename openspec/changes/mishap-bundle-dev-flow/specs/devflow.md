# devflow — Delta-Spec

## Purpose

Fix three process/logic issues in `dev-flow-plan` and `dev-flow-execute` skills to prevent unintended rebase of remote branches and clarify requirements for Lavish-Board and Spec-Delta directories.

## MODIFIED Requirements

### Requirement: DEVFLOW-001 — Fix-Path Spec-Delta Instruction

#### Scenario: DEVFLOW-001 — Fix-Path Spec-Delta Instruction

The Fix-Path in `opencode-flow-plan` must mention the `specs/` delta directory to prevent validation failures per T001304.

### Requirement: DEVFLOW-002 — Lavish-Board Recommended, Not Mandatory

#### Scenario: DEVFLOW-002 — Lavish-Board Recommended, Not Mandatory

Lavish-Board is marked as recommended, not mandatory. Only activated when in scope and user consent is present (`opencode.jsonc` → `lavish.enabled`).

### Requirement: DEVFLOW-003 — Safe Main-Branch Sync

#### Scenario: DEVFLOW-003 — Safe Main-Branch Sync

Step 0 of `dev-flow-execute` must check the current branch before pulling. If the main checkout is not on `main`, only `git fetch origin main:main` is executed to prevent rebasing remote branches.
