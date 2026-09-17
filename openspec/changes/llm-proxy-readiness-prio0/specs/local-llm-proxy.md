## MODIFIED Requirements

### Requirement: Health endpoint reports readiness, not liveness

The proxy SHALL answer `GET /health` with the question "can I serve requests",
not "is my process alive". Readiness is determined by the **enabled backends
of the primary tier, i.e. with `priority <= 1`** — the local primary path
(`priority 0` and `priority 1` are equivalent for readiness). Backends sharing an
`exclusiveGroup` (where only one member runs at a time, e.g. GPU loadouts on
shared hardware) are evaluated as a **group**: the group is healthy when at
least one member is healthy. A lower-priority backend (cloud fallback) is
reported but SHALL NOT make the proxy ready on its own, because it is slower,
costs money and sends data off-premises, which the platform's GDPR-by-design
stance treats as a fallback rather than a substitute.

The response body SHALL name the degraded backends in both the ready and the
not-ready case, so a caller sees *which* backend is missing rather than only
*that* something is missing.

If no backend with `priority <= 1` is present at all, the proxy SHALL be
considered not ready.

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

#### Scenario: No primary-tier backend is registered

- **GIVEN** no enabled backend has `priority <= 1`
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `503` with `ready: false`

#### Scenario: Healthy priority-0 backend makes the proxy ready

- **GIVEN** an enabled backend with `priority = 0` that is healthy
- **AND** no enabled backend has `priority = 1`
- **WHEN** a caller requests `GET /health`
- **THEN** the proxy responds `200` with `ready: true`

#### Scenario: exclusiveGroup with one healthy member

- **GIVEN** multiple enabled backends with `priority = 1` share the same `exclusiveGroup`
- **AND** only one member of the group is healthy (the others are not started / unhealthy)
- **WHEN** a caller requests `GET /health`
- **THEN** the group is considered healthy (≥1 healthy member)
- **AND** `ready: true`, the unhealthy siblings appear in `degraded`
