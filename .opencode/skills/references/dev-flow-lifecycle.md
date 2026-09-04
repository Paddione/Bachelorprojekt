# dev-flow lifecycle contract

This is the transition SSOT for the four project flow skills. Executable command details
remain in `git-workflow`, `verification-block`, `ci-fix-loop` and the phase references.

| skill | trigger | entry state | owner | mutation scope | exit state | next handoff |
|---|---|---|---|---|---|---|
| dev-flow-plan | behavior change | request, no staged plan | Planner | proposal/spec/plan on feature or fix worktree | plan staged and pushed, no PR | dev-flow-execute |
| dev-flow-chore | no behavior change | request, no plan required | Chore implementer | maintenance files on ticketed chore worktree | PR merged and cleanup complete | deploy when applicable |
| dev-flow-execute | staged feature/fix plan | plan staged and pushed | Implementer, Orchestrator, Finalizer | planned product and test files | merged PR, finalized ticket and cleanup | deploy, then dev-flow-e2e |
| dev-flow-e2e | post-deploy test coverage | merged and deployed product change | E2E Chore implementer | Playwright specs and generated inventory only | ticketed chore PR merged and cleanup complete | main |

## Common invariants

Every mutation has a ticket before its ticketed branch, an isolated worktree, propagated
session SID, and an explicit branch/PR owner. Branches are never pushed directly to `main`.
Use `git-workflow` for pull-first, explicit staging (including the git-crypt guard), PR,
merge and cleanup; use `verification-block` for tests and Freshness. A ticket is closed only
after confirmed `MERGED`; the Finalizer calls the idempotent post-merge finalizer and releases
claims only after archive/cleanup ordering is satisfied.

## Execute swimlane and exception loop

The Implementer applies the staged plan, runs RED→GREEN verification, commits, pushes and
creates the PR, then reports and stops. The Orchestrator independently reviews the PR and
performs the fail-closed phase-chain assertion before requesting `gh pr merge --auto --squash`.
It then retains the CI/conflict exception loop until state is confirmed `MERGED`; a later red
check, replacement run after a corrective Implementer push, or `DIRTY`/`CONFLICTING` after
`main` advances is sent to the same Implementer. Every new commit re-enters review,
`assert-phase-chain`, and invalidated CI gates before merge-ready is considered again; this is
the required re-review and phase-chain re-entry.

After the merge request, a fresh Finalizer waits using `ci-fix-loop` and must not close a
ticket on timeout, an open/closed PR, late CI failure or conflict. Only after `MERGED` does it
call `devflow-post-merge-finalize.sh`; the operation is idempotent.

## E2E specialization

Post-deploy E2E is a test-only Chore: `dev-flow-e2e` owns live target discovery, credentials,
Playwright projects, tags and optional headed/vision verification. Repository mutations use a
ticketed `chore/*` branch, PR, merge and cleanup through this contract.
