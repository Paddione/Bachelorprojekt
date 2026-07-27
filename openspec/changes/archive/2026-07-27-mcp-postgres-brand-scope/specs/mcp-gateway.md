## ADDED Requirements

### Requirement: mcp-postgres Brand Scope Is Declared

The `mcp-postgres` client entry in the MCP registry SSOT
(`docs/agent-guide/registry/mcp.yaml`) SHALL declare which brand database the server is
bound to, so that the binding is discoverable mechanically and not only in prose. The
declaration SHALL name the brand, the target database service, and the sanctioned read
path for the other brand.

#### Scenario: Registry declares brand and target database *(BATS)*

- **GIVEN** the registry file `docs/agent-guide/registry/mcp.yaml`
- **WHEN** the `clients.mcp-postgres` entry is parsed as YAML
- **THEN** it exposes a `brand` key with the value `mentolder`
- **AND** it exposes a non-empty `database` key naming the backing service

#### Scenario: Registry names the sanctioned korczewski read path *(BATS)*

- **GIVEN** the registry file `docs/agent-guide/registry/mcp.yaml`
- **WHEN** the `clients.mcp-postgres` entry is parsed as YAML
- **THEN** it exposes a non-empty `korczewski_path` key
- **AND** that value references the `workspace-korczewski` namespace

#### Scenario: Registry metadata does not change the rendered harness configs

- **GIVEN** the added brand-scope keys sit alongside `transport`, `endpoint` and `harness`
- **WHEN** `bash scripts/mcp-sync.sh check` runs
- **THEN** it reports no drift for `.mcp.json` and `.opencode/opencode.jsonc`

### Requirement: Ticket Reads Route To The Brand-Parametrised Tool

The MCP tool guide (`.claude/skills/references/mcp-tool-guide.md`) SHALL warn that
`mcp-postgres` is brand-scoped and SHALL direct ticket reads to `ticket-mcp` with an
explicit `brand` argument, because `external_id` values are unique only per brand and a
query for another brand's id silently returns the same-named row from the bound database.

#### Scenario: Guide carries the brand-scope warning *(BATS)*

- **GIVEN** the file `.claude/skills/references/mcp-tool-guide.md`
- **WHEN** its `mcp-postgres` section is read
- **THEN** it states that the server is bound to the mentolder database only
- **AND** it names the silent-wrong-row failure mode

#### Scenario: Guide prescribes ticket-mcp with explicit brand *(BATS)*

- **GIVEN** the file `.claude/skills/references/mcp-tool-guide.md`
- **WHEN** its guidance for ticket reads is read
- **THEN** it prescribes `ticket-mcp` with an explicit `brand` argument as the path for
  ticket reads
- **AND** it references ticket `T002278` as the origin of the rule

#### Scenario: Routing table does not advertise mcp-postgres for ticket queries *(BATS)*

- **GIVEN** the agent routing table in `CLAUDE.md`
- **WHEN** the `MCP-Primär` column is read
- **THEN** no row advertises `mcp-postgres` as the path for ticket queries
