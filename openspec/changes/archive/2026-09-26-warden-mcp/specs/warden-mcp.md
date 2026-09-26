## ADDED Requirements

### Requirement: REQ-WARDEN-MCP-001 Credentials only from the user config file

The warden-mcp launcher SHALL read `BW_HOST`, `BW_CLIENTID`, `BW_CLIENTSECRET` and `BW_PASSWORD`
exclusively from `~/.config/warden-mcp/server.env` and SHALL exit non-zero without starting the
server when the file or any of the four keys is missing or empty.

#### Scenario: Missing config file
- **GIVEN** `~/.config/warden-mcp/server.env` does not exist
- **WHEN** `node scripts/warden-mcp/launch.mjs` is started
- **THEN** it exits with a non-zero status
- **AND** stderr names the expected file path

#### Scenario: Missing key
- **GIVEN** `server.env` defines `BW_HOST`, `BW_CLIENTID`, `BW_CLIENTSECRET` but `BW_PASSWORD` is empty
- **WHEN** the launcher starts
- **THEN** it exits with a non-zero status
- **AND** stderr names `BW_PASSWORD`

### Requirement: REQ-WARDEN-MCP-002 No credentials in tracked MCP configs

The registry entry `warden` in `docs/agent-guide/registry/mcp.yaml` SHALL be a stdio server
reachable through `harness.claude_code` and `harness.opencode` and through no further harness,
SHALL pin `@icoretech/warden-mcp` to an exact version, and the generated `.mcp.json` SHALL
contain neither `BW_` variables nor `${…}` placeholders for it.

#### Scenario: Generated config is value-free
- **GIVEN** `task mcp:sync` has rendered `.mcp.json`
- **WHEN** the `warden` entry is inspected
- **THEN** it consists of `command: node` and the launcher path only
- **AND** no generated harness config outside the two approved harnesses contains a `warden`
  entry (for example not `scripts/llm/mcp-servers.json`)

#### Scenario: opencode renders the same launcher
- **GIVEN** the registry entry carries `harness.opencode` with `type: local`
- **WHEN** `task mcp:sync` has rendered `.opencode/opencode.jsonc`
- **THEN** the `warden` entry consists of `command: ["node","scripts/warden-mcp/launch.mjs"]`
  and `enabled: true`
- **AND** `task mcp:check` exits zero

### Requirement: REQ-WARDEN-MCP-003 Every mutating vault tool asks for confirmation

`.claude/settings.json` SHALL list every mutating or destructive tool of the pinned warden-mcp
release under `permissions.ask` as `mcp__warden__keychain_<name>`, and none of them under
`permissions.allow`. `.opencode/opencode.jsonc` SHALL list the same tools under `permission` as
`warden_keychain_<name>` with the value `ask`, and SHALL not allow or deny any of them.

#### Scenario: Delete requires confirmation
- **GIVEN** Claude Code runs with the project settings
- **WHEN** the agent calls `mcp__warden__keychain_delete_item`
- **THEN** Claude Code prompts the user before the call is executed

#### Scenario: Delete requires confirmation in opencode
- **GIVEN** opencode runs with the project config `.opencode/opencode.jsonc`
- **WHEN** the agent calls `warden_keychain_delete_item`
- **THEN** the tool is not executed without a user confirmation

### Requirement: REQ-WARDEN-MCP-004 Bitwarden CLI is resolved and version-checked on every platform

The launcher SHALL set `BW_BIN` to the first usable Bitwarden CLI it finds on `PATH`,
`~/.local/bin/bw` or, on Windows, in the WinGet package folder, SHALL emit a warning when none is
found or when its version is newer than 2026.6.x, and SHALL NOT abort on either condition.

#### Scenario: No usable Bitwarden CLI
- **GIVEN** neither `PATH` nor `~/.local/bin/bw` nor the WinGet folder provides a `bw` binary
- **WHEN** the launcher starts
- **THEN** it still starts the MCP server
- **AND** stderr carries a warning naming the searched locations

#### Scenario: Too new Bitwarden CLI
- **GIVEN** the resolved `bw` reports a version newer than 2026.6.x
- **WHEN** the launcher starts
- **THEN** stderr carries a warning naming the resolved binary and its version
- **AND** the server still starts, because vault access is established lazily
