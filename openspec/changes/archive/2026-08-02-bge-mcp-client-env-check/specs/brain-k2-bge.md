# Spec Delta: brain-k2-bge

## ADDED Requirements

### Requirement: bge-mcp client env diagnostic (REQ-bge-01)

A diagnostic script MUST report whether the local bge-mcp client environment is
usable, distinguishing a missing token from an unreachable server.

#### Scenario: Token present and server reachable

- **GIVEN** `~/.config/bge-mcp/server.env` exists and contains `BGE_MCP_TOKEN`
- **WHEN** `scripts/bge-mcp/check-client-env.sh` is executed
- **THEN** it exits 0 and reports both the token and a 200 response from the server

#### Scenario: Token missing

- **GIVEN** `~/.config/bge-mcp/server.env` is absent OR contains no `BGE_MCP_TOKEN`
- **WHEN** the check is executed
- **THEN** it exits 1 and names the required fix

#### Scenario: Server unreachable

- **GIVEN** the bge-mcp server on `:13005` does not respond
- **WHEN** the check is executed
- **THEN** it exits 2 and reports the server as down

### Requirement: BATS coverage for all three outcomes (REQ-bge-02)

The three exit codes MUST be covered by a BATS test that drives the script
through a fake environment, verifying command output rather than source text.

#### Scenario: Fake environment exercises every exit code

- **GIVEN** a fake env in a tmpdir simulating the three states
- **WHEN** the BATS test runs
- **THEN** exit codes 0, 1 and 2 are each asserted

### Requirement: Documentation points at the diagnostic (REQ-bge-03)

The MCP tool guide MUST reference the check, so an agent hitting a bge-mcp auth
failure finds the diagnostic instead of guessing.

#### Scenario: Guide references the check script

- **GIVEN** the check script exists
- **WHEN** the diagnostic block in `mcp-tool-guide.md` is read
- **THEN** it names `scripts/bge-mcp/check-client-env.sh`
