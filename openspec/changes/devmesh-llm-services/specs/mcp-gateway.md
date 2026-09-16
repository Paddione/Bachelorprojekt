## MODIFIED Requirements

### Requirement: Windows hosts have a documented start mechanism for the local MCP servers
<!-- bats: mcp-gateway/start-windows-unc.bats -->

Windows hosts MUST have a committed start mechanism that establishes the port-forwards the
local MCP clients depend on: port 18080 from the fleet `dev-pod`, and ports 18235, 13001 and
13005 from the devmesh `llm-services` Service. The mechanism MUST NOT start the bge-mcp shim
locally. It MUST resolve the repository root to a plain filesystem path, so that it also works
when started from a `\\wsl.localhost\...` UNC path.

The mechanism MUST be reachable from the Taskfile or the documentation so it does not become an
orphan script.

#### Scenario: operator starts the forwards on Windows

- **GIVEN** a Windows host with working `kubectl` contexts for the fleet and devmesh clusters
- **WHEN** the operator runs the documented Windows start mechanism
- **THEN** ports 18080, 18235, 13001 and 13005 accept connections on 127.0.0.1
- **AND** an MCP `initialize` request against port 13005 is answered

#### Scenario: the mechanism starts from a UNC path

- **GIVEN** the repository is reached through `\\wsl.localhost\<distro>\...`
- **WHEN** the start or the autostart registration script resolves the repository root
- **THEN** the resolved path carries no PowerShell provider prefix
