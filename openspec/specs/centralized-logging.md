# centralized-logging

## Purpose

The platform SHALL collect container logs from all fleet namespaces into a single Loki
instance, ship them through Promtail with structured parsing, and surface them through
four Grafana dashboards. The website application SHALL emit newline-delimited JSON
logs to stdout (via pino), correlate each log line to an `X-Request-ID`, and respond
to API errors with a standardized `{ error, requestId }` body — never a stack trace.

<!-- merged from change delta centralized-logging.md on 2026-06-21 -->

---

## Requirements

### Requirement: Pino logger singleton

The system SHALL provide a `logger` singleton in `website/src/lib/logger.ts` that
emits newline-delimited JSON to stdout, binds `service: 'website'`, and reads its
level from `PINO_LOG_LEVEL` (defaulting to `info`).

#### Scenario: Logger emits JSON with service binding

- **GIVEN** the website SSR runtime starts with `PINO_LOG_LEVEL=info`
- **WHEN** code calls `logger.info({ feature: 'foo' }, 'hello')`
- **THEN** the emitted line is valid JSON containing `service: "website"`, `level: "info"`, and the message field
- **AND** the line is terminated with a single newline (no transport/prettify)

#### Scenario: createRequestLogger binds request context

- **GIVEN** `createRequestLogger({ requestId: 'r-1', method: 'GET', path: '/x' })`
- **WHEN** the returned child logger emits a line
- **THEN** the line carries `requestId: "r-1"`, `method: "GET"`, and `path: "/x"` in addition to the base service binding

---

### Requirement: X-Request-ID injection and request lifecycle logging

The system SHALL run a logging middleware on every request that reuses an incoming
`X-Request-ID` header or generates a 12-character nanoid, writes `locals.requestId`
and `locals.requestLogger`, logs `request.start` (info) and `request.end` (info/warn/
error by status), and echoes `X-Request-ID` on the response.

#### Scenario: Inbound header is reused

- **GIVEN** a request arrives with `X-Request-ID: 01HMY...`
- **WHEN** the logging middleware runs
- **THEN** `locals.requestId` equals `01HMY...`
- **AND** the response carries `X-Request-ID: 01HMY...`

#### Scenario: Missing header yields a generated 12-char id

- **GIVEN** a request arrives without `X-Request-ID`
- **WHEN** the logging middleware runs
- **THEN** `locals.requestId` is a 12-character nanoid
- **AND** the response carries that same id back to the client

#### Scenario: request.end is logged at the right level

- **GIVEN** a handler returns a 4xx response
- **WHEN** the middleware logs `request.end`
- **THEN** the log entry has `level: "warn"`
- **AND** 5xx responses produce `level: "error"`
- **AND** 2xx/3xx responses produce `level: "info"`

---

### Requirement: Standardized error response contract

The system SHALL expose `errorResponse(code, requestId, status=500)` from
`website/src/pages/api/_errors.ts` that returns `{ error, requestId }` JSON with a
configurable HTTP status. The response body SHALL never contain a stack trace, even
when the underlying error is an `Error` instance.

#### Scenario: Default status is 500

- **GIVEN** `errorResponse('DB_ERROR', 'req-1')`
- **WHEN** the response is parsed
- **THEN** `res.status` is `500` and the body is `{ error: 'DB_ERROR', requestId: 'req-1' }`

#### Scenario: Status is configurable

- **GIVEN** `errorResponse('NOT_FOUND', 'req-1', 404)`
- **WHEN** the response is parsed
- **THEN** `res.status` is `404`

#### Scenario: Body never leaks a stack trace

- **GIVEN** an `Error('boom')` with stack `at foo (file.ts:1:1)`
- **WHEN** a handler catches it and calls `errorResponse('BOOM', 'req-1', 500)`
- **THEN** the JSON body equals `{ error: 'BOOM', requestId: 'req-1' }`
- **AND** the serialized body does not contain the substring `at `

---

### Requirement: API surface is free of console.* logging

The system SHALL NOT use `console.error`, `console.log`, `console.warn`, or
`console.info` inside `website/src/pages/api/`. Every error or warning emitted by an
API handler SHALL go through `locals.requestLogger` so the line carries the request
correlation fields and is captured as structured JSON by Promtail.

#### Scenario: No stray console calls in the API surface

- **GIVEN** the website source tree
- **WHEN** `grep -R "console\.\(error\|log\|warn\|info\)" website/src/pages/api` runs
- **THEN** no matches are reported

#### Scenario: API handler error is captured with request context

- **GIVEN** a handler wrapped in try/catch and `locals.requestLogger` is populated by the middleware
- **WHEN** the handler calls `locals.requestLogger.error({ err }, '[scope]')`
- **THEN** the emitted JSON line includes `requestId`, `method`, and `path` from the child bindings
- **AND** `err` is serialized with `pino.stdSerializers.err` (message + stack fields)

#### Scenario: API handler error returns standardized body

- **GIVEN** a handler catches an `Error` and calls `errorResponse('CODE', locals.requestId, status)`
- **WHEN** the client receives the response
- **THEN** the body is `{ error: 'CODE', requestId: <id> }` with no stack trace

---

### Requirement: PINO_LOG_LEVEL is environment-driven

The system SHALL source the pino log level from the `PINO_LOG_LEVEL` environment
variable, defaulting to `info` when unset, and the value SHALL be exposed by the
website ConfigMap and registered in `environments/schema.yaml`.

#### Scenario: Default level is info

- **GIVEN** `PINO_LOG_LEVEL` is not set
- **WHEN** the website starts
- **THEN** pino's level is `info`

#### Scenario: env:validate accepts the variable

- **GIVEN** `PINO_LOG_LEVEL` is registered in `environments/schema.yaml` with `required: false, default_dev: info`
- **WHEN** `task env:validate ENV=dev` runs
- **THEN** validation passes

---

### Requirement: Traefik JSON access logs

The system SHALL patch the k3s Traefik HelmChart via a `HelmChartConfig` to emit
access logs in JSON format to stdout (so Promtail collects them) and SHALL keep the
`X-Request-ID` request header visible in the log entries.

#### Scenario: Traefik access logs are queryable in Loki

- **GIVEN** the Traefik pods are running with the HelmChartConfig patch applied
- **WHEN** an operator runs `{container="traefik"}` in Grafana Explore
- **THEN** JSON-shaped access log entries are returned for each request

---

### Requirement: Promtail JSON pipeline with level label

The system SHALL configure Promtail with a `pipelineStages` chain that parses JSON
log lines, extracts the `level` field as a Loki label, and drops `level="debug"`
entries in production to keep volume manageable.

#### Scenario: Level label is attached to JSON logs

- **GIVEN** a container writes `{ "level": "warn", "msg": "..." }` to stdout
- **WHEN** Promtail ships the line to Loki
- **THEN** the resulting stream is queryable via `{level="warn"}`

#### Scenario: Debug entries are dropped

- **GIVEN** a container writes `{ "level": "debug", "msg": "..." }` to stdout
- **WHEN** Promtail processes the line
- **THEN** the line is dropped before reaching Loki

---

### Requirement: Keycloak JSON console logging

The system SHALL configure Keycloak to emit JSON-formatted console logs at
`INFO` level, with `org.keycloak.events` raised to `DEBUG` so login and admin events
are queryable in Loki.

#### Scenario: Keycloak events are queryable in Loki

- **GIVEN** Keycloak is running with `KC_LOG_CONSOLE_FORMAT=json` and `KC_LOG_LEVEL=INFO,org.keycloak.events:DEBUG`
- **WHEN** a user performs a login
- **THEN** the resulting events appear under `{app="keycloak"}` with a `level` label

---

### Requirement: Grafana dashboards for log observability

The system SHALL ship four Grafana dashboards that consume the Loki datasource and
expose the most common log views: a general log explorer, an API error tracker, a
traefik access log analytics view, and a keycloak audit trail.

#### Scenario: Log Explorer dashboard loads

- **GIVEN** the `log-explorer` dashboard ConfigMap is mounted by the monitoring kustomization
- **WHEN** an operator opens Grafana and selects "Log Explorer"
- **THEN** the dashboard renders with namespace, app, level, and brand template variables

#### Scenario: API Error Tracker dashboard loads

- **GIVEN** the `api-errors` dashboard is mounted
- **WHEN** an operator opens it
- **THEN** it shows a top-10 failed endpoints table and an error-frequency-per-route timeseries

#### Scenario: Traefik Access Log Analytics dashboard loads

- **GIVEN** the `traefik-access` dashboard is mounted
- **WHEN** an operator opens it
- **THEN** it shows a status-code distribution over time, a top-10 slowest endpoints panel, and a 4xx/5xx rate panel with threshold

#### Scenario: Keycloak Audit Trail dashboard loads

- **GIVEN** the `keycloak-audit` dashboard is mounted
- **WHEN** an operator opens it
- **THEN** it shows login success/failure timeseries, a failed-auth table (user, clientId, ipAddress, time), and a panel for more than 5 failed logins in 5 minutes

### Requirement: Astro middleware entry point chains the logging middleware

The system SHALL compose `website/src/middleware.ts` (the Astro entry point)
such that `onRequest` invokes `loggingMiddleware` from
`website/src/middleware/logging.ts` before any other handler in the chain.
After the chain runs, `context.locals.requestId` and
`context.locals.requestLogger` SHALL be populated for every request, and the
response SHALL carry the `X-Request-ID` header.

#### Scenario: locals.requestLogger is defined after onRequest

- **WHEN** a request reaches `onRequest` (with or without an incoming
  `X-Request-ID` header)
- **THEN** `context.locals.requestId` is a non-empty string
- **AND** `context.locals.requestLogger` is a defined `pino.Logger` instance
- **AND** the response carries the `X-Request-ID` header with the same value
  as `context.locals.requestId`

#### Scenario: logging middleware runs before the locale middleware

- **WHEN** a handler in the chain (the user-supplied `next` or any subsequent
  middleware) reads `context.locals.requestLogger`
- **THEN** the logger is already defined (the logging step has run to
  completion before user code is invoked)

<!-- merged from change delta centralized-logging.md on 2026-07-02 -->

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

<!-- merged from change delta centralized-logging.md (4fc23e3f525d) -->