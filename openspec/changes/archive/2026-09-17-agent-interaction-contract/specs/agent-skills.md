## ADDED Requirements

### Requirement: The reply footer carries no next-step proposal

`AGENTS.md` SHALL define the cross-harness interaction contract in a section headed
`## Interaction Contract`, and that section SHALL NOT contain a `NEXT:` or a `CONF:` footer field.
The heading `## Status Protocol` SHALL NOT appear anywhere in `AGENTS.md`. The remaining footer
fields `STATUS`, `RUNNING` and `BLOCKED` SHALL be declared as a once-per-finished-thread block, not
as a per-reply block.

A footer that proposes the next objective and waits for a one-word override turns every reversible
step into a confirmation round. The agent that can name the next step is the agent that should take
it.

#### Scenario: the old status protocol is reintroduced

- **GIVEN** a session re-adds a `## Status Protocol` heading or a `NEXT:` footer field to `AGENTS.md`
- **WHEN** the interaction-contract gate in `tests/spec/agent-skills/interaction-contract.bats` runs
- **THEN** the test fails and names the reintroduced field

#### Scenario: the contract section is present and free of the proposal fields

- **GIVEN** `AGENTS.md` carries `## Interaction Contract` with a `STATUS`/`RUNNING`/`BLOCKED` footer
  and no `NEXT:` or `CONF:` field
- **WHEN** the interaction-contract gate runs
- **THEN** the test passes

### Requirement: Agents run an assignment to its own end before returning control

The `## Interaction Contract` section of `AGENTS.md` SHALL state that an agent carries the assigned
task through to its own logical completion — including verification, commit and pull request where
the assignment covers them — and SHALL state that an agent does not start a new task or pull a new
ticket without being asked. The section SHALL NOT make continuation conditional on user
confirmation for steps the agent itself recommends.

#### Scenario: the autonomy boundary is missing

- **GIVEN** `AGENTS.md` describes the footer but never states that the assignment is run to its end
- **WHEN** the interaction-contract gate runs
- **THEN** the test fails because the boundary statement is absent

#### Scenario: the boundary is stated in both directions

- **GIVEN** the section states both that the assignment is completed and that no new ticket is
  pulled unasked
- **WHEN** the interaction-contract gate runs
- **THEN** the test passes

### Requirement: Interrupting the user requires one of four declared triggers

The `## Interaction Contract` section SHALL enumerate exactly four triggers that justify returning
control before the assignment is finished: a destructive or irreversible operation; a genuine fork
between viable designs for which the prior-art search found no precedent; a blocked state such as
missing credentials or an unreachable service; and a cost above threshold. The blocked-state trigger
SHALL reference `.claude/lib/behaviors/escalation-protocol.md` rather than restating the escalation
procedure, and the section SHALL state that work not depending on the open question is delivered
regardless.

#### Scenario: the escalation behavior is duplicated instead of referenced

- **GIVEN** the section restates the `agent-escalate.sh` procedure instead of pointing at
  `.claude/lib/behaviors/escalation-protocol.md`
- **WHEN** the interaction-contract gate runs
- **THEN** the test fails because the escalation reference is missing

#### Scenario: all four triggers and the reference are present

- **GIVEN** the section lists the destructive, fork, blocked and cost triggers and references the
  escalation behavior file
- **WHEN** the interaction-contract gate runs
- **THEN** the test passes

### Requirement: Decision questions are asked in a keyboard-selectable form

The `## Interaction Contract` section SHALL require that a question with a finite set of answers is
asked through `AskUserQuestion` in Claude Code or `question` in opencode and agy, and that a harness
offering neither falls back to numbered Markdown options with the recommended option stated first.
`CLAUDE.md` SHALL carry a pointer to the `AGENTS.md` contract, because the Claude Code main loop
loads `CLAUDE.md` and reaches `AGENTS.md` only through an explicit reference.

#### Scenario: CLAUDE.md does not point at the contract

- **GIVEN** `AGENTS.md` carries the contract and `CLAUDE.md` never mentions it
- **WHEN** the interaction-contract gate runs
- **THEN** the test fails, because the Claude Code main loop would never load the contract

#### Scenario: both harness tools and the fallback are named

- **GIVEN** the section names `AskUserQuestion`, `question` and the numbered-Markdown fallback, and
  `CLAUDE.md` points at the contract
- **WHEN** the interaction-contract gate runs
- **THEN** the test passes
