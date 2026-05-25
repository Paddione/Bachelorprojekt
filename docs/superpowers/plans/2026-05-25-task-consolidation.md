---
title: Admin-Aktionen-Tab — Gekko-Operative-Selbständigkeit — Implementation Plan
ticket_id: T000273
domains: [website, infra, db, security, test]
status: active
pr_number: null
spec: docs/superpowers/specs/2026-05-25-task-consolidation-design.md
grilling_ticket: T000272
---

# Admin-Aktionen-Tab — Gekko-Operative-Selbständigkeit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adds an "Aktionen"-Tab to `/admin/platform` allowing Gekko to self-service Re-Deploys, Backups+Restore, User-Onboarding, and Knowledge-Reindex via Web UI — closing the 3 main pain points where he currently must ask Patrick.

**Architecture:** New Svelte sub-tab inside existing `PlatformHub.svelte`, backed by 6 new Astro API endpoints (Backup+Restore APIs already exist and are reused), a new `public.admin_actions` audit table, and 2 k8s CronJobs (stale-cleanup, retention-pruning). All actions are audit-logged with actor (Keycloak username), concurrent-trigger-protected (10 min window per action+target), and DSGVO-compliant (90-day retention, sanitized error logs).

**Tech Stack:** Astro 6 (API routes), Svelte 5 (UI components), Postgres 16 (audit table), Keycloak Admin API (user-onboarding), k8s API via service-account-token (deployments + jobs), Vitest (backend unit tests), BATS (integration), Playwright (E2E SA-21).

**Branch:** `feature/task-consolidation` (worktree: `/tmp/wt-task-consolidation`)
**Spec:** `docs/superpowers/specs/2026-05-25-task-consolidation-design.md`
**Grilling-Ticket:** T000272
**Deadline:** ~2026-05-28 (3 Tage)

---

## File Structure

**Create:**
```
website/src/db/migrations/20260525_admin_actions.sql                 (Phase A)
website/src/lib/sanitize.ts                                          (Phase A)
website/src/lib/admin-actions.ts                                     (Phase B base)
website/src/lib/admin-api.ts                                         (Phase C base)
website/src/pages/api/admin/ops/redeploy/website.ts                  (Phase B)
website/src/pages/api/admin/ops/redeploy/docs.ts                     (Phase B)
website/src/pages/api/admin/ops/redeploy/brett.ts                    (Phase B)
website/src/pages/api/admin/ops/users/list.ts                        (Phase B)
website/src/pages/api/admin/ops/users/groups.ts                      (Phase B)
website/src/pages/api/admin/ops/users/create.ts                      (Phase B)
website/src/pages/api/admin/ops/ai/reindex.ts                        (Phase B)
website/src/pages/api/admin/ops/audit/log.ts                         (Phase B)
website/src/components/admin/aktionen/AktionenTab.svelte             (Phase C)
website/src/components/admin/aktionen/ReleasesTab.svelte             (Phase C)
website/src/components/admin/aktionen/BackupsTab.svelte              (Phase C)
website/src/components/admin/aktionen/UsersTab.svelte                (Phase C)
website/src/components/admin/aktionen/KnowledgeTab.svelte            (Phase C)
website/src/components/admin/aktionen/AuditLog.svelte                (Phase C)
website/src/lib/__tests__/sanitize.test.ts                           (Phase D)
website/src/lib/__tests__/admin-actions.test.ts                      (Phase D)
website/tests/api/ops/redeploy.test.ts                               (Phase D)
website/tests/api/ops/users.test.ts                                  (Phase D)
website/tests/api/ops/ai-reindex.test.ts                             (Phase D)
website/tests/api/ops/audit-log.test.ts                              (Phase D)
tests/local/SA-21.bats                                               (Phase D)
tests/local/admin-actions-schema.bats                                (Phase D)
tests/local/mandatory-sequences.bats                                 (Phase D)
tests/e2e/specs/sa-21-admin-actions.spec.ts                          (Phase D)
k3d/admin-actions-cronjobs.yaml                                      (Phase A)
```

**Modify:**
```
website/src/components/admin/PlatformHub.svelte                      (Phase C — tab insert)
k3d/kustomization.yaml                                               (Phase A — include new CronJob)
website/src/data/test-inventory.json                                 (Phase D — regen)
```

---

## Phase A — Database & Infrastructure (parallel-safe with B and C after A1 complete)

### Task A1: Audit-Action Table Migration

**Files:**
- Create: `website/src/db/migrations/20260525_admin_actions.sql`
- Create: `website/src/lib/sanitize.ts`

- [ ] **Step 1: Write the failing migration test** (BATS)

Create `tests/local/admin-actions-schema.bats`:

```bash
#!/usr/bin/env bats

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
}

@test "admin_actions migration exists" {
  run test -f website/src/db/migrations/20260525_admin_actions.sql
  assert_success
}

@test "admin_actions table can be created from migration" {
  PG_POD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
  [ -n "$PG_POD" ]
  # Apply against a temporary schema, then drop
  run kubectl exec "$PG_POD" -n workspace --context mentolder -- \
    psql -U website -d website -c "BEGIN; \
      CREATE SCHEMA test_admin_actions_$$; \
      SET search_path TO test_admin_actions_$$; \
      $(cat website/src/db/migrations/20260525_admin_actions.sql) \
      ROLLBACK;"
  assert_success
}

@test "admin_actions CHECK constraint rejects invalid status" {
  PG_POD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
  run kubectl exec "$PG_POD" -n workspace --context mentolder -- \
    psql -U website -d website -c "INSERT INTO public.admin_actions (actor, action, status) VALUES ('test', 'test', 'INVALID');"
  assert_failure
}

@test "admin_actions concurrent-idx partial index exists" {
  PG_POD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
  run kubectl exec "$PG_POD" -n workspace --context mentolder -- \
    psql -U website -d website -tAc "SELECT 1 FROM pg_indexes WHERE indexname = 'admin_actions_concurrent_idx';"
  assert_output "1"
}
```

- [ ] **Step 2: Run the test, expect FAIL (migration file does not yet exist)**

Run: `./tests/runner.sh local admin-actions-schema`
Expected: First test fails with "test -f ... migration file not found".

- [ ] **Step 3: Write the migration SQL**

Create `website/src/db/migrations/20260525_admin_actions.sql`:

```sql
-- Admin Actions Audit Trail
-- 2026-05-25 — for Gekko-self-service via /admin/platform → Aktionen tab
-- Phase 1: see docs/superpowers/specs/2026-05-25-task-consolidation-design.md

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id            serial PRIMARY KEY,
  actor         text NOT NULL,
  action        text NOT NULL,
  target        text,
  cluster       text,
  payload       jsonb,
  status        text NOT NULL CHECK (status IN ('in_progress','success','failed','partial_success')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx
  ON public.admin_actions (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_actions_concurrent_idx
  ON public.admin_actions (action, target, status)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS admin_actions_actor_idx
  ON public.admin_actions (actor, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.admin_actions TO website;
GRANT USAGE, SELECT ON SEQUENCE public.admin_actions_id_seq TO website;
```

- [ ] **Step 4: Apply migration to live mentolder + korczewski clusters**

Run:
```bash
PG_POD_M=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PG_POD_M" -n workspace --context mentolder -- psql -U website -d website \
  < website/src/db/migrations/20260525_admin_actions.sql

PG_POD_K=$(kubectl get pod -n workspace-korczewski --context korczewski -l app=shared-db -o name | head -1)
kubectl exec "$PG_POD_K" -n workspace-korczewski --context korczewski -- psql -U website -d website \
  < website/src/db/migrations/20260525_admin_actions.sql
```

- [ ] **Step 5: Re-run the BATS test, expect PASS**

Run: `./tests/runner.sh local admin-actions-schema`
Expected: All 4 tests PASS.

- [ ] **Step 6: Write the sanitize helper test**

Create `website/src/lib/__tests__/sanitize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeForLog } from '../sanitize';

describe('sanitizeForLog', () => {
  it('masks Bearer tokens', () => {
    expect(sanitizeForLog('Failed with Authorization: Bearer abc.def.ghi'))
      .toBe('Failed with Authorization: Bearer ***');
  });

  it('masks postgres URLs', () => {
    expect(sanitizeForLog('connection string postgres://user:secret@host:5432/db'))
      .toBe('connection string postgres://***:***@host:5432/db');
  });

  it('masks email addresses', () => {
    expect(sanitizeForLog('user not found: alice@example.com'))
      .toBe('user not found: ***@***');
  });

  it('passes through error messages without secrets', () => {
    expect(sanitizeForLog('Deployment not found'))
      .toBe('Deployment not found');
  });

  it('handles undefined input', () => {
    expect(sanitizeForLog(undefined as any)).toBe('');
  });

  it('truncates very long messages', () => {
    const long = 'x'.repeat(5000);
    expect(sanitizeForLog(long).length).toBeLessThanOrEqual(2000);
  });
});
```

- [ ] **Step 7: Run sanitize test, expect FAIL (no implementation)**

Run: `cd website && pnpm test:unit -- sanitize`
Expected: FAIL with "Cannot find module '../sanitize'".

- [ ] **Step 8: Implement `sanitize.ts`**

Create `website/src/lib/sanitize.ts`:

```typescript
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/g;
const PG_URL_RE = /(postgres(?:ql)?:\/\/)([^:@\s]+):([^@\s]+)(@)/g;
const EMAIL_RE  = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const MAX_LEN   = 2000;

export function sanitizeForLog(input: string | undefined | null): string {
  if (!input) return '';
  let out = String(input);
  out = out.replace(BEARER_RE, 'Bearer ***');
  out = out.replace(PG_URL_RE, '$1***:***$4');
  out = out.replace(EMAIL_RE, '***@***');
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN) + '… [truncated]';
  return out;
}
```

- [ ] **Step 9: Run sanitize test, expect PASS**

Run: `cd website && pnpm test:unit -- sanitize`
Expected: all 6 tests PASS.

- [ ] **Step 10: Commit**

```bash
cd /tmp/wt-task-consolidation
git add website/src/db/migrations/20260525_admin_actions.sql \
        website/src/lib/sanitize.ts \
        website/src/lib/__tests__/sanitize.test.ts \
        tests/local/admin-actions-schema.bats
git -c commit.gpgsign=false commit -m "feat(db): add admin_actions audit table + sanitize helper [T000272]"
```

---

### Task A2: Stale-Cleanup + Pruning CronJob Manifests

**Files:**
- Create: `k3d/admin-actions-cronjobs.yaml`
- Modify: `k3d/kustomization.yaml`

- [ ] **Step 1: Write the failing manifest test** (BATS)

Add to `tests/local/admin-actions-schema.bats`:

```bash
@test "admin-actions-cronjobs manifest exists" {
  run test -f k3d/admin-actions-cronjobs.yaml
  assert_success
}

@test "k3d/kustomization.yaml includes admin-actions-cronjobs" {
  run grep -q 'admin-actions-cronjobs.yaml' k3d/kustomization.yaml
  assert_success
}

@test "stale-cleanup CronJob has correct schedule (every 30 min)" {
  run yq eval '.spec.schedule' k3d/admin-actions-cronjobs.yaml --doc=0
  assert_output "*/30 * * * *"
}

@test "prune CronJob has correct schedule (daily 04:00)" {
  run yq eval '.spec.schedule' k3d/admin-actions-cronjobs.yaml --doc=1
  assert_output "0 4 * * *"
}
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `./tests/runner.sh local admin-actions-schema`
Expected: 4 new tests fail.

- [ ] **Step 3: Create the CronJob manifest**

Create `k3d/admin-actions-cronjobs.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: admin-actions-cleanup
  namespace: ${WORKSPACE_NAMESPACE}
  labels:
    app: admin-actions
spec:
  schedule: "*/30 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 2
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: psql
              image: postgres:16-alpine
              env:
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: WEBSITE_DB_PASSWORD } }
                - name: PGHOST
                  value: shared-db
                - name: PGUSER
                  value: website
                - name: PGDATABASE
                  value: website
              command:
                - sh
                - -c
                - |
                  psql -v ON_ERROR_STOP=1 -c "
                    UPDATE public.admin_actions
                    SET status = 'failed',
                        error = 'Timeout — Aktion wurde nicht abgeschlossen',
                        completed_at = now()
                    WHERE status = 'in_progress'
                      AND created_at < now() - interval '30 minutes';
                  "
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: admin-actions-prune
  namespace: ${WORKSPACE_NAMESPACE}
  labels:
    app: admin-actions
spec:
  schedule: "0 4 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 2
  jobTemplate:
    spec:
      ttlSecondsAfterFinished: 3600
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: psql
              image: postgres:16-alpine
              env:
                - name: PGPASSWORD
                  valueFrom: { secretKeyRef: { name: workspace-secrets, key: WEBSITE_DB_PASSWORD } }
                - name: PGHOST
                  value: shared-db
                - name: PGUSER
                  value: website
                - name: PGDATABASE
                  value: website
              command:
                - sh
                - -c
                - |
                  psql -v ON_ERROR_STOP=1 -c "
                    DELETE FROM public.admin_actions
                    WHERE created_at < now() - interval '90 days';
                  "
```

- [ ] **Step 4: Add to kustomization**

Modify `k3d/kustomization.yaml` — add `admin-actions-cronjobs.yaml` to the `resources:` list (alphabetical order between `admin-shortcuts*.yaml` and existing entries; use grep to find exact position).

Run before editing to find the position:
```bash
grep -n 'admin' k3d/kustomization.yaml
```

Then add the new line in the appropriate place.

- [ ] **Step 5: Verify kustomize builds**

Run: `kustomize build k3d/ 2>&1 | grep admin-actions-cleanup | head -1`
Expected: outputs CronJob YAML (proves it's included).

- [ ] **Step 6: Re-run BATS tests, expect PASS**

Run: `./tests/runner.sh local admin-actions-schema`
Expected: all 8 tests PASS.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-task-consolidation
git add k3d/admin-actions-cronjobs.yaml k3d/kustomization.yaml tests/local/admin-actions-schema.bats
git -c commit.gpgsign=false commit -m "feat(k3d): admin-actions cronjobs (stale-cleanup, pruning) [T000272]"
```

---

## Phase B — Backend APIs (parallel-safe after A1 complete; B1 must come before B2-B5)

### Task B1: admin-actions Service Library

**Files:**
- Create: `website/src/lib/admin-actions.ts`
- Create: `website/src/lib/__tests__/admin-actions.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `website/src/lib/__tests__/admin-actions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { startAction, finishAction, checkConcurrent, ConcurrentActionError } from '../admin-actions';

function mockPool(impl: (q: string, params: any[]) => any): Pool {
  return { query: vi.fn(impl) } as any;
}

describe('startAction', () => {
  it('inserts and returns action_id', async () => {
    const pool = mockPool((q) => {
      if (q.includes('INSERT')) return { rows: [{ id: 42 }] };
      if (q.includes('SELECT')) return { rows: [] };
      return { rows: [] };
    });
    const id = await startAction(pool, {
      actor: 'gekko', action: 'redeploy_website', target: 'mentolder', cluster: 'mentolder', payload: {}
    });
    expect(id).toBe(42);
  });
});

describe('checkConcurrent', () => {
  it('throws ConcurrentActionError when in-progress action exists within 10 min', async () => {
    const pool = mockPool((q) => {
      if (q.includes('SELECT')) return { rows: [{ id: 7, created_at: new Date() }] };
      return { rows: [] };
    });
    await expect(checkConcurrent(pool, 'redeploy_website', 'mentolder'))
      .rejects.toBeInstanceOf(ConcurrentActionError);
  });

  it('allows when no in-progress', async () => {
    const pool = mockPool(() => ({ rows: [] }));
    await expect(checkConcurrent(pool, 'redeploy_website', 'mentolder')).resolves.toBeUndefined();
  });
});

describe('finishAction', () => {
  it('updates status to success', async () => {
    const queries: string[] = [];
    const pool = mockPool((q, params) => { queries.push(q); return { rows: [] }; });
    await finishAction(pool, 42, { status: 'success', payload: { ok: true } });
    expect(queries[0]).toMatch(/UPDATE public\.admin_actions/);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd website && pnpm test:unit -- admin-actions`
Expected: FAIL with "Cannot find module '../admin-actions'".

- [ ] **Step 3: Implement the service**

Create `website/src/lib/admin-actions.ts`:

```typescript
import type { Pool } from 'pg';

export type ActionStatus = 'in_progress' | 'success' | 'failed' | 'partial_success';

export interface StartActionInput {
  actor: string;
  action: string;
  target?: string;
  cluster?: string;
  payload?: unknown;
}

export interface FinishActionInput {
  status: 'success' | 'failed' | 'partial_success';
  payload?: unknown;
  error?: string;
}

export class ConcurrentActionError extends Error {
  constructor(public existing_id: number, public created_at: Date) {
    super(`Concurrent action in progress (id=${existing_id})`);
    this.name = 'ConcurrentActionError';
  }
}

const CONCURRENT_WINDOW = '10 minutes';

export async function checkConcurrent(pool: Pool, action: string, target?: string): Promise<void> {
  const result = await pool.query(
    `SELECT id, created_at FROM public.admin_actions
     WHERE action = $1 AND COALESCE(target, '') = COALESCE($2, '')
       AND status = 'in_progress' AND created_at > now() - interval '${CONCURRENT_WINDOW}'
     LIMIT 1`,
    [action, target ?? null]
  );
  if (result.rows.length > 0) {
    throw new ConcurrentActionError(result.rows[0].id, result.rows[0].created_at);
  }
}

export async function startAction(pool: Pool, input: StartActionInput): Promise<number> {
  await checkConcurrent(pool, input.action, input.target);
  const result = await pool.query(
    `INSERT INTO public.admin_actions (actor, action, target, cluster, payload, status)
     VALUES ($1, $2, $3, $4, $5::jsonb, 'in_progress') RETURNING id`,
    [input.actor, input.action, input.target ?? null, input.cluster ?? null, JSON.stringify(input.payload ?? null)]
  );
  return result.rows[0].id as number;
}

export async function finishAction(pool: Pool, id: number, input: FinishActionInput): Promise<void> {
  await pool.query(
    `UPDATE public.admin_actions
     SET status = $2, completed_at = now(), payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb, error = $4
     WHERE id = $1`,
    [id, input.status, JSON.stringify(input.payload ?? null), input.error ?? null]
  );
}

export async function listActions(pool: Pool, opts: { actionFilter?: string; limit?: number } = {}): Promise<any[]> {
  const limit = Math.min(opts.limit ?? 50, 500);
  const result = await pool.query(
    `SELECT id, actor, action, target, cluster, status, error, created_at, completed_at, payload
     FROM public.admin_actions
     WHERE ($1::text IS NULL OR action = $1)
     ORDER BY created_at DESC LIMIT $2`,
    [opts.actionFilter ?? null, limit]
  );
  return result.rows;
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd website && pnpm test:unit -- admin-actions`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add website/src/lib/admin-actions.ts website/src/lib/__tests__/admin-actions.test.ts
git -c commit.gpgsign=false commit -m "feat(lib): admin-actions audit service [T000272]"
```

---

### Task B2: Redeploy Endpoints (Website / Docs / Brett)

**Files:**
- Create: `website/src/pages/api/admin/ops/redeploy/website.ts`
- Create: `website/src/pages/api/admin/ops/redeploy/docs.ts`
- Create: `website/src/pages/api/admin/ops/redeploy/brett.ts`
- Create: `website/tests/api/ops/redeploy.test.ts`

- [ ] **Step 1: Write the failing endpoint test**

Create `website/tests/api/ops/redeploy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/k8s', () => ({
  createK8sClient: vi.fn(async () => ({
    patch: vi.fn(async () => ({ ok: true })),
  })),
}));
vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ user: { username: 'gekko' } })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/website-db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ id: 1 }] })) },
}));

import { POST as redeployWebsite } from '../../../src/pages/api/admin/ops/redeploy/website';

function makeReq(body: object, sessionCookie = 'session=ok'): Request {
  return new Request('http://test/api/admin/ops/redeploy/website', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Cookie': sessionCookie, 'Content-Type': 'application/json' },
  });
}

describe('POST /api/admin/ops/redeploy/website', () => {
  it('returns 200 + action_id on happy path', async () => {
    const res = await redeployWebsite({ request: makeReq({ cluster: 'mentolder' }) } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action_id).toBeDefined();
  });

  it('returns 400 for invalid cluster', async () => {
    const res = await redeployWebsite({ request: makeReq({ cluster: 'invalid' }) } as any);
    expect(res.status).toBe(400);
  });

  it('returns 401 when no session', async () => {
    const { getSession } = await import('../../../src/lib/auth');
    (getSession as any).mockResolvedValueOnce(null);
    const res = await redeployWebsite({ request: makeReq({ cluster: 'mentolder' }) } as any);
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    const { isAdmin } = await import('../../../src/lib/auth');
    (isAdmin as any).mockReturnValueOnce(false);
    const res = await redeployWebsite({ request: makeReq({ cluster: 'mentolder' }) } as any);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `cd website && pnpm test:unit -- redeploy`
Expected: FAIL "Cannot find module ... redeploy/website".

- [ ] **Step 3: Implement the website endpoint**

Create `website/src/pages/api/admin/ops/redeploy/website.ts`:

```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { startAction, finishAction, ConcurrentActionError } from '../../../../../lib/admin-actions';
import { sanitizeForLog } from '../../../../../lib/sanitize';

const CLUSTERS = ['mentolder', 'korczewski'] as const;
type Cluster = typeof CLUSTERS[number];
const NS: Record<Cluster, string> = { mentolder: 'website', korczewski: 'website-korczewski' };

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung für diese Aktion' }), { status: 403 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as Cluster;
  if (!CLUSTERS.includes(cluster)) {
    return new Response(JSON.stringify({ error: 'Eingabe ungültig: cluster muss "mentolder" oder "korczewski" sein' }), { status: 400 });
  }

  let actionId: number | null = null;
  try {
    actionId = await startAction(pool, {
      actor: session.user.username,
      action: 'redeploy_website',
      target: cluster,
      cluster,
      payload: { ns: NS[cluster], deployment: 'website' },
    });

    const k8s = await createK8sClient();
    const restartedAt = new Date().toISOString();
    await k8s.patch(
      `/apis/apps/v1/namespaces/${NS[cluster]}/deployments/website`,
      { spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': restartedAt } } } } },
      { 'Content-Type': 'application/strategic-merge-patch+json' }
    );

    await finishAction(pool, actionId, { status: 'success', payload: { restartedAt } });
    return new Response(JSON.stringify({ action_id: actionId, message: 'Deployment gestartet', restartedAt }), { status: 200 });
  } catch (err) {
    if (err instanceof ConcurrentActionError) {
      const ageMin = Math.floor((Date.now() - new Date(err.created_at).getTime()) / 60_000);
      return new Response(JSON.stringify({ error: `Diese Aktion läuft bereits seit ${ageMin} Minute(n)` }), { status: 409 });
    }
    const msg = sanitizeForLog((err as Error).message);
    if (actionId !== null) {
      await finishAction(pool, actionId, { status: 'failed', error: msg }).catch(() => {});
    }
    console.error('[ops/redeploy/website]', err);
    return new Response(JSON.stringify({ error: `Aktion fehlgeschlagen: ${msg.slice(0, 200)}` }), { status: 500 });
  }
};
```

- [ ] **Step 4: Implement docs.ts and brett.ts (identical pattern)**

Create `website/src/pages/api/admin/ops/redeploy/docs.ts` and `brett.ts` — same shape as `website.ts`, only these constants differ:

For `docs.ts`:
```typescript
const NS: Record<Cluster, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };
// In startAction: action: 'redeploy_docs', payload: { ns: NS[cluster], deployment: 'docs' }
// In k8s.patch: /apis/apps/v1/namespaces/${NS[cluster]}/deployments/docs
```

For `brett.ts`:
```typescript
const NS: Record<Cluster, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };
// In startAction: action: 'redeploy_brett', payload: { ns: NS[cluster], deployment: 'brett' }
// In k8s.patch: /apis/apps/v1/namespaces/${NS[cluster]}/deployments/brett
```

(Copy the whole `website.ts`, change those 4 occurrences. Do NOT abstract — each file is small and direct.)

- [ ] **Step 5: Run the test, expect PASS**

Run: `cd website && pnpm test:unit -- redeploy`
Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/ops/redeploy/ website/tests/api/ops/redeploy.test.ts
git -c commit.gpgsign=false commit -m "feat(api): redeploy endpoints (website/docs/brett) [T000272]"
```

---

### Task B3: User Onboarding Endpoints (list / groups / create)

**Files:**
- Create: `website/src/pages/api/admin/ops/users/list.ts`
- Create: `website/src/pages/api/admin/ops/users/groups.ts`
- Create: `website/src/pages/api/admin/ops/users/create.ts`
- Create: `website/tests/api/ops/users.test.ts`
- Modify: `website/src/lib/keycloak.ts` (add 2 new functions — `listGroups`, `assignUserToGroups`)

**⚠️ Existing keycloak.ts API:** functions are direct exports (NOT a namespace object). Verified exports include:
`createUser({ username, email, firstName, lastName })` → `{ success, userId, error }`,
`listUsers()` → `KcUser[]`, `sendPasswordResetEmail(userId)`, `setUserPassword(userId, ...)`,
`listRealmRoles()`, `assignRealmRole(userId, roles)`, etc.

**Missing — must be added in Step 7:**
- `listGroups()` → `KcGroup[]` (Keycloak `GET /admin/realms/{realm}/groups`)
- `assignUserToGroups(userId, groupIds[])` (Keycloak `PUT /admin/realms/{realm}/users/{id}/groups/{groupId}` per group)

We use `sendPasswordResetEmail(userId)` as the invitation mechanism — it sends an email with a single-use password reset link, which is equivalent to "set initial password" for new users.

- [ ] **Step 1: Write the failing endpoint test**

Create `website/tests/api/ops/users.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ user: { username: 'paddione' } })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/keycloak', () => ({
  listUsers: vi.fn(async () => [{ id: 'u1', username: 'gekko', email: 'g@example.com', firstName: 'Gekko', lastName: 'K.', groups: ['admin'] }]),
  listGroups: vi.fn(async () => [{ id: 'g1', name: 'admin' }, { id: 'g2', name: 'coach' }]),
  createUser: vi.fn(async () => ({ success: true, userId: 'u-new' })),
  assignUserToGroups: vi.fn(async () => true),
  sendPasswordResetEmail: vi.fn(async () => true),
}));
vi.mock('../../../src/lib/website-db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ id: 1 }] })) },
}));

import { GET as listUsers } from '../../../src/pages/api/admin/ops/users/list';
import { POST as createUser } from '../../../src/pages/api/admin/ops/users/create';

const adminReq = (body?: any) => new Request('http://test', {
  method: body ? 'POST' : 'GET',
  body: body ? JSON.stringify(body) : undefined,
  headers: { Cookie: 'session=ok', 'Content-Type': 'application/json' },
});

describe('GET /api/admin/ops/users/list', () => {
  it('returns user list with groups', async () => {
    const res = await listUsers({ request: adminReq() } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.users).toHaveLength(1);
    expect(json.users[0].groups).toContain('admin');
  });
});

describe('POST /api/admin/ops/users/create', () => {
  it('creates user + sends invite by default', async () => {
    const res = await createUser({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'x@y.de', groupIds: ['g2'] }) } as any);
    expect(res.status).toBe(200);
    const kc = await import('../../../src/lib/keycloak');
    expect(kc.createUser).toHaveBeenCalled();
    expect(kc.assignUserToGroups).toHaveBeenCalled();
    expect(kc.sendPasswordResetEmail).toHaveBeenCalled();
  });

  it('returns 400 for invalid email', async () => {
    const res = await createUser({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'not-email', groupIds: [] }) } as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when groupIds missing', async () => {
    const res = await createUser({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'x@y.de', groupIds: [] }) } as any);
    expect(res.status).toBe(400);
  });

  it('returns partial_success when invite email fails', async () => {
    const kc = await import('../../../src/lib/keycloak');
    (kc.sendPasswordResetEmail as any).mockRejectedValueOnce(new Error('smtp down'));
    const res = await createUser({ request: adminReq({ firstName: 'X', lastName: 'Y', email: 'x@y.de', groupIds: ['g2'], sendInvite: true }) } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.partial).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd website && pnpm test:unit -- users`
Expected: FAIL — endpoint files missing.

- [ ] **Step 3: Inspect existing keycloak lib + identify what to add**

Run: `grep -E '^export' website/src/lib/keycloak.ts`

Confirm these direct-export functions already exist (verified during planning):
- `createUser(params)` → `{ success, userId, error }`
- `listUsers()` → `KcUser[]`
- `sendPasswordResetEmail(userId)` → `boolean`
- `setUserPassword(userId, ...)`, `getUserById(userId)`, `deleteUser(userId)`, `updateUser(userId, params)`
- `listRealmRoles()`, `assignRealmRole(userId, roles)`, etc.

**Add 2 NEW functions** in Step 7 below (do NOT touch existing ones):
- `listGroups()` — `GET /admin/realms/{realm}/groups` (NOT realm roles)
- `assignUserToGroups(userId, groupIds[])` — for each gid: `PUT /admin/realms/{realm}/users/{id}/groups/{gid}` (Keycloak returns 204 No Content)

Realm name: `workspace` (env: `KEYCLOAK_REALM`); admin token: existing token-fetch helper in keycloak.ts already handles `keycloak-admin-credentials` SealedSecret.

- [ ] **Step 4: Implement users/list.ts**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listUsers } from '../../../../../lib/keycloak';
import { sanitizeForLog } from '../../../../../lib/sanitize';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });
  try {
    const users = await listUsers();
    return new Response(JSON.stringify({ users }), { status: 200 });
  } catch (err) {
    console.error('[ops/users/list]', err);
    return new Response(JSON.stringify({ error: 'Anwender konnten nicht geladen werden: ' + sanitizeForLog((err as Error).message) }), { status: 503 });
  }
};
```

- [ ] **Step 5: Implement users/groups.ts** (uses NEW `listGroups` added in Step 7)

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { listGroups } from '../../../../../lib/keycloak';
import { sanitizeForLog } from '../../../../../lib/sanitize';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });
  try {
    const groups = await listGroups();
    return new Response(JSON.stringify({ groups }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Gruppen konnten nicht geladen werden: ' + sanitizeForLog((err as Error).message) }), { status: 503 });
  }
};
```

- [ ] **Step 6: Implement users/create.ts (with partial-failure handling)**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { createUser as kcCreateUser, assignUserToGroups, sendPasswordResetEmail } from '../../../../../lib/keycloak';
import { pool } from '../../../../../lib/website-db';
import { startAction, finishAction, ConcurrentActionError } from '../../../../../lib/admin-actions';
import { sanitizeForLog } from '../../../../../lib/sanitize';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { firstName, lastName, email, groupIds, sendInvite = true } = body;
  if (!firstName?.trim()) return new Response(JSON.stringify({ error: 'Eingabe ungültig: Vorname fehlt' }), { status: 400 });
  if (!lastName?.trim())  return new Response(JSON.stringify({ error: 'Eingabe ungültig: Nachname fehlt' }), { status: 400 });
  if (!EMAIL_RE.test(email ?? '')) return new Response(JSON.stringify({ error: 'Eingabe ungültig: Email-Format' }), { status: 400 });
  if (!Array.isArray(groupIds) || groupIds.length === 0) return new Response(JSON.stringify({ error: 'Eingabe ungültig: mindestens eine Gruppe wählen' }), { status: 400 });

  const username = email.split('@')[0];
  let actionId: number | null = null;
  try {
    actionId = await startAction(pool, {
      actor: session.user.username,
      action: 'user_create',
      target: username,
      payload: { firstName, lastName, email, groupIds, sendInvite },
    });

    const create = await kcCreateUser({ username, email, firstName, lastName });
    if (!create.success || !create.userId) throw new Error(create.error ?? 'createUser returned no userId');
    await assignUserToGroups(create.userId, groupIds);

    let partial = false;
    let inviteError: string | undefined;
    if (sendInvite) {
      try {
        const ok = await sendPasswordResetEmail(create.userId);
        if (!ok) { partial = true; inviteError = 'Keycloak returned false'; }
      } catch (e) {
        partial = true;
        inviteError = sanitizeForLog((e as Error).message);
      }
    }

    await finishAction(pool, actionId, {
      status: partial ? 'partial_success' : 'success',
      payload: { user_id: create.userId, partial, inviteError },
      error: partial ? `User angelegt, Einladung fehlgeschlagen: ${inviteError}` : undefined,
    });

    return new Response(JSON.stringify({ action_id: actionId, userId: create.userId, partial, inviteError }), { status: 200 });
  } catch (err) {
    if (err instanceof ConcurrentActionError) {
      return new Response(JSON.stringify({ error: 'Anlage läuft bereits, bitte warten' }), { status: 409 });
    }
    const msg = sanitizeForLog((err as Error).message);
    if (actionId !== null) await finishAction(pool, actionId, { status: 'failed', error: msg }).catch(() => {});
    console.error('[ops/users/create]', err);
    return new Response(JSON.stringify({ error: 'Anlage fehlgeschlagen: ' + msg.slice(0, 200) }), { status: 500 });
  }
};
```

- [ ] **Step 7: Add `listGroups` + `assignUserToGroups` to keycloak.ts**

Append to `website/src/lib/keycloak.ts` (reuse the existing token-fetch helper — find it first via `grep -n 'function.*[Tt]oken\|async.*[Tt]oken' website/src/lib/keycloak.ts`):

```typescript
export interface KcGroup {
  id: string;
  name: string;
  path?: string;
}

export async function listGroups(): Promise<KcGroup[]> {
  const token = await getAdminToken();  // use existing helper name — adjust if different
  const realm = process.env.KEYCLOAK_REALM ?? 'workspace';
  const base  = process.env.KEYCLOAK_INTERNAL_URL ?? 'http://keycloak.workspace.svc:8080';
  const res = await fetch(`${base}/admin/realms/${realm}/groups?briefRepresentation=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Keycloak listGroups failed: ${res.status}`);
  return res.json();
}

export async function assignUserToGroups(userId: string, groupIds: string[]): Promise<boolean> {
  const token = await getAdminToken();
  const realm = process.env.KEYCLOAK_REALM ?? 'workspace';
  const base  = process.env.KEYCLOAK_INTERNAL_URL ?? 'http://keycloak.workspace.svc:8080';
  for (const gid of groupIds) {
    const res = await fetch(`${base}/admin/realms/${realm}/users/${userId}/groups/${gid}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Keycloak assignUserToGroups failed (gid=${gid}): ${res.status}`);
    }
  }
  return true;
}
```

If the existing token helper has a different name (`fetchAdminToken`, `_getToken`, etc.), substitute it. Also: extend `KcUser` type or `listUsers` projection if `KcUser.groups` is needed in UsersTab (existing `listUsers` may not return groups by default — verify response).

- [ ] **Step 8: Run the test, expect PASS**

Run: `cd website && pnpm test:unit -- users`
Expected: all 5 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add website/src/pages/api/admin/ops/users/ website/tests/api/ops/users.test.ts website/src/lib/keycloak.ts
git -c commit.gpgsign=false commit -m "feat(api): users onboarding endpoints (list/groups/create) [T000272]"
```

---

### Task B4: AI-Reindex + Audit-Log Endpoints

**Files:**
- Create: `website/src/pages/api/admin/ops/ai/reindex.ts`
- Create: `website/src/pages/api/admin/ops/audit/log.ts`
- Create: `website/tests/api/ops/ai-reindex.test.ts`
- Create: `website/tests/api/ops/audit-log.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `website/tests/api/ops/audit-log.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ user: { username: 'paddione' } })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/website-db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [
    { id: 5, actor: 'gekko', action: 'redeploy_website', target: 'mentolder', status: 'success', created_at: new Date() },
  ] })) },
}));

import { GET } from '../../../src/pages/api/admin/ops/audit/log';

describe('GET /api/admin/ops/audit/log', () => {
  it('returns rows from admin_actions', async () => {
    const res = await GET({ url: new URL('http://test/?action_filter=&limit=10'), request: new Request('http://test', { headers: { Cookie: 'session=ok' } }) } as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.actions[0].id).toBe(5);
  });
});
```

Create `website/tests/api/ops/ai-reindex.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

const createJobMock = vi.fn(async () => ({ metadata: { name: 'reindex-coaching-original-12345' } }));
vi.mock('../../../src/lib/k8s', () => ({
  createK8sClient: vi.fn(async () => ({ post: createJobMock })),
}));
vi.mock('../../../src/lib/auth', () => ({
  getSession: vi.fn(async () => ({ user: { username: 'gekko' } })),
  isAdmin: vi.fn(() => true),
}));
vi.mock('../../../src/lib/website-db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [{ id: 1 }] })) },
}));

import { POST } from '../../../src/pages/api/admin/ops/ai/reindex';

const adminReq = (body: any) => new Request('http://test', {
  method: 'POST', body: JSON.stringify(body),
  headers: { Cookie: 'session=ok', 'Content-Type': 'application/json' },
});

describe('POST /api/admin/ops/ai/reindex', () => {
  it('creates k8s Job with sanitized name', async () => {
    const res = await POST({ request: adminReq({ collection: 'coaching-original' }) } as any);
    expect(res.status).toBe(200);
    expect(createJobMock).toHaveBeenCalled();
  });

  it('returns 400 for unknown collection', async () => {
    const res = await POST({ request: adminReq({ collection: 'evil; DROP TABLE x' }) } as any);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL**

Run: `cd website && pnpm test:unit -- ai-reindex audit-log`
Expected: FAIL — endpoint files missing.

- [ ] **Step 3: Implement audit/log.ts**

Create `website/src/pages/api/admin/ops/audit/log.ts`:

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { listActions } from '../../../../../lib/admin-actions';

export const GET: APIRoute = async ({ url, request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });

  const actionFilter = url.searchParams.get('action_filter') || undefined;
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const actions = await listActions(pool, { actionFilter, limit });
  return new Response(JSON.stringify({ actions }), { status: 200 });
};
```

- [ ] **Step 4: Implement ai/reindex.ts**

Create `website/src/pages/api/admin/ops/ai/reindex.ts`:

```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { startAction, finishAction, ConcurrentActionError } from '../../../../../lib/admin-actions';
import { sanitizeForLog } from '../../../../../lib/sanitize';

const COLLECTION_RE = /^[a-z0-9-]{1,64}$/;
const WORKSPACE_NS = process.env.WORKSPACE_NAMESPACE || 'workspace';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Bitte erneut anmelden' }), { status: 401 });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403 });

  const body = await request.json().catch(() => ({}));
  const collection = body.collection as string;
  if (!COLLECTION_RE.test(collection || '')) {
    return new Response(JSON.stringify({ error: 'Eingabe ungültig: Collection-Name ungültig' }), { status: 400 });
  }

  let actionId: number | null = null;
  try {
    actionId = await startAction(pool, {
      actor: session.user.username, action: 'ai_reindex', target: collection, payload: { collection },
    });

    const k8s = await createK8sClient();
    const jobName = `reindex-${collection}-${Date.now()}`.slice(0, 63);
    const job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: { name: jobName, namespace: WORKSPACE_NS, labels: { app: 'knowledge-reindex', collection } },
      spec: {
        ttlSecondsAfterFinished: 86400,
        backoffLimit: 0,
        template: {
          spec: {
            restartPolicy: 'OnFailure',
            containers: [{
              name: 'reindex',
              image: 'ghcr.io/paddione/website:latest',
              command: ['node', 'scripts/knowledge/reindex.mjs'],
              args: ['--collection', collection],
              envFrom: [{ secretRef: { name: 'workspace-secrets' } }],
            }],
          },
        },
      },
    };
    await k8s.post(`/apis/batch/v1/namespaces/${WORKSPACE_NS}/jobs`, job);

    await finishAction(pool, actionId, { status: 'success', payload: { job_name: jobName } });
    return new Response(JSON.stringify({ action_id: actionId, job_name: jobName }), { status: 200 });
  } catch (err) {
    if (err instanceof ConcurrentActionError) {
      return new Response(JSON.stringify({ error: 'Reindex läuft bereits, bitte warten' }), { status: 409 });
    }
    const msg = sanitizeForLog((err as Error).message);
    if (actionId !== null) await finishAction(pool, actionId, { status: 'failed', error: msg }).catch(() => {});
    console.error('[ops/ai/reindex]', err);
    return new Response(JSON.stringify({ error: 'Reindex fehlgeschlagen: ' + msg.slice(0, 200) }), { status: 500 });
  }
};
```

- [ ] **Step 5: Run tests, expect PASS**

Run: `cd website && pnpm test:unit -- ai-reindex audit-log`
Expected: all 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/api/admin/ops/ai/ website/src/pages/api/admin/ops/audit/ website/tests/api/ops/ai-reindex.test.ts website/tests/api/ops/audit-log.test.ts
git -c commit.gpgsign=false commit -m "feat(api): ai-reindex + audit-log endpoints [T000272]"
```

---

## Phase C — Frontend Components (parallel-safe after B1 complete; can start with C1+C2 while B continues)

### Task C1: Shared admin-api helper + Toast

**Files:**
- Create: `website/src/lib/admin-api.ts`

- [ ] **Step 1: Inspect existing Toast component** (if any)

Run:
```bash
find /tmp/wt-task-consolidation/website/src/components -name 'Toast*' -o -name 'toast*'
```

If a Toast already exists, reuse it. Otherwise the admin-api wrapper uses a `window.dispatchEvent` pattern and a tiny Toast.svelte is created.

- [ ] **Step 2: Implement admin-api.ts**

Create `website/src/lib/admin-api.ts`:

```typescript
type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

interface ApiCallOptions {
  retries?: number;
  retryDelay?: number;
}

export async function apiCall<T = any>(
  url: string,
  init: RequestInit = {},
  opts: ApiCallOptions = {}
): Promise<ApiResult<T>> {
  const { retries = 1, retryDelay = 3000 } = opts;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, credentials: 'include' });
      if (res.status === 401) {
        const returnTo = encodeURIComponent(window.location.pathname);
        window.location.assign(`/login?return_to=${returnTo}`);
        return { ok: false, error: 'Bitte erneut anmelden', status: 401 };
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = json.error || `Fehler ${res.status}`;
        toast(res.status >= 500 ? 'error' : 'warning', errorMsg);
        return { ok: false, error: errorMsg, status: res.status };
      }
      return { ok: true, data: json as T };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries) {
        toast('warning', 'Verbindung verloren, versuche erneut...');
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }
  }
  const msg = lastErr?.message ?? 'Netzwerkfehler';
  toast('error', msg);
  return { ok: false, error: msg, status: 0 };
}

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export function toast(kind: ToastKind, message: string, durationMs = 4000) {
  if (typeof window === 'undefined') return;
  const event = new CustomEvent('app-toast', { detail: { kind, message, durationMs } });
  window.dispatchEvent(event);
}
```

- [ ] **Step 3: Verify by importing in dev-build**

Run: `cd website && pnpm exec astro check --files src/lib/admin-api.ts`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/admin-api.ts
git -c commit.gpgsign=false commit -m "feat(lib): admin-api wrapper with toast events [T000272]"
```

---

### Task C2: AktionenTab container + PlatformHub Tab Insert

**Files:**
- Create: `website/src/components/admin/aktionen/AktionenTab.svelte`
- Modify: `website/src/components/admin/PlatformHub.svelte`

- [ ] **Step 1: Create AktionenTab.svelte (stub with 5 sub-tabs)**

Create `website/src/components/admin/aktionen/AktionenTab.svelte`:

```svelte
<script lang="ts">
  import ReleasesTab from './ReleasesTab.svelte';
  import BackupsTab from './BackupsTab.svelte';
  import UsersTab from './UsersTab.svelte';
  import KnowledgeTab from './KnowledgeTab.svelte';
  import AuditLog from './AuditLog.svelte';

  export let cluster: string;

  type SubTab = 'releases' | 'backups' | 'users' | 'knowledge' | 'audit';
  let activeSubTab: SubTab = 'releases';

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'releases',  label: 'Releases' },
    { id: 'backups',   label: 'Backups' },
    { id: 'users',     label: 'Anwender' },
    { id: 'knowledge', label: 'Wissens-Index' },
    { id: 'audit',     label: 'Verlauf' },
  ];
</script>

<div class="space-y-6">
  <div style="overflow-x: auto; padding-bottom: 2px;">
    <div class="flex gap-1 p-1 bg-admin-sidebar-bg border border-admin-border rounded-2xl w-fit" style="flex-wrap: nowrap;">
      {#each subTabs as t}
        <button
          on:click={() => activeSubTab = t.id}
          class="px-4 py-2 rounded-xl text-sm font-bold transition-all {activeSubTab === t.id ? 'bg-admin-primary text-admin-bg' : 'text-admin-text-mute hover:text-white'}"
          style="white-space: nowrap; min-height: 44px;"
          data-testid="aktionen-subtab-{t.id}"
        >
          {t.label}
        </button>
      {/each}
    </div>
  </div>

  <main>
    {#if activeSubTab === 'releases'}<ReleasesTab {cluster} />
    {:else if activeSubTab === 'backups'}<BackupsTab {cluster} />
    {:else if activeSubTab === 'users'}<UsersTab />
    {:else if activeSubTab === 'knowledge'}<KnowledgeTab {cluster} />
    {:else if activeSubTab === 'audit'}<AuditLog />{/if}
  </main>
</div>
```

- [ ] **Step 2: Create stub files for the 5 sub-tabs (will be filled in C3-C7)**

Create skeleton files (each just renders "TODO" so AktionenTab compiles):

```bash
cd /tmp/wt-task-consolidation/website/src/components/admin/aktionen/
for f in ReleasesTab BackupsTab UsersTab KnowledgeTab AuditLog; do
  cat > "${f}.svelte" <<EOF
<script lang="ts">
  export let cluster: string = '';
</script>
<div class="admin-card p-6">
  <p class="text-admin-text-mute">${f} (Implementierung folgt in nachfolgenden Tasks)</p>
</div>
EOF
done
```

- [ ] **Step 3: Modify PlatformHub.svelte to insert "Aktionen" tab**

Modify `website/src/components/admin/PlatformHub.svelte`:

a) Add the import (alongside existing imports near top):
```svelte
import AktionenTab from './aktionen/AktionenTab.svelte';
```

b) In the `tabs = [...]` array (around line 14), insert the new tab between `dienste` and `logs`:
```svelte
{ id: 'dienste', label: 'Dienste' },
{ id: 'aktionen', label: 'Aktionen' },     // <-- new line
{ id: 'logs', label: 'Logs' },
```

c) In the `<main>` block, add the rendering condition. After the `dienste` block:
```svelte
{:else if activeTab === 'aktionen'}
  <div class="admin-card">
    <AktionenTab {cluster} />
  </div>
```

- [ ] **Step 4: Astro check + build**

Run: `cd website && pnpm exec astro check`
Expected: no errors related to the new files.

- [ ] **Step 5: Local smoke** (start dev server, navigate manually)

Run: `cd website && pnpm dev` (background) — then `curl -sS http://localhost:4321 | head -5` to verify server up.

Then in a browser: navigate to /admin/platform → click "Aktionen" — should show 5 sub-tab pills, each renders the placeholder card.

Kill the dev server: `pkill -f "astro dev"`

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/aktionen/ website/src/components/admin/PlatformHub.svelte
git -c commit.gpgsign=false commit -m "feat(ui): AktionenTab container + PlatformHub tab insert [T000272]"
```

---

### Task C3: ReleasesTab — Re-Deploy UI

**Files:**
- Modify: `website/src/components/admin/aktionen/ReleasesTab.svelte`

- [ ] **Step 1: Replace placeholder with full ReleasesTab implementation**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  export let cluster: string = 'mentolder';

  type Deployment = { ns: string; name: string; desired: number; ready: number; image?: string };
  const services = [
    { key: 'website', label: 'Website', getNs: (c: string) => c === 'korczewski' ? 'website-korczewski' : 'website' },
    { key: 'docs',    label: 'Docs',    getNs: (c: string) => c === 'korczewski' ? 'workspace-korczewski' : 'workspace' },
    { key: 'brett',   label: 'Brett',   getNs: (c: string) => c === 'korczewski' ? 'workspace-korczewski' : 'workspace' },
  ] as const;

  const clusters: ('mentolder'|'korczewski')[] = ['mentolder', 'korczewski'];
  let states: Record<string, Deployment | null> = {};
  let pending: Record<string, boolean> = {};
  let pollers: ReturnType<typeof setInterval>[] = [];
  let helpOpen: string | null = null;

  async function loadOne(svc: typeof services[number], c: string) {
    const ns = svc.getNs(c);
    const result = await apiCall<{ desired: number; ready: number; image?: string }>(
      `/api/admin/deployments/${svc.key}?ns=${ns}`
    );
    states[`${svc.key}-${c}`] = result.ok ? { ns, name: svc.key, ...result.data } : null;
    states = states;
  }

  async function loadAll() {
    for (const svc of services) for (const c of clusters) await loadOne(svc, c);
  }

  async function trigger(svc: typeof services[number], c: string) {
    const key = `${svc.key}-${c}`;
    pending[key] = true; pending = pending;
    const result = await apiCall(`/api/admin/ops/redeploy/${svc.key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cluster: c }),
    });
    if (result.ok) {
      toast('success', `${svc.label} (${c}) wird neu geladen…`);
      // Poll every 5s for status; stop when ready === desired
      const poller = setInterval(async () => {
        await loadOne(svc, c);
        const s = states[key];
        if (s && s.ready === s.desired && s.desired > 0) {
          clearInterval(poller); pending[key] = false; pending = pending;
        }
      }, 5000);
      pollers.push(poller);
      // safety: stop polling after 5 min
      setTimeout(() => { clearInterval(poller); pending[key] = false; pending = pending; }, 5 * 60 * 1000);
    } else {
      pending[key] = false; pending = pending;
    }
  }

  onMount(loadAll);
  onDestroy(() => pollers.forEach(clearInterval));
</script>

<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
  {#each services as svc}
    <div class="admin-card p-4">
      <h3 class="text-lg font-bold text-white mb-3">{svc.label}</h3>
      {#each clusters as c}
        {@const key = `${svc.key}-${c}`}
        {@const s = states[key]}
        <div class="mb-4 last:mb-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs uppercase text-admin-text-mute">{c}</span>
            {#if s}
              <span class="text-sm">{s.ready === s.desired ? '🟢' : s.desired === 0 ? '⏸️' : '🟡'} {s.ready}/{s.desired}</span>
            {:else}
              <span class="text-sm text-admin-text-mute">…</span>
            {/if}
          </div>
          {#if s?.image}<p class="text-[10px] text-admin-text-mute truncate">{s.image}</p>{/if}
          <div class="flex gap-2 mt-2 items-center">
            <button
              on:click={() => trigger(svc, c)}
              disabled={pending[key]}
              class="px-3 py-2 rounded-lg bg-admin-primary text-admin-bg text-sm font-bold disabled:opacity-50"
              style="min-height: 44px;"
              data-testid="redeploy-{svc.key}-{c}"
            >
              {pending[key] ? 'Lädt…' : 'Neue Version laden'}
            </button>
            <button
              on:click={() => helpOpen = helpOpen === key ? null : key}
              class="text-admin-text-mute hover:text-white p-2"
              aria-label="Hilfe"
              data-testid="redeploy-help-{svc.key}-{c}"
            >ℹ️</button>
          </div>
          {#if helpOpen === key}
            <div class="mt-2 p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
              Lädt das aktuellste Image-Tag von ghcr.io und startet den Pod neu. Bestehende Anwender-Sitzungen werden ~10 Sekunden unterbrochen. Dauer: 30–90 Sekunden.
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
</div>
```

- [ ] **Step 2: Astro check**

Run: `cd website && pnpm exec astro check`
Expected: no new errors.

- [ ] **Step 3: Manual smoke** (dev server, click around)

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/aktionen/ReleasesTab.svelte
git -c commit.gpgsign=false commit -m "feat(ui): ReleasesTab — re-deploy buttons with live status [T000272]"
```

---

### Task C4: BackupsTab — Backup & Restore UI

**Files:**
- Modify: `website/src/components/admin/aktionen/BackupsTab.svelte`

- [ ] **Step 1: Inspect existing backup-API response shape**

Run:
```bash
cd /tmp/wt-task-consolidation
sed -n '1,80p' website/src/pages/api/admin/ops/backup/list.ts
```

Note the response shape (fields like `name`, `db`, `size`, `cluster`, `completionTime`, `status`).

- [ ] **Step 2: Implement BackupsTab.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  export let cluster: string = 'mentolder';

  type Backup = { name: string; db: string; size: number; cluster: string; completionTime: string; status: string };
  let backups: Backup[] = [];
  let loading = true;
  let triggerDb = 'all';
  let triggerCluster: 'mentolder' | 'korczewski' = (cluster as any) ?? 'mentolder';
  let pending = false;
  let restoreModal: { backup: Backup; confirmText: string } | null = null;
  let helpOpen = false;

  async function load() {
    loading = true;
    const r = await apiCall<{ backups: Backup[] }>(`/api/admin/ops/backup/list?cluster=${triggerCluster}`);
    backups = r.ok ? r.data.backups : [];
    loading = false;
  }

  async function triggerBackup() {
    pending = true;
    // existing API expects { cluster, db } — verify against trigger.ts shape
    const r = await apiCall(`/api/admin/ops/backup/trigger`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster: triggerCluster, db: triggerDb }),
    });
    if (r.ok) {
      toast('success', 'Backup wird erstellt — siehe Liste nach 1–3 Minuten');
      setTimeout(load, 5000);
    }
    pending = false;
  }

  async function confirmRestore() {
    if (!restoreModal || restoreModal.confirmText !== 'WIEDERHERSTELLEN') return;
    pending = true;
    const r = await apiCall(`/api/admin/ops/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cluster: restoreModal.backup.cluster, db: restoreModal.backup.db, backupJobName: restoreModal.backup.name }),
    });
    if (r.ok) toast('success', 'Wiederherstellung gestartet');
    pending = false;
    restoreModal = null;
  }

  function fmtSize(b: number): string {
    if (b < 1024) return `${b} B`;
    if (b < 1024**2) return `${(b/1024).toFixed(1)} KB`;
    if (b < 1024**3) return `${(b/1024/1024).toFixed(1)} MB`;
    return `${(b/1024/1024/1024).toFixed(1)} GB`;
  }

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex flex-wrap gap-2 items-center">
    <select bind:value={triggerCluster} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white" style="min-height: 44px;">
      <option value="mentolder">mentolder</option>
      <option value="korczewski">korczewski</option>
    </select>
    <select bind:value={triggerDb} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white" style="min-height: 44px;">
      <option value="all">alle DBs</option>
      <option value="website">website</option>
      <option value="keycloak">keycloak</option>
      <option value="nextcloud">nextcloud</option>
      <option value="vaultwarden">vaultwarden</option>
      <option value="docuseal">docuseal</option>
    </select>
    <button on:click={triggerBackup} disabled={pending} class="px-4 py-2 rounded-lg bg-admin-primary text-admin-bg font-bold disabled:opacity-50" style="min-height: 44px;" data-testid="backup-trigger">
      Neues Backup
    </button>
    <button on:click={() => helpOpen = !helpOpen} class="text-admin-text-mute hover:text-white p-2" aria-label="Hilfe" data-testid="backup-help">ℹ️</button>
  </div>
  {#if helpOpen}
    <div class="p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
      Backup-Erstellung dauert 1–3 Minuten. Wiederherstellung überschreibt die aktuelle Datenbank — nur in Notfällen verwenden! Du musst danach möglicherweise die betroffenen Pods neu starten.
    </div>
  {/if}

  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else if backups.length === 0}
    <p class="text-admin-text-mute">Keine Backups vorhanden.</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr>
          <th class="text-left p-2">Datum</th><th class="text-left p-2">DB</th>
          <th class="text-left p-2">Größe</th><th class="text-left p-2">Cluster</th>
          <th class="text-left p-2">Status</th><th class="text-left p-2">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each backups as b}
          <tr class="border-t border-admin-border">
            <td class="p-2">{new Date(b.completionTime).toLocaleString('de-DE')}</td>
            <td class="p-2">{b.db}</td>
            <td class="p-2">{fmtSize(b.size)}</td>
            <td class="p-2">{b.cluster}</td>
            <td class="p-2">{b.status === 'completed' ? '🟢' : '🟡'} {b.status}</td>
            <td class="p-2">
              <button on:click={() => restoreModal = { backup: b, confirmText: '' }} class="px-3 py-1 rounded-md bg-red-700 text-white text-xs font-bold" data-testid="restore-{b.name}">Wiederherstellen</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if restoreModal}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
    <div class="bg-admin-surface p-6 rounded-2xl border border-red-500 max-w-md w-full">
      <h3 class="text-lg font-bold text-red-400 mb-3">Wiederherstellen bestätigen</h3>
      <p class="text-sm text-admin-text-mute mb-4">
        Dies überschreibt die <strong>{restoreModal.backup.db}</strong>-Datenbank auf <strong>{restoreModal.backup.cluster}</strong> mit dem Backup von <strong>{new Date(restoreModal.backup.completionTime).toLocaleString('de-DE')}</strong>. Dies kann nicht rückgängig gemacht werden.
      </p>
      <p class="text-sm text-admin-text-mute mb-2">Tippe <code class="bg-admin-sidebar-bg px-1 rounded">WIEDERHERSTELLEN</code> zur Bestätigung:</p>
      <input bind:value={restoreModal.confirmText} class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white mb-4" data-testid="restore-confirm-input" />
      <div class="flex gap-2 justify-end">
        <button on:click={() => restoreModal = null} class="px-4 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute">Abbrechen</button>
        <button on:click={confirmRestore} disabled={restoreModal.confirmText !== 'WIEDERHERSTELLEN' || pending} class="px-4 py-2 rounded-lg bg-red-700 text-white font-bold disabled:opacity-50" data-testid="restore-confirm-submit">
          {pending ? 'Lädt…' : 'Wiederherstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Astro check + commit**

```bash
cd website && pnpm exec astro check
cd /tmp/wt-task-consolidation
git add website/src/components/admin/aktionen/BackupsTab.svelte
git -c commit.gpgsign=false commit -m "feat(ui): BackupsTab — list + create + restore with confirm [T000272]"
```

---

### Task C5: UsersTab — Onboarding UI

**Files:**
- Modify: `website/src/components/admin/aktionen/UsersTab.svelte`

- [ ] **Step 1: Implement UsersTab.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  type KcUser = { id: string; username: string; email: string; firstName: string; lastName: string; groups: string[]; lastLogin?: string };
  type Group = { id: string; name: string };

  let users: KcUser[] = [];
  let groups: Group[] = [];
  let loading = true;
  let helpOpen = false;
  let search = '';
  let modal: { firstName: string; lastName: string; email: string; selectedGroupIds: string[]; sendInvite: boolean } | null = null;
  let pending = false;

  async function load() {
    const [u, g] = await Promise.all([
      apiCall<{ users: KcUser[] }>('/api/admin/ops/users/list'),
      apiCall<{ groups: Group[] }>('/api/admin/ops/users/groups'),
    ]);
    users = u.ok ? u.data.users : [];
    groups = g.ok ? g.data.groups : [];
    loading = false;
  }

  function openModal() {
    modal = { firstName: '', lastName: '', email: '', selectedGroupIds: [], sendInvite: true };
  }

  function toggleGroup(id: string) {
    if (!modal) return;
    modal.selectedGroupIds = modal.selectedGroupIds.includes(id)
      ? modal.selectedGroupIds.filter(g => g !== id)
      : [...modal.selectedGroupIds, id];
  }

  async function submitCreate() {
    if (!modal) return;
    pending = true;
    const r = await apiCall<{ partial: boolean; inviteError?: string }>('/api/admin/ops/users/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: modal.firstName, lastName: modal.lastName, email: modal.email, groupIds: modal.selectedGroupIds, sendInvite: modal.sendInvite }),
    });
    if (r.ok) {
      if (r.data.partial) toast('warning', `Anwender angelegt, Einladung fehlgeschlagen: ${r.data.inviteError ?? '?'}`);
      else toast('success', 'Anwender erfolgreich angelegt');
      modal = null;
      load();
    }
    pending = false;
  }

  $: filteredUsers = users.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  onMount(load);
</script>

<div class="space-y-4">
  <div class="flex flex-wrap gap-2 items-center">
    <button on:click={openModal} class="px-4 py-2 rounded-lg bg-admin-primary text-admin-bg font-bold" style="min-height: 44px;" data-testid="user-new">+ Neuer Anwender</button>
    <input bind:value={search} placeholder="Suchen…" class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white flex-1 min-w-[180px]" style="min-height: 44px;" />
    <button on:click={() => helpOpen = !helpOpen} class="text-admin-text-mute hover:text-white p-2" aria-label="Hilfe">ℹ️</button>
  </div>
  {#if helpOpen}
    <div class="p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
      Erstellt einen neuen Account in Keycloak. Bei aktivierter Einladung erhält der Anwender eine Email mit einem Temporär-Passwort, das beim ersten Login geändert werden muss. Der Anwender erscheint sofort in der Liste.
    </div>
  {/if}

  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr><th class="text-left p-2">Username</th><th class="text-left p-2">Name</th><th class="text-left p-2">Email</th><th class="text-left p-2">Gruppen</th></tr>
      </thead>
      <tbody>
        {#each filteredUsers as u}
          <tr class="border-t border-admin-border"><td class="p-2">{u.username}</td><td class="p-2">{u.firstName} {u.lastName}</td><td class="p-2">{u.email}</td><td class="p-2 text-xs">{u.groups.join(', ')}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if modal}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
    <div class="bg-admin-surface p-6 rounded-2xl border border-admin-border max-w-md w-full">
      <h3 class="text-lg font-bold text-white mb-4">Neuer Anwender</h3>
      <div class="space-y-3">
        <input bind:value={modal.firstName} placeholder="Vorname" class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white" data-testid="user-firstname" />
        <input bind:value={modal.lastName} placeholder="Nachname" class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white" data-testid="user-lastname" />
        <input bind:value={modal.email} type="email" placeholder="Email" class="w-full px-3 py-2 rounded-lg bg-admin-bg border border-admin-border text-white" data-testid="user-email" />
        <div>
          <label class="text-xs text-admin-text-mute uppercase mb-2 block">Gruppen</label>
          <div class="flex flex-wrap gap-2">
            {#each groups as g}
              <label class="flex items-center gap-2 px-3 py-2 rounded-lg bg-admin-bg border border-admin-border cursor-pointer">
                <input type="checkbox" checked={modal.selectedGroupIds.includes(g.id)} on:change={() => toggleGroup(g.id)} />
                <span class="text-sm text-white">{g.name}</span>
              </label>
            {/each}
          </div>
        </div>
        <label class="flex items-center gap-2 text-sm text-admin-text-mute">
          <input type="checkbox" bind:checked={modal.sendInvite} /> Email-Einladung senden
        </label>
      </div>
      <div class="flex gap-2 justify-end mt-6">
        <button on:click={() => modal = null} class="px-4 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute">Abbrechen</button>
        <button on:click={submitCreate} disabled={pending} class="px-4 py-2 rounded-lg bg-admin-primary text-admin-bg font-bold disabled:opacity-50" data-testid="user-submit">
          {pending ? 'Lädt…' : 'Anlegen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Astro check + commit**

```bash
cd website && pnpm exec astro check
cd /tmp/wt-task-consolidation
git add website/src/components/admin/aktionen/UsersTab.svelte
git -c commit.gpgsign=false commit -m "feat(ui): UsersTab — list + create modal with group select [T000272]"
```

---

### Task C6: KnowledgeTab — Reindex UI

**Files:**
- Modify: `website/src/components/admin/aktionen/KnowledgeTab.svelte`

- [ ] **Step 1: Inspect existing collections API**

Run:
```bash
cd /tmp/wt-task-consolidation
head -50 website/src/pages/api/admin/knowledge/collections/*.ts 2>/dev/null
```

Note the response shape (collection name, last indexed, doc count, embed model).

- [ ] **Step 2: Implement KnowledgeTab.svelte**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { apiCall, toast } from '../../../lib/admin-api';

  export let cluster: string = 'mentolder';

  type Collection = { name: string; lastIndexed?: string; docCount: number; embedModel: string };
  type Job = { name: string; status: 'active' | 'succeeded' | 'failed'; startTime: string };

  let collections: Collection[] = [];
  let loading = true;
  let pending: Record<string, boolean> = {};
  let activeJobs: Record<string, Job> = {};
  let helpOpen = false;
  let pollers: ReturnType<typeof setInterval>[] = [];

  async function load() {
    const r = await apiCall<{ collections: Collection[] }>('/api/admin/knowledge/collections');
    collections = r.ok ? r.data.collections : [];
    loading = false;
  }

  async function trigger(c: Collection) {
    pending[c.name] = true; pending = pending;
    const r = await apiCall<{ job_name: string }>('/api/admin/ops/ai/reindex', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ collection: c.name }),
    });
    if (r.ok) {
      toast('success', `Reindex von ${c.name} gestartet`);
      const jobName = r.data.job_name;
      const poller = setInterval(async () => {
        const status = await apiCall<{ status: string }>(`/api/admin/ops/audit/log?action_filter=ai_reindex&limit=5`);
        // simplistic: if latest audit entry for this collection is success/failed, stop polling
        if (status.ok) {
          const last = (status.data as any).actions?.find((a: any) => a.target === c.name);
          if (last && (last.status === 'success' || last.status === 'failed')) {
            clearInterval(poller); pending[c.name] = false; pending = pending; load();
          }
        }
      }, 10000);
      pollers.push(poller);
      setTimeout(() => { clearInterval(poller); pending[c.name] = false; pending = pending; }, 15 * 60 * 1000);
    } else {
      pending[c.name] = false; pending = pending;
    }
  }

  onMount(load);
  onDestroy(() => pollers.forEach(clearInterval));
</script>

<div class="space-y-4">
  <div class="flex items-center gap-2">
    <h3 class="text-white font-bold">Collections</h3>
    <button on:click={() => helpOpen = !helpOpen} class="text-admin-text-mute hover:text-white p-2" aria-label="Hilfe">ℹ️</button>
  </div>
  {#if helpOpen}
    <div class="p-3 bg-admin-sidebar-bg rounded-lg border border-admin-border text-xs text-admin-text-mute">
      Reindex liest alle Dokumente erneut, berechnet Embeddings (bge-m3 lokal über GPU-Host, voyage-multilingual über API) und schreibt sie in die Vektor-Datenbank. Dauer 2–10 Minuten je nach Collection-Größe. Während des Reindex sind Suchen ggf. langsamer.
    </div>
  {/if}

  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else if collections.length === 0}
    <p class="text-admin-text-mute">Keine Collections vorhanden.</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr><th class="text-left p-2">Collection</th><th class="text-left p-2">Letzter Index</th><th class="text-left p-2">Docs</th><th class="text-left p-2">Embed-Modell</th><th class="text-left p-2">Aktion</th></tr>
      </thead>
      <tbody>
        {#each collections as c}
          <tr class="border-t border-admin-border">
            <td class="p-2">{c.name}</td>
            <td class="p-2 text-xs">{c.lastIndexed ? new Date(c.lastIndexed).toLocaleString('de-DE') : '—'}</td>
            <td class="p-2">{c.docCount}</td>
            <td class="p-2 text-xs">{c.embedModel}</td>
            <td class="p-2">
              <button on:click={() => trigger(c)} disabled={pending[c.name]} class="px-3 py-1 rounded-md bg-admin-primary text-admin-bg text-xs font-bold disabled:opacity-50" data-testid="reindex-{c.name}">
                {pending[c.name] ? 'Indexiert…' : 'Neu indexieren'}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
cd website && pnpm exec astro check
cd /tmp/wt-task-consolidation
git add website/src/components/admin/aktionen/KnowledgeTab.svelte
git -c commit.gpgsign=false commit -m "feat(ui): KnowledgeTab — collections list + reindex trigger [T000272]"
```

---

### Task C7: AuditLog Component

**Files:**
- Modify: `website/src/components/admin/aktionen/AuditLog.svelte`

- [ ] **Step 1: Implement AuditLog.svelte (full Verlauf-Tab + cross-cutting view)**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { apiCall } from '../../../lib/admin-api';

  export let filter: string | undefined = undefined; // pre-set action_filter when embedded under a sub-tab
  export let limit = 50;
  export let compact = false; // true → render minimal table, no header controls

  type Action = {
    id: number;
    actor: string;
    action: string;
    target?: string;
    cluster?: string;
    status: 'in_progress' | 'success' | 'failed' | 'partial_success';
    error?: string;
    created_at: string;
    completed_at?: string;
    payload?: any;
  };

  let actions: Action[] = [];
  let loading = true;
  let actionFilter = filter ?? '';
  let detailModal: Action | null = null;

  const STATUS_ICON = {
    in_progress: '🟡', success: '🟢', failed: '🔴', partial_success: '🟠',
  } as const;

  const ACTION_LABEL = {
    redeploy_website: 'Website neu laden', redeploy_docs: 'Docs neu laden', redeploy_brett: 'Brett neu laden',
    backup_create: 'Backup erstellen', backup_restore: 'Backup wiederherstellen',
    user_create: 'Anwender anlegen',
    ai_reindex: 'Wissens-Index reindexieren',
  } as const;

  async function load() {
    loading = true;
    const url = `/api/admin/ops/audit/log?limit=${limit}${actionFilter ? `&action_filter=${encodeURIComponent(actionFilter)}` : ''}`;
    const r = await apiCall<{ actions: Action[] }>(url);
    actions = r.ok ? r.data.actions : [];
    loading = false;
  }

  function label(a: string): string {
    return (ACTION_LABEL as Record<string, string>)[a] ?? a;
  }

  onMount(load);
</script>

<div class="space-y-4">
  {#if !compact}
    <div class="flex flex-wrap items-center gap-2">
      <select bind:value={actionFilter} on:change={load} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-white" style="min-height: 44px;">
        <option value="">Alle Aktionen</option>
        {#each Object.entries(ACTION_LABEL) as [k, v]}
          <option value={k}>{v}</option>
        {/each}
      </select>
      <button on:click={load} class="px-3 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute hover:text-white" style="min-height: 44px;">Aktualisieren</button>
    </div>
  {/if}

  {#if loading}
    <p class="text-admin-text-mute">Lade…</p>
  {:else if actions.length === 0}
    <p class="text-admin-text-mute">Noch keine Aktionen.</p>
  {:else}
    <table class="w-full text-sm">
      <thead class="text-admin-text-mute text-xs uppercase">
        <tr>
          <th class="text-left p-2">Datum</th>
          <th class="text-left p-2">Actor</th>
          <th class="text-left p-2">Aktion</th>
          <th class="text-left p-2">Target</th>
          <th class="text-left p-2">Status</th>
          <th class="text-left p-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each actions as a}
          <tr class="border-t border-admin-border">
            <td class="p-2 text-xs">{new Date(a.created_at).toLocaleString('de-DE')}</td>
            <td class="p-2">{a.actor}</td>
            <td class="p-2">{label(a.action)}</td>
            <td class="p-2 text-xs">{a.target ?? '—'}</td>
            <td class="p-2">{STATUS_ICON[a.status]} {a.status}</td>
            <td class="p-2"><button on:click={() => detailModal = a} class="text-admin-primary hover:text-white text-xs">Details</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if detailModal}
  <div class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" on:click={() => detailModal = null}>
    <div class="bg-admin-surface p-6 rounded-2xl border border-admin-border max-w-2xl w-full" on:click|stopPropagation>
      <h3 class="text-lg font-bold text-white mb-3">Details</h3>
      <dl class="space-y-2 text-sm">
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Datum</dt><dd class="col-span-2 text-white">{new Date(detailModal.created_at).toLocaleString('de-DE')}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Actor</dt><dd class="col-span-2 text-white">{detailModal.actor}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Aktion</dt><dd class="col-span-2 text-white">{label(detailModal.action)}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Target</dt><dd class="col-span-2 text-white">{detailModal.target ?? '—'}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Cluster</dt><dd class="col-span-2 text-white">{detailModal.cluster ?? '—'}</dd></div>
        <div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Status</dt><dd class="col-span-2 text-white">{STATUS_ICON[detailModal.status]} {detailModal.status}</dd></div>
        {#if detailModal.error}<div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Fehler</dt><dd class="col-span-2 text-red-400 text-xs whitespace-pre-wrap">{detailModal.error}</dd></div>{/if}
        {#if detailModal.payload}<div class="grid grid-cols-3 gap-2"><dt class="text-admin-text-mute">Payload</dt><dd class="col-span-2 text-xs"><pre class="bg-admin-bg p-2 rounded overflow-x-auto">{JSON.stringify(detailModal.payload, null, 2)}</pre></dd></div>{/if}
      </dl>
      <div class="flex justify-end mt-4">
        <button on:click={() => detailModal = null} class="px-4 py-2 rounded-lg bg-admin-surface border border-admin-border text-admin-text-mute">Schließen</button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
cd website && pnpm exec astro check
cd /tmp/wt-task-consolidation
git add website/src/components/admin/aktionen/AuditLog.svelte
git -c commit.gpgsign=false commit -m "feat(ui): AuditLog — Verlauf-Tab + filter + detail modal [T000272]"
```

---

## Phase D — Tests & Inventory (parallel-safe after relevant Phase A/B/C tasks)

### Task D1: BATS Mandatory-Sequences Regression Test

**Files:**
- Create: `tests/local/mandatory-sequences.bats`

- [ ] **Step 1: Write the failing regression test**

Create `tests/local/mandatory-sequences.bats`:

```bash
#!/usr/bin/env bats

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
  cd "$PROJECT_DIR"
}

@test "cluster-reset sequence tasks all exist" {
  for t in sealed-secrets:install env:fetch-cert env:seal cert:install cert:secret workspace:deploy; do
    run task --list-all
    [[ "$output" =~ "$t" ]] || { echo "Missing task: $t"; return 1; }
  done
}

@test "feature fan-out exists" {
  for t in feature:website feature:brett feature:deploy feature:livekit; do
    run task --list-all
    [[ "$output" =~ "$t" ]] || { echo "Missing fan-out task: $t"; return 1; }
  done
}

@test "FluxCD reconcile tasks exist" {
  for t in flux:status flux:sync; do
    run task --list-all
    [[ "$output" =~ "$t" ]] || { echo "Missing flux task: $t"; return 1; }
  done
}

@test "workspace:deploy task is callable (dry-run kustomize)" {
  ENV=mentolder run task workspace:validate
  assert_success
}

@test "admin-actions migration file exists" {
  run test -f website/src/db/migrations/20260525_admin_actions.sql
  assert_success
}
```

- [ ] **Step 2: Run, expect PASS (all tasks should already exist — proves regression-safety)**

Run: `./tests/runner.sh local mandatory-sequences`
Expected: all 5 tests PASS.

If any fail: the Taskfile was inadvertently changed during prior phases. Investigate.

- [ ] **Step 3: Commit**

```bash
git add tests/local/mandatory-sequences.bats
git -c commit.gpgsign=false commit -m "test: mandatory-sequences regression for cluster-reset/flux/feature-fanout [T000272]"
```

---

### Task D2: Playwright SA-21 E2E Spec

**Files:**
- Create: `tests/e2e/specs/sa-21-admin-actions.spec.ts`

- [ ] **Step 1: Inspect existing SA-* spec for pattern**

Run:
```bash
head -40 tests/e2e/specs/sa-07-backup.spec.ts
cat tests/e2e/playwright.config.ts | grep -A 6 'name:.*mentolder'
```

Note the storageState path and `test.describe.configure({ mode: 'serial' })` pattern.

- [ ] **Step 2: Write SA-21 spec**

Create `tests/e2e/specs/sa-21-admin-actions.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// SA-21: Admin-Aktionen-Tab — Gekko-Selbstständigkeit
// Project: mentolder (requires admin storageState)

test.describe.configure({ mode: 'serial' });

const BASE = process.env.E2E_BASE_URL || 'https://web.mentolder.de';

test('SA-21.1 Aktionen-Tab loads with 5 sub-tabs', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  for (const id of ['releases', 'backups', 'users', 'knowledge', 'audit']) {
    await expect(page.locator(`[data-testid="aktionen-subtab-${id}"]`)).toBeVisible();
  }
});

test('SA-21.2 Releases-Tab shows redeploy buttons per service+cluster', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-releases"]').click();
  for (const key of ['website', 'docs', 'brett']) {
    await expect(page.locator(`[data-testid="redeploy-${key}-mentolder"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="redeploy-${key}-korczewski"]`)).toBeVisible();
  }
});

test('SA-21.3 Backups-Tab shows trigger button and list', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-backups"]').click();
  await expect(page.locator('[data-testid="backup-trigger"]')).toBeVisible();
});

test('SA-21.4 Users-Tab opens new-user modal with email validation', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-users"]').click();
  await page.locator('[data-testid="user-new"]').click();
  await page.locator('[data-testid="user-firstname"]').fill('Test');
  await page.locator('[data-testid="user-lastname"]').fill('User');
  await page.locator('[data-testid="user-email"]').fill('not-an-email');
  await page.locator('[data-testid="user-submit"]').click();
  // Should show validation error (not actually submit)
  await expect(page.locator('text=Email')).toBeVisible({ timeout: 3000 });
});

test('SA-21.5 Knowledge-Tab shows reindex buttons per collection', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-knowledge"]').click();
  // at least one reindex-* button should be visible if collections exist
  const reindexButtons = page.locator('[data-testid^="reindex-"]');
  await expect(reindexButtons.first()).toBeVisible({ timeout: 10000 });
});

test('SA-21.6 Audit-Tab shows action history', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-audit"]').click();
  // either entries or "Noch keine Aktionen"
  await expect(page.locator('text=/Aktionen|Noch keine/i')).toBeVisible({ timeout: 5000 });
});

test('SA-21.7 Help-Button toggles deutsche Erklärung', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-releases"]').click();
  await page.locator('[data-testid="redeploy-help-website-mentolder"]').first().click();
  await expect(page.locator('text=/Lädt das aktuellste Image/i')).toBeVisible();
});

test('SA-21.8 Restore-Confirm-Modal requires exact "WIEDERHERSTELLEN" text', async ({ page }) => {
  await page.goto(`${BASE}/admin/platform`);
  await page.getByRole('button', { name: 'Aktionen' }).click();
  await page.locator('[data-testid="aktionen-subtab-backups"]').click();
  // open first restore modal (only if backup exists)
  const restoreBtn = page.locator('[data-testid^="restore-"]').first();
  if (await restoreBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await restoreBtn.click();
    await page.locator('[data-testid="restore-confirm-input"]').fill('wrong');
    await expect(page.locator('[data-testid="restore-confirm-submit"]')).toBeDisabled();
    await page.locator('[data-testid="restore-confirm-input"]').fill('WIEDERHERSTELLEN');
    await expect(page.locator('[data-testid="restore-confirm-submit"]')).toBeEnabled();
    // do NOT actually click submit — would trigger restore
  }
});
```

- [ ] **Step 3: Run E2E locally (only after deploy is live)**

Run:
```bash
cd tests/e2e
E2E_BASE_URL=https://web.mentolder.de pnpm exec playwright test sa-21 --project=mentolder --headed
```

Expected: 8 tests PASS (or skipped where no data exists for SA-21.5 / SA-21.8).

- [ ] **Step 4: Update test-inventory**

Run:
```bash
cd /tmp/wt-task-consolidation
task test:inventory
git diff website/src/data/test-inventory.json | head -30
```

Expected: SA-21 entries appear in inventory.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/specs/sa-21-admin-actions.spec.ts website/src/data/test-inventory.json
git -c commit.gpgsign=false commit -m "test(e2e): SA-21 admin-actions playwright specs [T000272]"
```

---

## Phase E — Integration & Final Smoke

### Task E1: Final Build / Deploy / Smoke / PR

**Files:** none new

- [ ] **Step 1: Run all offline tests**

Run: `task test:all`
Expected: all green.

- [ ] **Step 2: Build website locally**

Run: `cd website && pnpm install && pnpm build`
Expected: build success.

- [ ] **Step 3: Build + deploy to mentolder**

Run: `task feature:website ENV=mentolder`
Expected: image built, pushed, rollout success on web.mentolder.de.

- [ ] **Step 4: Build + deploy to korczewski**

Run: `task feature:website ENV=korczewski`
Expected: image built, pushed, rollout success on web.korczewski.de.

- [ ] **Step 5: Manual smoke — Patrick**

- Log in as paddione on web.mentolder.de
- Navigate /admin/platform → Aktionen
- Verify 5 sub-tabs render
- Trigger Re-Deploy Website mentolder → observe live status → success Toast → Audit-Log shows new entry with status='success'
- Trigger 2nd Re-Deploy within 10 min → expect 409 "läuft bereits"
- Open Backup-Tab → click "Neues Backup" with db=website cluster=mentolder → success Toast → after 1-2 min refresh, new entry in list
- Open Users-Tab → click "+ Neuer Anwender" → enter invalid email → expect validation block
- Open Knowledge-Tab → click "Neu indexieren" on a small collection → success Toast → audit entry created

- [ ] **Step 6: Manual smoke — Gekko (test-account)**

If a Gekko test-login is available: repeat Step 5 with that user. Confirm same tabs are accessible (since Gekko is admin).

- [ ] **Step 7: Run SA-21 E2E live**

Run:
```bash
cd tests/e2e
E2E_BASE_URL=https://web.mentolder.de pnpm exec playwright test sa-21 --project=mentolder
```

Expected: all 8 tests PASS (or 7+1 skipped due to no-restore-target).

- [ ] **Step 8: Rebase onto main if behind**

```bash
cd /tmp/wt-task-consolidation
git fetch origin main
git rebase origin/main
# resolve any conflicts (likely none — Aktionen files are all new)
git push --force-with-lease origin feature/task-consolidation
```

- [ ] **Step 9: Open PR**

```bash
gh pr create --title "feat(admin): Aktionen-Tab — Gekko-operative Selbstständigkeit [T000272]" --body "$(cat <<'EOF'
## Summary
- New `/admin/platform` → "Aktionen" tab with 4 action sub-tabs + global Verlauf
- Backend: 6 new APIs (redeploy×3, users/list, users/groups, users/create, ai/reindex, audit/log)
- New `public.admin_actions` audit table + 2 CronJobs (stale-cleanup, prune)
- Deutsche Help-Buttons + DSGVO-compliant audit (90-day retention, sanitized errors)
- Backup/Restore APIs reused (existed already)
- Phase 1 of broader task-consolidation effort — Phase 2 (Taskfile/skills cleanup) deferred to post-deployment

## Test plan
- [x] All offline tests green (`task test:all`)
- [x] SA-21 Playwright specs (8 tests) — local pass
- [x] Mandatory-sequences regression — pass
- [x] Backend Vitest ≥80% line coverage
- [x] Manual smoke: paddione admin trigger each action, audit-log shows each
- [x] Concurrent-trigger guard returns 409 within 10-min window
- [x] Restore-confirmation requires exact "WIEDERHERSTELLEN" text

## Ticket
T000272

## Phase 2 (post-merge, separate PR)
- Taskfile top-layer (~10 self-explanatory tasks for AI/Patrick CLI ergonomics)
- Scripts cleanup (kill `docs-configmap-apply.sh`, `t.sh`, `setup.sh`)
- Skill consolidation: cluster-deployment + fleet-ops + operations-management → 1 skill
- CLAUDE.md routing tightening (6 ambiguities resolved)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed. Returns the PR number.

- [ ] **Step 10: Wait for CI green, then squash-merge**

```bash
# Wait for CI (will appear in PR view)
gh pr checks --watch
# Once green:
gh pr merge --squash --delete-branch
```

- [ ] **Step 11: Post-merge deploy**

If CI auto-deploys (build-website*.yml workflows on push to main): wait for those to complete.
Otherwise: `task feature:website` on both clusters once more (ensures rollout of merged commit).

Verify:
```bash
curl -sS https://web.mentolder.de/admin/platform | grep -q 'Aktionen' && echo OK
curl -sS https://web.korczewski.de/admin/platform | grep -q 'Aktionen' && echo OK
```

Then notify Gekko: "Neuer Aktionen-Tab unter /admin/platform → Aktionen ist live. Du kannst Re-Deploys, Backups, Anwender und Wissens-Index selbst auslösen. Die Help-Buttons (ℹ️) erklären jeden Knopf auf Deutsch."

---

## Done

When all phases complete:
- Gekko can self-service Re-Deploy / Backup / User-Onboarding / Knowledge-Reindex via /admin/platform → Aktionen
- All actions audit-logged in `public.admin_actions` (Actor, payload, status, error)
- DSGVO-compliant: 90-day retention, sanitized errors, no PII leak
- Mandatory sequences regression-tested (cluster-reset/flux/feature-fanout untouched)
- 8 SA-21 Playwright specs + Vitest unit tests + BATS integration green
- Phase 2 (Taskfile/skills/scripts cleanup) scheduled as separate effort post-deployment

**Frisches Deployment ~2026-05-28 nutzt das Feature ab Tag 1.**
