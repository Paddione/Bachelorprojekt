## ADDED Requirements

### Requirement: Domain agents declare no tools allowlist

No agent definition under `.claude/agents/` SHALL declare a `tools:` key in its
frontmatter. A `tools:` key is an allowlist: every tool not named in it is withheld,
including all MCP tools and the `Skill` tool. Omitting the key lets the agent inherit the
full tool set, which is the only form that survives an MCP server rename — a
hand-maintained list silently goes stale instead.

The registry mirror in `docs/agent-guide/registry/agents.yaml` SHALL carry no `tools:`
entry for any role, and `docs/agent-guide/maps/agents-map.md` SHALL be regenerated so the
drift gate in `tests/spec/agent-roster.bats` stays green.

This supersedes the narrower T002221 guard, which only asserted that a declared list
resolves to a non-empty set. That check passes for any list of valid tool names and
therefore did not catch `bachelorprojekt-ops`, whose four entries all resolve.

#### Scenario: An agent that declares a tools allowlist fails the guard

- **GIVEN** an agent definition under `.claude/agents/` whose frontmatter contains a
  `tools:` key with at least one entry
- **WHEN** the agent-library guard runs
- **THEN** the guard fails and names the offending agent file

#### Scenario: Every current domain agent passes

- **GIVEN** the six domain agents `bachelorprojekt-{db,infra,ops,security,test,website}`
- **WHEN** the agent-library guard runs
- **THEN** the guard passes, confirming none of them declares a `tools:` key

#### Scenario: The registry mirror stays consistent with the definitions

- **GIVEN** `docs/agent-guide/registry/agents.yaml` and the agent definition files
- **WHEN** `task agent-guide:maps` regenerates the maps and the roster drift gate runs
- **THEN** no role carries a `tools:` entry and the generated map shows no diff
