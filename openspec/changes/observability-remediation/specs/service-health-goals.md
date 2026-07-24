# service-health-goals

## Purpose

Die Service-Health-Goal-States erweitern die bestehende Point-in-Time-Probe
(`website/src/pages/api/admin/ops/health.ts`) um eine persistierte Historie und ein
konfigurierbares Soll/Ist-Ziel pro Service. Statt nur den aktuellen Status zu zeigen,
verfolgt das System kontinuierlich (über einen periodischen CronJob), ob ein Service
sein definiertes Ziel (z.B. maximale Fehleranzahl pro Tag, Latenz-Schwelle) einhält,
und macht diesen Trend im Admin-UI sichtbar. Nicht zu verwechseln mit der bestehenden
`health-goals`-SSOT-Spec (internes SDLC-Qualitäts-Dashboard) — dieser Bereich betrifft
ausschließlich die Laufzeit-Gesundheit der Workspace-Services selbst.

## ADDED Requirements

### Requirement: Persisted service health check history

The system SHALL provide Postgres tables `service_health_checks` (columns:
`id bigserial`, `ts timestamptz DEFAULT now()`, `asset_id` referencing
`platform.software_assets`, `status text CHECK (status IN ('ok','slow','error',
'optional'))`, `latency_ms integer`) and `service_health_goals` (columns:
`asset_id` referencing `platform.software_assets` as primary key, `max_errors_per_day
integer`, `latency_threshold_ms integer`, `updated_at timestamptz DEFAULT now()`).

#### Scenario: A check result is persisted

- **GIVEN** the `service_health_checks` migration has been applied
- **WHEN** a row is inserted with `status='ok'`, `latency_ms=120` for a known `asset_id`
- **THEN** the insert succeeds and `ts` defaults to the current timestamp

#### Scenario: An invalid status is rejected

- **GIVEN** the `service_health_checks` migration has been applied
- **WHEN** a row is inserted with `status='invalid'`
- **THEN** the insert fails the `CHECK` constraint

### Requirement: CronJob triggers periodic health checks

The system SHALL run a Kubernetes CronJob (`k3d/service-health-check-cronjob.yaml`,
following the `error-log-retention-cronjob.yaml` pattern with an HTTP-triggered
endpoint gated by `CRON_SECRET`) at a configurable interval that invokes each
`platform.software_assets` entry's `health_url` probe (reusing the existing
`checkUrl` logic) and persists the result to `service_health_checks`.

#### Scenario: CronJob run persists a check for every asset

- **GIVEN** `platform.software_assets` contains 5 entries with a `health_url`
- **WHEN** the CronJob's trigger endpoint runs
- **THEN** 5 new rows appear in `service_health_checks` with matching `ts`

#### Scenario: Trigger endpoint rejects unauthenticated requests

- **GIVEN** a request without a valid `CRON_SECRET`
- **WHEN** the trigger endpoint is called
- **THEN** the response status is `401` and no rows are inserted

### Requirement: Goal status evaluation

The system SHALL expose a function that evaluates, for a given `asset_id` and
day, whether `service_health_goals` thresholds (`max_errors_per_day`,
`latency_threshold_ms`) were met using the day's `service_health_checks` rows,
returning `met` or `unmet`.

#### Scenario: Goal is met when errors stay under the threshold

- **GIVEN** `max_errors_per_day=2` and the day's checks contain 1 `status='error'` row
- **WHEN** the goal evaluation runs for that day
- **THEN** the result is `met`

#### Scenario: Goal is unmet when the threshold is exceeded

- **GIVEN** `max_errors_per_day=2` and the day's checks contain 3 `status='error'` rows
- **WHEN** the goal evaluation runs for that day
- **THEN** the result is `unmet`

### Requirement: Admin UI surfaces goal history

The system SHALL extend the admin ops/platform health view with a per-service
history panel showing the last 7 days' goal status (`met`/`unmet`) and the
latest `service_health_checks` trend, sourced from a new authenticated
`GET /api/admin/ops/health-goals` endpoint.

#### Scenario: Admin sees a 7-day goal trend

- **GIVEN** an admin session and 7 days of `service_health_checks`/goal evaluations for a service
- **WHEN** the admin opens the health goals panel
- **THEN** the panel renders 7 day-cells, each showing `met` or `unmet`

#### Scenario: Non-admin is rejected

- **GIVEN** a request without an admin session
- **WHEN** `GET /api/admin/ops/health-goals` is called
- **THEN** the response status is `401`
