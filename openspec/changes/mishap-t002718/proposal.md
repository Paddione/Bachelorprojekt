# Proposal: Mishap-Fix T002718 — Coverage-Guard incentivized test silencing

## Summary
Document the design principle derived from Mishap T002718: When a coverage/quality guard offers two remediation paths, the easier/cheaper path must not be the one that silences or disables the check.

## Motivation
In PR #3844, `scripts/tests/unit-coverage-guard.sh` was fixed because it previously failed to recognize `find tests/unit -maxdepth 1 -name "*.bats"` batch execution in `Taskfile.yml`, causing it to report untracked unit tests and suggest adding their basenames to `tests/unit/.coverage-allowlist`. This lower-friction option led to valid test files being parked in the allowlist and hiding regressions.

## Proposed Changes
- Create OpenSpec proposal, tasks, and ticket anchor for T002718.
- Ensure the fix in `scripts/tests/unit-coverage-guard.sh` remains verified by tests.

