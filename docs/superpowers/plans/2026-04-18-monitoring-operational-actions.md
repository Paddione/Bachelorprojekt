# Monitoring: Operational Actions + Real Metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Deployments section with Restart/Scale actions and real node resource metrics to the admin monitoring dashboard.

**Architecture:** Extract a shared K8s API client into `lib/k8s.ts` (GET + PATCH), add three new API endpoints (list deployments, rollout restart, scale replicas), fix node CPU%/Mem% computation in the monitoring endpoint, and update `MonitoringDashboard.svelte` with progress-bar node card and Deployments table with confirmation modals.

**Tech Stack:** Astro API routes (TypeScript), Svelte 4, Kubernetes in-cluster API, Tailwind CSS, k3d/Kustomize for RBAC.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `website/src/lib/k8s.ts` | Create | Shared in-cluster K8s API client (GET + PATCH) |
| `website/src/pages/api/admin/monitoring.ts` | Modify | Use shared client; fix node CPU%/Mem% computation |
| `website/src/pages/api/admin/deployments.ts` | Create | GET list of workspace deployments |
| `website/src/pages/api/admin/deployments/[name]/restart.ts` | Create | POST rollout restart a deployment |
| `website/src/pages/api/admin/deployments/[name]/scale.ts` | Create | POST set replica count |
| `k3d/website-rbac.yaml` | Modify | Add `deployments: get/list/patch` to workspace Role |
| `website/src/components/admin/MonitoringDashboard.svelte` | Modify | Node metrics progress bars + Deployments section + action modals |

---

### Task 1: Extract shared K8s API client

The current `monitoring.ts` has inline token/ca reads and a GET-only `fetchK8s` closure. Three new endpoints also need K8s access (including PATCH). Extract a shared client.

**Files:**
- Create: `website/src/lib/k8s.ts`
- Modify: `website/src/pages/api/admin/monitoring.ts`

- [ ] **Step 1: Create `website/src/lib/k8s.ts`**

```typescript
import https from 'node:https';
import fs from 'node:fs/promises';

export type K8sClient = {
  get: (path: string) => Promise<any>;
  patch: (path: string, body: object) => Promise<any>;
};

export async function createK8sClient(): Promise<K8sClient> {
  const token = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');
  const ca = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8');

  function request(path: string, method: string, body?: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const req = https.request(
        {
          hostname: 'kubernetes.default.svc',
          path,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(bodyStr && {
              'Content-Type': 'application/strategic-merge-patch+json',
              'Content-Length': Buffer.byteLength(bodyStr),
            }),
          },
          ca,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`K8s API ${res.statusCode}: ${res.statusMessage}`));
            } else {
              try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            }
          });
        }
      );
      req.on('error', reject);
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  return {
    get: (path) => request(path, 'GET'),
    patch: (path, body) => request(path, 'PATCH', body),
  };
}
```

- [ ] **Step 2: Rewrite `website/src/pages/api/admin/monitoring.ts` to use the shared client**

Replace the entire file contents:

```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../lib/k8s';
import { getSession, isAdmin } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden. Bitte RBAC für den website-Pod konfigurieren.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const [podsData, eventsData, podMetricsResult, nodeMetricsResult] = await Promise.allSettled([
      k8s.get('/api/v1/namespaces/workspace/pods'),
      k8s.get('/api/v1/namespaces/workspace/events'),
      k8s.get('/apis/metrics.k8s.io/v1beta1/namespaces/workspace/pods'),
      k8s.get('/apis/metrics.k8s.io/v1beta1/nodes'),
    ]);

    if (podsData.status === 'rejected') throw podsData.reason;
    if (eventsData.status === 'rejected') throw eventsData.reason;

    const metricsAvailable =
      podMetricsResult.status === 'fulfilled' && nodeMetricsResult.status === 'fulfilled';
    const podMetrics = metricsAvailable ? (podMetricsResult as PromiseFulfilledResult<any>).value : null;
    const nodeMetrics = metricsAvailable ? (nodeMetricsResult as PromiseFulfilledResult<any>).value : null;

    const pods = podsData.value.items.map((pod: any) => {
      const name = pod.metadata.labels?.app || pod.metadata.name;
      const phase = pod.status.phase;
      let ready = false;
      let restarts = 0;
      if (pod.status.containerStatuses) {
        ready = pod.status.containerStatuses.every((c: any) => c.ready);
        restarts = pod.status.containerStatuses.reduce(
          (acc: number, c: any) => acc + c.restartCount, 0
        );
      }
      let cpu = undefined;
      let memory = undefined;
      if (metricsAvailable && podMetrics) {
        const metrics = podMetrics.items.find((m: any) => m.metadata.name === pod.metadata.name);
        if (metrics?.containers?.length > 0) {
          const cpuUsage = metrics.containers.reduce((acc: number, c: any) => {
            const val = c.usage?.cpu;
            if (!val) return acc;
            if (val.endsWith('n')) return acc + parseInt(val) / 1_000_000;
            if (val.endsWith('u')) return acc + parseInt(val) / 1000;
            if (val.endsWith('m')) return acc + parseInt(val);
            return acc + parseInt(val) * 1000;
          }, 0);
          cpu = `${Math.round(cpuUsage)}m`;
          const memUsage = metrics.containers.reduce((acc: number, c: any) => {
            const val = c.usage?.memory;
            if (!val) return acc;
            if (val.endsWith('Ki')) return acc + parseInt(val) / 1024;
            if (val.endsWith('Mi')) return acc + parseInt(val);
            if (val.endsWith('Gi')) return acc + parseInt(val) * 1024;
            return acc;
          }, 0);
          memory = `${Math.round(memUsage)}Mi`;
        }
      }
      return { name, phase, ready, restarts, ...(cpu && { cpu }), ...(memory && { memory }) };
    });

    const events = eventsData.value.items
      .sort((a: any, b: any) => {
        const tA = new Date(a.lastTimestamp ?? a.eventTime ?? 0).getTime();
        const tB = new Date(b.lastTimestamp ?? b.eventTime ?? 0).getTime();
        return tB - tA;
      })
      .slice(0, 10)
      .map((event: any) => {
        const ts = event.lastTimestamp ?? event.eventTime;
        const ageMs = ts ? Date.now() - new Date(ts).getTime() : 0;
        const ageMins = Math.floor(ageMs / 60000);
        const age = ageMins < 60 ? `${ageMins}m` : `${Math.floor(ageMins / 60)}h`;
        return {
          type: event.type,
          reason: event.reason,
          object: event.involvedObject.name,
          message: event.message,
          age,
        };
      });

    // Node metrics — N/A placeholder; fixed in Task 2
    let node = undefined;
    if (metricsAvailable && nodeMetrics?.items?.length > 0) {
      node = { cpu: 'N/A', memory: 'N/A' };
    }

    return new Response(
      JSON.stringify({ pods, events, ...(node && { node }), metricsAvailable, fetchedAt: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    const msg =
      error.code === 'ECONNREFUSED'
        ? 'Kubernetes API-Server nicht erreichbar. Bitte Netzwerkrichtlinien und RBAC prüfen.'
        : error.message;
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 3: Verify monitoring page still works**

```bash
task website:dev
# Open http://web.localhost/admin/monitoring
# Pods list, events, and summary stats all load as before
# Node card may show N/A — fixed in Task 2
```

- [ ] **Step 4: Commit**

```bash
git add website/src/lib/k8s.ts website/src/pages/api/admin/monitoring.ts
git commit -m "refactor(monitoring): extract shared K8s API client to lib/k8s.ts"
```

---

### Task 2: Fix real node resource metrics

**Files:**
- Modify: `website/src/pages/api/admin/monitoring.ts`

- [ ] **Step 1: Add helper functions above the `GET` export**

Add these two functions directly before `export const GET`:

```typescript
function parseCpuToNano(val: string): number {
  if (val.endsWith('n')) return parseInt(val);
  if (val.endsWith('u')) return parseInt(val) * 1_000;
  if (val.endsWith('m')) return parseInt(val) * 1_000_000;
  return parseInt(val) * 1_000_000_000; // whole cores e.g. "4"
}

function parseMemToKi(val: string): number {
  if (val.endsWith('Ki')) return parseInt(val);
  if (val.endsWith('Mi')) return parseInt(val) * 1024;
  if (val.endsWith('Gi')) return parseInt(val) * 1024 * 1024;
  return Math.round(parseInt(val) / 1024); // bytes fallback
}
```

- [ ] **Step 2: Add a 5th parallel fetch for node capacity**

Replace the four-item `Promise.allSettled` with a five-item version:

```typescript
const [podsData, eventsData, podMetricsResult, nodeMetricsResult, nodeCapacityResult] =
  await Promise.allSettled([
    k8s.get('/api/v1/namespaces/workspace/pods'),
    k8s.get('/api/v1/namespaces/workspace/events'),
    k8s.get('/apis/metrics.k8s.io/v1beta1/namespaces/workspace/pods'),
    k8s.get('/apis/metrics.k8s.io/v1beta1/nodes'),
    k8s.get('/api/v1/nodes'),
  ]);
```

- [ ] **Step 3: Replace the node computation block**

Find and replace the `let node = undefined` block:

Old:
```typescript
    // Node metrics — N/A placeholder; fixed in Task 2
    let node = undefined;
    if (metricsAvailable && nodeMetrics?.items?.length > 0) {
      node = { cpu: 'N/A', memory: 'N/A' };
    }
```

New:
```typescript
    let node = undefined;
    if (
      metricsAvailable &&
      nodeMetrics?.items?.length > 0 &&
      nodeCapacityResult.status === 'fulfilled' &&
      nodeCapacityResult.value?.items?.length > 0
    ) {
      const usage = nodeMetrics.items[0].usage;
      const capacity = (nodeCapacityResult as PromiseFulfilledResult<any>).value.items[0].status.capacity;
      const cpuPercent = Math.round((parseCpuToNano(usage.cpu) / parseCpuToNano(capacity.cpu)) * 100);
      const memPercent = Math.round((parseMemToKi(usage.memory) / parseMemToKi(capacity.memory)) * 100);
      node = {
        cpu: `${Math.min(cpuPercent, 100)}%`,
        memory: `${Math.min(memPercent, 100)}%`,
      };
    }
```

- [ ] **Step 4: Verify in dev**

```bash
task website:dev
# Open http://web.localhost/admin/monitoring
# Node Resources card now shows "CPU: 34%" and "Mem: 61%" (values vary by cluster load)
# If metrics-server is unavailable in k3d, card is hidden — correct behaviour
```

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/monitoring.ts
git commit -m "fix(monitoring): compute real node CPU% and Mem% from node capacity"
```

---

### Task 3: Update RBAC for deployments

Note: `k3d/website-rbac.yaml` already has a ClusterRole granting `nodes: get/list` and `metrics.k8s.io: get/list`. Only the workspace-namespaced Role needs updating.

**Files:**
- Modify: `k3d/website-rbac.yaml`

- [ ] **Step 1: Add deployments rule to `website-monitoring-role`**

Find the `website-monitoring-role` Role. Replace its `rules` block:

Old:
```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "events"]
    verbs: ["get", "list"]
```

New:
```yaml
rules:
  - apiGroups: [""]
    resources: ["pods", "events"]
    verbs: ["get", "list"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch"]
```

- [ ] **Step 2: Apply and verify**

```bash
kubectl apply -f k3d/website-rbac.yaml
kubectl auth can-i list deployments --as=system:serviceaccount:website:website -n workspace
# Expected: yes
kubectl auth can-i patch deployments --as=system:serviceaccount:website:website -n workspace
# Expected: yes
```

- [ ] **Step 3: Commit**

```bash
git add k3d/website-rbac.yaml
git commit -m "feat(rbac): grant website SA get/list/patch on workspace deployments"
```

---

### Task 4: Add deployments list API endpoint

**Files:**
- Create: `website/src/pages/api/admin/deployments.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../lib/k8s';
import { getSession, isAdmin } from '../../../lib/auth';

type DeploymentStatus = 'healthy' | 'degraded' | 'pending';

function deploymentStatus(desired: number, ready: number): DeploymentStatus {
  if (desired === 0) return 'pending';
  if (ready === desired) return 'healthy';
  return 'degraded';
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const data = await k8s.get('/apis/apps/v1/namespaces/workspace/deployments');
    const deployments = data.items.map((d: any) => {
      const desired: number = d.spec.replicas ?? 1;
      const ready: number = d.status.readyReplicas ?? 0;
      const available: number = d.status.availableReplicas ?? 0;
      return {
        name: d.metadata.name,
        desired,
        ready,
        available,
        status: deploymentStatus(desired, ready),
      };
    });
    return new Response(JSON.stringify({ deployments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Verify in dev**

```bash
task website:dev
# In a browser with an admin session, navigate to:
# http://web.localhost/api/admin/deployments
# Expected JSON: { "deployments": [ { "name": "website", "desired": 2, "ready": 2, "available": 2, "status": "healthy" }, ... ] }
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/deployments.ts
git commit -m "feat(monitoring): add GET /api/admin/deployments endpoint"
```

---

### Task 5: Add rollout restart endpoint

**Files:**
- Create: `website/src/pages/api/admin/deployments/[name]/restart.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { name } = params;
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    return new Response(JSON.stringify({ error: 'Invalid deployment name' }), { status: 400 });
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await k8s.patch(`/apis/apps/v1/namespaces/workspace/deployments/${name}`, {
      spec: {
        template: {
          metadata: {
            annotations: {
              'kubectl.kubernetes.io/restartedAt': new Date().toISOString(),
            },
          },
        },
      },
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Verify in dev**

```bash
task website:dev
# Trigger a restart from the browser once the UI is ready (Task 8), or test via curl:
# curl -X POST -b "<session-cookie>" http://web.localhost/api/admin/deployments/website/restart
# Expected: { "ok": true }
# Confirm rolling restart:
kubectl get pods -n workspace -w
# website pod(s) should terminate and recreate
```

- [ ] **Step 3: Commit**

```bash
git add "website/src/pages/api/admin/deployments/[name]/restart.ts"
git commit -m "feat(monitoring): add POST /api/admin/deployments/[name]/restart endpoint"
```

---

### Task 6: Add scale endpoint

**Files:**
- Create: `website/src/pages/api/admin/deployments/[name]/scale.ts`

- [ ] **Step 1: Create the file**

```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { name } = params;
  if (!name || !/^[a-z0-9-]+$/.test(name)) {
    return new Response(JSON.stringify({ error: 'Invalid deployment name' }), { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { replicas } = body ?? {};
  if (typeof replicas !== 'number' || !Number.isInteger(replicas) || replicas < 0 || replicas > 10) {
    return new Response(
      JSON.stringify({ error: 'replicas must be an integer between 0 and 10' }),
      { status: 400 }
    );
  }

  let k8s;
  try {
    k8s = await createK8sClient();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Kein Service-Account-Token gefunden.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    await k8s.patch(`/apis/apps/v1/namespaces/workspace/deployments/${name}`, {
      spec: { replicas },
    });
    return new Response(JSON.stringify({ ok: true, replicas }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 2: Verify in dev**

```bash
task website:dev
# Scale website to 3:
# curl -X POST -b "<session-cookie>" -H "Content-Type: application/json" \
#   -d '{"replicas":3}' http://web.localhost/api/admin/deployments/website/scale
# Expected: { "ok": true, "replicas": 3 }
kubectl get deployment website -n workspace
# DESIRED column shows 3
# Scale back to 2:
# curl -X POST -b "<session-cookie>" -H "Content-Type: application/json" \
#   -d '{"replicas":2}' http://web.localhost/api/admin/deployments/website/scale
```

- [ ] **Step 3: Commit**

```bash
git add "website/src/pages/api/admin/deployments/[name]/scale.ts"
git commit -m "feat(monitoring): add POST /api/admin/deployments/[name]/scale endpoint"
```

---

### Task 7: Update MonitoringDashboard — node metrics progress bars

**Files:**
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

- [ ] **Step 1: Add `parsePercent` helper to `<script>`**

Add this function after the existing `getStatusColor` function:

```typescript
function parsePercent(val: string): number {
  return Math.min(parseInt(val) || 0, 100);
}
```

- [ ] **Step 2: Replace the node card body in the template**

Find and replace the two `<p>` tags inside the node card:

Old:
```svelte
          <p class="mt-1 text-sm text-light">CPU: {data.node.cpu}</p>
          <p class="text-sm text-light">Mem: {data.node.memory}</p>
```

New:
```svelte
          <div class="mt-2 space-y-2">
            <div>
              <div class="flex justify-between text-xs text-muted mb-1">
                <span>CPU</span><span>{data.node.cpu}</span>
              </div>
              <div class="w-full bg-dark-lighter rounded-full h-1.5">
                <div class="bg-blue-500 h-1.5 rounded-full" style="width: {parsePercent(data.node.cpu)}%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs text-muted mb-1">
                <span>Mem</span><span>{data.node.memory}</span>
              </div>
              <div class="w-full bg-dark-lighter rounded-full h-1.5">
                <div class="bg-purple-500 h-1.5 rounded-full" style="width: {parsePercent(data.node.memory)}%"></div>
              </div>
            </div>
          </div>
```

- [ ] **Step 3: Verify in dev**

```bash
task website:dev
# Open http://web.localhost/admin/monitoring
# Node Resources card shows two slim progress bars labelled CPU and Mem with percentage values
```

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(monitoring): replace N/A node card with CPU/Mem progress bars"
```

---

### Task 8: Add Deployments section and action modals to MonitoringDashboard

**Files:**
- Modify: `website/src/components/admin/MonitoringDashboard.svelte`

- [ ] **Step 1: Add new types to the `<script>` block**

Add after the existing `type MonitoringData` definition:

```typescript
  type Deployment = {
    name: string;
    desired: number;
    ready: number;
    available: number;
    status: 'healthy' | 'degraded' | 'pending';
  };

  type DeploymentAction =
    | { type: 'restart'; deployment: Deployment }
    | { type: 'scale'; deployment: Deployment };
```

- [ ] **Step 2: Add new state variables**

Add after the existing `let modalCloseTimer` line:

```typescript
  let deployments: Deployment[] = [];
  let deploymentsError: string | null = null;
  let pendingAction: DeploymentAction | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;
```

- [ ] **Step 3: Replace `fetchData` to also fetch deployments in parallel**

Replace the existing `fetchData` function:

```typescript
  const fetchData = async () => {
    try {
      loading = true;
      error = null;
      const [monRes, depRes] = await Promise.allSettled([
        fetch('/api/admin/monitoring'),
        fetch('/api/admin/deployments'),
      ]);

      if (monRes.status === 'fulfilled' && monRes.value.ok) {
        data = await monRes.value.json();
      } else if (monRes.status === 'rejected') {
        error = (monRes.reason as Error).message;
      } else {
        error = `Failed to fetch monitoring data: ${monRes.value.status} ${monRes.value.statusText}`;
      }

      if (depRes.status === 'fulfilled' && depRes.value.ok) {
        const json = await depRes.value.json();
        deployments = json.deployments ?? [];
        deploymentsError = null;
      } else {
        deploymentsError = 'Deployments konnten nicht geladen werden.';
      }
    } finally {
      loading = false;
    }
  };
```

- [ ] **Step 4: Add action helper functions**

Add these functions after `fetchData`:

```typescript
  function openAction(action: DeploymentAction) {
    pendingAction = action;
    scaleTarget = action.type === 'scale' ? action.deployment.desired : 1;
    actionLoading = false;
    actionError = null;
  }

  function closeAction() {
    pendingAction = null;
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
      if (!res.ok) {
        actionError = json.error ?? 'Unbekannter Fehler';
        return;
      }
      closeAction();
      setTimeout(fetchData, 1000);
    } catch {
      actionError = 'Netzwerkfehler';
    } finally {
      actionLoading = false;
    }
  }

  function deploymentStatusClass(status: Deployment['status']): string {
    if (status === 'healthy') return 'bg-green-900/40 text-green-400';
    if (status === 'degraded') return 'bg-orange-900/40 text-orange-400';
    return 'bg-yellow-900/40 text-yellow-400';
  }
```

- [ ] **Step 5: Add Deployments section to the template**

Insert this block directly after the closing `</div>` of the summary stats grid (the `grid grid-cols-1 md:grid-cols-4` div) and before the `<!-- Pods List -->` comment:

```svelte
    <!-- Deployments Section -->
    <div class="bg-dark-light border border-dark-lighter rounded-lg shadow overflow-hidden">
      <div class="px-4 py-5 sm:px-6 border-b border-dark-lighter">
        <h3 class="text-lg leading-6 font-medium text-light">Deployments</h3>
      </div>
      {#if deploymentsError}
        <p class="px-4 py-4 text-sm text-red-500">{deploymentsError}</p>
      {:else if deployments.length === 0}
        <p class="px-4 py-4 text-sm text-gray-500 text-center">No deployments found in workspace.</p>
      {:else}
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-dark-lighter text-xs text-muted text-left">
              <th class="px-4 py-3 font-medium">Name</th>
              <th class="px-3 py-3 font-medium">Ready</th>
              <th class="px-3 py-3 font-medium">Replicas</th>
              <th class="px-3 py-3 font-medium">Status</th>
              <th class="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dark-lighter">
            {#each deployments as dep}
              <tr class="hover:bg-dark transition-colors">
                <td class="px-4 py-3 font-medium text-light">{dep.name}</td>
                <td class="px-3 py-3 {dep.ready === dep.desired ? 'text-green-400' : 'text-orange-400'}">{dep.ready} / {dep.desired}</td>
                <td class="px-3 py-3 text-muted">{dep.desired}</td>
                <td class="px-3 py-3">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {deploymentStatusClass(dep.status)}">
                    {dep.status}
                  </span>
                </td>
                <td class="px-4 py-3 text-right space-x-2">
                  <button
                    on:click={() => openAction({ type: 'restart', deployment: dep })}
                    class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded border border-blue-700 text-blue-400 hover:bg-blue-900/30 transition-colors"
                  >
                    ⟳ Restart
                  </button>
                  <button
                    on:click={() => openAction({ type: 'scale', deployment: dep })}
                    class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded border border-purple-700 text-purple-400 hover:bg-purple-900/30 transition-colors"
                  >
                    ⇅ Scale
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
```

- [ ] **Step 6: Add action confirmation modal**

Add this block at the very end of the template, after the existing bug ticket modal closing `{/if}`:

```svelte
{#if pendingAction}
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    on:click|self={closeAction}
    role="dialog"
    aria-modal="true"
    aria-labelledby="action-modal-title"
  >
    <div class="bg-dark-light border border-dark-lighter rounded-lg shadow-xl w-full max-w-md">
      <div class="px-6 py-4 border-b border-dark-lighter flex items-center justify-between">
        <h2 id="action-modal-title" class="text-lg font-semibold text-light">
          {pendingAction.type === 'restart' ? 'Restart' : 'Scale'} Deployment
        </h2>
        <button on:click={closeAction} class="text-gray-400 hover:text-light transition-colors" aria-label="Schließen">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <div class="px-6 py-4 space-y-4">
        {#if pendingAction.type === 'restart'}
          <p class="text-sm text-light">
            Restart deployment <strong>{pendingAction.deployment.name}</strong>?
          </p>
          <p class="text-sm text-muted">
            This triggers a rolling restart. Pods are recreated one by one — existing connections may drop briefly.
          </p>
        {:else}
          <p class="text-sm text-light">
            Set replicas for <strong>{pendingAction.deployment.name}</strong>
            <span class="text-muted text-xs ml-1">(current: {pendingAction.deployment.desired})</span>
          </p>
          <div class="flex items-center gap-4">
            <button
              on:click={() => { if (scaleTarget > 0) scaleTarget -= 1; }}
              disabled={scaleTarget <= 0}
              class="w-8 h-8 rounded border border-dark-lighter text-light hover:bg-dark transition-colors text-lg flex items-center justify-center disabled:opacity-40"
            >−</button>
            <span class="text-light text-xl font-semibold w-8 text-center">{scaleTarget}</span>
            <button
              on:click={() => { if (scaleTarget < 10) scaleTarget += 1; }}
              disabled={scaleTarget >= 10}
              class="w-8 h-8 rounded border border-dark-lighter text-light hover:bg-dark transition-colors text-lg flex items-center justify-center disabled:opacity-40"
            >+</button>
          </div>
          {#if scaleTarget === 0}
            <p class="text-xs text-orange-400">
              This will stop all pods for {pendingAction.deployment.name}.
            </p>
          {/if}
        {/if}
        {#if actionError}
          <p class="text-sm text-red-500">{actionError}</p>
        {/if}
      </div>

      <div class="px-6 py-4 border-t border-dark-lighter flex justify-end gap-3">
        <button
          on:click={closeAction}
          class="px-4 py-2 text-sm rounded-md border border-dark-lighter text-light hover:bg-dark transition-colors"
        >
          Abbrechen
        </button>
        <button
          on:click={confirmAction}
          disabled={actionLoading}
          class="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors"
        >
          {actionLoading ? 'Bitte warten…' : (pendingAction.type === 'restart' ? 'Restart' : 'Apply')}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 7: Verify full feature in dev**

```bash
task website:dev
# Open http://web.localhost/admin/monitoring and verify:
# 1. Deployments table appears between summary stats and Pods list
# 2. Each deployment shows name, ready/desired, replica count, status badge (green/orange/yellow)
# 3. Clicking "⟳ Restart" opens confirmation dialog — click Restart → rolling restart starts
#    kubectl get pods -n workspace -w  (watch pods recreate)
# 4. Clicking "⇅ Scale" opens dialog with +/− stepper — change value → click Apply → replica count updates
#    kubectl get deployment <name> -n workspace  (verify DESIRED column)
# 5. Scale to 0 shows orange warning message in the dialog
# 6. API errors surface in the modal footer, not as page errors
# 7. Deployments table re-fetches ~1s after a successful action
# 8. Existing Pods list, Events list, and bug ticket modal work as before
```

- [ ] **Step 8: Commit**

```bash
git add website/src/components/admin/MonitoringDashboard.svelte
git commit -m "feat(monitoring): add Deployments section with Restart and Scale action modals"
```
