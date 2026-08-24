## MODIFIED Requirements

### Requirement: Agent and runtime names in instruction files and Council calls match the agent registry

The Claude Code domain agents listed in the routing tables of `CLAUDE.md` and `AGENTS.md` MUST
match the `roles:` keys of `docs/agent-guide/registry/agents.yaml`, and the opencode agents listed
in `AGENTS.md` MUST match the `runtimes:` keys of the same registry. The registry is the SSOT
established by T002304; instruction files mirror it and MUST be provably consistent with it.
Council member assignments MUST reference those runtime keys and MUST resolve their model at run
time from the registry mirror whose values are drift-checked against the canonical
`.opencode/agent-models.jsonc`; Council-owned configuration MUST NOT duplicate provider/model
strings.

#### Scenario: an agent is added to the registry but not to the routing tables

- **GIVEN** `agents.yaml` gains a seventh entry under `roles:`
- **WHEN** the instruction-file gate runs
- **THEN** the test fails because `CLAUDE.md` and `AGENTS.md` still list only six agents

#### Scenario: an opencode runtime is missing from the AGENTS.md table

- **GIVEN** `agents.yaml` lists `orchestrator` under `runtimes:` and `AGENTS.md` omits it
- **WHEN** the instruction-file gate runs
- **THEN** the test fails and names the missing runtime

#### Scenario: a Council definition duplicates a provider/model string

- **GIVEN** a Council invocation or reusable definition assigns a member by provider/model string
  instead of a registered runtime ID
- **WHEN** Council input validation runs
- **THEN** it rejects the assignment before starting model processes
- **AND** it directs the caller to choose a runtime key from `agents.yaml`
