## ADDED Requirements

### Requirement: Glimmer Worker MCP for Muse Code

The repository SHALL provide an MCP server `scripts/glimmer-worker-mcp/server.mjs` that lets Muse Code use
the local Glimmer model on `:1919` as a worker. It SHALL listen with Streamable HTTP on `127.0.0.1` (default
port `13007`, env `GLIMMER_WORKER_MCP_PORT`), SHALL reject requests without the bearer token from
`GLIMMER_WORKER_MCP_TOKEN` before reading the body, and SHALL use only the Node.js standard library plus
`scripts/lib/mcp-http-security.mjs`. It SHALL expose exactly the tools `glimmer_worker_start`,
`glimmer_worker_result` and `glimmer_worker_status`. A job SHALL run `opencode run --agent glimmer-primary
--dir <cwd> <task>`; jobs SHALL run one at a time in FIFO order with a per-job timeout. `glimmer_worker_start`
SHALL return a job id without waiting for the job, and `glimmer_worker_result` SHALL wait at most 55 seconds
per call and, once the job has ended, return its status, exit code, the tail of the opencode output, and the
target repository's `git status --porcelain` and `git diff --stat`.

Rationale: Muse Code's Meta provider cannot talk to llama-server — its stream decoder rejects llama-server's
Responses events (`reason="protocol"`) and llama-server drops Muse's `namespace` tools (measured 2026-09-25,
T900373). MCP is Muse's supported extension point. The asynchronous start/result split keeps every MCP call
short because Muse's MCP client timeout is undocumented, and the single-job queue mirrors the single slot of
`:1919` (`-np 1`).

#### Scenario: Unauthenticated requests are rejected

- **GIVEN** the server runs with a token
- **WHEN** a `tools/list` request arrives without a matching `Authorization: Bearer` header
- **THEN** the response status is 401 and no tool is invoked

#### Scenario: A job runs the worker and reports the diff

- **GIVEN** the server runs with `GLIMMER_WORKER_OPENCODE` pointing to an executable that edits a file
- **WHEN** `glimmer_worker_start` is called for a Git working tree and `glimmer_worker_result` is polled
- **THEN** the job ends with status `done`, and the result names the edited file in `git_status`

#### Scenario: Jobs outside a Git working tree are refused

- **GIVEN** a `cwd` that is not inside a Git working tree
- **WHEN** `glimmer_worker_start` is called
- **THEN** the call returns `isError: true` and no job is queued

### Requirement: Windows Paths Are Accepted by the Glimmer Worker

`glimmer_worker_start` SHALL accept `cwd` in WSL form and in Windows form. It SHALL map a drive path
`X:\a\b` to `/mnt/x/a/b` and a UNC path `\\wsl.localhost\<distro>\a\b` or `\\wsl$\<distro>\a\b` to `/a/b`
before validating it.

Rationale: the Windows installation of Muse Code reaches the same server over `127.0.0.1` (WSL mirrored
networking) and reports its working directory in Windows form.

#### Scenario: Windows forms resolve to WSL paths

- **GIVEN** the path mapper of the Glimmer worker
- **WHEN** it maps `C:\Users\x\repo`, `\\wsl.localhost\k3d-dev\home\x\repo` and `/home/x/repo`
- **THEN** the results are `/mnt/c/Users/x/repo`, `/home/x/repo` and `/home/x/repo`

### Requirement: The Glimmer Worker Is Registered Only in Muse Code

`scripts/glimmer-worker-mcp/install.sh` SHALL register the server as `mcpServers.glimmer-worker`
(`type: "http"`, URL `http://127.0.0.1:13007/mcp`, bearer header) in the Muse Code settings of WSL
(`~/.config/muse/settings.json`) and of Windows (`%USERPROFILE%\.config\muse\settings.json`), preserving all
other keys and writing a backup first. The server SHALL NOT be declared in
`docs/agent-guide/registry/mcp.yaml`.

Rationale: `task mcp:sync` distributes every registry entry to opencode, where the `glimmer-primary` worker
itself runs; a registry entry would let the worker delegate to itself recursively.

#### Scenario: Registration merges into existing settings

- **GIVEN** a Muse `settings.json` that already declares `mcpServers.factory-mcp-node`
- **WHEN** the installer registers the worker against that file
- **THEN** both `factory-mcp-node` and `glimmer-worker` are declared and a backup of the previous file exists

#### Scenario: The MCP registry does not list the worker

- **GIVEN** `docs/agent-guide/registry/mcp.yaml`
- **WHEN** its server ids are read
- **THEN** `glimmer-worker` is not among them
