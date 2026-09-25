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
reachable only through `harness.claude_code`, SHALL pin `@icoretech/warden-mcp` to an exact version,
and the generated `.mcp.json` SHALL contain neither `BW_` variables nor `${…}` placeholders for it.

#### Scenario: Generated config is value-free
- **GIVEN** `task mcp:sync` has rendered `.mcp.json`
- **WHEN** the `warden` entry is inspected
- **THEN** it consists of `command: node` and the launcher path only
- **AND** no other generated harness config contains a `warden` entry

### Requirement: REQ-WARDEN-MCP-003 Every mutating vault tool asks for confirmation

`.claude/settings.json` SHALL list every mutating or destructive tool of the pinned warden-mcp
release under `permissions.ask` as `mcp__warden__keychain_<name>`, and none of them under
`permissions.allow`.

#### Scenario: Delete requires confirmation
- **GIVEN** Claude Code runs with the project settings
- **WHEN** the agent calls `mcp__warden__keychain_delete_item`
- **THEN** Claude Code prompts the user before the call is executed
