## ADDED Requirements

### Requirement: Loadout-scoped Web UI config file

A loadout MAY declare an optional `uiConfigFile` path. When present, the runner SHALL pass it to
`llama-server` as `--ui-config-file`. When absent, no such argument SHALL be emitted, so loadouts
without the field keep their current argv byte-for-byte.

#### Scenario: Loadout declares uiConfigFile

- **GIVEN** a loadout whose `uiConfigFile` is `/run/user/1000/llama-ui-config.json`
- **WHEN** the runner builds the server argv for that loadout
- **THEN** the argv contains `--ui-config-file` immediately followed by that exact path

#### Scenario: Loadout omits uiConfigFile

- **GIVEN** a loadout with no `uiConfigFile` key, or with the value `null`
- **WHEN** the runner builds the server argv for that loadout
- **THEN** the argv contains no `--ui-config-file` token

#### Scenario: Only the 26B chat loadout is seeded

- **GIVEN** the shipped `scripts/llm/loadouts.json`
- **WHEN** the loadouts are inspected for a non-null `uiConfigFile`
- **THEN** exactly one loadout carries it, and its slug is `gemma26-factory`

### Requirement: MCP server seed is generated from the registry

The seed SHALL be generated from `docs/agent-guide/registry/mcp.yaml`. Every registry entry that is
reachable over HTTP SHALL appear in the seed, addressed by its `browser_endpoint` when the registry
declares one and by its `endpoint` otherwise. Entries the bridge does not serve SHALL NOT appear.

The generator SHALL emit the `mcpServers` value as a **JSON string containing an array**, matching
what the Web UI parses. Emitting a bare array SHALL be treated as a defect, because the Web UI
discards an unparseable value silently.

#### Scenario: Registry entry with a browser endpoint

- **GIVEN** a registry entry declaring `endpoint: http://localhost:18080/mcp` and
  `browser_endpoint: http://localhost:18082/mcp`
- **WHEN** the seed is generated
- **THEN** the entry's `url` in the seed is the browser endpoint, not the plain endpoint

#### Scenario: Seed value is a string, not an array

- **GIVEN** a generated seed file
- **WHEN** its `mcpServers` value is read
- **THEN** the value's JSON type is string, and parsing that string yields an array of objects each
  carrying `id`, `enabled`, `url` and `name`

#### Scenario: Every seeded server answers an MCP handshake

- **GIVEN** a generated seed file and the running MCP fleet
- **WHEN** an `initialize` request is sent to each seeded `url`
- **THEN** each responds with HTTP 200 and a JSON-RPC result carrying `serverInfo`

### Requirement: Bearer tokens never enter tracked files

The tracked seed template SHALL carry the bearer token only as an unexpanded `${BGE_MCP_TOKEN}`
reference. The expanded file SHALL be written outside the repository working tree at start time.

#### Scenario: Template holds no expanded secret

- **GIVEN** the tracked seed template
- **WHEN** its contents are scanned
- **THEN** the literal `${BGE_MCP_TOKEN}` is present and no expanded token value is

#### Scenario: Rendered runtime file carries the header

- **GIVEN** `BGE_MCP_TOKEN` is exported in the environment
- **WHEN** the seed is rendered to its runtime path
- **THEN** the rendered `bge-mcp` entry carries an `Authorization` header with the expanded value,
  and the runtime path lies outside the repository working tree

### Requirement: Seeded servers reach the Web UI as defaults

A `llama-server` started with a generated seed SHALL expose that seed under `/props` in
`ui_settings.mcpServers`, so the Web UI adopts the servers as defaults without any browser-side
configuration.

#### Scenario: Seed is observable through /props

- **GIVEN** a `llama-server` started with `--ui-config-file` pointing at a generated seed
- **WHEN** `GET /props` is requested
- **THEN** `ui_settings.mcpServers` equals the seed's `mcpServers` value verbatim

#### Scenario: The llama-server CORS proxy stays disabled

- **GIVEN** a `llama-server` started with a generated seed
- **WHEN** `GET /props` is requested
- **THEN** `cors_proxy_enabled` is `false`
