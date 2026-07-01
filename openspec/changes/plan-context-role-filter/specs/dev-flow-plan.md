## ADDED Requirements

### Requirement: plan-context.sh filters by role

The `scripts/plan-context.sh <role> [--with-openspec …]` script MUST filter
the emitted active OpenSpec change proposals to those whose `proposal.md`
frontmatter `domains:` list intersects with the domain-allowlist of the
supplied `<role>`. The role-to-domain mapping is a hardcoded lookup in
the script that mirrors the Agent Routing table in `AGENTS.md`
(lines 7-18). Proposals without a `domains:` frontmatter are included
as a legacy fallback and emit a `WARN:` line on stderr. Proposals with
`domains: []` (explicitly empty) are excluded for every role. The
special value `role=orchestrator` (or empty `<role>`) returns every
non-archived proposal (escape hatch for cross-cutting requests). An
unknown role returns every non-archived proposal plus a `WARN: unknown
role "<name>"` line on stderr.

#### Scenario: role=ops includes ops-tagged proposals and excludes website-tagged

- **GIVEN** at least one proposal with `domains: [ops, llm]` and one
  with `domains: [website]`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` is run
- **THEN** the output contains the ops-tagged proposal
- **AND** the output does not contain the website-tagged proposal

#### Scenario: legacy proposals without `domains:` frontmatter are included with a stderr WARN

- **GIVEN** a proposal without a `domains:` frontmatter field
- **WHEN** `bash scripts/plan-context.sh <any-known-role>` is run
- **THEN** the output contains the legacy proposal
- **AND** stderr contains a line matching
  `WARN: legacy proposal without domains frontmatter: <slug>`

#### Scenario: proposals with `domains: []` are excluded for all roles

- **GIVEN** a proposal with `domains: []` (explicitly empty)
- **WHEN** `bash scripts/plan-context.sh <any-known-role>` is run
- **THEN** the output does not contain the proposal

#### Scenario: role=orchestrator returns all non-archived proposals

- **GIVEN** any number of non-archived proposals
- **WHEN** `bash scripts/plan-context.sh orchestrator` is run
- **THEN** the output contains every non-archived proposal
- **AND** proposals under `openspec/changes/archive/` are still
  excluded

#### Scenario: unknown role returns all proposals plus a stderr WARN

- **GIVEN** a `<role>` that is not in the script's role-to-domain
  lookup
- **WHEN** `bash scripts/plan-context.sh foobar` is run
- **THEN** the output contains every non-archived proposal
- **AND** stderr contains a line matching
  `WARN: unknown role "foobar"`
