# Proposal: Mishap Bundle (dev-flow-plan, dev-flow-execute)

## Intent
Fix three process/logic issues identified in the `dev-flow-plan` and `dev-flow-execute` skills/scripts to prevent unintended rebase of remote branches and clarify requirements for Lavish-Board and Spec-Delta directories.

## Changes

### 1. dev-flow-plan: Fix-Path Spec-Delta Instruction
**Issue:** The Fix-Path in `opencode-flow-plan` does not mention the `specs/` delta directory, leading to validation failures.
**Fix:** Add a note in Fix-Path Step 2.8 to create `openspec/changes/<slug>/specs/<parent-ssot-slug>.md` according to T001304.

### 2. dev-flow-plan: Lavish-Board PFLICHT -> Recommended
**Issue:** Lavish-Board is marked as "PFLICHT" but has a consent gate in its own skill and is often disabled in `opencode.jsonc`.
**Fix:** Change "PFLICHT" to "empfohlenes Werkzeug" and mention the consent gate.

### 3. dev-flow-execute: Safe Main-Branch Sync
**Issue:** Step 0 of `dev-flow-execute` can rebase a remote branch if the main checkout isn't on `main`.
**Fix:** Update the shell script in `dev-flow-execute` Step 0 to check the current branch and use `git fetch origin main:main` if not on `main`.

## Trade-offs
- Minimal risk. Purely informative and safety improvements.

## Risks
- None.
