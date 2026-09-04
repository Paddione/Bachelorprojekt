## MODIFIED Requirements

### Requirement: Supervised service lifecycle

On a **Linux host**, the proxy SHALL run under a systemd user unit `llm-proxy.service`
(`Restart=on-failure`, `WantedBy=default.target`) installed via `task llm:proxy:install`.
`task llm:proxy:start`/`stop` SHALL prefer the systemd unit when installed and fall back to the
nohup+PID pattern otherwise. `task llm:proxy:start` SHALL refuse to start when a foreign process
already listens on the proxy port.

This lifecycle SHALL be understood as host-conditional, not universal. The Dev-Host runs Windows
with WSL2 shut down (operator decision 2026-09-03), so it provides no user-session systemd
instance: `scripts/llm-proxy/llm-proxy.service` and `scripts/llm-proxy/llm-proxy-lan.service`
have **no runtime there**, and `task llm:proxy:install` / `install-service` have no host on which
to install. A reader MUST NOT infer from this requirement that a supervised proxy process exists
on the Dev-Host.

What SHALL replace this lifecycle is **explicitly open** and out of scope here. ADR-007 records
the intent to retire the `llm-proxy` rather than port it, but the actual teardown (the
`llm-proxy` manifest in namespace `workspace-dev`) is runtime behaviour and belongs to a separate
infrastructure change. Until that change lands, this requirement states only where the systemd
path does and does not apply; it neither asserts a replacement nor authorises the teardown.

#### Scenario: Crash recovery via systemd on a Linux host

- **GIVEN** a Linux host on which `llm-proxy.service` is enabled and active
- **WHEN** the proxy process dies
- **THEN** systemd restarts it automatically and the proxy port is serving again without operator
  action

#### Scenario: The Windows Dev-Host offers no systemd lifecycle

- **GIVEN** the Dev-Host runs Windows with WSL2 shut down
- **WHEN** an operator or agent looks for the supervised proxy process described above
- **THEN** none exists, and the absence is the documented state rather than a defect to repair by
  reinstalling the unit
