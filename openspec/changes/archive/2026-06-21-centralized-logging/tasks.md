# Tasks: centralized-logging

> Mirror of `docs/superpowers/plans/2026-06-20-centralized-logging.md` in OpenSpec task format.
> Ticket: T000964. Loki/Grafana/Promtail are already deployed — this change adds log *quality*.

## Task 1: Pino logger singleton + dependencies

Add `pino` + `nanoid` to `website/package.json` and create the SSR-only logger singleton.

### Requirement: SSR JSON logger
- `website/src/lib/logger.ts` exports `logger` (base `{ service: 'website' }`, level from `PINO_LOG_LEVEL`, `err` serializer) and `createRequestLogger({requestId, method, path})`.
- Emits newline-delimited JSON to stdout (no transport/prettify) so Promtail collects it.

**Acceptance Criteria:**
- `logger.bindings()` contains `service: 'website'`.
- `createRequestLogger(...)` child carries `requestId`/`method`/`path`.
- `pnpm vitest run src/lib/logger.test.ts` passes.

## Task 2: Astro middleware — X-Request-ID + request logging

Create the website `middleware/` directory (does not exist yet) with the logging chain.

### Requirement: Request-ID injection and lifecycle logging
- `website/src/middleware/logging.ts` reuses an incoming `X-Request-ID` header or generates `nanoid(12)`; writes `locals.requestId` + `locals.requestLogger`; logs request.start/end (info/warn/error by status); echoes `X-Request-ID` on the response.
- `website/src/middleware/index.ts` exports `onRequest = sequence(loggingMiddleware)`.
- `App.Locals` extended with `requestId: string` and `requestLogger: pino.Logger`.

**Acceptance Criteria:**
- Incoming header is reused; absent header yields a 12-char id.
- `locals.requestLogger.bindings()` carries the requestId.
- `pnpm astro check` reports no new type errors.

## Task 3: Migrate critical API routes (auth, admin)

Replace `console.error` with `requestLogger` and return meaningful error codes in auth + admin routes.

### Requirement: Shared error contract + critical-route migration
- `website/src/pages/api/_errors.ts` exports `errorResponse(code, requestId, status=500)` returning `{error, requestId}` JSON — never a stack trace.
- All `console.error/log` in `src/pages/api/auth` and `src/pages/api/admin` replaced with `locals.requestLogger.error({ err }, '...')` + `errorResponse(...)`.

**Acceptance Criteria:**
- `errorResponse` body is `{error, requestId}` with no stack trace; status configurable.
- `grep console.error src/pages/api/auth src/pages/api/admin` returns nothing.

## Task 4: Migrate remaining API routes

Migrate billing/factory first, then bulk-migrate all remaining routes.

### Requirement: Console-free API surface
- All `console.error/log` under `website/src/pages/api/` replaced with `requestLogger` calls + `errorResponse`.

**Acceptance Criteria:**
- `grep console.error|console.log src/pages/api` returns no matches (spec AC 1).
- `pnpm vitest run` and `pnpm astro check` pass.

## Task 5: Wire PINO_LOG_LEVEL through ConfigMap + schema

### Requirement: Env-driven log level
- `k3d/website.yaml` `website-config` ConfigMap gets literal `PINO_LOG_LEVEL: "info"` (consumed via existing `envFrom`).
- `environments/schema.yaml` gets exactly one `env_vars` entry `PINO_LOG_LEVEL` (`required: false`, `default_dev: info`) — schema is over soft budget, add nothing else.

**Acceptance Criteria:**
- `task env:validate ENV=dev` and `task workspace:validate` pass.

## Task 6: Traefik JSON access logs

### Requirement: HelmChartConfig access logging
- `k3d/traefik-config.yaml` (new) patches the k3s Traefik HelmChart: `accesslog=true`, `format=json`, header `X-Request-ID=keep`.
- Referenced in `k3d/kustomization.yaml` (S4 — no orphan).

**Acceptance Criteria:**
- `task workspace:validate` build includes the `HelmChartConfig`.
- Traefik access logs queryable via `{container="traefik"}` (spec AC 3).

## Task 7: Promtail JSON pipeline + re-render

### Requirement: JSON pipeline stages
- `k3d/monitoring/values/promtail-values.yaml` gains `pipelineStages`: json parse → `level` label → drop `level="debug"`.
- `task loki:render` regenerates `promtail-rendered.yaml` (+ `loki-rendered.yaml`); both committed.

**Acceptance Criteria:**
- Rendered promtail config contains the `pipelineStages`.
- Monitoring kustomize build succeeds.

## Task 8: Keycloak JSON console logging

### Requirement: Structured audit logging
- `k3d/keycloak.yaml` env gains `KC_LOG_CONSOLE_FORMAT=json` and `KC_LOG_LEVEL=INFO,org.keycloak.events:DEBUG`.

**Acceptance Criteria:**
- `k3d/keycloak.yaml` stays under 500 lines; `task workspace:validate` passes.
- Keycloak login events queryable via `{app="keycloak"}` with `level` label (spec AC 4).

## Task 9: Grafana dashboard — Log Explorer

### Requirement: log-explorer.json
- `k3d/monitoring/grafana-dashboards/log-explorer.json` with namespace/app/level/brand template vars, live-tail logs panel, error-rate timeseries.
- Wired via `configMapGenerator` (`grafana_dashboard: "1"`) in the dashboards kustomization (S4).

**Acceptance Criteria:**
- Valid JSON; `kustomize build k3d/monitoring/grafana-dashboards` succeeds.

## Task 10: Grafana dashboard — API Error Tracker

### Requirement: api-errors.json
- Top-10 failed endpoints table, error-frequency-per-route timeseries, requestId Explore guidance.
- Wired via `configMapGenerator`.

**Acceptance Criteria:**
- Valid JSON; monitoring build succeeds.

## Task 11: Grafana dashboard — Traefik Access Log Analytics

### Requirement: traefik-access.json
- Status-code distribution over time, top-10 slowest endpoints, 4xx/5xx rate with threshold.
- Wired via `configMapGenerator`.

**Acceptance Criteria:**
- Valid JSON; monitoring build succeeds.

## Task 12: Grafana dashboard — Keycloak Audit Trail

### Requirement: keycloak-audit.json
- Login success/failure timeseries, failed-auth table (user/clientId/ipAddress/time), >5 failed-logins/5min panel.
- Wired via `configMapGenerator`.

**Acceptance Criteria:**
- Valid JSON; `kustomize build k3d/monitoring` succeeds.
- All 4 dashboards load without error (spec AC 5).

## Task 13: Final verification (PFLICHT)

### Requirement: CI-equivalent gate
- Run the mandatory verification sequence and regenerate artifacts.

**Acceptance Criteria:**
```bash
task test:changed
task freshness:regenerate
task freshness:check
task test:inventory   # tests were added → regenerate + commit test-inventory.json
bash scripts/openspec.sh validate
```
- All commands green (spec AC 6); `test-inventory.json` committed; OpenSpec change validates clean.
