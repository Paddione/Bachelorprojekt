## MODIFIED Requirements

### Requirement: dev-flow-execute activates auto-merge immediately after PR creation, not after the CI-watch loop

`.claude/skills/dev-flow-execute/SKILL.md` SHALL order Step 5 (`gh pr create`) directly
followed by enabling auto-merge (`gh pr merge --auto --squash --delete-branch`), with the
CI-fix loop (`devflow-ci-watch.sh`, formerly Step 5.5) running AFTER auto-merge has been
requested, as an observe-and-fix step rather than a gate the merge command waits behind.

This closes the gap observed at PR #3305/T002255: a session that ends while
`devflow-ci-watch.sh` is still polling never reaches the old Step 6, so
`autoMergeRequest` stays `null` and the PR is left open with no merge in flight — not
blocked, simply never requested. `gh pr merge --auto` returns immediately and merges
asynchronously once required checks turn green; on red CI it has no effect and the PR
stays open rather than merging broken code, so moving it earlier changes no merge
outcome — it only removes the window where the PR can be abandoned un-merge-requested.
The M1-lesson from T001899 (no auto-merge before the first implementation-commit push)
still holds: auto-merge is enabled only after Step 5's `gh pr create`, by which point at
least one implementation commit is already on the branch — the ordering change does not
move auto-merge earlier than that guard.

#### Scenario: Auto-merge is requested right after PR creation, before the CI-watch loop starts

- **GIVEN** the dev-flow-execute Step 5 section in `.claude/skills/dev-flow-execute/SKILL.md`
- **WHEN** the section is sliced from the `gh pr create` step to the start of the
  CI-fix-loop step
- **THEN** the slice contains `gh pr merge --auto --squash --delete-branch` before it
  contains `devflow-ci-watch.sh`

#### Scenario: A session interrupted during the CI-watch loop still has auto-merge armed

- **GIVEN** a PR created via dev-flow-execute Step 5 (auto-merge already requested per
  the new ordering)
- **WHEN** the session is interrupted while `devflow-ci-watch.sh` is still polling
- **THEN** `gh pr view --json autoMergeRequest` is non-null for that PR
- **AND** the PR merges on its own once required checks turn green, with no further
  session action needed
