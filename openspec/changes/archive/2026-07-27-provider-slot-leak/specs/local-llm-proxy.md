## ADDED Requirements

### Requirement: Service installation verifies port ownership and the resulting unit state

`task llm:proxy:install-service` SHALL determine whether the proxy port is still served before
enabling the systemd unit, and SHALL NOT rely on the PID file alone — the PID file only knows the
`nohup` instance and stays silent when the port is held by anything else. After
`systemctl enable --now`, the task SHALL confirm the unit actually reaches `active (running)`
rather than printing a success message: `enable --now` returns successfully while a unit is stuck
in `auto-restart`, and `is-active` reports `activating` during that state, which is
indistinguishable from a slow start.

#### Scenario: A manually started instance still holding the port is stopped

- **GIVEN** a proxy instance answers on the port but is not described by the PID file
- **WHEN** the install task runs
- **THEN** the task identifies the owning process via the port and stops it before enabling the unit

#### Scenario: A unit stuck in a restart loop fails the install

- **GIVEN** the unit cannot bind its port and systemd keeps restarting it
- **WHEN** the install task waits for the unit state
- **THEN** the task exits non-zero and prints the journal tail instead of reporting success
