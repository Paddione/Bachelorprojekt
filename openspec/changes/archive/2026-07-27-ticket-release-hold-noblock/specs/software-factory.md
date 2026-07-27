## ADDED Requirements

### Requirement: Ticket CLI auto-tick wake never blocks on the factory tick

Every subcommand of the ticket CLI that wakes `factory.service` SHALL complete without
waiting for a running factory tick to finish. This covers `release-hold` in
`scripts/ticket.sh` and the auto-tick wake in `scripts/vda/ticket/stage-plan.sh`. Both
write their control keys, then wake the dispatcher with a non-blocking
`systemctl --user start --no-block factory.service`. The success confirmation SHALL be
emitted before the systemd call, so the state change is reported even when systemd is
unreachable or stalled.

`factory.service` is a `Type=oneshot` unit with `RuntimeMaxSec=3600`; a blocking
`systemctl start` attaches to the already running job and waits for its completion, which
made the command hang silently for the duration of the tick.

#### Scenario: A factory tick is already running

- **GIVEN** `factory.service` is currently activating a long-running oneshot job
- **WHEN** an operator runs `scripts/ticket.sh release-hold --id <ticket>`
- **THEN** the command returns promptly with exit code 0 and prints
  `execution_released set to true for ticket <ticket>`, instead of blocking until the tick
  completes

#### Scenario: Staging a plan while a factory tick is running

- **GIVEN** `factory.service` is currently activating a long-running oneshot job
- **WHEN** an operator runs `scripts/ticket.sh stage-plan` without `--hold`
- **THEN** the command returns promptly after writing the `force-tick-requested` control
  key and prints its `staged in Kommissionierung` confirmation, instead of blocking until
  the tick completes

#### Scenario: systemd is unreachable

- **GIVEN** the `systemctl` call fails or is unavailable
- **WHEN** an operator runs `scripts/ticket.sh release-hold --id <ticket>`
- **THEN** the readiness flag and the `force-tick-requested` control key are still written,
  the confirmation is still printed, and the next scheduled tick picks the ticket up
