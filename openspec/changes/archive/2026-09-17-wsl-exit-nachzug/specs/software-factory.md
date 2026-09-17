## MODIFIED Requirements

### Requirement: Dispatcher-Tick-Execution

The system SHALL execute exactly one Dispatcher tick per tick activation via
`scripts/factory/wakeup.sh` under a `flock`-Sperre, sodass simultane Ticks ausgeschlossen sind.
`wakeup.sh` SHALL den Tick über `scripts/factory/dispatcher-bridge.sh` (Bash, kein
LLM/Tool-Call für den Tick selbst) dispatchen, statt das Modell zu einem
`Workflow(dispatcher.js)`-Tool-Call zu zwingen.

The tick activation SHALL be the in-cluster CronJob `factory-tick` in namespace
`workspace-dev` (`schedule: "*/5 * * * *"`, `concurrencyPolicy: Forbid`), which `kubectl exec`s
into `deploy/factory-runner` and invokes `wakeup.sh` there. This requirement is subordinate to
"Factory Dispatcher Runs In-Cluster": the CronJob is the normative activation path, and the
systemd user timer `scripts/factory/factory.timer` (`OnUnitInactiveSec=5min`, `Persistent=true`)
is a legacy Linux-host artefact that is NOT active on the current Dev-Host. No requirement of
this spec SHALL assume that a WSL host, a user-session systemd instance, or an interactive
Claude Code session is reachable for a tick to happen.

#### Scenario: Normaler Tick ohne parallele Instanz

- **GIVEN** the CronJob `factory-tick` fires on its schedule
- **WHEN** no other factory instance is running (`/tmp/factory-tick.lock` free)
- **THEN** `wakeup.sh` acquires the flock, unlocks git-crypt and calls
  `dispatcher-bridge.sh` with the prepared `prep_file`

#### Scenario: Paralleler Start während laufendem Tick

- **GIVEN** a factory tick is active (flock held)
- **WHEN** the next CronJob schedule elapses
- **THEN** no second dispatch happens — `concurrencyPolicy: Forbid` suppresses the Job and, as a
  second line of defence, `wakeup.sh` exits without action because the flock is held

#### Scenario: Leere Queue erfordert keinen LLM/Tool-Call

- **GIVEN** both brand queues are empty (no ticket to dispatch)
- **WHEN** `wakeup.sh` starts the tick via `dispatcher-bridge.sh`
- **THEN** `dispatcher-bridge.sh` exits 0 without invoking `claude`/`Workflow` — the tick stays
  purely Bash-based

#### Scenario: A tick happens while the Dev-Host is switched off

- **GIVEN** the Windows Dev-Host is powered down and no WSL instance exists
- **WHEN** the CronJob schedule elapses
- **THEN** a tick still runs inside the fleet cluster, because no part of the activation path
  depends on a host-local systemd timer

### Requirement: Force-Tick Trigger

The force-tick flag (`tickets.factory_control`, key `force-tick-requested`) SHALL be consumed
(logged and deleted) by `wakeup.sh` at the start of the next tick, so an operator- or
admin-triggered force-tick is auditable and takes effect at the latest with the next scheduled
`factory-tick` run (≤5 minutes).

The flag SHALL NOT depend on a host-local poller: the previously specified
`factory-forcetick.timer` systemd user timer is withdrawn — no such unit exists in the
repository, and a user-session systemd instance is not available on the Dev-Host. Any caller
that additionally attempts a host-local wake (`systemctl --user start --no-block
factory.service` in `scripts/ticket.sh` and `scripts/vda/ticket/stage-plan.sh`) SHALL treat that
call as best-effort and non-fatal; on the Windows Dev-Host it has no effect and MUST NOT change
the outcome.

#### Scenario: Admin force-tick is consumed by the next tick

- **GIVEN** the factory is idle and the admin API sets the force-tick flag
- **WHEN** the CronJob `factory-tick` next fires (≤5 minutes later)
- **THEN** `wakeup.sh` logs and deletes the flag and runs the tick

#### Scenario: No host-local timer is required

- **GIVEN** the Dev-Host provides no user-session systemd instance
- **WHEN** the force-tick flag is written
- **THEN** the flag is still consumed by the in-cluster tick, and no error is surfaced for the
  absent `factory.service`

### Requirement: Ticket CLI auto-tick wake never blocks on the factory tick

Every subcommand of the ticket CLI that attempts to wake the factory SHALL complete without
waiting for a running factory tick to finish. This covers `release-hold` in `scripts/ticket.sh`
and the auto-tick wake in `scripts/vda/ticket/stage-plan.sh`. Both SHALL write their control
keys first and emit their success confirmation BEFORE any wake attempt, so the state change is
reported even when the wake path is unavailable.

The wake attempt itself SHALL be non-blocking and non-fatal
(`systemctl --user start --no-block factory.service 2>/dev/null || true`). On the current
Windows Dev-Host this call is a no-op, because no user-session systemd instance exists; the
control key is picked up by the in-cluster `factory-tick` CronJob instead. The wake is therefore
a latency optimisation on Linux hosts, never a correctness precondition.

#### Scenario: A factory tick is already running

- **GIVEN** a factory tick is currently running in the cluster
- **WHEN** an operator runs `scripts/ticket.sh release-hold --id <ticket>`
- **THEN** the command returns promptly with exit code 0 and prints
  `execution_released set to true for ticket <ticket>`, instead of blocking until the tick
  completes

#### Scenario: Staging a plan while a factory tick is running

- **GIVEN** a factory tick is currently running in the cluster
- **WHEN** an operator runs `scripts/ticket.sh stage-plan` without `--hold`
- **THEN** the command returns promptly after writing the `force-tick-requested` control key and
  prints its `staged in Kommissionierung` confirmation

#### Scenario: The wake path is unavailable

- **GIVEN** `systemctl` is unavailable or unreachable (the Windows Dev-Host case)
- **WHEN** an operator runs `scripts/ticket.sh release-hold --id <ticket>`
- **THEN** the readiness flag and the `force-tick-requested` control key are still written, the
  confirmation is still printed with exit code 0, and the next scheduled in-cluster tick picks
  the ticket up

### Requirement: Stage-Plan Wake Trigger

`scripts/vda/ticket/stage-plan.sh` SHALL, after its DB writes succeed, set the
`force-tick-requested` flag, so a freshly staged plan is picked up by the next in-cluster tick
without operator action. It MAY additionally fire-and-forget a host-local
`systemctl --user start --no-block factory.service`; that call SHALL be non-fatal and SHALL NOT
be relied upon, because it has no effect on a host without a user-session systemd instance.

The guaranteed upper bound for pickup is therefore the `factory-tick` CronJob schedule
(`*/5 * * * *`), not a host-local immediate start.

#### Scenario: Staging arms the next tick

- **GIVEN** the factory loop is idle
- **WHEN** a plan is staged via `stage-plan.sh`
- **THEN** the `force-tick-requested` flag is set and the staged ticket is auto-enqueued in the
  next in-cluster tick (≤5 minutes)

#### Scenario: Staging succeeds without systemd

- **GIVEN** the Dev-Host provides no user-session systemd instance
- **WHEN** a plan is staged via `stage-plan.sh`
- **THEN** the command exits 0, the DB writes and the flag are persisted, and no systemd failure
  is surfaced to the operator

### Requirement: REQ-SF-EXECUTOR-002 — opencode-Binary wird im Dienstkontext selbst aufgelöst

The system SHALL resolve the `opencode` binary inside `scripts/factory/opencode-exec.sh`
instead of assuming it is on `PATH`. The resolution SHALL consider, in order:
`$OPENCODE_BIN` (explicit override), `command -v opencode`, and the npm-global
fallback `$HOME/.npm-global/bin/opencode`. If none of these yields an existing
executable, the executor SHALL abort with a non-127 exit code and a diagnostic
message naming the missing binary and the search order — not merely propagate 127.

Rationale: the factory runs unattended in a service context whose `PATH` omits
`~/.npm-global/bin` — historically a systemd user service, today the `factory-runner`
container in `workspace-dev`. Interactive shells work because the login shell prepends the
directory, so the defect is invisible in a manual run and strikes only the unattended one:
every pipeline then exits 127 with no fallback. The requirement is therefore about the
unattended execution context in general, not about systemd specifically.

#### Scenario: binary found via command -v

- **GIVEN** `opencode` is resolvable via `command -v opencode`
- **WHEN** `opencode-exec.sh` prepares its run
- **THEN** it uses the resolved binary path for the `opencode run --agent orchestrator` invocation

#### Scenario: binary not on PATH but present in npm-global

- **GIVEN** `PATH` does not contain `opencode` but `$HOME/.npm-global/bin/opencode` exists and is executable
- **WHEN** `opencode-exec.sh` prepares its run
- **THEN** it uses `$HOME/.npm-global/bin/opencode` and does NOT exit with 127

#### Scenario: binary nowhere to be found

- **GIVEN** no `opencode` binary exists in `PATH`, npm-global, or `$OPENCODE_BIN`
- **WHEN** `opencode-exec.sh` prepares its run
- **THEN** it aborts with an exit code distinct from 127 and a diagnostic message that names the missing binary and the search order
