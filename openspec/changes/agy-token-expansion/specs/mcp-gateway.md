## ADDED Requirements

### Requirement: Der agy-Renderer löst Header-Platzhalter auf

The agy renderer MUST resolve `${VAR}` placeholders in header values to their actual value,
because agy neither expands `${VAR}` itself nor understands opencode's `{env:VAR}` notation — it
sends the literal string and the target answers `401`. Resolution MUST consider the caller's
environment first and `~/.config/bge-mcp/server.env` second, so that the result does not depend on
which shell invoked the sync. Resolution MUST apply to every client's headers, not to one
hard-coded variable name.

#### Scenario: Placeholder resolved from the environment

- **GIVEN** a registry client whose header value contains `${PROBE_TOKEN}`
- **AND** `PROBE_TOKEN` is set in the environment
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the agy config carries the variable's value and no longer contains `${PROBE_TOKEN}`

#### Scenario: Placeholder resolved from server.env when the environment is empty

- **GIVEN** `PROBE_TOKEN` is unset in the environment
- **AND** `~/.config/bge-mcp/server.env` defines `PROBE_TOKEN`
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the agy config carries the value from that file

#### Scenario: Unresolvable placeholder is kept and reported

- **GIVEN** a header placeholder that is defined neither in the environment nor in `server.env`
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** it exits 0, the agy config still contains the literal placeholder, and a warning naming
  the variable is written to stderr

#### Scenario: Header values without a placeholder are untouched

- **GIVEN** a header value containing no `${...}` sequence
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the agy config carries that value byte-identical

### Requirement: Repository-tracked configs never carry an expanded secret

Because `.mcp.json` and `.opencode/opencode.jsonc` are tracked in the repository, they MUST keep
their placeholder notation. Only the agy config, which lives outside any working tree under
`$HOME`, may carry a resolved value.

#### Scenario: The two tracked renderers keep their notation

- **GIVEN** a registry client with a `${PROBE_TOKEN}` header and `PROBE_TOKEN` set to a value
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** `.mcp.json` still contains `${PROBE_TOKEN}`, `.opencode/opencode.jsonc` still contains
  `{env:PROBE_TOKEN}`, and neither file contains the resolved value
