## MODIFIED Requirements

### Requirement: G-AGENTIC11 CLAUDE.md MCP Server List Accuracy Gate

`CLAUDE.md`'s stated list of opencode-registered MCP servers SHALL equal the actual server names
registered in `.opencode/opencode.jsonc`.

The comparison SHALL be made against the exact registry keys, not against a shortened or
historical spelling of a server. A server whose registry key carries a suffix (`brain-mcp-node`,
`factory-mcp-node`, `ticket-mcp-node`) counts as phantom when `CLAUDE.md` names it without that
suffix; the two spellings are not interchangeable for this gate. A server removed from
`docs/agent-guide/registry/mcp.yaml` SHALL also disappear from the `CLAUDE.md` list in the same
change, so a removal cannot leave the list claiming a server that no longer exists.

#### Scenario: No phantom or undocumented servers after correction

- **GIVEN** `CLAUDE.md`'s opencode MCP server sentence and the real `.opencode/opencode.jsonc` server
  keys
- **WHEN** the G-AGENTIC11 measure command diffs the two sets
- **THEN** the combined count of phantom (claimed-but-absent) and undocumented (present-but-unclaimed)
  servers is 0

#### Scenario: A suffixed registry key is not satisfied by its unsuffixed spelling

- **GIVEN** `.opencode/opencode.jsonc` registers the key `ticket-mcp-node` and `CLAUDE.md` names
  `ticket-mcp`
- **WHEN** the G-AGENTIC11 measure command diffs the two sets
- **THEN** the mismatch is counted, so the gate is red until `CLAUDE.md` uses the registry key

#### Scenario: A server removed from the registry leaves the CLAUDE.md list

- **GIVEN** a server that is no longer present in `docs/agent-guide/registry/mcp.yaml` or
  `.opencode/opencode.jsonc`
- **WHEN** the G-AGENTIC11 measure command diffs the two sets
- **THEN** it is counted as phantom until the name is removed from `CLAUDE.md`

### Requirement: G-AGENTIC13 No Dead MCP Server References In Skills Gate

Every `mcp__<server>__*` tool token referenced inside a `SKILL.md` file SHALL correspond to a server
actually registered in `.mcp.json` or `.opencode/opencode.jsonc`.

The server segment of the token SHALL match a registry key exactly. A token naming a server by an
unsuffixed spelling of a suffixed key — `mcp__factory-mcp__…` where the registry holds
`factory-mcp-node` — is a dead reference, because no such server can be resolved at runtime.

#### Scenario: No dead server references after correction

- **GIVEN** all `SKILL.md` files and the registered server names
- **WHEN** the G-AGENTIC13 measure command extracts referenced `mcp__<server>__*` tokens and checks
  each against the registered server set
- **THEN** the count of dead references is 0

#### Scenario: An unsuffixed server segment counts as dead

- **GIVEN** a `SKILL.md` referencing `mcp__factory-mcp__factory_status` while the registry holds
  `factory-mcp-node`
- **WHEN** the G-AGENTIC13 measure command checks the extracted token against the registered set
- **THEN** the reference is counted as dead until the token names `factory-mcp-node`
