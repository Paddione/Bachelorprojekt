## ADDED Requirements

### Requirement: Persisted error_log table

The system SHALL provide a Postgres table `error_log` (migration
`website/src/db/migrations/20260703_create_error_log.sql`) with columns
`id bigserial`, `ts timestamptz DEFAULT now()`, `source text CHECK (source IN
('server','browser','pod'))`, `message text`, `namespace text`, `pod_name text`,
`meta jsonb`, and an index on `ts DESC`. Only `level=error` entries SHALL be
persisted.

#### Scenario: Table accepts a server-source error row

- **GIVEN** the `error_log` migration has been applied
- **WHEN** a row is inserted with `source='server'`, `message='boom'`
- **THEN** the insert succeeds and `ts` defaults to the current timestamp

#### Scenario: Table rejects an invalid source value

- **GIVEN** the `error_log` migration has been applied
- **WHEN** a row is inserted with `source='invalid'`
- **THEN** the insert fails the `CHECK` constraint

### Requirement: Fire-and-forget error persistence

The system SHALL provide `persistError(entry)` in
`website/src/lib/logging/error-log-store.ts` that inserts into `error_log`
without blocking or throwing into the caller's execution path. Insert failures
SHALL be logged via `logger.error` and SHALL NOT propagate as exceptions.

#### Scenario: Insert failure does not throw

- **GIVEN** the database connection for `error_log` is unavailable
- **WHEN** `persistError({ source: 'server', message: 'x' })` is called
- **THEN** the call resolves without throwing
- **AND** `logger.error` is called with details of the failure

#### Scenario: Server error-level log entries are persisted

- **GIVEN** the pino `logger` has the `error_log` stream registered
- **WHEN** code calls `logger.error({ ... }, 'something failed')`
- **THEN** a corresponding row with `source='server'` appears in `error_log`

### Requirement: Admin-gated error log API

The system SHALL expose `POST /api/admin/ops/error-log` and
`GET /api/admin/ops/error-log?since=24h` at
`website/src/pages/api/admin/ops/error-log.ts`, both gated by `getSession` +
`isAdmin` (returning `401` for non-admins). `POST` SHALL accept
`{ source, message, meta? }` for browser/pod-originated errors and call
`persistError`. `GET` with `since=24h` SHALL return all `error_log` rows with
`ts` within the last 24 hours, ordered by `ts DESC`.

#### Scenario: Non-admin is rejected

- **GIVEN** a request without an admin session
- **WHEN** `GET /api/admin/ops/error-log?since=24h` is called
- **THEN** the response status is `401`

#### Scenario: Admin retrieves last-24h errors

- **GIVEN** an admin session and `error_log` rows both inside and outside the
  last 24 hours
- **WHEN** `GET /api/admin/ops/error-log?since=24h` is called
- **THEN** the response contains only rows with `ts` within the last 24 hours
- **AND** rows are ordered newest-first

#### Scenario: Admin posts a browser error

- **GIVEN** an admin session
- **WHEN** `POST /api/admin/ops/error-log` is called with
  `{ source: 'browser', message: 'TypeError: x is undefined' }`
- **THEN** the response status is `2xx`
- **AND** a corresponding row appears in `error_log`

### Requirement: Browser error capture persists to error_log

The system SHALL extend `website/src/lib/logging/browser-collector.ts` so that,
in addition to the existing local `addEntry()` call, every captured
`window.onerror` / `unhandledrejection` event also issues a fire-and-forget
`POST /api/admin/ops/error-log` request with `source: 'browser'`.

#### Scenario: Uncaught browser error is persisted

- **GIVEN** `registerBrowserLogCapture` is active for an admin session
- **WHEN** an uncaught `window.onerror` event fires
- **THEN** the entry is added to the local live store
- **AND** a `POST /api/admin/ops/error-log` request with `source: 'browser'` is sent

### Requirement: Pod stream error lines persist during active observation

The system SHALL extend the pod-log stream handling in
`website/src/components/assistant/LogsSidekickView.svelte` so that, while a pod
log stream is actively open, lines classified as `level=error` (via
`parsePodLine`/`textToLevel`) are also sent to
`POST /api/admin/ops/error-log` with `source: 'pod'`, `namespace`, and
`pod_name` populated. No background capture occurs outside an actively open
pod stream.

#### Scenario: Error line in an open pod stream is persisted

- **GIVEN** an admin has started a pod log stream for namespace `workspace`,
  pod `website-abc123`
- **WHEN** a streamed line is classified as `level=error`
- **THEN** a `POST /api/admin/ops/error-log` request is sent with
  `source='pod'`, `namespace='workspace'`, `pod_name='website-abc123'`

#### Scenario: Errors before the stream opens are not captured

- **GIVEN** no pod log stream is currently open for a given pod
- **WHEN** that pod emits an error-level log line
- **THEN** no row is inserted into `error_log` for that line

### Requirement: 24h error history view in the sidekick

The system SHALL extend `LogsSidekickView.svelte` with a mode toggle
("Live" / "Letzte 24h"). In "Letzte 24h" mode, the view SHALL fetch from
`GET /api/admin/ops/error-log?since=24h` on activation and via a manual
refresh control, rendering entries with the existing `levelClass`/`levelLabel`
formatting. The two modes SHALL NOT be merged into a single list.

#### Scenario: Switching to 24h mode loads persisted errors

- **GIVEN** an admin is viewing the Live log mode
- **WHEN** the admin switches to "Letzte 24h" mode
- **THEN** the view fetches from `GET /api/admin/ops/error-log?since=24h`
- **AND** displays the returned entries using the existing level/source styling

#### Scenario: Live and 24h entries remain separate

- **GIVEN** the admin is in "Letzte 24h" mode
- **WHEN** a new live server error arrives via the SSE stream
- **THEN** the 24h list does not automatically append the live entry

### Requirement: Automated error_log retention

The system SHALL run a daily CronJob
(`k3d/error-log-retention-cronjob.yaml`, following the existing
`tests-retention-cronjob.yaml` pattern with an HTTP-triggered endpoint gated by
`CRON_SECRET`) that deletes `error_log` rows with `ts` older than 7 days.

#### Scenario: Old rows are deleted by the retention job

- **GIVEN** `error_log` contains a row with `ts` 8 days in the past
- **WHEN** the retention CronJob's trigger endpoint runs
- **THEN** that row is deleted
- **AND** rows with `ts` within the last 7 days remain
