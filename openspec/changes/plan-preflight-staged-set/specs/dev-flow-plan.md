## ADDED Requirements

### Requirement: plan-preflight pre-commit evaluates the staged set

The `pre-commit` invocation of `scripts/plan-preflight.sh` SHALL pass when the staged set
contains only plan artifacts (`tests/`, `openspec/changes/`, `website/src/data/openspec-status.json`,
`website/src/data/test-inventory.json`) — the exact state immediately before the plan-stage
commit. It SHALL NOT require a fully clean working tree: unstaged and untracked files are not
part of the commit and SHALL NOT fail the guard. A staged file outside the plan artifacts SHALL
still be rejected.

#### Scenario: Staged plan artifacts pass, staged foreign files are rejected

- **GIVEN** a feature branch with a valid agent-lock claim and only plan artifacts staged
- **WHEN** `scripts/plan-preflight.sh pre-commit --ticket <id>` runs
- **THEN** the guard SHALL exit 0
- **AND** with a staged file outside the plan artifacts the guard SHALL exit 1
- **AND** an unstaged/untracked file alone SHALL NOT fail the guard
