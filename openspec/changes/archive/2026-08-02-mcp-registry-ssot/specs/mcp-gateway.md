## ADDED Requirements

### Requirement: MCP client registration must be generated from a single registry

`docs/agent-guide/registry/mcp.yaml` is the single source of truth for which MCP servers each
harness registers. It MUST declare two top-level keys:

- `clients` — the servers a harness registers, each with a transport (`http` or `stdio`), the
  endpoint or command, and a per-harness enabled flag for `claude_code`, `agy` and `opencode`.
- `cluster` — the in-cluster deployment that backs the HTTP endpoints, its containers and ports,
  and the port-forward bridge that exposes them on localhost.

Only `clients` is rendered. `cluster` is documentation: it records that `localhost:18080` and
`localhost:13001` are not local processes but a `kubectl port-forward` onto
`svc/claude-code-mcp-monolith`, so that `scripts/mcp-gateway/` is not mistaken for an unused
artifact and removed.

`scripts/mcp-sync.sh render` MUST write `.mcp.json`, the `mcp` block of
`.opencode/opencode.jsonc`, and `~/.gemini/config/mcp_config.json` from `clients`, translating
into each harness's own shape: `"type": "http"` for Claude Code, `"serverUrl"` for agy, and
`"type": "remote"` / `"type": "local"` with a `command` array for opencode.

Rendering `.opencode/opencode.jsonc` MUST replace only the `mcp` block and leave the rest of the
file byte-identical. The file is JSONC and its comments carry the reasons individual servers are
disabled; a JSON round-trip would discard them.

#### Scenario: a server is added to the registry

- **GIVEN** a new entry under `clients` enabled for all three harnesses
- **WHEN** `scripts/mcp-sync.sh render` runs
- **THEN** all three configuration files gain the server in their own format, and no other part
  of any file changes

#### Scenario: a server is disabled for one harness only

- **GIVEN** an entry whose `opencode` flag is false and whose `claude_code` and `agy` flags are
  true
- **WHEN** `render` runs
- **THEN** `.opencode/opencode.jsonc` carries it with `"enabled": false` while the other two
  files register it normally

#### Scenario: rendering preserves opencode.jsonc comments

- **GIVEN** `.opencode/opencode.jsonc` contains comments explaining why `github-mcp` and
  `playwright` are disabled
- **WHEN** `render` rewrites the `mcp` block
- **THEN** those comments survive unchanged

### Requirement: MCP configuration drift must fail closed for repository-tracked files

`scripts/mcp-sync.sh check` MUST compare each rendered target against its current content and
exit non-zero on any difference.

For `.mcp.json` and `.opencode/opencode.jsonc` this check is unconditional. For
`~/.gemini/config/mcp_config.json` — which lives outside the repository in the user's home
directory and cannot exist in CI — the check MUST run when the file is present and MUST be
skipped with an explicit message when it is absent. It MUST NOT silently pass over a missing
file, because a green exit that skipped a target reads as proof that the target matched.

The check MUST be asserted from `tests/spec/mcp-gateway.bats`, which already covers `.mcp.json`
server registration, rather than from a new test file.

#### Scenario: a tracked config is edited by hand

- **GIVEN** `.mcp.json` is edited without updating `mcp.yaml`
- **WHEN** `check` runs
- **THEN** it exits non-zero and names the differing file

#### Scenario: the agy config is absent, as in CI

- **GIVEN** `~/.gemini/config/mcp_config.json` does not exist
- **WHEN** `check` runs
- **THEN** the two repository-tracked files are still verified, the agy target is reported as
  skipped, and the exit code reflects only the tracked files

#### Scenario: the agy config is present and has drifted

- **GIVEN** `~/.gemini/config/mcp_config.json` exists and differs from the rendered output
- **WHEN** `check` runs
- **THEN** it exits non-zero and names that file

### Requirement: The registry must record known defects of the cluster layer rather than repair them

The `cluster` section MUST record, for each container of the monolith, whether it is functional,
and reference the ticket for any that is not. Two are known at the time of writing: the
`keycloak` container targets a service that no longer exists because Pocket ID replaced Keycloak
(T002311), and the SSOT description of this component claims the monolith was decommissioned
while it is running (T002312).

Repairing either requires changing a production manifest and is out of scope for a change whose
subject is configuration generation.

#### Scenario: a container is known to be broken

- **GIVEN** the `keycloak` container cannot satisfy its readiness probe
- **WHEN** the registry is written
- **THEN** its entry is marked as defective and carries the ticket reference, and the container
  is left in the deployment
