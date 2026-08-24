## ADDED Requirements

### Requirement: Council members resolve through the existing agent registry

The Council SHALL accept repeatable registered runtime IDs as members. It SHALL resolve each
runtime through `docs/agent-guide/registry/agents.yaml` and SHALL NOT persist provider/model
strings in Council definitions. Runtime-to-model consistency SHALL continue to be enforced by
the existing bidirectional drift contract against `.opencode/agent-models.jsonc`.

#### Scenario: Registered runtime is assigned

- **GIVEN** `qwen-cloud` exists under `agents.yaml` `runtimes:`
- **WHEN** the user invokes the Council with `--member qwen-cloud`
- **THEN** the member model is resolved from the registry at run time
- **AND** no Council-owned model mapping is consulted or created

#### Scenario: Unknown runtime is rejected before paid calls

- **GIVEN** no runtime named `invented-model` exists in the registry
- **WHEN** the user assigns `--member invented-model`
- **THEN** the invocation fails before starting any model process
- **AND** the diagnostic lists valid runtime IDs

### Requirement: Assigned models deliberate without project mutation

Every member turn SHALL execute through a read-only agent profile while selecting the resolved
model explicitly. Council prompts SHALL be treated as advisory deliberation and SHALL NOT grant
member runtimes their normal write permissions. The Council SHALL never implement, commit,
enqueue, deploy, or otherwise mutate the project beyond its own run artifacts.

#### Scenario: Write-capable runtime joins as a read-only member

- **GIVEN** a registered runtime whose ordinary agent definition is write-capable
- **WHEN** it is assigned as a Council member
- **THEN** the launcher uses the read-only `explore` profile with that runtime's resolved model
- **AND** the member cannot modify the working tree

### Requirement: Council protocol preserves evidence and dissent

The Council SHALL run independent opening positions before sharing other members' output. It
SHALL then perform cross-examination, produce a candidate synthesis, and collect a structured
ballot from every surviving member. A ballot SHALL be exactly one of `ACCEPT`,
`ACCEPT_WITH_CONDITION`, or `OBJECT`, with evidence and any conditions or objections retained in
the final record.

#### Scenario: Minority objection survives the final result

- **GIVEN** most members accept a candidate and one member returns a material `OBJECT`
- **WHEN** the final decision is assembled
- **THEN** the objection and its evidence appear verbatim in the decision record
- **AND** the Council does not relabel receipt or majority support as unanimity

### Requirement: Decision states fail honestly

The Council SHALL derive its outcome from successful member count, model diversity, ballots,
conditions, and unresolved material objections. It SHALL support at least `CONSENSUS`,
`QUALIFIED_CONSENSUS`, `HUMAN_REQUIRED`, `INSUFFICIENT_EVIDENCE`, and `FAILED`. A material
objection or unresolved acceptance condition SHALL prevent `CONSENSUS`.

#### Scenario: Material objection requires human judgment

- **GIVEN** a revision round ends with a surviving material objection
- **WHEN** no configured revision rounds remain
- **THEN** the outcome is `HUMAN_REQUIRED`
- **AND** the decision record identifies the exact unresolved question

#### Scenario: Too few independent models survive

- **GIVEN** fewer than two distinct resolved model identities return successful opening positions
- **WHEN** the Council evaluates viability
- **THEN** it returns `INSUFFICIENT_EVIDENCE`
- **AND** it does not continue to synthesis as though aliases were independent votes

### Requirement: Council runs are inspectable and resumable as evidence

Each invocation SHALL create a unique run directory containing the input, resolved member roster,
per-round member outputs, candidate revisions, ballots, failure details, and a final structured
decision. The human-readable summary and JSON decision SHALL agree on status and unresolved
objections.

#### Scenario: Model process fails during deliberation

- **GIVEN** one assigned model exits unsuccessfully
- **WHEN** at least two distinct successful models remain
- **THEN** deliberation continues with the surviving members
- **AND** the failed member and error are disclosed in the final artifacts

### Requirement: VDA exposes the Council as the canonical call surface

`scripts/vda.sh` SHALL expose a `council` command with repeatable `--member` assignments, an
explicit question or prompt file, an optional chair runtime, bounded revision rounds, and a
machine-readable output mode. Help and validation SHALL complete without starting model calls.

#### Scenario: User requests JSON decision output

- **GIVEN** valid registered members and a question
- **WHEN** the user invokes `bash scripts/vda.sh council --json ...`
- **THEN** stdout contains the final decision JSON
- **AND** progress and diagnostics do not corrupt stdout
