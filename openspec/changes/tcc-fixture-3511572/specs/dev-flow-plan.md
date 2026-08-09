## ADDED Requirements

### Requirement: Unified Task Context Assembly

The system SHALL provide a single context assembler that both execution paths — the Software
Factory dispatcher and `dev-flow-execute` — invoke to build the context block prepended to an
implementer agent's prompt, so that neither path is structurally better supplied than the other.

#### Scenario: Factory dispatch receives the assembled context

- **GIVEN** a ticket whose change directory contains a valid `intel.json`
- **WHEN** the Factory dispatches an implementer for one of its partials
- **THEN** the agent prompt contains the assembled context block in addition to `tasks.md`
- **AND** the block carries the intel subset for that partial's `target_files`

#### Scenario: dev-flow-execute uses the same assembler

- **GIVEN** the same change directory
- **WHEN** `dev-flow-execute` spawns its implementer subagent
- **THEN** the context block is produced by the same assembler, not by a path-specific routine

### Requirement: Deterministic Intel Bundle Generation

The system SHALL provide a generator that populates the mechanically derivable sections of
`intel.json` without requiring an LLM: `impact_files` with their S1 ratchet values, `db_tables`,
`symbols` and `call_graph`. Sections requiring judgement — `api_contracts` and `external_types` —
remain the planner's responsibility.

#### Scenario: Generator populates mechanical sections

- **GIVEN** a change slug and a set of target files
- **WHEN** the generator runs
- **THEN** `impact_files` contains one entry per target file with `loc`, `s1_limit`, `s1_baseline`
  and `s1_budget` computed from the working tree and `docs/code-quality/baseline.json`
- **AND** the resulting bundle validates against `plan-intel-bundle.schema.json`

#### Scenario: Unreachable source is recorded, not silently skipped

- **GIVEN** an intel source and its fallback are both unavailable
- **WHEN** the generator runs
- **THEN** it records a `risks[]` entry with `severity: warn` naming the missing source
- **AND** it does not leave the corresponding section silently empty

### Requirement: Hard Core And Visibly Degraded Enrichment

The assembler SHALL treat the static core as mandatory and the dispatch-time enrichment as
optional, and SHALL make every enrichment failure visible in its output rather than omitting the
section.

#### Scenario: Missing core aborts

- **GIVEN** a change directory without `intel.json`, or with a bundle failing the completeness rule
- **WHEN** the assembler runs
- **THEN** it exits non-zero and emits a diagnostic naming the missing or incomplete section
- **AND** it does not emit a partial context block

#### Scenario: Failed enrichment is marked, not dropped

- **GIVEN** an enrichment source that times out or is unreachable
- **WHEN** the assembler runs
- **THEN** the output still contains the static core
- **AND** the output contains an explicit marker naming the unavailable signal
- **AND** the assembler exits zero

#### Scenario: Enrichment cannot stall a dispatch

- **GIVEN** all three enrichment sources are unresponsive
- **WHEN** the assembler runs
- **THEN** each source is abandoned after its individual timeout
- **AND** total added latency stays bounded by the sum of those timeouts

### Requirement: Intel Bundle Completeness Gate

`plan-lint` SHALL verify that a staged plan's intel bundle is complete with respect to the plan's
own partial manifest, rather than merely present.

#### Scenario: Bundle covering all target files passes

- **GIVEN** a plan whose partial manifest lists target files
- **AND** an `intel.json` whose `impact_files` paths cover the union of those target files
- **AND** non-empty `meta` and `symbols`
- **WHEN** `plan-lint` runs
- **THEN** the completeness rule passes

#### Scenario: Bundle missing a target file fails

- **GIVEN** a plan whose partial manifest lists a target file absent from `impact_files`
- **WHEN** `plan-lint` runs
- **THEN** the completeness rule fails and names the uncovered file
- **AND** the linter exits non-zero
