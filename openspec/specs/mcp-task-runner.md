# mcp-task-runner


<!-- merged from change delta mcp-task-runner.md on 2026-06-21 -->
# mcp-task-runner


## Purpose

### Requirement: plan_tasks

The system SHALL provide a `plan_tasks` MCP tool that accepts a list of `{task, env}` pairs and returns an execution plan organised into parallel groups.

The plan SHALL be derived by:
- Parsing the project's `Taskfile.yml` via `task --list-all --json` to extract the dependency graph (DAG)
- Applying Kahn's topological sort to the requested tasks
- Placing tasks with no inter-dependency in the same parallel group
- Placing tasks from different brands (env) on the same level into the same parallel group

The system SHALL return `ErrCyclicDependency` if the requested tasks form a cycle.

#### Scenario: same-brand independent tasks form one group

- **GIVEN** a Taskfile where `workspace:deploy` and `workspace:validate` both have empty `deps`
- **WHEN** the caller invokes `plan_tasks` with `[{task: workspace:deploy, env: mentolder}, {task: workspace:validate, env: mentolder}]`
- **THEN** the returned plan contains exactly one group with both tasks

#### Scenario: dependent tasks are sequenced

- **GIVEN** a Taskfile where `workspace:post-setup` depends on `workspace:deploy`
- **WHEN** the caller invokes `plan_tasks` with both tasks for the same brand
- **THEN** the returned plan contains two groups, `workspace:deploy` first and `workspace:post-setup` second

#### Scenario: cyclic dependencies are rejected

- **GIVEN** a Taskfile where task A depends on B and B depends on A
- **WHEN** the caller invokes `plan_tasks` with both tasks
- **THEN** the tool returns an error referencing the cycle

## Requirements

### Requirement: run_task

The system SHALL provide a `run_task` MCP tool that executes a single go-task task and returns a structured result.

The tool SHALL:
- Invoke `task <name> ENV=<env>` via `exec.Command`
- Emit stdout and stderr line-by-line as OTel LogRecords with attributes `task.name`, `task.env`, `task.brand`, `task.exit_code`, and `stream`
- Create an OTel root span per call and a child span per task
- Return `{task, env, exit_code, stdout, stderr, trace_id}`
- Validate `task` and `env` arguments against the allow-list `A-Za-z0-9_:./-` (no `--` prefix allowed)

#### Scenario: successful task returns exit_code 0

- **GIVEN** a Taskfile task that exits 0
- **WHEN** the caller invokes `run_task` with that task name
- **THEN** the result has `exit_code = 0` and a non-empty `trace_id`

#### Scenario: argument injection is rejected

- **GIVEN** an attacker-controlled task argument
- **WHEN** the argument contains `--` or other disallowed characters
- **THEN** the tool returns an error before invoking any subprocess

### Requirement: execute_plan

The system SHALL provide an `execute_plan` MCP tool that accepts a plan object (as returned by `plan_tasks`) and executes it with fail-fast semantics.

The tool SHALL:
- Execute groups sequentially in plan order
- Within each group, run all tasks in parallel via goroutines and `sync.WaitGroup`
- If any task in a group exits non-zero, cancel subsequent groups and return immediately
- Emit a single OTel root span `execute_plan` and one child span per task
- Return the aggregated list of `Result` objects

#### Scenario: successful parallel execution

- **GIVEN** a plan with one group of two independent tasks
- **WHEN** the caller invokes `execute_plan`
- **THEN** both tasks run concurrently and the result list contains two entries

#### Scenario: failure aborts subsequent groups

- **GIVEN** a plan with two groups; group 1 contains a task that exits non-zero
- **WHEN** the caller invokes `execute_plan`
- **THEN** the result list contains only the group-1 entry; group 2 never starts

### Requirement: local WSL binary

The system SHALL ship a Go binary `mcp-task-runner` that runs as a local process on the WSL host and communicates via the stdio MCP transport.

The binary SHALL:
- Be built from the `mcp-task-runner/` module at the repo root
- Be invoked from `.mcp.json` with `command` pointing to the binary and `args` containing `--taskfile /path/to/Taskfile.yml`
- Resolve the Taskfile path via the `--taskfile` flag; reject paths containing `..`
- Fail-open on OTel Collector unavailability: log to stderr and continue

#### Scenario: binary lists three tools on tools/list

- **WHEN** an MCP client sends `tools/list`
- **THEN** the response contains `plan_tasks`, `run_task`, and `execute_plan`

#### Scenario: OTel collector down does not abort task execution

- **GIVEN** the OTel Collector at `localhost:4317` is unreachable
- **WHEN** the caller invokes `run_task`
- **THEN** the task still runs and the result is returned normally

### Requirement: OTel tracing and logging

The system SHALL instrument task execution with OpenTelemetry traces and logs.

Each task execution SHALL:
- Create a span with attributes `task.name`, `task.env`, `task.brand`, `task.exit_code`
- Emit one log record per stdout/stderr line with attribute `stream` set to `stdout` or `stderr`
- Send traces and logs via OTLP gRPC to the endpoint configured by `--otel-endpoint` (default `localhost:4317`)

#### Scenario: traces reach the collector

- **GIVEN** the OTel Collector is reachable on `localhost:4317`
- **WHEN** a task is executed
- **THEN** a span appears in Grafana Tempo with the expected attributes
