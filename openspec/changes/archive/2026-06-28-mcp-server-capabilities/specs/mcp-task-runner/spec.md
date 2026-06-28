## ADDED Requirements

### Requirement: mcp-task-runner exposes async task lifecycle tools
The `mcp-task-runner` server SHALL expose three additional tools (`run_task_async`, `cancel_task`, `get_task_result`) for asynchronous task execution alongside the existing synchronous `run_task` and `execute_plan` tools.

#### Scenario: All five tools are registered at server start
- **WHEN** the mcp-task-runner process starts
- **THEN** it registers exactly five tools: `plan_tasks`, `run_task`, `execute_plan`, `run_task_async`, `cancel_task`, `get_task_result`, `get_task_graph`

### Requirement: mcp-task-runner exposes task graph visualization tool
The `mcp-task-runner` server SHALL expose a `get_task_graph` tool that returns the parsed Taskfile dependency graph.

#### Scenario: Tool is available without configuration
- **WHEN** a caller lists available tools from mcp-task-runner
- **THEN** `get_task_graph` appears in the tool list with its format parameter documented
