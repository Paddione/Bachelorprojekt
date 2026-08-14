## ADDED Requirements

### Requirement: Worktree removal SHALL respect live agent-lock claims

`scripts/worktree-clean-check.sh` SHALL reject (exit 1) a worktree whose branch holds a live,
foreign branch-scoped agent-lock claim — a hygiene run or a parallel dev-flow session SHALL NOT
remove a worktree while another session is working in it. The check SHALL reuse
`scripts/agent-lock.sh check branch <branch>` (exit 3 = held).

#### Scenario: A claimed worktree survives a foreign cleanup pre-check

- **GIVEN** a worktree whose branch holds a live foreign branch-scoped claim
- **WHEN** `scripts/worktree-clean-check.sh <path>` runs
- **THEN** the check SHALL exit 1 and name the claim
- **AND** the dev-flow-plan skill step −1 SHALL reference the claim check before removing stale worktrees
