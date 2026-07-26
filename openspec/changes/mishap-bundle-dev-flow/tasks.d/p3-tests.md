# Plan: p3-tests

## Goal
Verify all changes in the Mishap Bundle.

## Implementation
1. Run `scripts/plan-lint.sh` on:
   - `openspec/changes/mishap-bundle-dev-flow/tasks.md`
   - `.opencode/skills/opencode-flow-plan/SKILL.md`
   - `.opencode/skills/opencode-flow-execute/SKILL.md`
2. Run `scripts/openspec.sh validate` to check for structural correctness.
3. Create a test script `scripts/test-dev-flow-execute-sync.sh` that:
   - Creates a dummy repo.
   - Simulates a non-main branch.
   - Runs the shell command from `dev-flow-execute` Step 0.
   - Asserts that it does a `fetch` and not a `pull`.
4. Execute the test script.
