## ADDED Requirements

### Requirement: Plan context is summarized per proposal

`scripts/plan-context.sh` SHALL emit, for each proposal that passes the role filter, a summary
consisting of the slug, the title, the short description from `proposal.md` and the task
headings from `tasks.md`. It SHALL NOT emit the complete body of `proposal.md`, `tasks.md`,
`tasks.d/*.md` or `design.md` by default.

The complete body SHALL remain reachable via an explicit `--full` flag, so that no existing
consumer loses access to information it relies on.

A proposal whose `domains:` field cannot be resolved from either `proposal.md` or its adjacent
`tasks.md` SHALL be excluded from every role-filtered run, rather than included for all roles.
The orchestrator role and the unknown-role fail-soft path keep their current behaviour.

The rationale is a budget, not aesthetics: CLAUDE.md requires this output to be prepended to
every agent dispatch. At five-figure line counts the step gets skipped in practice, which
removes the context injection entirely.

#### Scenario: a selected proposal contributes a summary, not its body

- **GIVEN** a proposal tagged `domains: [ops]` whose `tasks.md` contains 200 detail lines
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` runs
- **THEN** the output names the proposal and its task headings, and contains none of the 200
  detail lines

#### Scenario: --full restores the complete body

- **GIVEN** the same proposal
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops --full` runs
- **THEN** the output contains the complete `tasks.md` body, as before this change

#### Scenario: an unmarked proposal is excluded from a role-filtered run

- **GIVEN** a proposal with no resolvable `domains:` field in `proposal.md` or `tasks.md`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-db` runs
- **THEN** the proposal does not appear in the output, and a WARN naming the slug goes to stderr

#### Scenario: the orchestrator role still sees every proposal

- **GIVEN** the same unmarked proposal
- **WHEN** `bash scripts/plan-context.sh orchestrator` runs
- **THEN** the proposal appears, because `__ALL__` disables filtering entirely
