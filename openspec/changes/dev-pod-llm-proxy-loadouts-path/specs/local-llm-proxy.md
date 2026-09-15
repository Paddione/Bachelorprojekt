## ADDED Requirements

### Requirement: Deterministic loadouts path resolution across execution environments
<!-- bats: local-llm-proxy/dev-pod-loadouts-path.bats -->

The system SHALL locate `scripts/llm/loadouts.json` reliably regardless of the current working directory.
When reading or writing loadout configuration:
1. If the environment variable `LOADOUTS_PATH` is set, that path SHALL be used.
2. If `scripts/llm/loadouts.json` exists relative to the current working directory, that path SHALL be used.
3. If `DEV_POD_REPO` is set and contains `scripts/llm/loadouts.json`, that path SHALL be used.
4. If neither matches, the path SHALL be resolved relative to the module location (`scripts/llm-proxy/loadouts.mjs`).

The `mcp-node` supervisor SHALL pass `LOADOUTS_PATH="${LOADOUTS_PATH:-$REPO/scripts/llm/loadouts.json}"`
to the `llm-proxy` process.

#### Scenario: Explicit LOADOUTS_PATH takes precedence *(BATS)*

- **GIVEN** `LOADOUTS_PATH` is set in the process environment pointing to a valid loadouts file
- **WHEN** `readLoadouts()` is invoked without arguments
- **THEN** it reads configuration from `LOADOUTS_PATH`

#### Scenario: Running from outside the repo root resolves loadouts relative to the repository *(BATS)*

- **GIVEN** the current working directory is outside the repository (e.g. `/tmp` or `/workspace`)
- **AND** `LOADOUTS_PATH` is not explicitly set
- **WHEN** `readLoadouts()` is invoked without arguments
- **THEN** it resolves the repository's `scripts/llm/loadouts.json` without throwing `ENOENT`

#### Scenario: Supervisor passes LOADOUTS_PATH to llm-proxy *(BATS)*

- **GIVEN** `docker/mcp-node/supervisor.sh`
- **WHEN** the `supervise llm-proxy` command definition is inspected
- **THEN** it sets `LOADOUTS_PATH` pointing to `$REPO/scripts/llm/loadouts.json`
