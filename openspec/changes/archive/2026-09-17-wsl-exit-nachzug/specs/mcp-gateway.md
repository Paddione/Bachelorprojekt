## MODIFIED Requirements

### Requirement: Windows hosts have a documented start mechanism for the local MCP servers

The Dev-Host is a Windows host. The committed Windows start mechanism SHALL therefore be the
regular path for starting the local MCP servers, and the systemd units under
`scripts/bge-mcp/` and `scripts/mcp-gateway/` SHALL be treated as the Linux-host special case —
not the other way round. Those units are Linux-only and pin the bge upstreams to a WSL-local
proxy address; with WSL2 shut down they have no runtime on the Dev-Host and MUST NOT be cited as
the way the local MCP stack is started.

The Windows mechanism SHALL be committed to the repository
(`scripts/mcp-gateway/start-windows.ps1` for starting, `scripts/mcp-gateway/register-autostart.ps1`
for logon autostart). It MUST establish the port-forwards the local servers depend on and MUST
start the bge-mcp shim with `LLM_EMBED_URL` and `LLM_RERANKER_URL` pointing at those forwards.

The mechanism MUST be reachable from the Taskfile or the documentation so it does not become an
orphan script; it is exposed as `task mcp:start-windows`, `task mcp:autostart:register` and
`task mcp:autostart:unregister`.

The systemd units SHALL be retained only as the Linux-host equivalent and SHALL carry a pointer
to their Windows counterpart, so a reader of a unit file finds the path that is actually in use.

#### Scenario: operator starts the local MCP stack on Windows

- **GIVEN** a Windows host with a working `kubectl` context for the fleet cluster
- **AND** `BGE_MCP_TOKEN` available to the start mechanism
- **WHEN** the operator runs `task mcp:start-windows`
- **THEN** the bge-mcp shim listens on its configured port
- **AND** an MCP `initialize` request against that port is answered

#### Scenario: the stack comes back after a logon without manual steps

- **GIVEN** the autostart task has been registered via `task mcp:autostart:register`
- **WHEN** the operator logs on to the Dev-Host
- **THEN** the same start mechanism runs unattended, so the local MCP servers are available
  without a systemd user instance

#### Scenario: the systemd units are not the documented start path

- **GIVEN** the Dev-Host runs Windows with WSL2 shut down
- **WHEN** an operator or agent looks up how the local MCP servers are started
- **THEN** the answer is the Windows mechanism, and the Linux units under `scripts/bge-mcp/` and
  `scripts/mcp-gateway/` are identified as the Linux-host equivalent with no runtime here
