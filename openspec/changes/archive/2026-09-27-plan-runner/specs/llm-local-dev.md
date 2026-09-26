## ADDED Requirements

### Requirement: Plan Runner Executes OpenSpec Partials With Local Models

The repository SHALL provide `scripts/llm/plan-runner.mjs`, which executes the partials of an OpenSpec
change (`## Partials` table in `tasks.md` plus `tasks.d/pX-*.md`) using the orchestrator model on `:1919`
and Qwen3.5-4B workers on `:1920`. It SHALL use only the Node.js standard library. It SHALL respect each
partial's `depends_on` column and SHALL persist progress atomically in
`openspec/changes/<slug>/.plan-runner/state.json`, so that a restart resumes open partials and resets
partials left `running` to `open`. Workers SHALL run as `opencode run --agent <agent> --dir <worktree>` with
the primary agents `plan-worker-4b` (`:1920`) and `plan-worker-self` (`:1919`), because `opencode run` silently
replaces a subagent with the default agent;
the binary SHALL be overridable via `PLAN_RUNNER_OPENCODE` and the orchestrator endpoint via
`PLAN_RUNNER_ORCH_URL`. A worker run SHALL count as successful only if its output ends with
`PLAN-RUNNER-RESULT: success`.

#### Scenario: Partials run in dependency order

- **GIVEN** a change whose manifest declares `p2` with `depends_on` `p1`
- **WHEN** the plan runner starts with both partials open
- **THEN** `p2` is not dispatched before `p1` is marked `done`

#### Scenario: Progress survives a restart

- **GIVEN** a state file with `p1` `done` and `p2` `running`
- **WHEN** the plan runner starts again
- **THEN** `p1` stays `done`, `p2` is reset to `open`, and `p1` is not dispatched again

### Requirement: Orchestrator Self-Execution When All Workers Are Busy

The orchestrator SHALL be able to execute a partial itself through the tool `execute_self`, which the
plan runner SHALL accept only when no 4B worker slot is free. Before starting the self-run the plan runner
SHALL save the orchestrator's plan notes to the state file. The self-run SHALL be an
`opencode run --agent plan-worker-self` process whose prompt contains all tasks of the partial, and the orchestrator
loop SHALL block until it returns success or failure. While the orchestrator is blocked, the plan runner
SHALL assign every free 4B slot to the next ready partial and SHALL deliver those results to the
orchestrator when it resumes. The orchestrator's server SHALL run with `--cache-ram` so that its context
is restored from host RAM after the self-run.

Rationale: measured 2026-09-26 on Qwen3.8-27B GSQ-RCO IQ2_S-mtp, a displaced 51k-token orchestrator slot
returned in 2.9 s with `--cache-ram` (26 tokens re-prefilled) versus 48 s cold; explicit slot
save/restore re-prefilled the whole context on this hybrid model.

#### Scenario: Self-execution is refused while a worker slot is free

- **GIVEN** one free 4B slot
- **WHEN** the orchestrator calls `execute_self`
- **THEN** the tool returns an error that tells it to use `dispatch_4b`, and no self-run starts

#### Scenario: Workers keep running while the orchestrator sleeps

- **GIVEN** all 4B slots busy, a second ready partial, and a self-run in progress
- **WHEN** a 4B slot becomes free before the self-run returns
- **THEN** the plan runner dispatches the ready partial to that slot, and its result is delivered to the
  orchestrator after the self-run returns
