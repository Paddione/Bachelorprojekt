# agent-behavior

## Purpose

Regelt, was Agenten gegen produktive Systeme tun dürfen. Der erste Baustein ist der
Prod-Write-Guard aus T001954: Subagenten sollen während Plan- und Diagnosephasen lesen,
aber nicht schreiben. Der Guard sitzt vor `kubectl exec … psql` und unterscheidet
Lese- von Schreibzugriffen, statt sich auf die Selbstdisziplin des Aufrufers zu verlassen.

## Requirements

### Requirement: Prod-namespace write block
The system SHALL maintain a denylist of production Kubernetes namespaces. Any `kubectl exec ... psql` command targeting a namespace in the denylist that contains DDL/DML statements SHALL be intercepted and blocked unless an explicit override flag is provided.

#### Scenario: A write against a denylisted namespace is blocked

- **GIVEN** a namespace that appears in `PROD_WRITE_GUARD_DENYLIST`
- **WHEN** `prod-write-guard.sh check <namespace> "<DDL or DML statement>"` runs without an override flag
- **THEN** the command exits non-zero and the statement is not executed

#### Scenario: A read against a denylisted namespace passes

- **GIVEN** a namespace that appears in the denylist
- **WHEN** the statement is read-only
- **THEN** the guard exits zero and the statement is allowed to run

#### Scenario: A namespace outside the denylist is not intercepted

- **GIVEN** a namespace that does not appear in the denylist
- **WHEN** a write statement targets it
- **THEN** the guard exits zero, because the guard protects production only

### Requirement: Guard emits structured output
When a write is blocked, the guard SHALL emit a line in the format `GUARD: prod-write-blocked namespace=<ns> op=<type> caller=<context>` to stderr, enabling automated detection and logging.

#### Scenario: A blocked write emits a machine-readable line

- **GIVEN** a write that the guard blocks
- **WHEN** the guard rejects it
- **THEN** stderr carries a line beginning `GUARD: prod-write-blocked` with `namespace=`, `op=` and `caller=` fields
- **AND** the line goes to stderr, not stdout, so it never contaminates query output

### Requirement: Override requires explicit flag
The `--confirm-prod-write` flag SHALL bypass the guard but SHALL be logged to the agent-lock or session-message system for auditability. The flag SHALL NOT be available to subagents (read-only agents lack bash write permission).

#### Scenario: The override flag allows the write and is recorded

- **GIVEN** a write against a denylisted namespace
- **WHEN** `--confirm-prod-write` is passed
- **THEN** the guard exits zero
- **AND** an override line naming the namespace and the confirming caller is emitted for the audit trail

#### Scenario: Omitting the flag is the default

- **GIVEN** the same write without the flag
- **WHEN** the guard runs
- **THEN** it blocks — the bypass is never implicit

<!-- merged from change delta agent-behavior.md (e3d4ff2c50fa) -->

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

<!-- merged from change delta agent-behavior.md (1222bdaa73a7) -->