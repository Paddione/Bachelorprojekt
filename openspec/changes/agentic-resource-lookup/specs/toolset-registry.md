# Spec Delta: toolset-registry

## ADDED Requirements

### Requirement: Local sources are consulted before remote ones

The lookup SHALL evaluate its sources in a fixed order: first
`docs/agent-guide/registry/capabilities.yaml`, then the marketplaces registered in
`~/.claude/plugins/known_marketplaces.json`, and last the official MCP registry at
`https://registry.modelcontextprotocol.io/v0/servers`. Where a candidate appears in more than one
source, the local curation state SHALL win.

Rationale: the most valuable answer to "is there anything for X?" is "we evaluated that and
rejected it, because …". That answer is held locally and costs no network access. A registry
search that runs before the local reconciliation produces candidates the project has long since
judged.

#### Scenario: A candidate is already curated

- **GIVEN** `capabilities.yaml` lists `mcp:com.pulsemcp/playwright-stealth` with `state: suppressed`
- **WHEN** `find "browser automation"` runs and the registry returns that same server
- **THEN** the hit is shown with its `suppressed` state and stored `reason`, not as a new candidate

#### Scenario: The registry is unreachable

- **GIVEN** `registry.modelcontextprotocol.io` does not respond within 10 seconds
- **WHEN** `find` runs
- **THEN** the command returns the local hits, names the failed source on stderr, and exits 0

### Requirement: inspect returns schemas rather than prose where possible

For a server carrying at least one `remotes[]` entry, `inspect` SHALL perform an MCP
`initialize` + `tools/list` sequence against `remotes[].url` and print the returned tool names
with their parameters. Only when no `remotes[]` entry exists, or the sequence fails, SHALL it fall
back to the `README` of the `repository` field.

The output SHALL label which source was used (`schema` versus `readme`).

Rationale: a `tools/list` describes what the server ships right now; a README describes what
somebody once wrote down. That difference matters for an adoption decision and must not disappear
in the presentation.

#### Scenario: Server with a reachable remote

- **GIVEN** a registry entry whose `remotes[0].type` is `streamable-http`
- **WHEN** `inspect <name>` runs and the remote responds
- **THEN** the output contains the tool names from `tools/list` and the label `schema`

#### Scenario: Server without a remote

- **GIVEN** a registry entry that carries only `packages[]` (npm or OCI)
- **WHEN** `inspect <name>` runs
- **THEN** the output contains the README excerpt, the label `readme`, and the acquisition path

#### Scenario: Remote responds but demands credentials

- **GIVEN** the remote answers `initialize` with an authentication error
- **WHEN** `inspect <name>` runs
- **THEN** the command falls back to `readme` and notes that the server requires credentials

### Requirement: Only decisions are persisted, never lookups

The lookup SHALL NOT write registry responses, READMEs or tool schemas to disk. The `record` verb
SHALL write exactly one entry into `capabilities.yaml` and then run
`node scripts/toolset/check.mjs`.

Rationale: a cache solves speed, not knowledge loss, and creates an invalidation duty. What
outlives a session is the judgement alone. The schema for it already exists and is not duplicated.

#### Scenario: record writes a suppressed entry

- **GIVEN** a server that was evaluated and rejected
- **WHEN** `record <name> --capability <cap> --state suppressed --reason "<text>"` runs
- **THEN** `capabilities.yaml` contains an entry with `state: suppressed` and that `reason`, and
  `node scripts/toolset/check.mjs` exits 0

#### Scenario: record without a reason on a non-canonical state

- **GIVEN** `--state suppressed` is passed without `--reason`
- **WHEN** `record` runs
- **THEN** the command exits 1 before touching the file
