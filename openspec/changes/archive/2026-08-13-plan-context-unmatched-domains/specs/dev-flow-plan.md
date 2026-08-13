## MODIFIED Requirements

### Requirement: plan-context.sh filters by role

The `scripts/plan-context.sh <role> [--with-openspec …]` script MUST filter
the emitted active OpenSpec change proposals to those whose `proposal.md`
frontmatter `domains:` list intersects with the domain-allowlist of the
supplied `<role>`. The role-to-domain mapping is a hardcoded lookup in
the script that mirrors the Agent Routing table in `AGENTS.md`
(lines 7-18) and MAY contain additional observed corpus words, so that
established free-form domains (`scripts`, `plan-authoring`, `ci-cd`,
`dev-tooling`, `devflow`, `testing`, `ticket-mcp`, `ticket-ops` →
`bachelorprojekt-test`; `deployment` → `bachelorprojekt-infra`) reach at
least one role. The full role name (`bachelorprojekt-<suffix>`) is always
part of that role's vocabulary: a proposal tagged
`domains: [bachelorprojekt-test]` matches role `bachelorprojekt-test`.
Proposals without a `domains:` frontmatter are included as a legacy
fallback and emit a `WARN:` line on stderr. Proposals with `domains: []`
(explicitly empty) are excluded for every role. The special value
`role=orchestrator` (or empty `<role>`) returns every non-archived proposal
(escape hatch for cross-cutting requests). An unknown role returns every
non-archived proposal plus a `WARN: unknown role "<name>"` line on stderr.

#### Scenario: the full role name as a domain matches its own role

- **GIVEN** a proposal with `domains: [bachelorprojekt-test]`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-test` is run
- **THEN** the output contains the proposal

#### Scenario: an observed corpus word reaches its mapped role

- **GIVEN** a proposal with `domains: [scripts]`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-test` is run
- **THEN** the output contains the proposal

## ADDED Requirements

### Requirement: plan-context.sh flags proposals without a domain anchor

A proposal is anchored when at least one of its `domains:` tokens is a
slash-free word contained in the union of all role vocabularies (every
role's allowlist plus the role names themselves). Tokens containing `/`
are path pointers and never count as anchors. On every role-filtered run,
`scripts/plan-context.sh` SHALL emit a `WARN:` line on stderr for each
active proposal that is not anchored, naming the slug and its domains.
Runs with `__ALL__` semantics (`role=orchestrator` and the unknown-role
fail-soft path) SHALL NOT emit this WARN, because the proposal is not
excluded there. Proposals without a `domains:` field and proposals with
`domains: []` keep their existing handling.

A BATS corpus guard SHALL verify, for every active (non-archived)
proposal, that at least one domain anchor exists, using the vocabulary
emitted by `plan-context.sh --vocab` as the single source of truth.

#### Scenario: an unanchored proposal emits a WARN on every role run

- **GIVEN** a proposal with `domains: [tooling, skills]` (neither word in
  any role vocabulary)
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` is run
- **THEN** the output does not contain the proposal
- **AND** stderr contains a line matching
  `WARN: proposal <slug> has domains […] matching no role allowlist`

#### Scenario: an anchored proposal emits no dead-domains WARN

- **GIVEN** a proposal with `domains: [ops]`
- **WHEN** `bash scripts/plan-context.sh bachelorprojekt-ops` is run
- **THEN** the output contains the proposal
- **AND** stderr contains no line matching `matching no role allowlist`

#### Scenario: orchestrator includes an unanchored proposal without WARN

- **GIVEN** a proposal with `domains: [tooling]`
- **WHEN** `bash scripts/plan-context.sh orchestrator` is run
- **THEN** the output contains the proposal
- **AND** stderr contains no line matching `matching no role allowlist`

#### Scenario: the corpus guard fails on a new unanchored proposal

- **GIVEN** an active proposal whose `domains:` contains only words outside
  the vocabulary emitted by `plan-context.sh --vocab` (path tokens
  excepted)
- **WHEN** the BATS suite `tests/spec/dev-flow-plan/domains-vocabulary.bats`
  is run
- **THEN** the corpus-guard test fails, naming the unanchored slug
