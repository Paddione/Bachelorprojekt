## ADDED Requirements

### Requirement: HTTP MCP Client Header Declaration

The MCP registry SHALL support an optional `headers` map on any client with `transport: http`,
and the generators SHALL render that map into every harness config that supports request headers
(`claude_code`, `agy`, `opencode`). Header values MAY contain `${VAR}` environment references,
which the generators SHALL emit verbatim without expansion, so that no secret material is written
into a tracked file.

#### Scenario: Registry declares a bearer header for an authenticated HTTP server

- **GIVEN** the registry entry for `bge-mcp` declares `headers.Authorization: "Bearer ${BGE_MCP_TOKEN}"`
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** `.mcp.json` contains a `headers` object for `bge-mcp` whose `Authorization` value is the
  literal string `Bearer ${BGE_MCP_TOKEN}`, and `scripts/mcp-sync.sh check` reports no drift

#### Scenario: Header support is generic, not per-server

- **GIVEN** a registry contains an arbitrary `transport: http` client with two declared headers
- **WHEN** the generators render that registry
- **THEN** both headers appear unchanged in the generated config, without the client being named
  anywhere in the generator source

#### Scenario: No expanded secret reaches a tracked config

- **GIVEN** the generated `.mcp.json` declares one or more `Authorization` headers
- **WHEN** each header value is inspected
- **THEN** every value is an unexpanded `${VAR}` reference, and none contains a literal token

#### Scenario: Harness reaches the authenticated server

- **GIVEN** `BGE_MCP_TOKEN` is exported in the environment the harness was started from
- **WHEN** the harness performs the MCP `initialize` handshake against `127.0.0.1:13005`
- **THEN** the server answers `HTTP 200` instead of `HTTP 401`, and the tools `bge_embed` and
  `bge_rerank` are listed

#### Scenario: Servers without declared headers are unaffected

- **GIVEN** an existing `transport: http` client that declares no `headers` map
- **WHEN** the generators render it
- **THEN** its emitted config carries no `headers` key at all, byte-identical to the previous
  output, so that `check` stays green for every untouched server

### Requirement: Generator Output Redirection For Testing

`scripts/mcp-sync.sh` SHALL honour the environment overrides `MCP_REGISTRY` (source registry path)
and `MCP_OUT_DIR` (target root directory) so that `render` can be exercised against a fixture
registry without writing to the real harness configs.

#### Scenario: Render writes to an alternate output root

- **GIVEN** `MCP_REGISTRY` points at a fixture registry and `MCP_OUT_DIR` at a temporary directory
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** the generated configs appear beneath the temporary directory, and the repository's
  own `.mcp.json`, `.opencode/opencode.jsonc` and `scripts/llm/mcp-servers.json` remain unmodified
