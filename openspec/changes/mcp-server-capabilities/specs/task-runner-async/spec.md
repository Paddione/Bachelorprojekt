## ADDED Requirements

### Requirement: Async task execution returns a job ID immediately
The system SHALL provide a `run_task_async` tool that starts a task in the background and returns a `job_id` string immediately, without blocking until task completion.

#### Scenario: Async task start succeeds
- **WHEN** a caller invokes `run_task_async` with a valid task name
- **THEN** the tool returns `{"job_id": "<uuid>", "status": "running"}` within 100ms

#### Scenario: Async task start with invalid task name
- **WHEN** a caller invokes `run_task_async` with a task name that does not exist in the Taskfile
- **THEN** the tool returns an error result with a descriptive message and no job_id

### Requirement: Running tasks can be cancelled by job ID
The system SHALL provide a `cancel_task` tool that sends SIGTERM to the process group of a running task identified by `job_id`, waits up to 5 seconds, then sends SIGKILL if the process has not exited.

#### Scenario: Cancel a running task
- **WHEN** a caller invokes `cancel_task` with a valid `job_id` of a running task
- **THEN** the tool returns `{"cancelled": true, "job_id": "<uuid>"}` and the task process is terminated

#### Scenario: Cancel an already-completed task
- **WHEN** a caller invokes `cancel_task` with a `job_id` of a task that has already finished
- **THEN** the tool returns `{"cancelled": false, "job_id": "<uuid>", "reason": "already done"}` without error

#### Scenario: Cancel with unknown job ID
- **WHEN** a caller invokes `cancel_task` with a `job_id` that does not exist in the registry
- **THEN** the tool returns an error result indicating the job was not found

### Requirement: Task result can be polled by job ID
The system SHALL provide a `get_task_result` tool that returns the current status and, once complete, the exit code and output of an async task.

#### Scenario: Poll a still-running task
- **WHEN** a caller invokes `get_task_result` with a `job_id` of a running task
- **THEN** the tool returns `{"status": "running", "job_id": "<uuid>"}`

#### Scenario: Poll a completed task
- **WHEN** a caller invokes `get_task_result` with a `job_id` of a finished task
- **THEN** the tool returns `{"status": "done", "exit_code": 0, "output": "<stdout+stderr>", "job_id": "<uuid>"}`

#### Scenario: Poll a cancelled task
- **WHEN** a caller invokes `get_task_result` with a `job_id` of a cancelled task
- **THEN** the tool returns `{"status": "cancelled", "job_id": "<uuid>"}`

### Requirement: Existing run_task tool is unaffected
The synchronous `run_task` tool SHALL continue to work identically to before — blocking until completion and returning output directly.

#### Scenario: Existing sync tool still works
- **WHEN** a caller invokes `run_task` with a valid task name
- **THEN** the tool blocks and returns the task output as before, with no behavioral change
