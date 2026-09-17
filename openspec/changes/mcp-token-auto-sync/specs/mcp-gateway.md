# Delta: mcp-gateway — token drift auto-sync

_Ticket: T900223 · Parent-SSOT: `openspec/specs/mcp-gateway.md`_

## ADDED Requirements

### Requirement: Watchdog detects MCP token drift without leaking secrets

The `mcp-gateway-watchdog` SHALL compare the live token fingerprints
(sha256) of the supervised MCP credentials against the local
`~/.config/*/server.env` files on every tick, and SHALL report `match` or
`drift` per key name only — never a token value, neither on stdout, nor in
the journal, nor in agent messages.

#### Scenario: Fingerprints match — no action *(BATS)*

- **GIVEN** the live secret value and the `server.env` value share the same sha256
- **WHEN** `scripts/mcp-gateway/token-drift-heal.sh check` runs
- **THEN** it exits 0, writes nothing, restarts nothing, and its output contains no token value

#### Scenario: Fingerprints differ — drift is reported without values *(BATS)*

- **GIVEN** a fixture live secret and a fixture `server.env` with different values
- **WHEN** the check runs
- **THEN** it reports `drift` for the key name, exits non-zero, and the output contains neither value

#### Scenario: Cluster unreachable — fail-closed skip *(BATS)*

- **GIVEN** the live secret cannot be read (cluster down)
- **WHEN** the check runs
- **THEN** it reports `skip`, exits 0, and heals nothing

### Requirement: Watchdog heals token drift and notifies

On detected drift the system SHALL atomically rewrite the affected
`server.env` file (mode 600), re-run `scripts/mcp-sync.sh render` so all
harness configs (including the Codex bearer entries) pick up the new token,
restart only the affected systemd user units, and notify via
`scripts/agent-msg.sh post` plus a journal line that the harness must be
restarted once (running sessions read tokens only at startup). The heal
SHALL honour the watchdog rate-limit and SHALL NOT loop when the post-heal
`doctor.sh` bearer probe still fails — it notifies once instead.

#### Scenario: Drift triggers full heal *(BATS)*

- **GIVEN** a drifted fixture key with a mocked unit-restart hook
- **WHEN** the heal runs
- **THEN** the fixture `server.env` carries the new value with mode 600, the render hook ran, the affected unit hook ran, unaffected unit hooks did not run, and no output contains either token value

#### Scenario: No drift — heal is a no-op *(BATS)*

- **GIVEN** matching fixture fingerprints
- **WHEN** the heal runs
- **THEN** no file is rewritten, no render hook runs, and no unit hook runs

#### Scenario: Heal notifies about the required harness restart *(BATS)*

- **GIVEN** a drifted fixture key
- **WHEN** the heal completes
- **THEN** the agent-msg hook received a message naming the key and stating that the harness must be restarted once
