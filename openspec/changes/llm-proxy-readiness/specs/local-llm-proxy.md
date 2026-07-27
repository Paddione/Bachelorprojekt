## ADDED Requirements

### Requirement: Health endpoint reports readiness, not liveness

The proxy SHALL answer `GET /health` with the question "can I serve requests",
not "is my process alive". Readiness is determined by the **enabled backends
with `priority = 1`** — the local primary path. A lower-priority backend
(cloud fallback) is reported but SHALL NOT make the proxy ready on its own,
because it is slower, costs money and sends data off-premises, which the
platform's GDPR-by-design stance treats as a fallback rather than a substitute.

The response body SHALL name the degraded backends in both the ready and the
not-ready case, so a caller sees *which* backend is missing rather than only
*that* something is missing.

If no `priority = 1` backend is present at all, the proxy SHALL be considered
not ready.

#### Scenario: Local primary backend is down while a cloud fallback is healthy

- **GIVEN** an enabled backend with `priority = 1` that is not healthy
- **AND** an enabled backend with `priority = 2` that is healthy
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `503` with `ready: false` and lists the
  unhealthy priority-1 backend in `degraded`

#### Scenario: Only a lower-priority fallback is down

- **GIVEN** all enabled `priority = 1` backends are healthy
- **AND** an enabled backend with `priority = 2` is not healthy
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `200` with `ready: true` and still lists the
  unhealthy fallback in `degraded`

#### Scenario: No priority-1 backend is registered

- **GIVEN** no enabled backend has `priority = 1`
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `503` with `ready: false`

### Requirement: Liveness has its own endpoint

The proxy SHALL expose `GET /livez` answering `200` unconditionally while the
process is running, so callers that genuinely only need liveness are not
affected by backend state.

The systemd unit SHALL NOT gate restarts on readiness: restarting the proxy
cannot recover a backend that runs as a separate process on the Windows host.

#### Scenario: Liveness during a backend outage

- **GIVEN** an enabled `priority = 1` backend is not healthy
- **WHEN** a caller requests `GET /livez`
- **THEN** the proxy responds `200`, while `GET /health` responds `503`
