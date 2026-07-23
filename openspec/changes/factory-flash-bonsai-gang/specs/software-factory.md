## ADDED Requirements

### Requirement: REQ-SF-AUTOTICK-001 — Stage löst automatisch einen Factory-Tick aus

Beim Stagen eines Plans (`stage-plan`, nach dem `plan_staged`-Status-UPDATE) SHALL das
System idempotent das Steuer-Flag `force-tick-requested` (Tabelle
`tickets.factory_control`, `brand IS NULL`, `set_by='stage-plan'`) schreiben und
best-effort `factory.service` starten. Ein Fehlschlag des Flag-Schreibens SHALL das
Stagen NICHT fehlschlagen lassen (Degradation auf den `factory.timer`-Pfad, Warnung auf
stderr). Dieses Requirement supersedet T002102-p3 Task 1/4/5.

#### Scenario: Staging a plan wakes the factory without waiting for the timer

- **GIVEN** a ticket with a committed plan and a pushed feature branch
- **WHEN** `stage-plan --id T… --branch … --plan … --partials N` completes successfully
- **THEN** `tickets.factory_control` contains `key='force-tick-requested'` with `brand IS NULL`
- **AND** the existing consumer (`wakeup.sh`) picks up the flag on its next start and ticks immediately

#### Scenario: Flag write failure degrades gracefully

- **GIVEN** the tickets database is unreachable for the control-flag insert
- **WHEN** `stage-plan` runs
- **THEN** the plan is still staged (exit 0) and a warning is printed to stderr

### Requirement: REQ-SF-EXECUTOR-001 — Umschaltbarer Factory-Executor

`dispatcher-bridge.sh` SHALL pro Ticket-Launch anhand der Env-Variable
`FACTORY_EXECUTOR` (`claude` = Default, `opencode`) den Executor wählen. Der
`opencode`-Zweig SHALL `scripts/factory/opencode-exec.sh` im vorbereiteten
Launch-Worktree aufrufen; der `claude`-Zweig SHALL byte-identisch zum heutigen
Verhalten bleiben. Ein unbekannter Wert SHALL auf `claude` zurückfallen (Warnung).

#### Scenario: Opt-in opencode executor is used when requested

- **GIVEN** `FACTORY_EXECUTOR=opencode` in the factory environment
- **WHEN** `dispatcher-bridge.sh` launches a ticket
- **THEN** `opencode-exec.sh` is invoked in the launch worktree instead of `claude -p`

#### Scenario: Default behavior unchanged

- **GIVEN** `FACTORY_EXECUTOR` is unset
- **WHEN** `dispatcher-bridge.sh` launches a ticket
- **THEN** the existing `claude -p` spawn (flags unchanged) is used

### Requirement: REQ-SF-EXECUTOR-002 — Orchestrator-Dispatch mit Gang-Telemetrie

`opencode-exec.sh` SHALL `opencode run --agent orchestrator` mit einem Prompt aufrufen,
der Ticket-ID, Branch, Worktree-Pfad, Plan-Pfad, das `## Partials`-Manifest und die
Trial-Guardrails (kein Auto-Merge, `pr-ready`-Gate) enthält. Pro Lauf SHALL das Skript
Phase-Events schreiben (`phase=implement`, `state=entered|done|blocked` — KEINE neuen
State-Werte, vgl. T002130) mit strukturiertem `detail`-JSON
(`executor`, `subagent`, `partial`, `duration_s`, `exit`). Bei Exit ≠ 0 SHALL ein
`blocked`-Event geschrieben werden und KEIN stiller Fallback auf `claude -p` erfolgen.

#### Scenario: Successful gang run leaves per-subagent telemetry

- **GIVEN** a staged multi-partial plan and `FACTORY_EXECUTOR=opencode`
- **WHEN** the orchestrator completes all partials via bonsai-8b subagents
- **THEN** `tickets.factory_phase_events` contains `implement`/`done` events whose `detail` JSON names executor, subagent, and partial

#### Scenario: Orchestrator failure is visible, not silently retried

- **GIVEN** `opencode run` exits non-zero
- **WHEN** `opencode-exec.sh` finishes
- **THEN** an `implement`/`blocked` event with the exit code in `detail` exists and no `claude -p` fallback was spawned

### Requirement: REQ-SF-OPENCODE-CANON-001 — Gang-Konfiguration ist Repo-Kanon

Die Agenten `orchestrator`, `bonsai-8b-1..4`, `deepseek-helper` und der
Orchestrator-Prompt SHALL in `.opencode/agent-models.jsonc` bzw.
`.opencode/prompts/orchestrator.md` versioniert sein, sodass
`scripts/opencode-sync-agents.sh` sie in die globale Config verteilt. Die
Bonsai-Modell-ID SHALL `Ternary-Bonsai-8B-Q2_0.gguf` sein (TQ2_0 hat keine
CUDA-Kernel — stiller CPU-Fallback, T002111). Doku-Aussagen zur Parallelität
(`AGENTS.md`, jsonc-Kommentare) SHALL den Ist-Zustand beschreiben
(Server `-np 1`, physische Parallelität via `max_inflight` konfigurierbar).

#### Scenario: Agent sync propagates instead of destroying the gang config

- **GIVEN** the repo canon contains orchestrator + 4 bonsai subagents
- **WHEN** `scripts/opencode-sync-agents.sh` runs
- **THEN** the global opencode config contains the same agent set afterwards
