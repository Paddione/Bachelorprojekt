## MODIFIED Requirements

### Requirement: Bonsai Provider Registration for Implement and Review

`scripts/factory/provider-register-bonsai.sh` SHALL register the logical model id `ternary-bonsai` with base URL `http://127.0.0.1:18235` (the unified gateway) in `tickets.provider_config` and `tickets.factory_model_slots` — never a backend port directly. This resolves the previous contradiction with the local-llm-proxy spec ("no enabled row references :8093 or :1234").

#### Scenario: Registration writes gateway URL

- **GIVEN** the registration script runs against a brand database
- **WHEN** its idempotent upserts complete
- **THEN** every row it touched has `base_url = http://127.0.0.1:18235` and `model_id = ternary-bonsai`, and re-running it never reintroduces `:8093`

### Requirement: Force-Tick Trigger

The force-tick flag (`tickets.factory_control`, key `force-tick-requested`) SHALL cause an actual factory tick within 30 seconds: a `factory-forcetick.timer` systemd user timer polls the flag and starts `factory.service` when set. `wakeup.sh` keeps consuming (logging and deleting) the flag for audit purposes.

#### Scenario: Admin force-tick actually ticks

- **GIVEN** the factory is idle and the admin API sets the force-tick flag
- **WHEN** the forcetick timer fires (≤30 s later)
- **THEN** `factory.service` is started and the flag is consumed by the resulting tick

## ADDED Requirements

### Requirement: Stage-Plan Wake Trigger

`scripts/vda/ticket/stage-plan.sh` SHALL, after its DB writes succeed, set the force-tick flag and fire-and-forget `systemctl --user start factory.service` (non-fatal when systemd is unavailable), so a freshly staged plan is picked up without waiting for the 5-minute fallback timer.

#### Scenario: Staging wakes the factory

- **GIVEN** the factory loop is idle
- **WHEN** a plan is staged via stage-plan.sh
- **THEN** a factory tick starts within seconds (not minutes) and the staged ticket is auto-enqueued in that tick

### Requirement: Pre-Dispatch Gateway Health Gate

`dispatcher-bridge.sh` SHALL probe the LLM gateway (`GET ${ANTHROPIC_BASE_URL:-http://localhost:18235}/healthz`, timeout ≤3 s) before claiming budget/slots for a ticket. On probe failure the ticket is skipped with a log line and remains untouched — no gang slot is burned and no doomed `claude -p` session is spawned.

#### Scenario: Dead gateway does not burn slots

- **GIVEN** the gateway is unreachable or reports 503
- **WHEN** the dispatcher iterates launchable tickets
- **THEN** no ticket transitions to `in_progress`, no worktree/session is created, and a skip reason is logged

### Requirement: Env-driven phase model routing

`scripts/factory/pipeline.mjs` SHALL derive its phase-agent model target from environment (`FACTORY_LLM_BASE_URL` default `http://127.0.0.1:18235`, `FACTORY_LLM_MODEL` default `ternary-bonsai`, `FACTORY_LLM_PROVIDER` default `llamacpp`) instead of a hardcoded LM-Studio constant, so orchestrator and phase agents share one gateway egress.

#### Scenario: Phases route through the gateway

- **GIVEN** autopilot.env sets no overrides
- **WHEN** a pipeline phase spawns an agent
- **THEN** the agent's LLM call targets `http://127.0.0.1:18235` with model `ternary-bonsai`
