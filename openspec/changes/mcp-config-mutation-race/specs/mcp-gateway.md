## ADDED Requirements

### Requirement: Spec Tests Never Mutate Tracked MCP Config Artifacts
<!-- bats: authenticated-http-headers.bats, spec-tracked-file-guard-isolation.bats -->

The system SHALL run every spec test that exercises `mcp-sync.sh render` for
generic/probe fixtures entirely against a sandbox output directory
(`MCP_OUT_DIR`) without reading from or writing to the real, git-tracked
targets `.mcp.json`, `.opencode/opencode.jsonc`, or `scripts/llm/mcp-servers.json`.

#### Scenario: Generic-header-passthrough test never touches real tracked config mtimes *(BATS)*

- **GIVEN** `tests/spec/mcp-gateway/authenticated-http-headers.bats` runs its
  "renderers pass headers through for any http client" test in isolation
- **WHEN** the mtimes of `.mcp.json`, `.opencode/opencode.jsonc` and
  `scripts/llm/mcp-servers.json` are stamped before and after the test
- **THEN** all three mtimes are unchanged, because the test renders exclusively
  into a `MCP_OUT_DIR` tmpdir and never copies to or restores the real repo
  paths

### Requirement: Tracked-File Mutation Guard Is Immune To Concurrent Legitimate Spec Runs
<!-- bats: spec-tracked-file-guard-isolation.bats -->

The system SHALL measure whether `mcp-tooling.bats` mutates tracked MCP
config artifacts by running it against an isolated sandbox copy of the
repository, not by reading the mtimes of the real, git-tracked working tree
paths — so that any other spec file touching those same real paths while
running in parallel (`bats -j`) cannot cause a false positive attributed to
`mcp-tooling.bats`.

#### Scenario: Guard assertion stays green under concurrent real-file touches *(BATS)*

- **GIVEN** a background process repeatedly touches the real, tracked
  `docs/agent-guide/registry/mcp.yaml` while `spec-tracked-file-guard.bats`'s
  T002779 assertion for `mcp-tooling.bats` runs
- **WHEN** that assertion completes
- **THEN** it still passes, because its measurement is scoped to a sandboxed
  copy of the repository and is not affected by mtime changes to the real
  working tree made by processes outside its own sandboxed run

### Requirement: MCP Sync Drift Diagnostics Never Leak Expanded Secrets
<!-- bats: mcp-sync-drift-no-secret-leak.bats -->

The system SHALL redact expanded secret values (e.g. `Authorization` bearer
tokens) from the diff output that `mcp-sync.sh check` prints when it detects
drift against `mcp_config.json`, so that a CI run of the drift branch never
prints a usable credential into a public Actions log.

#### Scenario: Drift diff for mcp_config.json redacts bearer tokens *(BATS)*

- **GIVEN** `mcp-sync.sh check` detects drift against a fixture
  `mcp_config.json` whose `Authorization` header contains an expanded bearer
  token
- **WHEN** the drift diff is printed to stdout/stderr
- **THEN** the literal token value does not appear in the output; a redaction
  placeholder appears in its place
