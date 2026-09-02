## ADDED Requirements

### Requirement: bge-mcp shim resolves its router import as a file:// URL

The bge-mcp shim MUST convert the resolved path of `components/website/src/lib/bge-router.ts`
into a `file://` URL before passing it to the dynamic `import()`. Passing a bare absolute path
is rejected by the Node ESM loader on Windows, where an absolute path starts with a drive
letter and is parsed as an unsupported URL scheme.

The shim MUST therefore reach its authentication check on every supported host platform,
regardless of whether the repository path is POSIX-style or drive-letter-based.

#### Scenario: shim starts on a drive-letter path without a token

- **GIVEN** the repository is checked out at a path beginning with a drive letter (e.g. `C:/`)
- **AND** the environment variable `BGE_MCP_TOKEN` is unset
- **WHEN** `node scripts/bge-mcp/server.mjs` is executed
- **THEN** the output names the missing `BGE_MCP_TOKEN`
- **AND** the output does NOT contain `ERR_UNSUPPORTED_ESM_URL_SCHEME`

#### Scenario: shim starts on a POSIX path without a token

- **GIVEN** the repository is checked out at a POSIX path (e.g. `/home/patrick/Bachelorprojekt`)
- **AND** the environment variable `BGE_MCP_TOKEN` is unset
- **WHEN** `node scripts/bge-mcp/server.mjs` is executed
- **THEN** the output names the missing `BGE_MCP_TOKEN`

### Requirement: mcp-task-runner is invoked through node on hosts without the wrapper binary

The registry entry for `mcp-task-runner` MUST invoke the server through `node` with a
repo-relative path to `scripts/mcp-task-runner/server.mjs` for any harness that runs from the
repository root, rather than depending on the `/usr/local/bin/mcp-task-runner` wrapper. The
wrapper is a Bash script installed only on Linux hosts; the server itself is plain Node.js and
carries no platform dependency.

The entry MUST NOT be disabled on the grounds that the wrapper binary is absent.

#### Scenario: task runner answers a tools listing when started through node

- **GIVEN** a checkout on a host without `/usr/local/bin/mcp-task-runner`
- **WHEN** an MCP `initialize` request followed by `tools/list` is sent to
  `node scripts/mcp-task-runner/server.mjs` over stdio
- **THEN** the server identifies itself as `mcp-task-runner`
- **AND** the listed tools include `plan_tasks` and `run_task`

### Requirement: Windows hosts have a documented start mechanism for the local MCP servers

Because the systemd units under `scripts/bge-mcp/` and `scripts/mcp-gateway/` are Linux-only
and pin the bge upstreams to a WSL-local proxy address, Windows hosts MUST have an equivalent,
committed start mechanism. It MUST establish the port-forwards the local servers depend on and
MUST start the bge-mcp shim with `LLM_EMBED_URL` and `LLM_RERANKER_URL` pointing at those
forwards.

The mechanism MUST be reachable from the Taskfile or the documentation so it does not become an
orphan script.

#### Scenario: operator starts the local MCP stack on Windows

- **GIVEN** a Windows host with a working `kubectl` context for the fleet cluster
- **AND** `BGE_MCP_TOKEN` available to the start mechanism
- **WHEN** the operator runs the documented Windows start mechanism
- **THEN** the bge-mcp shim listens on its configured port
- **AND** an MCP `initialize` request against that port is answered
