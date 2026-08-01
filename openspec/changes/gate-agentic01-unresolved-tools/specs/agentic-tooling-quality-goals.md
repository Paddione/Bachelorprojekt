## MODIFIED Requirements

### Requirement: G-AGENTIC01 Subagent Tool-Scope Baseline Tracked

The measurement command SHALL count, across all agent definitions under `.claude/agents/`, every
`tools:` entry that resolves to nothing. Two states count as a violation:

1. a `tools:` key that resolves to the empty set;
2. a `tools:` entry of the form `mcp__<server>__<tool>` whose `<server>` is not declared under
   `clients:` in `docs/agent-guide/registry/mcp.yaml`.

An agent that declares **no** `tools:` key at all SHALL NOT count — it inherits every tool, which is
the deliberate state established by test `T002221` for `bachelorprojekt-{security,infra,db}`.

The measurement SHALL be exposed as a standalone command that both the goal check and the test suite
invoke, so that the test can assert on its actual output rather than on its source text. The command
SHALL fail with a non-zero exit code when the registry is unreadable, rather than reporting a count
of zero from a measurement that did not happen.

This is a Target, not a Gate — the count is documented in `goals.md` without failing CI regardless of
value.

#### Scenario: Counting agents whose declared tools resolve to nothing

- **GIVEN** a set of agent definitions under `.claude/agents/` and the MCP registry at
  `docs/agent-guide/registry/mcp.yaml`
- **WHEN** the G-AGENTIC01 measure command is executed against them
- **THEN** it prints the number of agents whose `tools:` key resolves to the empty set plus the
  number of `mcp__<server>__<tool>` entries naming a server absent from the registry, and that value
  is recorded as the documented Target baseline in `goals.md`

#### Scenario: An agent without a tools key is not a violation

- **GIVEN** an agent definition that declares no `tools:` key in its frontmatter
- **WHEN** the G-AGENTIC01 measure command is executed
- **THEN** that agent does not contribute to the count, so the state deliberately established by
  test `T002221` does not put the goal into warning

#### Scenario: A misspelled MCP tool name is counted even when built-ins remain

- **GIVEN** an agent whose `tools:` list contains both a valid built-in and an entry naming an MCP
  server that is absent from the registry
- **WHEN** the G-AGENTIC01 measure command is executed
- **THEN** the misspelled entry is counted, even though the list as a whole does not resolve to the
  empty set

#### Scenario: An unreadable registry fails instead of reporting zero

- **GIVEN** a registry path that does not exist
- **WHEN** the G-AGENTIC01 measure command is executed
- **THEN** it exits with a non-zero status and does not print a count, so a green goal can never rest
  on a measurement that did not run
