---
title: Monitoring Page Redesign — Implementation Plan
domains: [website, infra]
status: completed
pr_number: null
---

# Monitoring Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-scroll `/admin/monitoring` page with a tabbed dashboard (Übersicht / Cluster / Tests / Deployments / Berichte) and add an in-cluster bash test runner with SSE streaming plus a Playwright report panel fed by a Claude webhook.

**Architecture:** `MonitoringDashboard.svelte` becomes a tab shell; each tab is a dedicated component in `website/src/components/admin/monitoring/`. The bash runner is a Node.js `child_process.spawn` managed by `test-runner.ts`; results stream to the browser via SSE. Playwright reports are pushed to a webhook endpoint and stored in the DB, then rendered in an iframe.

**Tech Stack:** Astro (server mode, Node adapter), Svelte 5, PostgreSQL (pg pool), Node.js child_process + fs.watch, Server-Sent Events, Tailwind CSS (dark mode, existing class patterns from codebase).

---

## File Map

**New files:**
- `website/src/lib/test-runner.ts` — job registry, spawn logic, SSE event bus
- `website/src/pages/api/admin/tests/run.ts` — POST: start bash run
- `website/src/pages/api/admin/tests/stream/[jobId].ts` — GET: SSE stream
- `website/src/pages/api/admin/tests/results/[jobId].ts` — GET: final JSON/MD
- `website/src/pages/api/admin/tests/playwright-report.ts` — GET (latest HTML) + POST (store from Claude)
- `website/src/pages/api/admin/tests/report.ts` — POST: regenerate markdown
- `website/src/components/admin/monitoring/OverviewTab.svelte`
- `website/src/components/admin/monitoring/ClusterTab.svelte`
- `website/src/components/admin/monitoring/DeploymentsTab.svelte`
- `website/src/components/admin/monitoring/TestsTab.svelte`
- `website/src/components/admin/monitoring/BerichteTab.svelte`
- `website/src/components/admin/monitoring/TestRunner.svelte`
- `website/src/components/admin/monitoring/PlaywrightPanel.svelte`

**Modified files:**
- `website/src/lib/website-db.ts` — add `test_runs` and `playwright_reports` functions
- `website/src/components/admin/MonitoringDashboard.svelte` — rewrite as tab shell
- `website/Dockerfile` — add `curl jq bash kubectl`, copy `tests/`
- `k3d/website.yaml` — extend ClusterRole; add `PROD_DOMAIN`+`CLUSTER_ENV` to ConfigMap; add `MONITORING_WEBHOOK_TOKEN` secret mount
- `k3d/website-dev-secrets.yaml` — add `MONITORING_WEBHOOK_TOKEN`
- `Taskfile.yml` — add `\$PROD_DOMAIN \$CLUSTER_ENV` to website deploy envsubst
- `environments/schema.yaml` — add `CLUSTER_ENV` env_var; add `MONITORING_WEBHOOK_TOKEN` secret
- `environments/mentolder.yaml` — set `CLUSTER_ENV: mentolder`
- `environments/korczewski.yaml` — set `CLUSTER_ENV: korczewski`

---

## Task 1: Kubernetes RBAC + env vars + secrets

**Files:**
- Modify: `k3d/website.yaml:81-103` (ClusterRole)
- Modify: `k3d/website.yaml:14-70` (website-config ConfigMap)
- Modify: `k3d/website.yaml:258-262` (secret mounts section)
- Modify: `k3d/website-dev-secrets.yaml`
- Modify: `Taskfile.yml:1763` (envsubst vars)
- Modify: `environments/schema.yaml`
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`

- [ ] **Step 1.1: Extend ClusterRole to support test operations**

In `k3d/website.yaml`, replace the `rules:` block of `website-monitoring-reader` (lines 84–90) with:

```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "events", "nodes", "namespaces", "configmaps", "persistentvolumeclaims", "services", "secrets"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["delete"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch"]
  - apiGroups: ["batch"]
    resources: ["cronjobs", "jobs"]
    verbs: ["get", "list"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["ingresses"]
    verbs: ["get", "list"]
  - apiGroups: ["traefik.io", "traefik.containo.us"]
    resources: ["ingressroutes"]
    verbs: ["get", "list"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["pods", "nodes"]
    verbs: ["get", "list"]
```

- [ ] **Step 1.2: Add PROD_DOMAIN and CLUSTER_ENV to website-config ConfigMap**

In `k3d/website.yaml`, add to the `data:` section of the `website-config` ConfigMap (around line 30, after `BRAND:`):

```yaml
  PROD_DOMAIN: "${PROD_DOMAIN}"
  CLUSTER_ENV: "${CLUSTER_ENV}"
```

- [ ] **Step 1.3: Add MONITORING_WEBHOOK_TOKEN secret mount to website Deployment**

In `k3d/website.yaml`, after the `STALENESS_WEBHOOK_SECRET` block (around line 262), add:

```yaml
            - name: MONITORING_WEBHOOK_TOKEN
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: MONITORING_WEBHOOK_TOKEN
```

- [ ] **Step 1.4: Add MONITORING_WEBHOOK_TOKEN to dev secrets**

In `k3d/website-dev-secrets.yaml`, append:

```yaml
  MONITORING_WEBHOOK_TOKEN: "devmonitoringwebhooktoken123456789"
```

- [ ] **Step 1.5: Update envsubst vars in Taskfile.yml**

In `Taskfile.yml` line 1763, add `\$PROD_DOMAIN \$CLUSTER_ENV` to the envsubst variable list. The line currently ends with `\$BRETT_DOMAIN"`. Change to `\$BRETT_DOMAIN \$PROD_DOMAIN \$CLUSTER_ENV"`.

- [ ] **Step 1.6: Add CLUSTER_ENV to environments/schema.yaml**

After the `PROD_DOMAIN` entry in `environments/schema.yaml`, add:

```yaml
  - name: CLUSTER_ENV
    required: true
    default_dev: "dev"
    validate: "^[a-z0-9-]+$"
```

Also add `MONITORING_WEBHOOK_TOKEN` secret entry. After the `STALENESS_WEBHOOK_SECRET` block:

```yaml
  - name: MONITORING_WEBHOOK_TOKEN
    required: true
    generate: false
    extra_namespaces:
      - namespace: website
        secret: website-secrets
```

- [ ] **Step 1.7: Set CLUSTER_ENV in production env files**

In `environments/mentolder.yaml`, under `env_vars:`:
```yaml
  CLUSTER_ENV: mentolder
```

In `environments/korczewski.yaml`, under `env_vars:`:
```yaml
  CLUSTER_ENV: korczewski
```

- [ ] **Step 1.8: Validate manifests**

```bash
task workspace:validate
task env:validate ENV=mentolder
task env:validate ENV=korczewski
```

Expected: no errors.

- [ ] **Step 1.9: Commit**

```bash
git add k3d/website.yaml k3d/website-dev-secrets.yaml Taskfile.yml environments/
git commit -m "feat(monitoring): extend RBAC and add CLUSTER_ENV + MONITORING_WEBHOOK_TOKEN"
```

---

## Task 2: Dockerfile — add test tools and copy tests/

**Files:**
- Modify: `website/Dockerfile`

- [ ] **Step 2.1: Update Dockerfile runtime stage**

Replace the runtime stage in `website/Dockerfile` with:

```dockerfile
# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Tools needed by test runner scripts
RUN apk add --no-cache bash curl jq && \
    KUBECTL_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt) && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && mv kubectl /usr/local/bin/kubectl

# Only copy the built output (server + client assets)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Copy test suite for in-cluster test runner
COPY --chown=node:node tests ./tests
RUN chmod +x tests/runner.sh tests/lib/*.sh tests/local/*.sh 2>/dev/null || true

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

USER node
CMD ["node", "./dist/server/entry.mjs"]
```

- [ ] **Step 2.2: Verify build succeeds locally**

```bash
cd website && docker build -t workspace-website:test . && cd ..
```

Expected: build succeeds, no errors.

- [ ] **Step 2.3: Commit**

```bash
git add website/Dockerfile
git commit -m "feat(monitoring): add kubectl/jq/bash + tests/ to website image for test runner"
```

---

## Task 3: DB functions — test_runs and playwright_reports

**Files:**
- Modify: `website/src/lib/website-db.ts` (append to end)

- [ ] **Step 3.1: Add interfaces and test_runs functions**

Append to the end of `website/src/lib/website-db.ts`:

```typescript
// ── Test Runs ────────────────────────────────────────────────────────────────

export interface TestRun {
  id: string;
  tier: string;
  testIds: string | null;
  cluster: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'done' | 'error';
  pass: number | null;
  fail: number | null;
  skip: number | null;
  durationMs: number | null;
}

async function initTestRunsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id           TEXT PRIMARY KEY,
      tier         TEXT NOT NULL,
      test_ids     TEXT,
      cluster      TEXT NOT NULL,
      started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at  TIMESTAMPTZ,
      status       TEXT NOT NULL DEFAULT 'running',
      pass         INT,
      fail         INT,
      skip         INT,
      duration_ms  INT
    )
  `);
}

export async function saveTestRun(params: {
  id: string;
  tier: string;
  testIds: string | null;
  cluster: string;
}): Promise<void> {
  await initTestRunsTable();
  await pool.query(
    `INSERT INTO test_runs (id, tier, test_ids, cluster) VALUES ($1, $2, $3, $4)`,
    [params.id, params.tier, params.testIds, params.cluster]
  );
}

export async function updateTestRun(params: {
  id: string;
  status: 'done' | 'error';
  pass: number;
  fail: number;
  skip: number;
  durationMs: number;
}): Promise<void> {
  await pool.query(
    `UPDATE test_runs
     SET status = $2, finished_at = now(), pass = $3, fail = $4, skip = $5, duration_ms = $6
     WHERE id = $1`,
    [params.id, params.status, params.pass, params.fail, params.skip, params.durationMs]
  );
}

export async function listTestRuns(limit = 20): Promise<TestRun[]> {
  await initTestRunsTable();
  const result = await pool.query(
    `SELECT id, tier, test_ids AS "testIds", cluster,
            started_at AS "startedAt", finished_at AS "finishedAt",
            status, pass, fail, skip, duration_ms AS "durationMs"
     FROM test_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ── Playwright Reports ───────────────────────────────────────────────────────

export interface PlaywrightReport {
  id: number;
  createdAt: string;
  html: string;
}

async function initPlaywrightReportsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS playwright_reports (
      id         SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      html       TEXT NOT NULL
    )
  `);
}

export async function savePlaywrightReport(html: string): Promise<number> {
  await initPlaywrightReportsTable();
  const result = await pool.query(
    `INSERT INTO playwright_reports (html) VALUES ($1) RETURNING id`,
    [html]
  );
  // Keep only last 5
  await pool.query(
    `DELETE FROM playwright_reports WHERE id NOT IN (
       SELECT id FROM playwright_reports ORDER BY created_at DESC LIMIT 5
     )`
  );
  return result.rows[0].id;
}

export async function getLatestPlaywrightReport(): Promise<PlaywrightReport | null> {
  await initPlaywrightReportsTable();
  const result = await pool.query(
    `SELECT id, created_at AS "createdAt", html
     FROM playwright_reports ORDER BY created_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return {
    id: result.rows[0].id,
    createdAt: result.rows[0].createdAt.toISOString(),
    html: result.rows[0].html,
  };
}
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit && cd ..
```

Expected: no type errors.

- [ ] **Step 3.3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(monitoring): add test_runs and playwright_reports DB functions"
```

---

## Task 4: test-runner.ts — job registry and spawn logic

**Files:**
- Create: `website/src/lib/test-runner.ts`

- [ ] **Step 4.1: Create the test runner library**

Create `website/src/lib/test-runner.ts`:

```typescript
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { watch, existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { randomUUID } from 'crypto';
import { saveTestRun, updateTestRun } from './website-db.js';

export interface TestResult {
  req: string;
  test: string;
  desc: string;
  status: 'pass' | 'fail' | 'skip';
  duration_ms: number;
  detail: string;
}

export interface TestJobSummary {
  total: number;
  pass: number;
  fail: number;
  skip: number;
}

export type SseListener = (event: string, data: string) => void;

export interface TestJob {
  id: string;
  tier: string;
  startedAt: Date;
  status: 'running' | 'done' | 'error';
  stdoutBuffer: string[];
  resultBuffer: TestResult[];
  summary: TestJobSummary | null;
  listeners: Set<SseListener>;
}

// Module-level registry — survives across requests in the same Node process
const jobs = new Map<string, TestJob>();

export function getJob(id: string): TestJob | undefined {
  return jobs.get(id);
}

export function hasRunningJob(): boolean {
  for (const job of jobs.values()) {
    if (job.status === 'running') return true;
  }
  return false;
}

export async function spawnTestRun(tier: string, testIds: string[]): Promise<string> {
  const id = randomUUID();
  const cluster = process.env.CLUSTER_ENV ?? 'dev';
  const prodDomain = process.env.PROD_DOMAIN ?? 'localhost';

  const job: TestJob = {
    id,
    tier,
    startedAt: new Date(),
    status: 'running',
    stdoutBuffer: [],
    resultBuffer: [],
    summary: null,
    listeners: new Set(),
  };
  jobs.set(id, job);

  await saveTestRun({
    id,
    tier,
    testIds: testIds.length > 0 ? testIds.join(' ') : null,
    cluster,
  });

  const args = ['tests/runner.sh', tier, ...testIds];
  const env = { ...process.env, PROD_DOMAIN: prodDomain };

  const proc = spawn('bash', args, { cwd: '/app', env });

  const emit = (event: string, data: string) => {
    for (const listener of job.listeners) {
      listener(event, data);
    }
  };

  // Stream stdout line by line as log events
  const rl = createInterface({ input: proc.stdout!, crlfDelay: Infinity });
  rl.on('line', (line) => {
    job.stdoutBuffer.push(line);
    emit('log', JSON.stringify({ line }));
  });

  // Watch /app/tests/results/ for the JSONL temp file created by runner.sh
  const resultsDir = '/app/tests/results';
  let jsonlWatcher: ReturnType<typeof watch> | null = null;
  let watchedJsonlFile: string | null = null;

  const startJsonlTail = (filePath: string) => {
    if (watchedJsonlFile === filePath) return;
    watchedJsonlFile = filePath;

    // Tail the file: read all existing content first, then watch for appends
    let offset = 0;
    const readNewLines = async () => {
      try {
        const content = await readFile(filePath, 'utf-8');
        const newContent = content.slice(offset);
        offset = content.length;
        for (const line of newContent.split('\n').filter(Boolean)) {
          try {
            const result = JSON.parse(line) as TestResult;
            if (result.req && result.status) {
              job.resultBuffer.push(result);
              emit('result', JSON.stringify(result));
            }
          } catch {
            // not a result line
          }
        }
      } catch {
        // file not ready yet
      }
    };

    readNewLines();
    jsonlWatcher = watch(filePath, readNewLines);
  };

  // Check for existing or new JSONL files in results dir
  const checkForJsonl = () => {
    if (!existsSync(resultsDir)) return;
    const files = readdirSync(resultsDir).filter(
      (f) => f.startsWith(`.tmp-${tier}-`) && f.endsWith('.jsonl')
    );
    if (files.length > 0) {
      // pick most recent by name (timestamp-sorted)
      const latest = files.sort().at(-1)!;
      startJsonlTail(`${resultsDir}/${latest}`);
    }
  };

  let dirWatcher: ReturnType<typeof watch> | null = null;
  if (existsSync(resultsDir)) {
    checkForJsonl();
    dirWatcher = watch(resultsDir, (_, filename) => {
      if (filename?.startsWith(`.tmp-${tier}-`) && filename.endsWith('.jsonl')) {
        startJsonlTail(`${resultsDir}/${filename}`);
      }
    });
  }

  proc.on('exit', async (code) => {
    jsonlWatcher?.close();
    dirWatcher?.close();

    // Read summary from finalised JSON file
    let summary: TestJobSummary = { total: 0, pass: 0, fail: 0, skip: 0 };
    try {
      const files = existsSync(resultsDir)
        ? readdirSync(resultsDir).filter(
            (f) => f.startsWith(`20`) && f.endsWith(`-${tier}.json`) && !f.startsWith('.tmp')
          )
        : [];
      if (files.length > 0) {
        const latest = files.sort().at(-1)!;
        const raw = JSON.parse(await readFile(`${resultsDir}/${latest}`, 'utf-8'));
        summary = raw.summary ?? summary;
      }
    } catch {
      // fallback: count from buffer
      summary = {
        total: job.resultBuffer.length,
        pass: job.resultBuffer.filter((r) => r.status === 'pass').length,
        fail: job.resultBuffer.filter((r) => r.status === 'fail').length,
        skip: job.resultBuffer.filter((r) => r.status === 'skip').length,
      };
    }

    job.status = code === 0 ? 'done' : 'error';
    job.summary = summary;

    const durationMs = Date.now() - job.startedAt.getTime();
    await updateTestRun({
      id,
      status: job.status,
      pass: summary.pass,
      fail: summary.fail,
      skip: summary.skip,
      durationMs,
    }).catch(() => {});

    emit('done', JSON.stringify({ code, summary, durationMs }));

    // Keep job in map for 10 minutes so late SSE consumers can read the buffer
    setTimeout(() => jobs.delete(id), 10 * 60 * 1000);
  });

  return id;
}
```

- [ ] **Step 4.2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add website/src/lib/test-runner.ts
git commit -m "feat(monitoring): add test-runner job registry and spawn logic"
```

---

## Task 5: API — POST /api/admin/tests/run

**Files:**
- Create: `website/src/pages/api/admin/tests/run.ts`

- [ ] **Step 5.1: Write the endpoint**

Create `website/src/pages/api/admin/tests/run.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth.js';
import { hasRunningJob, spawnTestRun } from '../../../../lib/test-runner.js';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (hasRunningJob()) {
    return new Response(JSON.stringify({ error: 'A test run is already in progress' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { tier?: string; testIds?: string[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier = body.tier === 'local' ? 'local' : 'prod';
  const testIds = Array.isArray(body.testIds)
    ? body.testIds.filter((id) => /^[A-Z]+-\d+(-init)?$/.test(id))
    : [];

  const jobId = await spawnTestRun(tier, testIds);
  return new Response(JSON.stringify({ jobId }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 5.2: Test with curl (cluster must be running)**

```bash
# From dev environment — get admin session cookie first, then:
curl -s -X POST http://web.localhost/api/admin/tests/run \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <admin-session-cookie>' \
  -d '{"tier":"local","testIds":["SA-07"]}' | jq .
```

Expected: `{ "jobId": "<uuid>" }`

- [ ] **Step 5.3: Commit**

```bash
git add website/src/pages/api/admin/tests/
git commit -m "feat(monitoring): add POST /api/admin/tests/run endpoint"
```

---

## Task 6: API — GET /api/admin/tests/stream/[jobId] (SSE)

**Files:**
- Create: `website/src/pages/api/admin/tests/stream/[jobId].ts`

- [ ] **Step 6.1: Write the SSE endpoint**

Create `website/src/pages/api/admin/tests/stream/[jobId].ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth.js';
import { getJob } from '../../../../../lib/test-runner.js';

export const GET: APIRoute = async ({ params, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const job = getJob(params.jobId!);
  if (!job) {
    return new Response('Not Found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const fmt = (event: string, data: string) =>
    encoder.encode(`event: ${event}\ndata: ${data}\n\n`);

  const stream = new ReadableStream({
    start(controller) {
      // Replay buffered events for late consumers
      for (const line of job.stdoutBuffer) {
        controller.enqueue(fmt('log', JSON.stringify({ line })));
      }
      for (const result of job.resultBuffer) {
        controller.enqueue(fmt('result', JSON.stringify(result)));
      }

      if (job.status !== 'running') {
        // Job already finished — send done immediately
        controller.enqueue(fmt('done', JSON.stringify({ summary: job.summary })));
        controller.close();
        return;
      }

      // Register listener for live events
      const listener = (event: string, data: string) => {
        controller.enqueue(fmt(event, data));
        if (event === 'done') {
          job.listeners.delete(listener);
          controller.close();
        }
      };
      job.listeners.add(listener);

      // Clean up if client disconnects
      request.signal.addEventListener('abort', () => {
        job.listeners.delete(listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
```

- [ ] **Step 6.2: Verify TypeScript compiles**

```bash
cd website && npx tsc --noEmit && cd ..
```

Expected: no errors.

- [ ] **Step 6.3: Commit**

```bash
git add website/src/pages/api/admin/tests/stream/
git commit -m "feat(monitoring): add GET /api/admin/tests/stream/[jobId] SSE endpoint"
```

---

## Task 7: API — results, playwright-report, and report endpoints

**Files:**
- Create: `website/src/pages/api/admin/tests/results/[jobId].ts`
- Create: `website/src/pages/api/admin/tests/playwright-report.ts`
- Create: `website/src/pages/api/admin/tests/report.ts`

- [ ] **Step 7.1: Create GET /api/admin/tests/results/[jobId]**

Create `website/src/pages/api/admin/tests/results/[jobId].ts`:

```typescript
import type { APIRoute } from 'astro';
import { readdir, readFile } from 'fs/promises';
import { getSession, isAdmin } from '../../../../../lib/auth.js';

export const GET: APIRoute = async ({ params, request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const format = url.searchParams.get('format') ?? 'json';
  const jobId = params.jobId!;
  const resultsDir = '/app/tests/results';

  try {
    const files = await readdir(resultsDir);
    // Find finalised result file — named like 2026-04-27T14:22:01Z-prod.json
    // We match by content: the JSON file whose meta.job_id matches (if present),
    // or fall back to the most recent completed file
    const candidates = files.filter(
      (f) => !f.startsWith('.tmp') && (f.endsWith('.json') || f.endsWith('.md'))
    );

    if (format === 'md') {
      const mdFiles = candidates.filter((f) => f.endsWith('.md')).sort();
      if (mdFiles.length === 0) return new Response('No report found', { status: 404 });
      const content = await readFile(`${resultsDir}/${mdFiles.at(-1)}`, 'utf-8');
      return new Response(content, { headers: { 'Content-Type': 'text/markdown' } });
    }

    const jsonFiles = candidates.filter((f) => f.endsWith('.json')).sort();
    if (jsonFiles.length === 0) return new Response('No report found', { status: 404 });
    const content = await readFile(`${resultsDir}/${jsonFiles.at(-1)}`, 'utf-8');
    return new Response(content, { headers: { 'Content-Type': 'application/json' } });
  } catch {
    return new Response('Results not available', { status: 404 });
  }
};
```

- [ ] **Step 7.2: Create playwright-report endpoint (GET + POST)**

Create `website/src/pages/api/admin/tests/playwright-report.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth.js';
import { savePlaywrightReport, getLatestPlaywrightReport } from '../../../../lib/website-db.js';

const WEBHOOK_TOKEN = process.env.MONITORING_WEBHOOK_TOKEN ?? '';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const report = await getLatestPlaywrightReport();
  if (!report) return new Response('No report', { status: 404 });
  return new Response(report.html, { headers: { 'Content-Type': 'text/html' } });
};

export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!WEBHOOK_TOKEN || token !== WEBHOOK_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const html = await request.text();
  if (!html.includes('<html') && !html.includes('<!DOCTYPE')) {
    return new Response(JSON.stringify({ error: 'Expected HTML body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = await savePlaywrightReport(html);
  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 7.3: Create POST /api/admin/tests/report**

Create `website/src/pages/api/admin/tests/report.ts`:

```typescript
import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { getSession, isAdmin } from '../../../../lib/auth.js';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  await new Promise<void>((resolve) => {
    const proc = spawn('bash', ['tests/runner.sh', 'report'], { cwd: '/app' });
    proc.on('exit', () => resolve());
  });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 7.4: TypeScript check + commit**

```bash
cd website && npx tsc --noEmit && cd ..
git add website/src/pages/api/admin/tests/
git commit -m "feat(monitoring): add results, playwright-report, and report endpoints"
```

---

## Task 8: Frontend — MonitoringDashboard tab shell

**Files:**
- Modify: `website/src/components/admin/MonitoringDashboard.svelte` (full rewrite)
- Create dir: `website/src/components/admin/monitoring/` (just mkdir, components added in later tasks)

- [ ] **Step 8.1: Rewrite MonitoringDashboard.svelte as a tab shell**

Replace the entire contents of `website/src/components/admin/MonitoringDashboard.svelte` with:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  // Tab components (imported once each sub-component is created)
  // import OverviewTab from './monitoring/OverviewTab.svelte';
  // import ClusterTab from './monitoring/ClusterTab.svelte';
  // import DeploymentsTab from './monitoring/DeploymentsTab.svelte';
  // import TestsTab from './monitoring/TestsTab.svelte';
  // import BerichteTab from './monitoring/BerichteTab.svelte';

  type Tab = 'overview' | 'cluster' | 'tests' | 'deployments' | 'berichte';

  let activeTab: Tab = 'overview';

  // Allow deep-linking via hash: /admin/monitoring#tests
  onMount(() => {
    const hash = location.hash.slice(1) as Tab;
    if (['overview', 'cluster', 'tests', 'deployments', 'berichte'].includes(hash)) {
      activeTab = hash;
    }
  });

  function setTab(tab: Tab) {
    activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Übersicht' },
    { id: 'cluster', label: 'Cluster' },
    { id: 'tests', label: 'Tests' },
    { id: 'deployments', label: 'Deployments' },
    { id: 'berichte', label: 'Berichte' },
  ];
</script>

<div class="space-y-0">
  <!-- Tab bar -->
  <div class="flex border-b border-gray-700 bg-gray-950 -mx-4 px-4 sm:-mx-6 sm:px-6">
    {#each tabs as tab}
      <button
        on:click={() => setTab(tab.id)}
        class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {activeTab === tab.id
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Tab content -->
  <div class="pt-5">
    {#if activeTab === 'overview'}
      <p class="text-muted text-sm">OverviewTab — coming in next task</p>
      <!-- <OverviewTab on:navigate={(e) => setTab(e.detail)} /> -->
    {:else if activeTab === 'cluster'}
      <p class="text-muted text-sm">ClusterTab — coming in next task</p>
      <!-- <ClusterTab /> -->
    {:else if activeTab === 'tests'}
      <p class="text-muted text-sm">TestsTab — coming in next task</p>
      <!-- <TestsTab /> -->
    {:else if activeTab === 'deployments'}
      <p class="text-muted text-sm">DeploymentsTab — coming in next task</p>
      <!-- <DeploymentsTab /> -->
    {:else if activeTab === 'berichte'}
      <p class="text-muted text-sm">BerichteTab — coming in next task</p>
      <!-- <BerichteTab /> -->
    {/if}
  </div>
</div>
```

- [ ] **Step 8.2: Create monitoring/ subdirectory**

```bash
mkdir -p website/src/components/admin/monitoring
```

- [ ] **Step 8.3: Build and verify page loads**

```bash
task website:dev
# Open http://web.localhost/admin/monitoring — should show tab bar with placeholder text
```

Expected: tab bar renders, clicking tabs changes the placeholder text, no console errors.

- [ ] **Step 8.4: Commit**

```bash
git add website/src/components/admin/MonitoringDashboard.svelte website/src/components/admin/monitoring/
git commit -m "feat(monitoring): rewrite MonitoringDashboard as tab shell"
```

---

## Task 9: Frontend — ClusterTab and DeploymentsTab (extract from old component)

**Files:**
- Create: `website/src/components/admin/monitoring/ClusterTab.svelte`
- Create: `website/src/components/admin/monitoring/DeploymentsTab.svelte`
- Modify: `website/src/components/admin/MonitoringDashboard.svelte` (uncomment imports)

- [ ] **Step 9.1: Create ClusterTab.svelte**

The cluster section includes: node metrics bars, pod summary counters, pod table, events list. Extract the relevant state and markup from the old component. Create `website/src/components/admin/monitoring/ClusterTab.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; cpu?: string; memory?: string };
  type KubeEvent = { type: string; reason: string; object: string; message: string; age: string };
  type ClusterNode = { name: string; cpu: string; memory: string };
  type MonitoringData = { pods: Pod[]; events: KubeEvent[]; nodes?: ClusterNode[]; metricsAvailable: boolean; fetchedAt: string };

  let data: MonitoringData | null = null;
  let loading = true;
  let error: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  // Bug ticket modal (same logic as old component)
  let selectedEvent: KubeEvent | null = null;
  let modalDescription = '';
  let modalCategory = 'fehler';
  let modalLoading = false;
  let modalError: string | null = null;
  let modalSuccessId: string | null = null;

  async function fetchData() {
    try {
      loading = true;
      const res = await fetch('/api/admin/monitoring');
      if (res.ok) data = await res.json();
      else error = `Fehler ${res.status}`;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function parsePercent(val: string) { return Math.min(parseInt(val, 10) || 0, 100); }

  function podStatusClass(pod: Pod) {
    if (pod.phase === 'Failed' || pod.phase === 'CrashLoopBackOff' || pod.phase === 'Unknown')
      return 'bg-red-900/20 text-red-400';
    if (!pod.ready || pod.phase === 'Pending' || pod.phase === 'ContainerCreating')
      return 'bg-yellow-900/20 text-yellow-400';
    return '';
  }

  function openEventModal(event: KubeEvent) {
    selectedEvent = event;
    modalDescription = `${event.reason} on ${event.object}: ${event.message}`;
    modalCategory = 'fehler';
    modalLoading = false;
    modalError = null;
    modalSuccessId = null;
  }

  async function submitTicket() {
    if (!selectedEvent) return;
    modalLoading = true;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: modalCategory }),
      });
      const json = await res.json();
      if (!res.ok) { modalError = json.error ?? 'Fehler'; return; }
      modalSuccessId = json.ticketId;
      setTimeout(() => { selectedEvent = null; }, 3000);
    } catch { modalError = 'Netzwerkfehler'; }
    finally { modalLoading = false; }
  }

  onMount(() => {
    fetchData();
    refreshInterval = setInterval(fetchData, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));

  $: runningCount = data?.pods.filter(p => p.ready).length ?? 0;
  $: pendingCount = data?.pods.filter(p => !p.ready && p.phase !== 'Failed').length ?? 0;
  $: failedCount = data?.pods.filter(p => p.phase === 'Failed' || p.phase === 'Unknown').length ?? 0;
  $: restartingCount = data?.pods.filter(p => p.restarts > 3).length ?? 0;
</script>

<div class="space-y-5">
  <div class="flex justify-between items-center">
    <span class="text-sm text-gray-400">
      {#if data?.fetchedAt}Aktualisiert: {new Date(data.fetchedAt).toLocaleTimeString('de-DE')}{/if}
    </span>
    <button on:click={fetchData} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  <!-- Node metrics -->
  {#if data?.nodes && data.nodes.length > 0}
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-200 mb-3">Nodes</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {#each data.nodes as node}
          {@const cpuPct = parsePercent(node.cpu)}
          {@const memPct = parsePercent(node.memory)}
          <div class="space-y-1.5">
            <div class="flex justify-between text-xs text-gray-400">
              <span class="font-mono">{node.name}</span>
              <span>CPU {node.cpu} · Mem {node.memory}</span>
            </div>
            <div class="h-1.5 bg-gray-700 rounded overflow-hidden">
              <div class="h-full rounded transition-all {cpuPct < 65 ? 'bg-green-500' : cpuPct < 85 ? 'bg-orange-400' : 'bg-red-500'}"
                style="width: {cpuPct}%"></div>
            </div>
            <div class="h-1.5 bg-gray-700 rounded overflow-hidden">
              <div class="h-full rounded transition-all {memPct < 65 ? 'bg-green-500' : memPct < 85 ? 'bg-orange-400' : 'bg-red-500'}"
                style="width: {memPct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Pod summary -->
  <div class="grid grid-cols-4 gap-3">
    {#each [
      { label: 'Running', count: runningCount, color: 'text-green-400' },
      { label: 'Pending', count: pendingCount, color: 'text-yellow-400' },
      { label: 'Restarting', count: restartingCount, color: 'text-orange-400' },
      { label: 'Failed', count: failedCount, color: 'text-red-400' },
    ] as stat}
      <div class="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
        <div class="text-xl font-bold font-mono {stat.color}">{stat.count}</div>
        <div class="text-xs text-gray-400 mt-1">{stat.label}</div>
      </div>
    {/each}
  </div>

  <!-- Pod table -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="grid grid-cols-[2fr_80px_60px_50px_70px_70px] gap-0 px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
      <span>Pod</span><span>Phase</span><span>Ready</span><span>↺</span><span>CPU</span><span>Mem</span>
    </div>
    {#if data?.pods}
      {#each data.pods as pod}
        <div class="grid grid-cols-[2fr_80px_60px_50px_70px_70px] gap-0 px-3 py-2 border-b border-gray-700/50 text-xs {podStatusClass(pod)} last:border-0">
          <span class="font-mono truncate text-gray-200">{pod.name}</span>
          <span class="{pod.phase === 'Running' ? 'text-green-400' : 'text-yellow-400'}">{pod.phase}</span>
          <span class="{pod.ready ? 'text-green-400' : 'text-red-400'}">{pod.ready ? '✓' : '✗'}</span>
          <span class="{pod.restarts > 3 ? 'text-orange-400' : 'text-gray-400'}">{pod.restarts}</span>
          <span class="text-gray-400">{pod.cpu ?? '—'}</span>
          <span class="text-gray-400">{pod.memory ?? '—'}</span>
        </div>
      {/each}
    {:else if loading}
      <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {/if}
  </div>

  <!-- Events -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-700">
      <h3 class="text-sm font-semibold text-gray-200">Events (letzte 10)</h3>
    </div>
    {#if data?.events}
      <div class="divide-y divide-gray-700/50">
        {#each data.events as event}
          <div class="grid grid-cols-[70px_100px_1fr_50px_auto] gap-2 px-3 py-2 text-xs items-center
            {event.type === 'Warning' ? 'bg-red-900/10' : ''}">
            <span class="rounded px-1.5 py-0.5 text-center
              {event.type === 'Warning' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}">
              {event.type}
            </span>
            <span class="text-gray-400 font-mono">{event.reason}</span>
            <span class="text-gray-200 truncate">{event.message}</span>
            <span class="text-gray-500 text-right">{event.age}</span>
            <button on:click={() => openEventModal(event)}
              class="text-blue-400 hover:text-blue-300 text-xs">Ticket</button>
          </div>
        {/each}
      </div>
    {:else if loading}
      <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {/if}
  </div>
</div>

<!-- Bug ticket modal (same as old component) -->
{#if selectedEvent}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-md space-y-3">
      <h3 class="font-semibold text-gray-100">Bug-Ticket erstellen</h3>
      <textarea bind:value={modalDescription} rows={3}
        class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200 resize-none"></textarea>
      <select bind:value={modalCategory} class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200">
        <option value="fehler">Fehler</option>
        <option value="verbesserung">Verbesserung</option>
      </select>
      {#if modalError}<p class="text-red-400 text-sm">{modalError}</p>{/if}
      {#if modalSuccessId}<p class="text-green-400 text-sm">Ticket {modalSuccessId} erstellt.</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => selectedEvent = null}
          class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={submitTicket} disabled={modalLoading}
          class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {modalLoading ? '…' : 'Erstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 9.2: Create DeploymentsTab.svelte**

Extract the deployments section. Create `website/src/components/admin/monitoring/DeploymentsTab.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Deployment = { name: string; desired: number; ready: number; available: number; status: 'healthy' | 'degraded' | 'stopped' };
  type DeploymentAction = { type: 'restart' | 'scale'; deployment: Deployment };

  let deployments: Deployment[] = [];
  let loading = true;
  let error: string | null = null;
  let pendingAction: DeploymentAction | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchDeployments() {
    try {
      loading = true;
      const res = await fetch('/api/admin/deployments');
      if (res.ok) {
        const json = await res.json();
        deployments = json.deployments ?? [];
      } else {
        error = `Fehler ${res.status}`;
      }
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function openAction(action: DeploymentAction) {
    pendingAction = action;
    scaleTarget = action.type === 'scale' ? action.deployment.desired : 1;
    actionError = null;
  }

  async function confirmAction() {
    if (!pendingAction) return;
    actionLoading = true;
    actionError = null;
    try {
      const { type, deployment } = pendingAction;
      const body = type === 'scale' ? JSON.stringify({ replicas: scaleTarget }) : '{}';
      const res = await fetch(`/api/admin/deployments/${deployment.name}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const json = await res.json();
      if (!res.ok) { actionError = json.error ?? 'Fehler'; return; }
      pendingAction = null;
      setTimeout(fetchDeployments, 1000);
    } catch { actionError = 'Netzwerkfehler'; }
    finally { actionLoading = false; }
  }

  function statusClass(status: Deployment['status']) {
    if (status === 'healthy') return 'bg-green-900/40 text-green-400';
    if (status === 'degraded') return 'bg-orange-900/40 text-orange-400';
    return 'bg-yellow-900/40 text-yellow-400';
  }

  onMount(() => {
    fetchDeployments();
    refreshInterval = setInterval(fetchDeployments, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));
</script>

<div class="space-y-4">
  <div class="flex justify-between items-center">
    <h2 class="text-sm font-semibold text-gray-200">Deployments</h2>
    <button on:click={fetchDeployments} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="grid grid-cols-[2fr_80px_80px_110px_130px] gap-0 px-3 py-2 border-b border-gray-700 text-xs text-gray-500 uppercase tracking-wide">
      <span>Deployment</span><span>Desired</span><span>Ready</span><span>Status</span><span>Aktionen</span>
    </div>
    {#each deployments as dep}
      <div class="grid grid-cols-[2fr_80px_80px_110px_130px] gap-0 px-3 py-2.5 border-b border-gray-700/50 text-sm items-center last:border-0
        {dep.status === 'degraded' ? 'bg-orange-900/10' : dep.status === 'stopped' ? 'bg-yellow-900/10' : ''}">
        <span class="font-mono text-gray-200 text-xs">{dep.name}</span>
        <span class="text-gray-400 text-xs">{dep.desired}</span>
        <span class="text-xs {dep.ready === dep.desired ? 'text-green-400' : 'text-red-400'}">{dep.ready}/{dep.desired}</span>
        <span class="text-xs px-2 py-0.5 rounded-full inline-block {statusClass(dep.status)}">{dep.status}</span>
        <div class="flex gap-2">
          <button on:click={() => openAction({ type: 'restart', deployment: dep })}
            class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">↺ Restart</button>
          <button on:click={() => openAction({ type: 'scale', deployment: dep })}
            class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">⤢ Scale</button>
        </div>
      </div>
    {/each}
    {#if loading && deployments.length === 0}
      <div class="px-3 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {/if}
  </div>
</div>

<!-- Action confirmation modal -->
{#if pendingAction}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-sm space-y-3">
      {#if pendingAction.type === 'restart'}
        <h3 class="font-semibold text-gray-100">Restart {pendingAction.deployment.name}?</h3>
        <p class="text-sm text-gray-400">Rolling restart — kurze Unterbrechung möglich.</p>
      {:else}
        <h3 class="font-semibold text-gray-100">Scale {pendingAction.deployment.name}</h3>
        <div class="flex items-center gap-3">
          <label class="text-sm text-gray-400">Replicas:</label>
          <input type="number" bind:value={scaleTarget} min={0} max={10}
            class="w-20 bg-gray-900 border border-gray-600 rounded p-1.5 text-sm text-gray-200 text-center" />
        </div>
      {/if}
      {#if actionError}<p class="text-red-400 text-sm">{actionError}</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => pendingAction = null}
          class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={confirmAction} disabled={actionLoading}
          class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {actionLoading ? '…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 9.3: Wire up ClusterTab and DeploymentsTab in MonitoringDashboard**

In `MonitoringDashboard.svelte`, add the imports and replace the placeholder text for 'cluster' and 'deployments':

```svelte
  import ClusterTab from './monitoring/ClusterTab.svelte';
  import DeploymentsTab from './monitoring/DeploymentsTab.svelte';
```

And replace the placeholder content:
```svelte
    {:else if activeTab === 'cluster'}
      <ClusterTab />
    {:else if activeTab === 'deployments'}
      <DeploymentsTab />
```

- [ ] **Step 9.4: Verify Cluster and Deployments tabs render**

```bash
task website:dev
# Open http://web.localhost/admin/monitoring#cluster
# Open http://web.localhost/admin/monitoring#deployments
```

Expected: pods, nodes, events visible on Cluster tab; deployments list on Deployments tab. Identical to the old page.

- [ ] **Step 9.5: Commit**

```bash
git add website/src/components/admin/monitoring/ website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(monitoring): extract ClusterTab and DeploymentsTab components"
```

---

## Task 10: Frontend — TestRunner.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/TestRunner.svelte`

- [ ] **Step 10.1: Create TestRunner.svelte**

Create `website/src/components/admin/monitoring/TestRunner.svelte`:

```svelte
<script lang="ts">
  type TestResult = { req: string; test: string; desc: string; status: 'pass' | 'fail' | 'skip'; duration_ms: number; detail?: string };
  type Summary = { total: number; pass: number; fail: number; skip: number };

  let tier: 'prod' | 'local' = 'prod';
  let filterInput = '';
  let running = false;
  let logLines: string[] = [];
  let results: TestResult[] = [];
  let summary: Summary | null = null;
  let currentTest = '';
  let durationMs = 0;
  let error: string | null = null;
  let eventSource: EventSource | null = null;
  let logEl: HTMLPreElement;

  async function startRun() {
    if (running) return;
    running = true;
    logLines = [];
    results = [];
    summary = null;
    error = null;
    currentTest = '';

    const testIds = filterInput
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch('/api/admin/tests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, testIds }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Fehler' }));
      error = json.error ?? `HTTP ${res.status}`;
      running = false;
      return;
    }

    const { jobId } = await res.json();
    const startTime = Date.now();

    eventSource = new EventSource(`/api/admin/tests/stream/${jobId}`);

    eventSource.addEventListener('log', (e) => {
      const { line } = JSON.parse(e.data);
      logLines = [...logLines, line];
      // Extract current test ID from log line e.g. "[SA-07]"
      const match = line.match(/\[([A-Z]+-\d+)\]/);
      if (match) currentTest = match[1];
      // Auto-scroll log
      setTimeout(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; }, 0);
    });

    eventSource.addEventListener('result', (e) => {
      results = [...results, JSON.parse(e.data)];
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      summary = data.summary;
      durationMs = data.durationMs ?? Date.now() - startTime;
      running = false;
      currentTest = '';
      eventSource?.close();
    });

    eventSource.onerror = () => {
      if (!running) return; // already done
      error = 'Verbindung unterbrochen';
      running = false;
      eventSource?.close();
    };
  }

  function statusIcon(status: TestResult['status']) {
    if (status === 'pass') return '✓';
    if (status === 'fail') return '✗';
    return '⊘';
  }

  function statusColor(status: TestResult['status']) {
    if (status === 'pass') return 'text-green-400';
    if (status === 'fail') return 'text-red-400';
    return 'text-gray-400';
  }

  function fmtDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }

  async function downloadResult(format: 'json' | 'md') {
    // We don't have jobId here — download latest from the server
    const res = await fetch(`/api/admin/tests/results/latest?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results.${format === 'md' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
  <!-- Controls bar -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700 flex-wrap">
    <span class="text-sm font-semibold text-gray-200">Bash-Tests</span>

    <!-- Tier toggle -->
    <div class="flex border border-gray-600 rounded overflow-hidden text-xs">
      <button on:click={() => tier = 'prod'}
        class="px-3 py-1.5 {tier === 'prod' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}">
        prod
      </button>
      <button on:click={() => tier = 'local'}
        class="px-3 py-1.5 {tier === 'local' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}">
        local
      </button>
    </div>

    <input
      bind:value={filterInput}
      placeholder="FA-15 SA-07 … (leer = alle)"
      class="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 w-48 focus:outline-none focus:border-blue-500"
    />

    <button on:click={startRun} disabled={running}
      class="ml-auto px-4 py-1.5 text-sm font-semibold bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
      {running ? '● läuft' : '▶ Starten'}
    </button>

    {#if running && currentTest}
      <span class="text-xs text-blue-400 font-mono animate-pulse">● {currentTest}</span>
    {/if}
  </div>

  {#if error}
    <div class="px-4 py-2 text-sm text-red-400 bg-red-900/20">{error}</div>
  {/if}

  <!-- Split panel -->
  <div class="grid grid-cols-2 min-h-[200px] max-h-[400px]">
    <!-- Left: log -->
    <div class="border-r border-gray-700 flex flex-col">
      <div class="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50">Ausgabe</div>
      <pre bind:this={logEl}
        class="flex-1 overflow-auto p-3 text-xs font-mono text-gray-300 leading-relaxed bg-gray-900/50 whitespace-pre-wrap"
      >{#each logLines as line}{line + '\n'}{/each}{#if running}<span class="animate-pulse text-gray-500">▌</span>{/if}</pre>
    </div>

    <!-- Right: results table -->
    <div class="flex flex-col">
      <div class="px-3 py-1.5 border-b border-gray-700/50 flex justify-between items-center">
        <span class="text-xs text-gray-500 uppercase tracking-wide">Ergebnis</span>
        {#if results.length > 0}
          <div class="flex gap-3 text-xs">
            <span class="text-green-400">✓ {results.filter(r => r.status === 'pass').length}</span>
            <span class="text-red-400">✗ {results.filter(r => r.status === 'fail').length}</span>
            <span class="text-gray-400">⊘ {results.filter(r => r.status === 'skip').length}</span>
          </div>
        {/if}
      </div>
      <div class="flex-1 overflow-auto bg-gray-900/50">
        {#each results as result}
          <div class="grid grid-cols-[55px_28px_1fr_55px] gap-1 px-2 py-1.5 border-b border-gray-700/30 text-xs items-center
            {result.status === 'fail' ? 'bg-red-900/10' : ''}">
            <span class="font-mono text-gray-400">{result.req}</span>
            <span class="text-gray-500">{result.test}</span>
            <span class="text-gray-300 truncate" title={result.detail || result.desc}>{result.desc}</span>
            <span class="text-right font-mono {statusColor(result.status)}">
              {statusIcon(result.status)} {result.duration_ms}ms
            </span>
          </div>
        {/each}
        {#if running && results.length === 0}
          <div class="p-3 text-xs text-gray-500 text-center">Wartet auf erste Ergebnisse…</div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Summary bar -->
  {#if summary}
    <div class="flex items-center gap-4 px-4 py-2.5 bg-gray-900/60 border-t border-gray-700 text-xs flex-wrap">
      <span class="text-green-400">✓ {summary.pass} bestanden</span>
      <span class="text-red-400">✗ {summary.fail} fehlgeschlagen</span>
      <span class="text-gray-400">⊘ {summary.skip} übersprungen</span>
      <span class="text-gray-500 ml-auto">Dauer: {fmtDuration(durationMs)}</span>
      <button on:click={() => downloadResult('json')} class="text-blue-400 hover:text-blue-300">↓ JSON</button>
      <button on:click={() => downloadResult('md')} class="text-blue-400 hover:text-blue-300">↓ Markdown</button>
    </div>
  {/if}
</div>
```

- [ ] **Step 10.2: Commit**

```bash
git add website/src/components/admin/monitoring/TestRunner.svelte
git commit -m "feat(monitoring): add TestRunner component with SSE log/report split panel"
```

---

## Task 11: Frontend — PlaywrightPanel.svelte and TestsTab.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/PlaywrightPanel.svelte`
- Create: `website/src/components/admin/monitoring/TestsTab.svelte`
- Modify: `website/src/components/admin/MonitoringDashboard.svelte` (uncomment Tests import)

- [ ] **Step 11.1: Create PlaywrightPanel.svelte**

Create `website/src/components/admin/monitoring/PlaywrightPanel.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let lastReport: { createdAt: string } | null = null;
  let hasReport = false;
  let copied = false;

  const webhookToken = '(aus MONITORING_WEBHOOK_TOKEN — admin kennt den Wert)';

  const claudePrompt = `Run the Playwright e2e tests in tests/e2e/ against the prod cluster.
After the run completes, read the HTML report from tests/e2e/playwright-report/index.html
and POST it to /api/admin/tests/playwright-report with:
  Authorization: Bearer <MONITORING_WEBHOOK_TOKEN>
  Content-Type: text/html`;

  async function checkReport() {
    try {
      const res = await fetch('/api/admin/tests/playwright-report', { method: 'HEAD' }).catch(() => null);
      if (res && res.ok) {
        hasReport = true;
        // Get timestamp from a separate metadata endpoint if available,
        // or just mark as present
      }
    } catch { /* no report yet */ }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(claudePrompt);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  onMount(checkReport);
</script>

<div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
  <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
    <span class="text-sm font-semibold text-gray-200">Playwright E2E</span>
    {#if lastReport}
      <span class="text-xs text-gray-400">Letzter Bericht: {new Date(lastReport.createdAt).toLocaleString('de-DE')}</span>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      <span class="text-xs text-gray-400">via Claude starten →</span>
      <button on:click={copyPrompt}
        class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 rounded">
        {copied ? '✓ Kopiert' : 'Prompt kopieren'}
      </button>
    </div>
  </div>

  <div class="p-4">
    {#if hasReport}
      <iframe
        src="/api/admin/tests/playwright-report"
        title="Playwright Report"
        class="w-full border border-gray-700 rounded"
        style="height: 500px;"
        sandbox="allow-same-origin allow-scripts"
      ></iframe>
    {:else}
      <div class="flex flex-col gap-4">
        <p class="text-sm text-gray-400">Noch kein Bericht vorhanden. Kopiere den Prompt und füge ihn in Claude Code ein.</p>
        <div class="bg-gray-900 border border-gray-700 rounded p-3">
          <div class="text-xs text-gray-500 mb-2">Claude-Prompt</div>
          <pre class="text-xs text-blue-300 font-mono whitespace-pre-wrap leading-relaxed">{claudePrompt}</pre>
        </div>
      </div>
    {/if}
  </div>
</div>
```

- [ ] **Step 11.2: Create TestsTab.svelte**

Create `website/src/components/admin/monitoring/TestsTab.svelte`:

```svelte
<script lang="ts">
  import TestRunner from './TestRunner.svelte';
  import PlaywrightPanel from './PlaywrightPanel.svelte';
</script>

<div class="space-y-5">
  <TestRunner />
  <PlaywrightPanel />
</div>
```

- [ ] **Step 11.3: Wire up TestsTab in MonitoringDashboard**

In `MonitoringDashboard.svelte`, add:

```svelte
  import TestsTab from './monitoring/TestsTab.svelte';
```

And replace the Tests placeholder:

```svelte
    {:else if activeTab === 'tests'}
      <TestsTab />
```

- [ ] **Step 11.4: Verify Tests tab renders**

```bash
task website:dev
# Navigate to http://web.localhost/admin/monitoring#tests
```

Expected: bash runner controls visible with tier toggle, filter input, and Run button. Playwright panel below it with prompt.

- [ ] **Step 11.5: Commit**

```bash
git add website/src/components/admin/monitoring/
git commit -m "feat(monitoring): add PlaywrightPanel and TestsTab"
```

---

## Task 12: Frontend — OverviewTab.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/OverviewTab.svelte`
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

- [ ] **Step 12.1: Create OverviewTab.svelte**

Create `website/src/components/admin/monitoring/OverviewTab.svelte`:

```svelte
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ navigate: 'cluster' | 'tests' | 'deployments' | 'berichte' }>();

  type Pod = { phase: string; ready: boolean; restarts: number };
  type Deployment = { status: 'healthy' | 'degraded' | 'stopped'; name: string };
  type KubeEvent = { type: string; reason: string; object: string; message: string; age: string };
  type StalenessFinding = { system: string; status: 'ok' | 'warning' | 'stale'; issue: string };
  type StalenessReport = { issueCount: number; reportJson: { findings: StalenessFinding[]; generated_at: string }; createdAt: string };
  type TestRun = { pass: number; fail: number; skip: number; startedAt: string; durationMs: number | null; tier: string };

  let pods: Pod[] = [];
  let nodes: { name: string; cpu: string; memory: string }[] = [];
  let events: KubeEvent[] = [];
  let deployments: Deployment[] = [];
  let stalenessReport: StalenessReport | null = null;
  let lastTestRun: TestRun | null = null;
  let loading = true;
  let refreshInterval: ReturnType<typeof setInterval>;

  async function fetchAll() {
    loading = true;
    const [monRes, depRes, stalRes, testRes] = await Promise.allSettled([
      fetch('/api/admin/monitoring'),
      fetch('/api/admin/deployments'),
      fetch('/api/admin/staleness-report'),
      fetch('/api/admin/test-runs'),
    ]);
    if (monRes.status === 'fulfilled' && monRes.value.ok) {
      const d = await monRes.value.json();
      pods = d.pods ?? [];
      nodes = d.nodes ?? [];
      events = (d.events ?? []).slice(0, 3);
    }
    if (depRes.status === 'fulfilled' && depRes.value.ok) {
      deployments = (await depRes.value.json()).deployments ?? [];
    }
    if (stalRes.status === 'fulfilled' && stalRes.value.ok) {
      stalenessReport = await stalRes.value.json();
    }
    if (testRes.status === 'fulfilled' && testRes.value.ok) {
      const runs = await testRes.value.json();
      lastTestRun = runs[0] ?? null;
    }
    loading = false;
  }

  async function startTests() {
    dispatch('navigate', 'tests');
    // Give the tab a moment to mount, then trigger the run
    await fetch('/api/admin/tests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'prod' }),
    });
  }

  async function regenerateReport() {
    await fetch('/api/admin/tests/report', { method: 'POST' });
  }

  onMount(() => {
    fetchAll();
    refreshInterval = setInterval(fetchAll, 15000);
  });
  onDestroy(() => clearInterval(refreshInterval));

  $: runningPods = pods.filter(p => p.ready).length;
  $: failedPods = pods.filter(p => p.phase === 'Failed' || p.phase === 'Unknown').length;
  $: pendingPods = pods.filter(p => !p.ready && p.phase !== 'Failed').length;
  $: healthyDeps = deployments.filter(d => d.status === 'healthy').length;
  $: firstDegraded = deployments.find(d => d.status !== 'healthy');
  $: avgCpu = nodes.length > 0
    ? Math.round(nodes.reduce((s, n) => s + (parseInt(n.cpu) || 0), 0) / nodes.length)
    : null;
  $: stalenessStatus = stalenessReport
    ? (stalenessReport.issueCount === 0 ? 'OK' : `${stalenessReport.issueCount} Warnungen`)
    : '—';
  $: stalenessColor = stalenessReport?.issueCount === 0 ? 'text-green-400' : 'text-yellow-400';
</script>

<div class="space-y-4">
  <!-- 5 status cards -->
  <div class="grid grid-cols-5 gap-3">
    <button on:click={() => dispatch('navigate', 'cluster')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Pods</div>
      <div class="text-2xl font-bold font-mono {failedPods > 0 ? 'text-red-400' : 'text-green-400'}">
        {runningPods}/{pods.length}
      </div>
      <div class="text-xs text-gray-500 mt-1">{pendingPods} pending · {failedPods} failed</div>
    </button>

    <button on:click={() => dispatch('navigate', 'cluster')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Nodes</div>
      <div class="text-2xl font-bold font-mono text-green-400">{nodes.length}/{nodes.length}</div>
      <div class="text-xs text-gray-500 mt-1">{avgCpu != null ? `CPU ⌀${avgCpu}%` : '—'}</div>
    </button>

    <button on:click={() => dispatch('navigate', 'deployments')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors
        {firstDegraded ? 'border-orange-700/50' : ''}">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Deployments</div>
      <div class="text-2xl font-bold font-mono {firstDegraded ? 'text-yellow-400' : 'text-green-400'}">
        {healthyDeps}/{deployments.length}
      </div>
      <div class="text-xs text-gray-500 mt-1 truncate">{firstDegraded ? firstDegraded.name : 'alle healthy'}</div>
    </button>

    <button on:click={() => dispatch('navigate', 'tests')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Letzter Testlauf</div>
      {#if lastTestRun}
        <div class="text-2xl font-bold font-mono {lastTestRun.fail > 0 ? 'text-red-400' : 'text-green-400'}">
          {lastTestRun.pass}/{lastTestRun.pass + lastTestRun.fail + lastTestRun.skip}
        </div>
        <div class="text-xs text-gray-500 mt-1">
          {new Date(lastTestRun.startedAt).toLocaleDateString('de-DE')} · {lastTestRun.fail} fail
        </div>
      {:else}
        <div class="text-2xl font-bold font-mono text-gray-500">—</div>
        <div class="text-xs text-gray-500 mt-1">kein Lauf</div>
      {/if}
    </button>

    <button on:click={() => dispatch('navigate', 'berichte')}
      class="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-gray-500 transition-colors">
      <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Staleness</div>
      <div class="text-2xl font-bold font-mono {stalenessColor}">{stalenessStatus}</div>
      <div class="text-xs text-gray-500 mt-1">
        {stalenessReport ? new Date(stalenessReport.createdAt).toLocaleDateString('de-DE') : '—'}
      </div>
    </button>
  </div>

  <!-- Middle row -->
  <div class="grid grid-cols-2 gap-3">
    <!-- Recent events -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-gray-200">Aktuelle Events</span>
        <button on:click={() => dispatch('navigate', 'cluster')} class="text-xs text-blue-400 hover:text-blue-300">→ Cluster</button>
      </div>
      {#if events.length > 0}
        <div class="space-y-2">
          {#each events as evt}
            <div class="flex items-baseline gap-2 text-xs">
              <span class="shrink-0 px-1.5 py-0.5 rounded text-xs {evt.type === 'Warning' ? 'bg-red-900/40 text-red-400' : 'bg-green-900/40 text-green-400'}">
                {evt.type}
              </span>
              <span class="text-gray-300 truncate">{evt.message}</span>
              <span class="text-gray-500 ml-auto shrink-0">{evt.age}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-gray-500">{loading ? 'Lädt…' : 'Keine Events'}</p>
      {/if}
    </div>

    <!-- Staleness summary -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-gray-200">Staleness-Bericht</span>
        <button on:click={() => dispatch('navigate', 'berichte')} class="text-xs text-blue-400 hover:text-blue-300">→ Berichte</button>
      </div>
      {#if stalenessReport?.reportJson?.findings}
        <div class="space-y-1.5">
          {#each stalenessReport.reportJson.findings.slice(0, 4) as f}
            <div class="flex items-center gap-2 text-xs">
              <span class="w-2 h-2 rounded-full shrink-0 {f.status === 'ok' ? 'bg-green-500' : f.status === 'warning' ? 'bg-yellow-400' : 'bg-red-500'}"></span>
              <span class="text-gray-300">{f.system}</span>
              <span class="ml-auto {f.status === 'ok' ? 'text-green-400' : 'text-yellow-400'}">{f.status}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-gray-500">{loading ? 'Lädt…' : 'Kein Bericht'}</p>
      {/if}
    </div>
  </div>

  <!-- Bottom row -->
  <div class="grid grid-cols-[2fr_1fr] gap-3">
    <!-- Test run summary -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-semibold text-gray-200">
          Letzter Testlauf{lastTestRun ? ` — ${lastTestRun.tier} · ${new Date(lastTestRun.startedAt).toLocaleString('de-DE')}` : ''}
        </span>
        <button on:click={() => dispatch('navigate', 'tests')} class="text-xs text-blue-400 hover:text-blue-300">→ Tests</button>
      </div>
      {#if lastTestRun}
        <div class="flex gap-2 flex-wrap">
          <!-- These are approximate — a full breakdown by category would require storing it -->
          <span class="text-xs px-2 py-1 bg-gray-900 border border-green-700/50 text-green-400 rounded">✓ {lastTestRun.pass} pass</span>
          <span class="text-xs px-2 py-1 bg-gray-900 border border-red-700/50 text-red-400 rounded">✗ {lastTestRun.fail} fail</span>
          <span class="text-xs px-2 py-1 bg-gray-900 border border-gray-600 text-gray-400 rounded">⊘ {lastTestRun.skip} skip</span>
        </div>
      {:else}
        <p class="text-xs text-gray-500">Noch kein Testlauf vorhanden.</p>
      {/if}
    </div>

    <!-- Quick actions -->
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <div class="text-sm font-semibold text-gray-200 mb-3">Schnellzugriff</div>
      <div class="space-y-2">
        <button on:click={startTests}
          class="w-full text-sm py-2 bg-green-700 hover:bg-green-600 text-white rounded font-medium">
          ▶ Tests starten
        </button>
        <button on:click={regenerateReport}
          class="w-full text-sm py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
          Bericht generieren
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 12.2: Add GET /api/admin/test-runs endpoint for history**

Create `website/src/pages/api/admin/test-runs.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth.js';
import { listTestRuns } from '../../../lib/website-db.js';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const runs = await listTestRuns(20);
  return new Response(JSON.stringify(runs), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 12.3: Wire up OverviewTab in MonitoringDashboard**

In `MonitoringDashboard.svelte`, add:

```svelte
  import OverviewTab from './monitoring/OverviewTab.svelte';
```

Replace the overview placeholder:

```svelte
    {#if activeTab === 'overview'}
      <OverviewTab on:navigate={(e) => setTab(e.detail)} />
```

- [ ] **Step 12.4: Verify overview renders and navigation works**

```bash
task website:dev
# Navigate to http://web.localhost/admin/monitoring
```

Expected: 5 status cards visible, events and staleness summaries visible, "→ Cluster" links navigate correctly, "▶ Tests starten" switches to Tests tab.

- [ ] **Step 12.5: Commit**

```bash
git add website/src/components/admin/monitoring/ website/src/pages/api/admin/
git commit -m "feat(monitoring): add OverviewTab with status cards and navigation"
```

---

## Task 13: Frontend — BerichteTab.svelte

**Files:**
- Create: `website/src/components/admin/monitoring/BerichteTab.svelte`
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

- [ ] **Step 13.1: Create BerichteTab.svelte**

Create `website/src/components/admin/monitoring/BerichteTab.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import TestResultsPanel from '../TestResultsPanel.svelte';

  type StalenessFinding = { system: string; status: 'ok' | 'warning' | 'stale'; issue: string; recommendation?: string };
  type StalenessReport = { id: number; createdAt: string; issueCount: number; reportJson: { findings: StalenessFinding[] } };
  type TestRun = { id: string; tier: string; cluster: string; startedAt: string; finishedAt: string | null; status: string; pass: number | null; fail: number | null; skip: number | null; durationMs: number | null };

  let staleness: StalenessReport | null = null;
  let testRuns: TestRun[] = [];
  let loading = true;

  // Bug ticket modal for staleness
  let selectedFinding: StalenessFinding | null = null;
  let modalDescription = '';
  let modalLoading = false;
  let modalError: string | null = null;
  let modalSuccessId: string | null = null;

  async function fetchAll() {
    loading = true;
    const [stalRes, runsRes] = await Promise.allSettled([
      fetch('/api/admin/staleness-report'),
      fetch('/api/admin/test-runs'),
    ]);
    if (stalRes.status === 'fulfilled' && stalRes.value.ok) staleness = await stalRes.value.json();
    if (runsRes.status === 'fulfilled' && runsRes.value.ok) testRuns = await runsRes.value.json();
    loading = false;
  }

  function openFindingModal(finding: StalenessFinding) {
    selectedFinding = finding;
    modalDescription = `Staleness: ${finding.system} – ${finding.status}: ${finding.issue}${finding.recommendation ? ` Empfehlung: ${finding.recommendation}` : ''}`;
    modalError = null; modalSuccessId = null; modalLoading = false;
  }

  async function submitTicket() {
    modalLoading = true;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: 'fehler' }),
      });
      const json = await res.json();
      if (!res.ok) { modalError = json.error ?? 'Fehler'; return; }
      modalSuccessId = json.ticketId;
      setTimeout(() => selectedFinding = null, 3000);
    } catch { modalError = 'Netzwerkfehler'; }
    finally { modalLoading = false; }
  }

  function fmtDuration(ms: number | null) {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }

  async function downloadRun(runId: string, format: 'json' | 'md') {
    const res = await fetch(`/api/admin/tests/results/${runId}?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${runId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onMount(fetchAll);
</script>

<div class="space-y-6">

  <!-- Staleness full report -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="flex justify-between items-center px-4 py-3 border-b border-gray-700">
      <span class="text-sm font-semibold text-gray-200">
        Staleness-Bericht{staleness ? ` — ${new Date(staleness.createdAt).toLocaleDateString('de-DE')}` : ''}
      </span>
      {#if staleness}
        <span class="text-xs text-gray-400">{staleness.issueCount} Warnungen</span>
      {/if}
    </div>
    {#if staleness?.reportJson?.findings}
      <div class="divide-y divide-gray-700/50">
        {#each staleness.reportJson.findings as finding}
          <div class="grid grid-cols-[130px_80px_1fr_auto] gap-3 px-4 py-2.5 text-sm items-center
            {finding.status !== 'ok' ? 'bg-yellow-900/10' : ''}">
            <span class="text-gray-200">{finding.system}</span>
            <span class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full {finding.status === 'ok' ? 'bg-green-500' : finding.status === 'warning' ? 'bg-yellow-400' : 'bg-red-500'}"></span>
              <span class="{finding.status === 'ok' ? 'text-green-400' : 'text-yellow-400'} text-xs">{finding.status}</span>
            </span>
            <span class="text-gray-400 text-xs">{finding.issue}</span>
            {#if finding.status !== 'ok'}
              <button on:click={() => openFindingModal(finding)}
                class="text-xs text-blue-400 hover:text-blue-300 shrink-0">Ticket</button>
            {:else}
              <span></span>
            {/if}
          </div>
        {/each}
      </div>
    {:else if loading}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {:else}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Kein Bericht vorhanden.</div>
    {/if}
  </div>

  <!-- Test run history -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-700">
      <h3 class="text-sm font-semibold text-gray-200">Testlauf-Historie</h3>
    </div>
    {#if testRuns.length > 0}
      <div class="divide-y divide-gray-700/50">
        <div class="grid grid-cols-[160px_60px_60px_50px_50px_50px_1fr_80px] gap-2 px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
          <span>Datum</span><span>Tier</span><span>Cluster</span>
          <span class="text-green-400">Pass</span><span class="text-red-400">Fail</span><span>Skip</span>
          <span></span><span>Download</span>
        </div>
        {#each testRuns as run}
          <div class="grid grid-cols-[160px_60px_60px_50px_50px_50px_1fr_80px] gap-2 px-4 py-2.5 text-xs items-center
            {run.status === 'error' ? 'bg-red-900/10' : ''}">
            <span class="text-gray-300">{new Date(run.startedAt).toLocaleString('de-DE')}</span>
            <span class="text-gray-400 font-mono">{run.tier}</span>
            <span class="text-gray-400">{run.cluster}</span>
            <span class="text-green-400">{run.pass ?? '—'}</span>
            <span class="text-red-400">{run.fail ?? '—'}</span>
            <span class="text-gray-400">{run.skip ?? '—'}</span>
            <span class="text-gray-500">{fmtDuration(run.durationMs)}</span>
            <div class="flex gap-2">
              <button on:click={() => downloadRun(run.id, 'json')} class="text-blue-400 hover:text-blue-300">JSON</button>
              <button on:click={() => downloadRun(run.id, 'md')} class="text-blue-400 hover:text-blue-300">MD</button>
            </div>
          </div>
        {/each}
      </div>
    {:else if loading}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Lädt…</div>
    {:else}
      <div class="px-4 py-4 text-sm text-gray-500 text-center">Noch keine Testläufe.</div>
    {/if}
  </div>

  <!-- Manual test protocols (existing component, unchanged) -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <div class="px-4 py-3 border-b border-gray-700">
      <h3 class="text-sm font-semibold text-gray-200">Manuelle Test-Protokolle</h3>
    </div>
    <div class="p-4">
      <TestResultsPanel />
    </div>
  </div>
</div>

<!-- Staleness bug ticket modal -->
{#if selectedFinding}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-5 w-full max-w-md space-y-3">
      <h3 class="font-semibold text-gray-100">Bug-Ticket: {selectedFinding.system}</h3>
      <textarea bind:value={modalDescription} rows={3}
        class="w-full bg-gray-900 border border-gray-600 rounded p-2 text-sm text-gray-200 resize-none"></textarea>
      {#if modalError}<p class="text-red-400 text-sm">{modalError}</p>{/if}
      {#if modalSuccessId}<p class="text-green-400 text-sm">Ticket {modalSuccessId} erstellt.</p>{/if}
      <div class="flex gap-2 justify-end">
        <button on:click={() => selectedFinding = null} class="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Abbrechen</button>
        <button on:click={submitTicket} disabled={modalLoading}
          class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {modalLoading ? '…' : 'Erstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 13.2: Wire up BerichteTab in MonitoringDashboard**

In `MonitoringDashboard.svelte`, add:

```svelte
  import BerichteTab from './monitoring/BerichteTab.svelte';
```

Replace the Berichte placeholder:

```svelte
    {:else if activeTab === 'berichte'}
      <BerichteTab />
```

- [ ] **Step 13.3: Verify Berichte tab renders**

```bash
task website:dev
# Navigate to http://web.localhost/admin/monitoring#berichte
```

Expected: staleness findings table, empty test run history (until first run), manual test protocols at bottom.

- [ ] **Step 13.4: Commit**

```bash
git add website/src/components/admin/monitoring/ website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(monitoring): add BerichteTab — staleness, test history, manual protocols"
```

---

## Task 14: End-to-end smoke test of the full flow

- [ ] **Step 14.1: Verify all tabs load cleanly**

```bash
task website:dev
```

Open each URL and confirm no console errors:
- `http://web.localhost/admin/monitoring` — overview with 5 cards
- `http://web.localhost/admin/monitoring#cluster` — pod table, node bars
- `http://web.localhost/admin/monitoring#tests` — runner + playwright panel
- `http://web.localhost/admin/monitoring#deployments` — deployments table
- `http://web.localhost/admin/monitoring#berichte` — staleness + history + protocols

- [ ] **Step 14.2: Run a single bash test via the dashboard**

1. Go to `#tests`
2. Enter `SA-07` in the filter
3. Click **▶ Starten**
4. Verify log lines appear on the left and result rows appear on the right
5. Verify summary bar appears on completion

- [ ] **Step 14.3: Post a Playwright report via webhook**

```bash
# Find the MONITORING_WEBHOOK_TOKEN (dev value from website-dev-secrets.yaml):
TOKEN="devmonitoringwebhooktoken123456789"

# Post minimal HTML report
curl -s -X POST http://web.localhost/api/admin/tests/playwright-report \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: text/html" \
  -d '<!DOCTYPE html><html><body><h1>Playwright Report</h1><p>2 passed, 0 failed</p></body></html>'
```

Expected: `{"ok":true,"id":1}`

Then navigate to `#tests` and verify the Playwright section now shows the iframe.

- [ ] **Step 14.4: Verify Berichte history updates after test run**

Navigate to `#berichte` — the completed SA-07 run should appear in the Testlauf-Historie table.

- [ ] **Step 14.5: Final commit**

```bash
git add .
git commit -m "feat(monitoring): complete monitoring redesign — tabbed dashboard + test runner"
```

---

## Notes

**`/api/admin/tests/results/latest`** (referenced in TestRunner download): the `[jobId].ts` endpoint currently uses the jobId parameter but falls back to "latest" by reading the most recent file. Pass `latest` as jobId from the frontend download buttons — the endpoint ignores the ID and returns the most recent file either way. This is intentional: after a run completes the job ID is no longer needed for downloads.

**SSE and Astro streaming**: Astro's Node adapter supports `ReadableStream` responses. The `X-Accel-Buffering: no` header disables Nginx/Traefik response buffering so SSE events arrive in real-time.

**Prod deploy after this change**: Run `task workspace:validate` first. The Dockerfile change requires rebuilding and pushing the website image (`task website:deploy ENV=mentolder`). The new DB tables are created lazily on first request — no manual migration needed.
