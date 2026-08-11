## ADDED Requirements

### Requirement: auto-close skips plan-only PRs regardless of branch family

The merge-closure poller (`scripts/factory/auto-close-merged.sh`) SHALL decide whether a merged
PR carries implementation by file content (`pr_is_plan_only`), and SHALL skip the ticket
transition when the PR changed only plan files (`openspec/**`) and regenerated artifacts — for
EVERY non-archive branch family, not only `chore/openspec-*`.

A plan-only PR stages the plan for later execution by the factory; auto-closing the ticket while
it is still `plan_staged` makes the plan unreachable. The branch-prefix heuristic
(`^chore/archive-|^openspec/`) is a fast-path skip that never carries implementation and stays;
any other branch — including `feature/*` and `fix/*` — SHALL be verified by file content.

#### Scenario: A plan-only PR on a feature branch does not auto-close the ticket

- **GIVEN** a merged PR on `feature/batch-ticket-ops-meta-T003541` whose changed files are all under `openspec/**` or are regenerated artifacts
- **WHEN** `scripts/factory/auto-close-merged.sh` processes that PR
- **THEN** it logs a plan-only SKIP and leaves the ticket in `plan_staged`

#### Scenario: An execution PR on a feature branch still auto-closes

- **GIVEN** a merged PR on `feature/fix-ticket-lock-subagent-T003102` that changes files under `scripts/`, `tests/` or `.claude/`
- **WHEN** `scripts/factory/auto-close-merged.sh` processes that PR
- **THEN** it does not skip and transitions the ticket to `done`

#### Scenario: Archive branches stay a fast-path skip

- **GIVEN** a merged PR on `chore/archive-*` or `openspec/*`
- **WHEN** `scripts/factory/auto-close-merged.sh` processes that PR
- **THEN** it skips without a file-content lookup
