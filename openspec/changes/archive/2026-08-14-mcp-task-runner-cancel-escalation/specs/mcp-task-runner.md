# mcp-task-runner — Delta (T005592)

## MODIFIED Requirements

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
