# mcp-task-runner

<!-- merged from change delta mcp-task-runner.md on 2026-06-21 -->

## Purpose

### Requirement: plan_tasks

The system SHALL provide a `plan_tasks` MCP tool that accepts a list of `{task, env}` pairs and returns an execution plan organised into parallel groups.

The plan SHALL be derived by:
- Listing the project's tasks via `task --list-all --json` to obtain the task universe (task names and their source-file locations)
- Extracting the dependency edges (DAG) from the Taskfile YAML sources, resolving `includes:` namespaces declared in the root Taskfile
- Applying Kahn's topological sort to the requested tasks
- Placing tasks with no inter-dependency in the same parallel group
- Placing tasks from different brands (env) on the same level into the same parallel group

The system SHALL return `ErrCyclicDependency` if the requested tasks form a cycle.

The system SHALL fail with an error naming the unreadable or unparseable source file rather than silently returning an edge-less graph.

#### Scenario: same-brand independent tasks form one group

- **GIVEN** a Taskfile where `task-a` and `task-b` both have empty `deps`
- **WHEN** the caller invokes `plan_tasks` with `[{task: task-a, env: mentolder}, {task: task-b, env: mentolder}]`
- **THEN** the returned plan contains exactly one group with both tasks

#### Scenario: dependent tasks are sequenced

- **GIVEN** a Taskfile where `task-b` depends on `task-a`
- **WHEN** the caller invokes `plan_tasks` with both tasks for the same brand
- **THEN** the returned plan contains two groups, `task-a` first and `task-b` second

#### Scenario: cyclic dependencies are rejected

- **GIVEN** a Taskfile where task A depends on B and B depends on A
- **WHEN** the caller invokes `plan_tasks` with both tasks
- **THEN** the tool returns an error referencing the cycle

#### Scenario: dependency edges declared in include-namespaced taskfiles are honoured

- **GIVEN** a root Taskfile that includes a taskfile under the namespace `assets`, and a task `website:build` whose `deps` reference `assets:sync`
- **WHEN** the caller invokes `plan_tasks` with `website:build` and `assets:sync` for the same brand
- **THEN** the returned plan contains two groups, `assets:sync` first and `website:build` second

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

### Requirement: get_task_graph

The system SHALL provide a `get_task_graph` MCP tool that returns the full task dependency DAG parsed from the project's Taskfile.

The tool SHALL:
- Accept an optional `format` argument restricted to the values `mermaid` (default) and `json`
- Return the DAG as a Mermaid `graph TD` document when `format` is `mermaid` or omitted
- Return the DAG as JSON when `format` is `json`
- Return an error referencing the parse failure when the Taskfile cannot be parsed

#### Scenario: default output format is Mermaid

- **GIVEN** a parseable Taskfile
- **WHEN** the caller invokes `get_task_graph` without a `format` argument
- **THEN** the result is a Mermaid graph document

#### Scenario: JSON output format

- **GIVEN** a parseable Taskfile
- **WHEN** the caller invokes `get_task_graph` with `format: json`
- **THEN** the result is valid JSON describing the tasks and their dependencies

### Requirement: run_task_async

The system SHALL provide a `run_task_async` MCP tool that starts a task in the background and returns a job identifier immediately.

The tool SHALL:
- Accept a required `task` argument and an optional `env` argument
- Validate both against the allow-list `A-Za-z0-9_:./-` (no `--` prefix allowed)
- Run the task in a new goroutine via the same execution path as `run_task` and record the result in the global job registry
- Return `{job_id, status: "running"}` without waiting for completion

#### Scenario: async start returns immediately

- **GIVEN** a long-running Taskfile task
- **WHEN** the caller invokes `run_task_async` with that task name
- **THEN** the result contains a non-empty `job_id` and `status` `running`, and the tool returns before the task finishes

#### Scenario: async arguments are validated

- **GIVEN** an attacker-controlled task argument containing `--`
- **WHEN** the caller invokes `run_task_async` with that argument
- **THEN** the tool returns an error before starting any subprocess

### Requirement: cancel_task

The system SHALL provide a `cancel_task` MCP tool that cancels a running asynchronous job by its `job_id`.

The tool SHALL:
- Send `SIGTERM` to the task process group of a running job
- Escalate to `SIGKILL` against the same process group when the task has not exited within 5 seconds after `SIGTERM`, so that child processes of the task are terminated as well
- Return `{cancelled: true, job_id}` when the job was running and cancellation was requested
- Return `{cancelled: false, job_id, reason: "already done"}` when the job has already finished or been cancelled
- Return a job-not-found error for unknown `job_id` values

#### Scenario: task ignoring SIGTERM is killed after the escalation window

- **GIVEN** a running async job whose task process ignores `SIGTERM` and keeps child processes running
- **WHEN** the caller invokes `cancel_task` with that job's id
- **THEN** the task process group receives `SIGTERM` and is killed with `SIGKILL` within approximately 5 seconds, and the underlying `run_task` execution returns instead of hanging until the children exit

#### Scenario: cancelling an unknown job reports not found

- **GIVEN** a `job_id` that was never registered
- **WHEN** the caller invokes `cancel_task` with that id
- **THEN** the tool returns an error indicating the job was not found

#### Scenario: cancelling a finished job reports already done

- **GIVEN** a job that has already completed
- **WHEN** the caller invokes `cancel_task` with that job's id
- **THEN** the result has `cancelled: false` and `reason: "already done"`

### Requirement: get_task_result

The system SHALL provide a `get_task_result` MCP tool that returns the current status and, once finished, the result of an asynchronous job.

The tool SHALL:
- Return `{status, job_id}` where `status` is `running` while the job is in progress and `done` or `cancelled` once finished
- Include `exit_code` and the combined `output` once the job has finished
- Return a job-not-found error for unknown `job_id` values

#### Scenario: polling a running job reports running

- **GIVEN** an async job that has not yet finished
- **WHEN** the caller invokes `get_task_result` with that job's id
- **THEN** the result has `status: "running"` and no `exit_code`

#### Scenario: polling a finished job reports the result

- **GIVEN** an async job that has finished
- **WHEN** the caller invokes `get_task_result` with that job's id
- **THEN** the result has `status: "done"` and contains `exit_code` and `output`

### Requirement: local WSL binary

The system SHALL ship a Go binary `mcp-task-runner` that runs as a local process on the WSL host and communicates via the stdio MCP transport.

The binary SHALL:
- Be built from the `mcp-task-runner/` module at the repo root
- Be invoked from `.mcp.json` with `command` pointing to the binary and `args` containing `--taskfile /path/to/Taskfile.yml`
- Resolve the Taskfile path via the `--taskfile` flag; reject paths containing `..`
- Fail-open on OTel Collector unavailability: log to stderr and continue

#### Scenario: binary lists all seven tools on tools/list

- **WHEN** an MCP client sends `tools/list`
- **THEN** the response contains `plan_tasks`, `run_task`, `execute_plan`, `get_task_graph`, `run_task_async`, `cancel_task`, and `get_task_result`

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

The instrumentation SHALL apply to every execution path, including asynchronous jobs started via `run_task_async`.

#### Scenario: traces reach the collector

- **GIVEN** the OTel Collector is reachable on `localhost:4317`
- **WHEN** a task is executed
- **THEN** a span appears in Grafana Tempo with the expected attributes

<!-- merged from change delta mcp-task-runner.md (bcd02a43b942) -->

<!-- merged from change delta mcp-task-runner.md (23c31fa05de6) -->