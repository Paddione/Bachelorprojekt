## ADDED Requirements

### Requirement: Declarative MCP server registry for Hermes
The system SHALL provide a versioned registry file `scripts/hermes-mcp-servers.yaml` listing
every project MCP server Hermes may connect to, including its transport (`url` for remote HTTP
servers or `command`+`args` for stdio servers) and an optional `tools.exclude` denylist of
destructive/mutating tool names.

#### Scenario: Registry lists all catalog servers
- **GIVEN** the project MCP catalog in `.opencode/opencode.jsonc` (`factory-mcp`,
  `mcp-kubernetes`, `mcp-postgres`, `codebase-memory-mcp`, `mcp-task-runner`, `ticket-mcp`)
- **WHEN** `scripts/hermes-mcp-servers.yaml` is parsed
- **THEN** every server name from the catalog is present as a top-level key with a valid
  transport definition (`url` XOR `command`)

#### Scenario: Denylist covers known destructive tools
- **GIVEN** the reference list of known destructive/mutating tool names per server (e.g.
  `mcp-kubernetes`: `pods_delete`, `pods_exec`, `pods_run`, `resources_delete`,
  `resources_create_or_update`, `resources_scale`; `ticket-mcp`: `create_ticket`,
  `transition_status`, `update_fields`, and the other write tools listed in the design doc)
- **WHEN** `scripts/hermes-mcp-servers.yaml` is validated against that reference list
- **THEN** every tool name in the reference list appears in the corresponding server's
  `tools.exclude` array

#### Scenario: mcp-postgres has no denylist
- **GIVEN** `mcp-postgres` exposes a single, server-side read-only-enforced `query` tool
- **WHEN** `scripts/hermes-mcp-servers.yaml` is parsed
- **THEN** the `mcp-postgres` entry has no `tools.exclude` key (or an empty one)

### Requirement: Idempotent provisioning of Hermes MCP config
The system SHALL provide `scripts/hermes-mcp-provision.sh`, which writes the `mcp_servers`
section of `~/.hermes/config.yaml` from `scripts/hermes-mcp-servers.yaml` without using the
interactive `hermes mcp add` flow, and which is idempotent (re-running it produces the same
resulting `mcp_servers` section for an unchanged registry).

#### Scenario: Dry-run does not modify the target config file
- **GIVEN** a fixture `config.yaml` without any `mcp_servers` entries
- **WHEN** `scripts/hermes-mcp-provision.sh --dry-run --config <fixture-path>` is run
- **THEN** the fixture file on disk is unchanged and the script prints the `mcp_servers` YAML
  it would write

#### Scenario: Provisioning is idempotent
- **GIVEN** a fixture `config.yaml` already provisioned by a previous run of
  `scripts/hermes-mcp-provision.sh --config <fixture-path>`
- **WHEN** the script is run again against the unchanged registry and the same fixture path
- **THEN** the resulting `mcp_servers` section is byte-for-byte identical to the previous run

#### Scenario: Provisioning preserves unrelated config keys
- **GIVEN** a fixture `config.yaml` containing an unrelated top-level key (e.g. `model:`)
  and a foreign `mcp_servers` entry not present in the registry
- **WHEN** `scripts/hermes-mcp-provision.sh --config <fixture-path>` is run
- **THEN** the unrelated top-level key and the foreign `mcp_servers` entry remain present in
  the resulting file

### Requirement: hermes-delegate.sh defaults to no tool access
`scripts/hermes-delegate.sh` SHALL default to invoking `hermes` with `-t ""` (no toolsets)
when called without the new MCP opt-in argument, preserving its existing zero-tool-access
default behavior.

#### Scenario: Default invocation stays tool-free
- **GIVEN** `scripts/hermes-mcp-provision.sh` has already provisioned MCP servers on the host
- **WHEN** `scripts/hermes-delegate.sh "<prompt>"` is called without the MCP opt-in argument
- **THEN** the underlying `hermes` invocation still passes `-t ""`

#### Scenario: Opt-in invocation enables provisioned MCP servers
- **GIVEN** `scripts/hermes-mcp-provision.sh` has already provisioned MCP servers on the host
- **WHEN** `scripts/hermes-delegate.sh "<prompt>" --with-project-mcp` is called
- **THEN** the underlying `hermes` invocation enables the provisioned MCP servers instead of
  passing `-t ""`
