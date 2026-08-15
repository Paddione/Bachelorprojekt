## MODIFIED Requirements

### Requirement: local WSL binary

The system SHALL ship a Node.js ESM script `mcp-task-runner` (located at `scripts/mcp-task-runner/server.mjs`) that runs as a local process on the WSL host and communicates via the stdio MCP transport.

The script SHALL:
- Be executable directly with `node` or via the CLI wrapper `mcp-task-runner`
- Be invoked from `.mcp.json` with `command` pointing to `mcp-task-runner` or `node scripts/mcp-task-runner/server.mjs` and `args` containing `--taskfile /path/to/Taskfile.yml`
- Resolve the Taskfile path via the `--taskfile` flag; reject paths containing `..`
- Fail-open on OTel Collector unavailability: log to stderr and continue

#### Scenario: binary lists all seven tools on tools/list

- **WHEN** an MCP client sends `tools/list`
- **THEN** the response contains `plan_tasks`, `run_task`, `execute_plan`, `get_task_graph`, `run_task_async`, `cancel_task`, and `get_task_result`

#### Scenario: OTel collector down does not abort task execution

- **GIVEN** the OTel Collector at `localhost:4317` is unreachable
- **WHEN** the caller invokes `run_task`
- **THEN** the task still runs and the result is returned normally
