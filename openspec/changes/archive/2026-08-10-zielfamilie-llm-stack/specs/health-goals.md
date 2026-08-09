## ADDED Requirements

### Requirement: REQ-HEALTH-GOALS-LLM-001 — LLM stack operation goal family

The system SHALL define a goal family `G-LLM01` through `G-LLM05` in `.claude/lib/goals.md`
covering the operating state of the local LLM stack: model server availability, llm-proxy
readiness, configuration-versus-runtime model drift, autostart coverage of declared LLM stack
services, and dead local LLM endpoint references.

Each goal SHALL be measurable through a single command whose output is either a non-negative
integer or the literal `n/a`.

#### Scenario: Every family member is documented and measurable

- **GIVEN** `.claude/lib/goals.md` as the single source of truth for health goals
- **WHEN** the goal family is read
- **THEN** each of `G-LLM01`, `G-LLM02`, `G-LLM03`, `G-LLM04` and `G-LLM05` carries a title, a
  measurement command and a meta line with priority, baseline, target, effort, cycle,
  reproducibility and ticket reference
- **AND** each measurement command resolves to an invocation of `scripts/lib/llm-stack-measure.sh`

### Requirement: REQ-HEALTH-GOALS-LLM-002 — Positive anchor in every measurement

Every `G-LLM*` measurement SHALL emit `n/a` instead of a numeric value when its measurement
precondition is not satisfied, so that a missing measurement base is reported as skipped rather
than as a met target.

The preconditions are: for `G-LLM01` and `G-LLM03` a parseable loadout registry holding at least
one entry with a port, plus a llm-proxy answering on `/livez`; for `G-LLM02` a `/health` response
that parses as JSON and carries both a `ready` field and a `checked` count of at least one; for
`G-LLM04` an available service manager and at least one declared unit file; for `G-LLM05` a
backend registry query that returns at least one local endpoint.

A measurement SHALL NOT treat an absent, unparseable or unexpectedly shaped input as an empty
collection.

#### Scenario: Unparseable loadout registry reports n/a rather than zero

- **GIVEN** a loadout registry fixture that is not valid JSON
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed against it
- **THEN** the command prints `n/a`
- **AND** it does not print `0`

#### Scenario: A health payload without the expected fields reports n/a rather than zero

- **GIVEN** a llm-proxy fixture whose `/health` response carries neither a `degraded` list nor a
  `checked` count
- **WHEN** `scripts/lib/llm-stack-measure.sh proxy-readiness` is executed against it
- **THEN** the command prints `n/a`
- **AND** it does not print `0`

#### Scenario: A populated measurement base still reports a number

- **GIVEN** a loadout registry fixture with at least one entry carrying a port and a reachable
  liveness endpoint
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed against it
- **THEN** the command prints a non-negative integer

### Requirement: REQ-HEALTH-GOALS-LLM-003 — Exclusive group aware availability

`G-LLM01` SHALL count a group of loadouts sharing an `exclusiveGroup` as available when at least
one member of that group answers its health endpoint, because members of such a group share one
GPU and cannot run simultaneously.

Loadouts without an `exclusiveGroup` SHALL be counted individually per port.

#### Scenario: One live member makes its exclusive group available

- **GIVEN** a loadout registry fixture with three entries in the same `exclusiveGroup` of which
  exactly one answers its health endpoint
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed
- **THEN** the reported count does not include that group

#### Scenario: A group without any live member is counted

- **GIVEN** a loadout registry fixture with two entries in one `exclusiveGroup`, neither of which
  answers its health endpoint, alongside a second group with a live member
- **WHEN** `scripts/lib/llm-stack-measure.sh server-availability` is executed
- **THEN** the reported count is 1

### Requirement: REQ-HEALTH-GOALS-LLM-004 — Numeric-only measurement output

Every `G-LLM*` measurement SHALL print either a non-negative integer or `n/a`, and SHALL NOT print
any other status word.

A llm-proxy reporting `ready: false` SHALL be expressed as the number of backends that cannot
serve, so the value stays comparable with the target and safe to append to `HG_VALUES_FILE`.

#### Scenario: A not-ready proxy yields a non-zero number rather than a status word

- **GIVEN** a llm-proxy fixture whose `/health` response carries `ready: false` and `checked: 3`
- **WHEN** `scripts/lib/llm-stack-measure.sh proxy-readiness` is executed against it
- **THEN** the command prints `3`
- **AND** the output matches an integer, not a word

### Requirement: REQ-HEALTH-GOALS-LLM-005 — Family boundary against the interface family

`G-LLM05` SHALL only consider endpoints declared by LLM stack artifacts, and SHALL exclude
endpoints declared in the MCP registry, because those are owned by `G-IF01`.

The boundary rule SHALL be the declaring artifact, not the failure mode.

#### Scenario: An endpoint declared in the MCP registry is not counted twice

- **GIVEN** a backend registry fixture listing a local endpoint without a listener that is also
  present in the MCP registry fixture
- **WHEN** `scripts/lib/llm-stack-measure.sh dead-endpoints` is executed
- **THEN** that endpoint is not included in the reported count
- **AND** a second local endpoint without a listener that appears only in the backend registry is
  included

### Requirement: REQ-HEALTH-GOALS-LLM-006 — Local measurement location

The `G-LLM*` family SHALL be measured locally through `task freshness:check` and SHALL NOT be
measured in CI, because a CI runner has no LLM endpoints and would report every goal as met.

When `CI` is set, `task freshness:check` SHALL print a skip note naming the reason and SHALL NOT
run the measurement. The measurement SHALL NOT change the exit status of `task freshness:check` in
either branch.

The goal identifiers of this family SHALL be appended to the existing `HG_LOCAL_ONLY_GOALS` list
rather than introducing a second warning block.

#### Scenario: CI run skips the family with a visible note

- **GIVEN** the environment variable `CI` is set
- **WHEN** `task freshness:check` is executed
- **THEN** the output contains a skip note for the local-only goals
- **AND** no `G-LLM*` measurement value is printed

#### Scenario: Local run reports the family without affecting the gate

- **GIVEN** the environment variable `CI` is unset
- **WHEN** `task freshness:check` is executed
- **THEN** the output contains the `G-LLM*` goal identifiers
- **AND** the exit status is the one the gate would have produced without the block
