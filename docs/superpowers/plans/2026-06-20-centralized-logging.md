---
title: Centralized Logging (Pino + Grafana Dashboards) Implementation Plan
ticket_id: T000964
domains: [website, infra, db, ops, test, security]
status: active
pr_number: 1913
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Centralized Logging (Pino + Grafana Dashboards) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured JSON logging (Pino) with request-ID correlation to the Astro website, enrich Promtail/Traefik/Keycloak log formatting, and ship 4 Grafana dashboards — all on the already-deployed Loki/Grafana/Promtail stack.

**Architecture:** Pino singleton (SSR-only) emits JSON to stdout; an Astro middleware chain injects a per-request `X-Request-ID` (nanoid) and a child logger into `locals`; API routes log via `requestLogger` and return meaningful error codes + `requestId` (never stack traces). Infra layer adds Traefik JSON access logs, a Promtail JSON pipeline (level→label), and Keycloak JSON console logging. Grafana renders 4 dashboards via the existing `grafana_dashboard` sidecar configMapGenerator pattern.

**Tech Stack:** Astro 6 / TypeScript, `pino`, `nanoid`, k3s Traefik (`HelmChartConfig`), Grafana Loki, Promtail (Helm-rendered), Kustomize.

## Global Constraints

- **Pino is SSR-only.** `import pino` (and the logger module) must only be reached from server-side code (`website/src/lib/`, `website/src/middleware/`, `website/src/pages/api/`). Never import it into a client component or anything in a client bundle.
- **No hardcoded brand hostnames (S3).** Never write `*.mentolder.de` / `*.korczewski.de` literals into `k3d/`, `prod*/`, or `website/src/`. Use `PROD_DOMAIN`, `configmap-domains.yaml`, or namespace templates.
- **No stack traces in HTTP responses.** Stack/`err` goes to the log only; the response body carries a specific error code + `requestId` and nothing sensitive (no query params, no PII).
- **Every new `k3d/*.yaml` must be referenced in a `kustomization.yaml` (S4).** New manifests that are not wired in are orphan violations.
- **S1 line budgets (verbatim, per file touched):**
  - `website/src/lib/logger.ts` — NEW `.ts`, limit 600. Cut with reserve.
  - `website/src/middleware/logging.ts` — NEW `.ts`, limit 600.
  - `website/src/middleware/index.ts` — NEW `.ts`, limit 600.
  - `k3d/keycloak.yaml` — Ist 218, not baselined, limit 500 → **Budget 282**. Adding 2 env entries (~4 lines) is safe.
  - `k3d/monitoring/values/promtail-values.yaml` — Ist 29, limit 500 → **Budget 471**. Safe.
  - `k3d/traefik-config.yaml` — NEW `.yaml`, no `.yaml` line gate (S1 covers code extensions). No budget concern.
  - `environments/schema.yaml` — Ist 1067, not baselined, limit 600 → **already over limit, Budget effectively 0/negative.** Add **at most 1** entry (`PINO_LOG_LEVEL`, ~4 lines). Do NOT add anything else here. This file is YAML config registry — the S1 gate applies to code extensions, but keep the addition minimal regardless to avoid review friction.
  - `website/src/pages/api/**/*.ts` — 432 files, none baselined, limit 600 each. Most are <100 lines; the `console.error → requestLogger` swap is net-neutral or shrinks files. No split needed.
  - Dashboard `*.json` files — no S1 gate for JSON.

**Key repo facts (verified):**
- `pino` and `nanoid` are NOT yet in `website/package.json` — they must be added.
- There is no `website/src/middleware/` directory yet — it is created in this plan.
- Website env config is a ConfigMap `website-config` (literal values, `envFrom`) at `k3d/website.yaml:16`; the deployment consumes it via `envFrom.configMapRef` at line 228-230. `PINO_LOG_LEVEL` is a literal value — it does **not** need to be added to the Taskfile `envsubst` variable list (only `${...}`-templated vars do).
- Dashboards live in `k3d/monitoring/grafana-dashboards/` and are wired via `configMapGenerator` with `labels: grafana_dashboard: "1"` + `generatorOptions.disableNameSuffixHash: true`. The `grafana-dashboards` dir is already referenced from `k3d/monitoring/kustomization.yaml`.
- Promtail is Helm-rendered: edit `k3d/monitoring/values/promtail-values.yaml`, then run `task loki:render` to regenerate `k3d/monitoring/promtail-rendered.yaml` (commit both).
- 140 API files contain `console.error`/`console.log`. Migrate by criticality: auth → admin → billing/factory → bulk.

---

## File Structure

```
website/
  package.json                              # +pino, +nanoid
  src/
    lib/
      logger.ts                             # NEU: Pino-Singleton
    middleware/
      index.ts                              # NEU: Astro-Middleware-Einstiegspunkt
      logging.ts                            # NEU: X-Request-ID + Request-Logging
    pages/api/**/*.ts                       # MODIFY: console.error → requestLogger (~140 Dateien)

k3d/
  traefik-config.yaml                       # NEU: HelmChartConfig Traefik JSON Access-Logs
  keycloak.yaml                             # MODIFY: +KC_LOG_CONSOLE_FORMAT=json
  monitoring/
    values/
      promtail-values.yaml                  # MODIFY: +JSON-Pipeline-Stages
    promtail-rendered.yaml                  # REGENERIERT via task loki:render
    grafana-dashboards/
      log-explorer.json                     # NEU: Haupt-Log-Explorer Dashboard
      api-errors.json                       # NEU: API Error Tracker Dashboard
      traefik-access.json                   # NEU: Traefik Access Analytics Dashboard
      keycloak-audit.json                   # NEU: Keycloak Audit Trail Dashboard
    kustomization.yaml                      # MODIFY: +traefik-config.yaml in resources

environments/
  schema.yaml                               # MODIFY: +PINO_LOG_LEVEL (1 Eintrag)
```

---

## Task 1: Add pino + nanoid dependencies and the logger singleton

**Files:**
- Modify: `website/package.json` (dependencies block)
- Create: `website/src/lib/logger.ts`
- Test: `website/src/lib/logger.test.ts`

**Interfaces:**
- Produces:
  - `export const logger: pino.Logger` — root singleton, `base: { service: 'website' }`, level from `PINO_LOG_LEVEL` env (default `info` in dev).
  - `export function createRequestLogger(fields: { requestId: string; method: string; path: string }): pino.Logger` — returns `logger.child(fields)`.

- [x] **Step 1: Add dependencies**

In `website/package.json` `dependencies`, add (keep alphabetical where the file already is):

```json
    "nanoid": "^5.0.9",
    "pino": "^9.6.0",
```

Then install:

```bash
cd website && pnpm install
```

- [x] **Step 2: Write the failing test**

Create `website/src/lib/logger.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { logger, createRequestLogger } from './logger';

describe('logger', () => {
  it('root logger carries the website service base field', () => {
    expect(logger.bindings()).toMatchObject({ service: 'website' });
  });

  it('createRequestLogger attaches request context as child bindings', () => {
    const child = createRequestLogger({ requestId: 'req-abc', method: 'POST', path: '/api/x' });
    expect(child.bindings()).toMatchObject({
      service: 'website',
      requestId: 'req-abc',
      method: 'POST',
      path: '/api/x',
    });
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `cd website && pnpm vitest run src/lib/logger.test.ts`
Expected: FAIL — `Cannot find module './logger'`.

- [x] **Step 4: Implement the logger singleton**

Create `website/src/lib/logger.ts`:

```typescript
import pino from 'pino';

// SSR-only. Emits newline-delimited JSON to stdout; Promtail collects it.
// Level is controlled by PINO_LOG_LEVEL (ConfigMap website-config): info in dev, warn in prod.
const level = process.env.PINO_LOG_LEVEL ?? 'info';

export const logger = pino({
  level,
  base: { service: 'website' },
  // Pino's stdSerializers.err -> { type, message, stack }
  serializers: { err: pino.stdSerializers.err },
  // No transport/prettify: raw JSON to stdout so Promtail's JSON pipeline can parse it.
});

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
}

export function createRequestLogger(fields: RequestLogContext): pino.Logger {
  return logger.child(fields);
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd website && pnpm vitest run src/lib/logger.test.ts`
Expected: PASS (2 passing).

- [x] **Step 6: Commit**

```bash
git add website/package.json website/pnpm-lock.yaml website/src/lib/logger.ts website/src/lib/logger.test.ts
git commit -m "feat(logging): add pino+nanoid and SSR logger singleton [T000964]"
```

---

## Task 2: Astro middleware — X-Request-ID injection + request/response logging

**Files:**
- Create: `website/src/middleware/logging.ts`
- Create: `website/src/middleware/index.ts`
- Test: `website/src/middleware/logging.test.ts`
- Modify (types): `website/src/env.d.ts` (or `website/src/types/` — see Step 5)

**Interfaces:**
- Consumes: `createRequestLogger` from Task 1.
- Produces:
  - `App.Locals.requestId: string`
  - `App.Locals.requestLogger: import('pino').Logger`
  - `export const onRequest` (Astro middleware) from `website/src/middleware/index.ts`.

- [x] **Step 1: Write the failing test**

Create `website/src/middleware/logging.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { loggingMiddleware } from './logging';

function makeContext(headers: Record<string, string> = {}) {
  const locals: Record<string, unknown> = {};
  return {
    request: new Request('https://example.test/api/x', { method: 'POST', headers }),
    locals,
  } as any;
}

describe('loggingMiddleware', () => {
  it('reuses an incoming X-Request-ID header', async () => {
    const ctx = makeContext({ 'X-Request-ID': 'incoming-123' });
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    const res = await loggingMiddleware(ctx, next);
    expect(ctx.locals.requestId).toBe('incoming-123');
    expect(res.headers.get('X-Request-ID')).toBe('incoming-123');
  });

  it('generates a 12-char id when the header is absent', async () => {
    const ctx = makeContext();
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    await loggingMiddleware(ctx, next);
    expect(ctx.locals.requestId).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it('exposes a request-scoped logger on locals', async () => {
    const ctx = makeContext({ 'X-Request-ID': 'req-1' });
    const next = vi.fn(async () => new Response('ok', { status: 200 }));
    await loggingMiddleware(ctx, next);
    expect(ctx.locals.requestLogger).toBeDefined();
    expect(ctx.locals.requestLogger.bindings()).toMatchObject({ requestId: 'req-1' });
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd website && pnpm vitest run src/middleware/logging.test.ts`
Expected: FAIL — `Cannot find module './logging'`.

- [x] **Step 3: Implement the logging middleware**

Create `website/src/middleware/logging.ts`:

```typescript
import { nanoid } from 'nanoid';
import type { APIContext, MiddlewareNext } from 'astro';
import { createRequestLogger } from '../lib/logger';

const REQUEST_ID_HEADER = 'X-Request-ID';

export async function loggingMiddleware(
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> {
  const incoming = context.request.headers.get(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length > 0 ? incoming : nanoid(12);

  const url = new URL(context.request.url);
  const method = context.request.method;
  const path = url.pathname;

  const requestLogger = createRequestLogger({ requestId, method, path });
  context.locals.requestId = requestId;
  context.locals.requestLogger = requestLogger;

  const start = Date.now();
  requestLogger.info({ msg: 'request.start' });

  const response = await next();

  const durationMs = Date.now() - start;
  const statusCode = response.status;
  const logFields = { statusCode, durationMs, msg: 'request.end' };
  if (statusCode >= 500) requestLogger.error(logFields);
  else if (statusCode >= 400) requestLogger.warn(logFields);
  else requestLogger.info(logFields);

  // Echo the id back so support/tooling can correlate a browser request to Loki.
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
```

- [x] **Step 4: Create the middleware entrypoint**

Create `website/src/middleware/index.ts`:

```typescript
import { sequence } from 'astro:middleware';
import { loggingMiddleware } from './logging';

// Astro discovers middleware via src/middleware/index.ts and runs `onRequest`.
// sequence() keeps the chain explicit so future middleware can be appended.
export const onRequest = sequence(loggingMiddleware);
```

- [x] **Step 5: Extend the Locals type**

Confirm where Astro locals are declared:

```bash
cd website && grep -rn "namespace App" src/env.d.ts src/types/ 2>/dev/null
```

If `src/env.d.ts` already has an `App.Locals` interface, add these two members to it. Otherwise create/extend `src/env.d.ts`:

```typescript
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    requestId: string;
    requestLogger: import('pino').Logger;
    // ...keep any existing members already declared here...
  }
}
```

> If an `App.Locals` block already exists, MERGE these two lines into it — do not create a second `namespace App` block (TS will not error, but keep it single-source).

- [x] **Step 6: Run the test to verify it passes**

Run: `cd website && pnpm vitest run src/middleware/logging.test.ts`
Expected: PASS (3 passing).

- [x] **Step 7: Typecheck**

Run: `cd website && pnpm astro check 2>&1 | tail -20` (or `pnpm exec tsc --noEmit` if that is the project's check).
Expected: No new type errors referencing `requestId`/`requestLogger`/`middleware`.

- [x] **Step 8: Commit**

```bash
git add website/src/middleware/ website/src/env.d.ts
git commit -m "feat(logging): astro middleware for X-Request-ID + request logging [T000964]"
```

---

## Task 3: Migrate critical API routes (auth, admin) to requestLogger + meaningful errors

**Files:**
- Modify: `website/src/pages/api/auth/*.ts`, `website/src/pages/api/admin/**/*.ts` (the catch blocks)
- Test: extend the nearest existing API route test if one exists; otherwise add `website/src/pages/api/auth/login.test.ts` covering the error-response shape (see Step 2).

**Interfaces:**
- Consumes: `App.Locals.requestLogger`, `App.Locals.requestId` from Task 2.
- Produces: the standard error-response shape `{ error: '<CODE>', requestId: string }` reused by Tasks 4.

- [x] **Step 1: Enumerate the critical routes**

```bash
cd website && grep -rln "console.error\|console.log" src/pages/api/auth src/pages/api/admin
```

These are the highest-criticality routes — migrate them first.

- [x] **Step 2: Write/extend a failing test for the error shape**

Search first for an existing test to extend:

```bash
cd website && grep -rln "api/auth\|api/admin" src --include='*.test.ts'
```

If one exists, add a case to it. Otherwise create `website/src/pages/api/_error-contract.test.ts` documenting the shared contract (a pure-function test on a helper):

```typescript
import { describe, it, expect } from 'vitest';
import { errorResponse } from './_errors';

describe('errorResponse', () => {
  it('returns JSON with a code and requestId, status defaulting to 500', async () => {
    const res = errorResponse('METRICS_FETCH_FAILED', 'req-xyz');
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    const body = await res.json();
    expect(body).toEqual({ error: 'METRICS_FETCH_FAILED', requestId: 'req-xyz' });
  });

  it('never leaks a stack trace in the body', async () => {
    const res = errorResponse('DB_ERROR', 'req-1', 503);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/at .*\(/);
    expect(res.status).toBe(503);
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `cd website && pnpm vitest run src/pages/api/_error-contract.test.ts`
Expected: FAIL — `Cannot find module './_errors'`.

- [x] **Step 4: Add the shared error helper**

Create `website/src/pages/api/_errors.ts`:

```typescript
// Shared error-response builder for API routes. Keeps the {error, requestId}
// contract DRY. NEVER place stack traces or sensitive params in the body.
export function errorResponse(code: string, requestId: string, status = 500): Response {
  return new Response(JSON.stringify({ error: code, requestId }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd website && pnpm vitest run src/pages/api/_error-contract.test.ts`
Expected: PASS (2 passing).

- [x] **Step 6: Migrate each auth + admin route's catch blocks**

For every `console.error('[...]', err)` in the enumerated files, replace the catch block. Example transform (verbatim pattern):

Before:
```typescript
  } catch (err) {
    console.error('[POST /api/admin/x] error:', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
```

After (route signature must expose `locals` — `export const POST: APIRoute = async ({ request, locals }) => {`):
```typescript
  } catch (err) {
    locals.requestLogger.error({ err }, 'admin x failed');
    return errorResponse('ADMIN_X_FAILED', locals.requestId);
  }
```

Add `import { errorResponse } from '../_errors';` (adjust `../` depth per file) at the top of each migrated file. Pick a specific SCREAMING_SNAKE code per route (e.g. `LOGIN_FAILED`, `MAGIC_LINK_FAILED`, `ADMIN_USER_LIST_FAILED`). Keep the stack/`err` in the log only.

- [x] **Step 7: Verify no console.error remains in auth/admin**

Run: `cd website && grep -rn "console.error\|console.log" src/pages/api/auth src/pages/api/admin`
Expected: no matches.

- [x] **Step 8: Typecheck + run affected tests**

Run: `cd website && pnpm astro check 2>&1 | tail -20 && pnpm vitest run src/pages/api`
Expected: no new type errors; tests pass.

- [x] **Step 9: Commit**

```bash
git add website/src/pages/api/_errors.ts website/src/pages/api/_error-contract.test.ts website/src/pages/api/auth website/src/pages/api/admin
git commit -m "feat(logging): migrate auth+admin API routes to requestLogger + error codes [T000964]"
```

---

## Task 4: Migrate remaining API routes (billing/factory first, then bulk)

**Files:**
- Modify: `website/src/pages/api/billing/**/*.ts`, `website/src/pages/api/factory*/**/*.ts`, then all remaining `website/src/pages/api/**/*.ts` containing `console.error`/`console.log`.

**Interfaces:**
- Consumes: `errorResponse` (Task 3), `locals.requestLogger`, `locals.requestId`.

- [x] **Step 1: Migrate billing + factory routes**

```bash
cd website && grep -rln "console.error\|console.log" src/pages/api/billing src/pages/api/factory* 2>/dev/null
```

Apply the same transform as Task 3 Step 6 (route-specific error code, `errorResponse(...)`, `locals.requestLogger.error({ err }, '...')`). For GET routes that take no `locals` yet, change the signature to `async ({ locals }) =>` (or `async ({ request, locals }) =>`).

- [x] **Step 2: Migrate the remaining bulk routes**

```bash
cd website && grep -rln "console.error\|console.log" src/pages/api
```

Work through the remaining files. Each: add the `errorResponse` import (correct relative depth), replace `console.error(..., err)` → `locals.requestLogger.error({ err }, '<context msg>')`, and replace generic 500 bodies with `errorResponse('<CODE>', locals.requestId)`. Where a `console.log` is purely informational, convert to `locals.requestLogger.info({ ... }, '...')` if `locals` is in scope, otherwise `logger.info(...)` importing the root `logger`.

- [x] **Step 3: Verify the codebase is console-free in api/**

Run: `cd website && grep -rn "console.error\|console.log" src/pages/api`
Expected: no matches (acceptance criterion 1).

- [x] **Step 4: Typecheck + full website unit tests**

Run: `cd website && pnpm astro check 2>&1 | tail -20 && pnpm vitest run`
Expected: no new type errors; all tests pass.

- [x] **Step 5: Commit**

```bash
git add website/src/pages/api
git commit -m "feat(logging): migrate remaining API routes to requestLogger [T000964]"
```

---

## Task 5: Wire PINO_LOG_LEVEL through ConfigMap + schema

**Files:**
- Modify: `k3d/website.yaml` (the `website-config` ConfigMap `data` block)
- Modify: `environments/schema.yaml` (single new `env_vars` entry)

**Interfaces:**
- Produces: `PINO_LOG_LEVEL` available to the website pod via `envFrom: configMapRef: website-config`.

- [x] **Step 1: Add the ConfigMap value**

In `k3d/website.yaml`, in the `website-config` ConfigMap `data:` block (near the `# Brand` group), add a literal (NOT an envsubst `${...}` value — keep it literal so the Taskfile envsubst list needs no change):

```yaml
  # Logging
  PINO_LOG_LEVEL: "info"
```

> The prod overlay can later patch this to `warn` per `prod/`; base dev value stays `info`.

- [x] **Step 2: Register the variable in the schema (single minimal entry)**

In `environments/schema.yaml`, under `env_vars:`, add exactly one entry (schema is already over the soft line budget — add nothing else here):

```yaml
  - name: PINO_LOG_LEVEL
    description: Pino log level for the website SSR logger (info in dev, warn in prod)
    required: false
    default_dev: "info"
```

- [x] **Step 3: Validate the env schema + manifest**

Run:
```bash
cd /tmp/wt-centralized-logging
task env:validate ENV=dev
task workspace:validate
```
Expected: both succeed; no missing-variable error for `PINO_LOG_LEVEL`.

- [x] **Step 4: Commit**

```bash
git add k3d/website.yaml environments/schema.yaml
git commit -m "feat(logging): register PINO_LOG_LEVEL in website-config + schema [T000964]"
```

---

## Task 6: Traefik JSON access logs (HelmChartConfig) + kustomization wiring

**Files:**
- Create: `k3d/traefik-config.yaml`
- Modify: `k3d/kustomization.yaml` (add the new resource — S4)

**Interfaces:**
- Produces: k3s Traefik emits JSON access logs to stdout, keeping the `X-Request-ID` header field.

- [x] **Step 1: Create the HelmChartConfig**

Create `k3d/traefik-config.yaml`:

```yaml
# Patches the k3s-managed Traefik HelmChart (no separate Deployment).
# Enables JSON access logs to stdout (collected by Promtail) and preserves
# the X-Request-ID header so Traefik access logs correlate with app logs.
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    additionalArguments:
      - "--accesslog=true"
      - "--accesslog.format=json"
      - "--accesslog.fields.defaultmode=keep"
      - "--accesslog.fields.headers.defaultmode=drop"
      - "--accesslog.fields.headers.names.X-Request-ID=keep"
```

- [x] **Step 2: Reference it in the base kustomization (S4)**

Add `traefik-config.yaml` to the `resources:` list in `k3d/kustomization.yaml`. Confirm:

```bash
cd /tmp/wt-centralized-logging && grep -n "traefik-config.yaml" k3d/kustomization.yaml
```
Expected: one match.

- [x] **Step 3: Validate the build (no orphan)**

Run: `cd /tmp/wt-centralized-logging && task workspace:validate`
Expected: kustomize build succeeds and includes the `HelmChartConfig`.

- [x] **Step 4: Commit**

```bash
git add k3d/traefik-config.yaml k3d/kustomization.yaml
git commit -m "feat(logging): traefik JSON access logs with X-Request-ID retained [T000964]"
```

---

## Task 7: Promtail JSON pipeline + re-render

**Files:**
- Modify: `k3d/monitoring/values/promtail-values.yaml`
- Regenerate (committed): `k3d/monitoring/promtail-rendered.yaml` (via `task loki:render`)

**Interfaces:**
- Produces: Loki gets a `level` label extracted from JSON logs; `debug` lines dropped.

- [x] **Step 1: Add the JSON pipeline snippet**

In `k3d/monitoring/values/promtail-values.yaml`, under `config.snippets`, add a `pipelineStages` block (sibling to the existing `extraRelabelConfigs`):

```yaml
    pipelineStages:
      # Parse JSON log lines (non-fatal: malformed/plaintext lines pass through unchanged).
      - json:
          expressions:
            level: level
      # Promote the parsed level to a Loki label so {level="error"} queries work.
      - labels:
          level:
      # Drop debug noise so prod indexes stay lean.
      - match:
          selector: '{level="debug"}'
          action: drop
```

- [x] **Step 2: Re-render the Helm output**

Run:
```bash
cd /tmp/wt-centralized-logging && task loki:render
```
Expected: `k3d/monitoring/promtail-rendered.yaml` (and `loki-rendered.yaml`) regenerated. Review the diff — the `pipelineStages` must appear in the promtail config in the rendered file.

- [x] **Step 3: Validate monitoring kustomize**

Run: `cd /tmp/wt-centralized-logging && task monitoring:validate` (falls back to `kustomize build k3d/monitoring` if that task name differs — verify with `task -l | grep monitoring`).
Expected: build succeeds.

- [x] **Step 4: Commit**

```bash
git add k3d/monitoring/values/promtail-values.yaml k3d/monitoring/promtail-rendered.yaml k3d/monitoring/loki-rendered.yaml
git commit -m "feat(logging): promtail JSON pipeline (level label + debug drop) [T000964]"
```

---

## Task 8: Keycloak JSON console logging

**Files:**
- Modify: `k3d/keycloak.yaml` (env block; Ist 218, budget 282 — adds ~4 lines, safe)

**Interfaces:**
- Produces: Keycloak emits JSON audit/console logs to stdout with `org.keycloak.events` at DEBUG.

- [x] **Step 1: Add the env vars**

In `k3d/keycloak.yaml`, in the container `env:` list (alongside `KC_PROXY_HEADERS`), add:

```yaml
            - name: KC_LOG_CONSOLE_FORMAT
              value: "json"
            - name: KC_LOG_LEVEL
              value: "INFO,org.keycloak.events:DEBUG"
```

- [x] **Step 2: Validate the manifest + line budget**

Run:
```bash
cd /tmp/wt-centralized-logging
wc -l k3d/keycloak.yaml   # expect ~222, well under 500
task workspace:validate
```
Expected: under 500 lines; build succeeds.

- [x] **Step 3: Commit**

```bash
git add k3d/keycloak.yaml
git commit -m "feat(logging): keycloak JSON console logs + events DEBUG [T000964]"
```

---

## Task 9: Grafana dashboard — Log Explorer

**Files:**
- Create: `k3d/monitoring/grafana-dashboards/log-explorer.json`
- Modify: `k3d/monitoring/grafana-dashboards/kustomization.yaml` (configMapGenerator entry — S4)

**Interfaces:**
- Consumes: Loki datasource (already provisioned), the `level` label from Task 7.

- [x] **Step 1: Create the dashboard JSON**

Create `k3d/monitoring/grafana-dashboards/log-explorer.json`. Use the existing `traefik-dashboard.json` as a structural template (same schema version, `__inputs`-free provisioned format). Minimum panels:
- Template variables (Loki label_values): `namespace`, `app`, `level`, `brand`.
- A `logs` panel: `{namespace="$namespace", app="$app", level="$level", brand="$brand"}` with live tail enabled.
- A `timeseries` error-rate panel: `sum(rate({level="error"}[5m])) by (app)`.

```bash
cd /tmp/wt-centralized-logging && python3 -m json.tool k3d/monitoring/grafana-dashboards/traefik-dashboard.json > /dev/null && echo "template is valid JSON"
```

After authoring, validate the new file is well-formed:
```bash
cd /tmp/wt-centralized-logging && python3 -m json.tool k3d/monitoring/grafana-dashboards/log-explorer.json > /dev/null && echo OK
```
Expected: `OK`.

- [x] **Step 2: Wire the configMapGenerator (S4)**

In `k3d/monitoring/grafana-dashboards/kustomization.yaml`, append to `configMapGenerator`:

```yaml
  - name: grafana-dashboard-log-explorer
    files:
      - log-explorer.json
    options:
      labels:
        grafana_dashboard: "1"
```

- [x] **Step 3: Validate**

Run: `cd /tmp/wt-centralized-logging && kustomize build k3d/monitoring/grafana-dashboards > /dev/null && echo OK`
Expected: `OK`.

- [x] **Step 4: Commit**

```bash
git add k3d/monitoring/grafana-dashboards/log-explorer.json k3d/monitoring/grafana-dashboards/kustomization.yaml
git commit -m "feat(logging): grafana log-explorer dashboard [T000964]"
```

---

## Task 10: Grafana dashboard — API Error Tracker

**Files:**
- Create: `k3d/monitoring/grafana-dashboards/api-errors.json`
- Modify: `k3d/monitoring/grafana-dashboards/kustomization.yaml`

- [x] **Step 1: Create the dashboard JSON**

Create `k3d/monitoring/grafana-dashboards/api-errors.json` (structure mirrors Task 9). Panels:
- Table: top-10 failed endpoints — `topk(10, sum by (path) (count_over_time({app="website", level="error"} | json | path != "" [1h])))`.
- Timeseries: error frequency per API route over time.
- A text/links panel describing how to filter Loki Explore by `requestId` (e.g. `{app="website"} | json | requestId="<id>"`).

Validate:
```bash
cd /tmp/wt-centralized-logging && python3 -m json.tool k3d/monitoring/grafana-dashboards/api-errors.json > /dev/null && echo OK
```

- [x] **Step 2: Wire the configMapGenerator**

Append to `k3d/monitoring/grafana-dashboards/kustomization.yaml`:

```yaml
  - name: grafana-dashboard-api-errors
    files:
      - api-errors.json
    options:
      labels:
        grafana_dashboard: "1"
```

- [x] **Step 3: Validate + commit**

```bash
cd /tmp/wt-centralized-logging && kustomize build k3d/monitoring/grafana-dashboards > /dev/null && echo OK
git add k3d/monitoring/grafana-dashboards/api-errors.json k3d/monitoring/grafana-dashboards/kustomization.yaml
git commit -m "feat(logging): grafana api-errors dashboard [T000964]"
```

---

## Task 11: Grafana dashboard — Traefik Access Log Analytics

**Files:**
- Create: `k3d/monitoring/grafana-dashboards/traefik-access.json`
- Modify: `k3d/monitoring/grafana-dashboards/kustomization.yaml`

- [x] **Step 1: Create the dashboard JSON**

Create `k3d/monitoring/grafana-dashboards/traefik-access.json`. Panels (data from Traefik JSON access logs collected via container=traefik):
- HTTP status distribution (2xx/3xx/4xx/5xx) over time — `sum by (DownstreamStatus) (count_over_time({container="traefik"} | json [5m]))` (use the Traefik JSON field name, e.g. `DownstreamStatus`).
- Top-10 slowest endpoints from access-log duration — `topk(10, ...)` over the Traefik duration field.
- 4xx/5xx rate panel with a threshold annotation.

Validate:
```bash
cd /tmp/wt-centralized-logging && python3 -m json.tool k3d/monitoring/grafana-dashboards/traefik-access.json > /dev/null && echo OK
```

- [x] **Step 2: Wire the configMapGenerator**

```yaml
  - name: grafana-dashboard-traefik-access
    files:
      - traefik-access.json
    options:
      labels:
        grafana_dashboard: "1"
```

- [x] **Step 3: Validate + commit**

```bash
cd /tmp/wt-centralized-logging && kustomize build k3d/monitoring/grafana-dashboards > /dev/null && echo OK
git add k3d/monitoring/grafana-dashboards/traefik-access.json k3d/monitoring/grafana-dashboards/kustomization.yaml
git commit -m "feat(logging): grafana traefik-access dashboard [T000964]"
```

---

## Task 12: Grafana dashboard — Keycloak Audit Trail

**Files:**
- Create: `k3d/monitoring/grafana-dashboards/keycloak-audit.json`
- Modify: `k3d/monitoring/grafana-dashboards/kustomization.yaml`

- [x] **Step 1: Create the dashboard JSON**

Create `k3d/monitoring/grafana-dashboards/keycloak-audit.json`. Panels (data from Keycloak JSON logs, Task 8):
- Login successes vs failures over time — Loki queries filtering Keycloak event JSON (`{app="keycloak"} | json | type=~"LOGIN.*"`).
- Failed-auth table: columns `user`, `clientId`, `ipAddress`, `time` (from `| json` extracted fields).
- Unusual-activity panel: `sum(count_over_time({app="keycloak"} | json | type="LOGIN_ERROR" [5m])) > 5` styled as an alert threshold.

Validate:
```bash
cd /tmp/wt-centralized-logging && python3 -m json.tool k3d/monitoring/grafana-dashboards/keycloak-audit.json > /dev/null && echo OK
```

- [x] **Step 2: Wire the configMapGenerator**

```yaml
  - name: grafana-dashboard-keycloak-audit
    files:
      - keycloak-audit.json
    options:
      labels:
        grafana_dashboard: "1"
```

- [x] **Step 3: Validate the full monitoring build + commit**

```bash
cd /tmp/wt-centralized-logging && kustomize build k3d/monitoring > /dev/null && echo OK
git add k3d/monitoring/grafana-dashboards/keycloak-audit.json k3d/monitoring/grafana-dashboards/kustomization.yaml
git commit -m "feat(logging): grafana keycloak-audit dashboard [T000964]"
```

---

## Task 13: Final verification (PFLICHT)

**Files:** none (verification + generated-artifact regeneration only).

- [x] **Step 1: Targeted tests for changed domains**

Run: `cd /tmp/wt-centralized-logging && task test:changed`
Expected: vitest (website), BATS selection, and `quality:check` (S1–S4 ratchet) all pass.

- [x] **Step 2: Regenerate freshness artifacts**

Run: `cd /tmp/wt-centralized-logging && task freshness:regenerate`
Expected: regenerates test-inventory, repo-index, etc. Commit any changes it produces.

- [x] **Step 3: Freshness + quality gate (CI equivalent)**

Run: `cd /tmp/wt-centralized-logging && task freshness:check`
Expected: green — freshness + `quality:check` (S1–S4) + baseline key-count assertion all pass. If a new file trips S1, split it (do NOT add a baseline entry).

- [x] **Step 4: Test inventory (only if tests changed)**

Since this plan adds tests (`logger.test.ts`, `logging.test.ts`, `_error-contract.test.ts`), regenerate and commit the inventory:
```bash
cd /tmp/wt-centralized-logging && task test:inventory
git add website/src/data/test-inventory.json
git commit -m "chore(test): regenerate test-inventory for logging tests [T000964]"
```

- [x] **Step 5: OpenSpec validation**

Run: `cd /tmp/wt-centralized-logging && bash scripts/openspec.sh validate`
Expected: the `centralized-logging` change tree validates clean.

- [x] **Step 6: Final commit (if anything from regenerate is uncommitted)**

```bash
cd /tmp/wt-centralized-logging && git status --porcelain
# commit any remaining generated artifacts:
git add -A && git commit -m "chore(logging): regenerate artifacts post-verification [T000964]" || echo "nothing to commit"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** logger.ts (T1) · middleware logging.ts + index.ts (T2) · API migration + meaningful errors (T3–T4) · PINO_LOG_LEVEL ConfigMap+schema (T5) · Traefik JSON access logs + X-Request-ID retain (T6) · Promtail JSON pipeline + re-render (T7) · Keycloak JSON logging (T8) · 4 dashboards (T9–T12) · final verification incl. `task test:changed`/`freshness:check` (T13). All 6 acceptance criteria mapped.
- **No hardcoded brand hostnames** anywhere in snippets (S3) — Traefik/Promtail/Keycloak/dashboards use labels and ConfigMap/env values only.
- **S4** — every new `k3d/*.yaml` (`traefik-config.yaml`) and every new dashboard JSON is wired into a `kustomization.yaml`.
- **S1** — schema.yaml addition limited to 1 entry; keycloak.yaml well within budget; new `.ts` files cut with reserve; API migration is net-neutral.
- **Type consistency:** `createRequestLogger`, `errorResponse(code, requestId, status=500)`, `locals.requestId`, `locals.requestLogger` used identically across T1–T4.
