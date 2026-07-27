## ADDED Requirements

### Requirement: Self-built MCP servers must be referenced by PATH name, not absolute path

An MCP server built from this repository MUST be installed onto the `PATH` and referenced in
`docs/agent-guide/registry/mcp.yaml` by its command name. The registry MUST NOT contain an
absolute path under a user home directory.

An absolute path such as `/home/<user>/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go` binds the
repository to one account and one checkout location. It also spreads: the same literal has to be
repeated in every harness config and in every task that verifies the server, so a move breaks
several files at once.

The install step MUST be best-effort rather than fatal: a host where the target directory is not
writable falls back to an already-installed binary instead of failing the task. `mcp-task-runner`
establishes this pattern.

#### Scenario: the registry references a repo-built server

- **GIVEN** `ticket-mcp` is built from `scripts/ticket-mcp/go`
- **WHEN** `docs/agent-guide/registry/mcp.yaml` declares its `command`
- **THEN** the value is the PATH name `ticket-mcp-go`, and `grep -c '/home/' ` over the registry
  returns 0

#### Scenario: the install target is not writable

- **GIVEN** a host on which `/usr/local/bin` is not writable and `sudo -n` is unavailable
- **WHEN** the build task runs
- **THEN** it reports that it keeps the pre-installed binary and exits successfully, rather than
  failing the whole task chain

#### Scenario: harness configs are regenerated from the registry

- **GIVEN** the registry command changed from an absolute path to a PATH name
- **WHEN** `task mcp:sync` runs
- **THEN** `.mcp.json`, `.opencode/opencode.jsonc` and `~/.gemini/config/mcp_config.json` carry the
  PATH name, and `task mcp:check` reports no drift
