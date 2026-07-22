## ADDED Requirements

### Requirement: Session reuse in factory pipeline
run-pipeline.mjs MUST reuse Claude Code sessions across pipeline phases using `--resume <session-id>` instead of spawning fresh processes.

#### Scenario: Session reused across phases
- GIVEN a ticket progressing through pipeline phases
- WHEN a new phase starts
- THEN the pipeline resumes the existing session
- AND the ~26s prefill cost is eliminated

### Requirement: Graceful fallback on session loss
The pipeline MUST fall back to a fresh `claude -p` dispatch when a session cannot be resumed.

#### Scenario: Session timeout triggers fallback
- GIVEN a ticket with an expired/lost session
- WHEN the pipeline tries to resume
- THEN it detects the failure
- AND falls back to a fresh spawn
- AND the pipeline continues without interruption

### Requirement: Timeout handling with session reuse
Phase timeouts MUST work correctly with session reuse — hanging resumed sessions should be killed and retried.
