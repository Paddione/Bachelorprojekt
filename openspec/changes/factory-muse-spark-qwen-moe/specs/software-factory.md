## MODIFIED Requirements

### Requirement: REQ-SF-EXECUTOR-001 — Umschaltbarer Factory-Executor

`dispatcher-bridge.sh` SHALL pro Ticket-Launch anhand der Env-Variable
`FACTORY_EXECUTOR` (`opencode` = Default, `claude`, `dsh` = Passthrough an
dsh-harness-integration) den Executor wählen. Der
`opencode`-Zweig SHALL `scripts/factory/opencode-exec.sh` im vorbereiteten
Launch-Worktree aufrufen; der `claude`-Zweig SHALL byte-identisch zum
pre-T002128-Verhalten bleiben. Ein unbekannter Wert SHALL auf `opencode`
zurückfallen (Warnung, fail-closed auf den neuen Default statt still zurück
auf den Legacy-Executor). Der `dsh`-Zweig (dsh-harness-integration) SHALL
unverändert bleiben.

#### Scenario: Opencode executor is used by default

- **GIVEN** `FACTORY_EXECUTOR` is unset
- **WHEN** `dispatcher-bridge.sh` launches a ticket
- **THEN** `opencode-exec.sh` is invoked in the launch worktree instead of `claude -p`

#### Scenario: Claude executor is used when explicitly requested

- **GIVEN** `FACTORY_EXECUTOR=claude` in the factory environment
- **WHEN** `dispatcher-bridge.sh` launches a ticket
- **THEN** the existing `claude -p` spawn (flags unchanged) is used

#### Scenario: Unknown executor falls back to opencode (fail-closed)

- **GIVEN** `FACTORY_EXECUTOR=nonsense` in the factory environment
- **WHEN** the executor branch of `dispatcher-bridge.sh` is evaluated
- **THEN** a warning names the unknown value and the `opencode` branch is used

## ADDED Requirements

### Requirement: REQ-SF-EXECUTOR-003 — FACTORY_MODE local|api|mixed

`dispatcher-bridge.sh` SHALL die Env-Variable `FACTORY_MODE`
(`local|api|mixed`, Default `mixed`) auswerten und an `opencode-exec.sh`
durchreichen. `local` SHALL Cloud-Eskalation im Orchestrator-Prompt
deaktivieren (nur `local`-Subagent). `api` SHALL Eskalation an `planner-muse`
bereits beim ersten Stall erlauben (kein zweimal-lokal-warten). `mixed` SHALL
das bisherige Verhalten fahren (zweimal lokal, dann Eskalationskette). Ein
unbekannter Wert SHALL auf `mixed` zurückfallen (Warnung).

#### Scenario: Local mode disables cloud escalation

- **GIVEN** `FACTORY_MODE=local` and `FACTORY_EXECUTOR=opencode`
- **WHEN** `opencode-exec.sh` builds the orchestrator prompt
- **THEN** the prompt names only the `local` subagent and forbids cloud escalation

#### Scenario: API mode escalates to planner-muse on first stall

- **GIVEN** `FACTORY_MODE=api` and `FACTORY_EXECUTOR=opencode`
- **WHEN** the local subagent stalls once
- **THEN** the orchestrator escalates that partial to `planner-muse` instead of retrying locally

#### Scenario: Unknown mode falls back to mixed

- **GIVEN** `FACTORY_MODE=nonsense`
- **WHEN** the mode branch is evaluated
- **THEN** a warning names the unknown value and `mixed` behavior is used

### Requirement: REQ-SF-EXECUTOR-004 — Muse Spark 1.3 planning with Go fallback

`.opencode/agent-models.jsonc` SHALL `muse-spark-1.3-contributor-free`
(OpenCode Zen, 1M ctx) und `muse-spark-1.3-contributor` (OpenCode Go, 1M ctx)
führen. Der `orchestrator`-Agent SHALL das Zen-Free-Modell als Primary nutzen.
Der Subagent `planner-muse` SHALL das Go-Modell nutzen und in der
Allow-Liste von `orchestrator`, `big-pickle` und `qwen38-primary` stehen
(exakte Namen, keine Wildcards). Die Eskalationskette SHALL lauten: `local`
(2 Versuche) → `planner-muse` → `deepseek-helper-go` → `deepseek-helper` →
`pro/pro-direct`. Die Empty-Return-Regel SHALL `planner-muse` als M2 nennen.

#### Scenario: Orchestrator plans on Muse Spark free tier

- **GIVEN** the factory runs with `FACTORY_EXECUTOR=opencode`
- **WHEN** the orchestrator agent resolves its model
- **THEN** `opencode-zen/muse-spark-1.3-contributor-free` is used

#### Scenario: First escalation after local goes to planner-muse

- **GIVEN** `FACTORY_MODE=mixed` and the `local` subagent failed the same partial twice
- **WHEN** the orchestrator escalates
- **THEN** the partial is dispatched to `planner-muse` with a compacted handoff
