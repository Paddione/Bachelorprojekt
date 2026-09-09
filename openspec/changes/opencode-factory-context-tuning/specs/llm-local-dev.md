## ADDED Requirements

### Requirement: V2 Compaction Targets 100K Active Context

The project opencode config SHALL declare a V2 `compaction` block with
`auto: true`, `keep.tokens: 16000` and `buffer: 96000`, with a comment showing
the threshold math for the 200k factory model.

Rationale: V2 computes the preflight threshold as
`context − max(output, buffer)` (verified against
`packages/core/src/session/compaction.ts` and
`https://opencode.ai/v2/docs/compaction/`). With `context: 200000` and
`output: 8192`, `buffer: 96000` yields compaction at ≈104k active context;
`keep.tokens: 16000` keeps the 12–20k recent tail. The V1 keys `reserved` and
`preserve_recent_tokens` are ignored by V2 and SHALL NOT appear.

#### Scenario: Compaction block present with V2 keys

- **GIVEN** `.opencode/opencode.jsonc` on the feature branch
- **WHEN** the `compaction` block is inspected
- **THEN** it contains `auto: true`, `keep.tokens: 16000`, `buffer: 96000`
  and no `reserved` or `preserve_recent_tokens` key

#### Scenario: Threshold math holds for the factory model

- **GIVEN** the factory model limit `context: 200000`, `output: 8192`
- **WHEN** `200000 − max(8192, 96000)` is computed
- **THEN** the result is `104000` (≈100k operating target)

### Requirement: Factory Roles Carry Minimal Toolsets

Each factory role (planner, implementer, reviewer, dispatcher) SHALL be
documented with only the tools it needs; the implementation SHALL restrict
per-agent permissions where opencode supports it and otherwise reduce the
global surface (disabled MCP servers, skill denies) plus a prompt convention.

- Planner: code search, read, ticket operations.
- Implementer: read, edit, shell, tests.
- Reviewer: read, diff, tests; no write access.
- Dispatcher: ticket/session operations, no code tools.

#### Scenario: Reviewer has no write access

- **GIVEN** the reviewer role definition
- **WHEN** its permission set is inspected
- **THEN** write/edit operations are denied

### Requirement: Fresh Sessions at Ticket and Partial Boundaries

The orchestrator and factory prompts SHALL require a fresh implementation
session per ticket/partial with a self-contained task packet (goal, files,
acceptance, `Done when`, `Stop when`, `Rejected approaches`); continuity
travels via Git, tickets, specs and handoff artifacts, not via long-running
conversations. Research and implementation SHALL be separate sessions.

#### Scenario: Task packet carries stopping conditions

- **GIVEN** a factory dispatch prompt
- **WHEN** its sections are inspected
- **THEN** it states `Done when` (behavior, tests, no unrelated files,
  commit, ticket evidence) and `Stop when` (3rd identical failure, missing
  credential, spec conflict, file-boundary breach)

### Requirement: Global Instructions Stay Lean

`AGENTS.md` SHALL NOT exceed 160 lines; guidance applying to fewer than ~20%
of factory tasks lives next to its component, not in the global prompt.

#### Scenario: AGENTS.md line cap

- **GIVEN** `AGENTS.md` on the feature branch
- **WHEN** `wc -l` is run
- **THEN** the count is at most 160
