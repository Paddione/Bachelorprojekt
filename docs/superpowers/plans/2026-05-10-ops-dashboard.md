# Ops-Dashboard `/admin/ops` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/admin/ops` page in the existing website with six German-language tabs that give full cluster control without needing a terminal: service health, deployment restarts, live log streaming, ArgoCD sync, DB backup/restore, and DNS/cert status.

**Architecture:** New Astro page + Svelte tab shell (same pattern as `/admin/monitoring`). New API endpoints under `/api/admin/ops/*` talk to the k8s API via the existing ServiceAccount. RBAC extended to cover the korczewski namespace, jobs, TLS secrets, and ArgoCD sync. Two new env vars (`IPV64_UPDATE_HASH_MENTOLDER`, `IPV64_UPDATE_HASH_KORCZEWSKI`) added to website-secrets for DNS pinning.

**Tech Stack:** Astro SSR, Svelte, TypeScript, Node.js https module (k8s streaming), Server-Sent Events, Kubernetes RBAC, ipv64.net REST API.

**Agent routing note:** Tasks 1 and "Deploy" are infra work (`k3d/`). Tasks 2–10 are website work (`website/src/`). Use `bachelorprojekt-infra` for Task 1, `bachelorprojekt-website` for Tasks 2–10.

---

## File Map

**Create:**
```
website/src/pages/admin/ops.astro
website/src/components/admin/OpsConsole.svelte
website/src/components/admin/ops/GesundheitTab.svelte
website/src/components/admin/ops/DienstTab.svelte
website/src/components/admin/ops/LogsTab.svelte
website/src/components/admin/ops/ArgoCDOpsTab.svelte
website/src/components/admin/ops/DatenbankTab.svelte
website/src/components/admin/ops/DnsZertTab.svelte
website/src/pages/api/admin/ops/health.ts
website/src/pages/api/admin/ops/deployments/list.ts
website/src/pages/api/admin/ops/deployments/[ns]/[name]/restart.ts
website/src/pages/api/admin/ops/deployments/[ns]/[name]/scale.ts
website/src/pages/api/admin/ops/logs/stream.ts
website/src/pages/api/admin/ops/argocd/sync.ts
website/src/pages/api/admin/ops/backup/trigger.ts
website/src/pages/api/admin/ops/backup/list.ts
website/src/pages/api/admin/ops/restore.ts
website/src/pages/api/admin/ops/certs.ts
website/src/pages/api/admin/ops/dns/pin.ts
```

**Modify:**
```
k3d/website-rbac.yaml                    — add korczewski Role + job/secret/argocd-patch RBAC
k3d/website.yaml                         — add IPV64_UPDATE_HASH_* env vars, LIVEKIT_PIN_IP_* env vars
k3d/secrets.yaml                         — add placeholder values for new secrets (dev)
environments/schema.yaml                 — register new secret vars
website/src/layouts/AdminLayout.astro    — add Ops nav link below Monitoring
```

---

## Task 1: RBAC Foundation

**Files:**
- Modify: `k3d/website-rbac.yaml`
- Modify: `k3d/website.yaml` (RBAC section, lines ~95–123)

- [ ] **Step 1: Add Role + RoleBinding for `workspace-korczewski` namespace**

Append to `k3d/website-rbac.yaml`:
```yaml
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: website-ops-role
  namespace: workspace-korczewski
rules:
  - apiGroups: [""]
    resources: ["pods", "events"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["pods/log"]
    verbs: ["get"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: website-ops-rolebinding
  namespace: workspace-korczewski
subjects:
  - kind: ServiceAccount
    name: website
    namespace: website
roleRef:
  kind: Role
  name: website-ops-role
  apiGroup: rbac.authorization.k8s.io
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: website-ops-role
  namespace: website-korczewski
rules:
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: website-ops-rolebinding
  namespace: website-korczewski
subjects:
  - kind: ServiceAccount
    name: website
    namespace: website
roleRef:
  kind: Role
  name: website-ops-role
  apiGroup: rbac.authorization.k8s.io
```

- [ ] **Step 2: Add jobs + TLS-secret access in `workspace` namespace**

In `k3d/website-rbac.yaml`, extend the existing `website-monitoring-role` (namespace: workspace) rules:
```yaml
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "create"]
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["workspace-wildcard-tls"]
    verbs: ["get"]
```

- [ ] **Step 3: Add ArgoCD sync + korczewski TLS secret access to ClusterRole**

In `k3d/website.yaml`, find the `ClusterRole` block (around line 95) and update the argoproj rule to include `patch`, and add korczewski TLS secret access:
```yaml
  - apiGroups: ["argoproj.io"]
    resources: ["applications"]
    verbs: ["get", "list", "patch"]
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["korczewski-tls"]
    verbs: ["get"]
```

- [ ] **Step 4: Register new env vars in schema + add dev placeholders**

In `environments/schema.yaml`, add under `secret_vars` (or appropriate section):
```yaml
  - name: IPV64_UPDATE_HASH_MENTOLDER
    description: "ipv64 domain_update_hash for mentolder.de DNS pinning"
    secret: true
  - name: IPV64_UPDATE_HASH_KORCZEWSKI
    description: "ipv64 domain_update_hash for korczewski.de DNS pinning"
    secret: true
```

In `k3d/secrets.yaml`, add placeholder entries for dev (empty string is fine — DNS pinning silently skips if blank):
```yaml
  IPV64_UPDATE_HASH_MENTOLDER: ""
  IPV64_UPDATE_HASH_KORCZEWSKI: ""
```

- [ ] **Step 5: Mount new env vars in website pod**

In `k3d/website.yaml`, in the `env:` block of the website Deployment, add:
```yaml
            - name: IPV64_UPDATE_HASH_MENTOLDER
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: IPV64_UPDATE_HASH_MENTOLDER
                  optional: true
            - name: IPV64_UPDATE_HASH_KORCZEWSKI
              valueFrom:
                secretKeyRef:
                  name: website-secrets
                  key: IPV64_UPDATE_HASH_KORCZEWSKI
                  optional: true
            - name: LIVEKIT_PIN_IP_MENTOLDER
              value: "46.225.125.59"
            - name: LIVEKIT_PIN_IP_KORCZEWSKI
              value: "37.27.251.38"
```

- [ ] **Step 6: Validate manifests**

```bash
task workspace:validate
```
Expected: no errors.

- [ ] **Step 7: Commit**
```bash
git add k3d/website-rbac.yaml k3d/website.yaml k3d/secrets.yaml environments/schema.yaml
git commit -m "feat(rbac): extend website SA for ops dashboard — korczewski, jobs, TLS secrets, ArgoCD sync"
```

---

## Task 2: k8s Client — Add POST and Streaming

**Files:**
- Modify: `website/src/lib/k8s.ts`

The current client only has `get` and `patch`. The ops endpoints need `post` (create Jobs, trigger ArgoCD sync), `delete` (future use), and raw `stream` access (logs SSE). We keep the streaming inline in the logs endpoint (not added to the client) because it has different lifetime semantics.

- [ ] **Step 1: Add `post` and `delete` to `K8sClient` type and factory**

Replace the entire `website/src/lib/k8s.ts` content:
```typescript
import https from 'node:https';
import fs from 'node:fs/promises';

export type K8sClient = {
  get: (path: string) => Promise<any>;
  patch: (path: string, body: object) => Promise<any>;
  post: (path: string, body: object) => Promise<any>;
  delete: (path: string) => Promise<any>;
};

export async function createK8sClient(): Promise<K8sClient> {
  const token = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8');
  const ca = await fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8');

  function request(path: string, method: string, body?: object, contentType = 'application/strategic-merge-patch+json'): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : undefined;
      const req = https.request(
        {
          hostname: 'kubernetes.default.svc.cluster.local',
          path,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(bodyStr && {
              'Content-Type': contentType,
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
              reject(new Error(`K8s API ${res.statusCode}: ${res.statusMessage} — ${data}`));
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
    post: (path, body) => request(path, 'POST', body, 'application/json'),
    delete: (path) => request(path, 'DELETE'),
  };
}

/** Read SA token + CA for raw streaming use (logs SSE endpoint). */
export async function readK8sCredentials(): Promise<{ token: string; ca: string }> {
  const [token, ca] = await Promise.all([
    fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8'),
    fs.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8'),
  ]);
  return { token, ca };
}
```

- [ ] **Step 2: Verify existing tests still pass**
```bash
cd website && npx vitest run --reporter=verbose 2>&1 | tail -20
```
Expected: same pass/fail as before (the k8s client has no unit tests currently — this is fine).

- [ ] **Step 3: Commit**
```bash
git add website/src/lib/k8s.ts
git commit -m "feat(k8s): add post/delete methods and readK8sCredentials helper"
```

---

## Task 3: Ops Page Skeleton

**Files:**
- Create: `website/src/pages/admin/ops.astro`
- Create: `website/src/components/admin/OpsConsole.svelte`
- Create (stubs): all 6 tab files under `website/src/components/admin/ops/`

- [ ] **Step 1: Create the Astro page**

`website/src/pages/admin/ops.astro`:
```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import OpsConsole from '../../components/admin/OpsConsole.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Cluster-Steuerung">
  <section class="pt-8 pb-20 px-4 sm:px-6 bg-dark min-h-screen">
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-light font-serif">Cluster-Steuerung</h1>
        <p class="text-muted text-sm mt-1">Dienste, Logs, Deployments und Backups für mentolder & korczewski</p>
      </div>
      <OpsConsole client:load />
    </div>
  </section>
</AdminLayout>
```

- [ ] **Step 2: Create OpsConsole shell**

`website/src/components/admin/OpsConsole.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import GesundheitTab from './ops/GesundheitTab.svelte';
  import DienstTab from './ops/DienstTab.svelte';
  import LogsTab from './ops/LogsTab.svelte';
  import ArgoCDOpsTab from './ops/ArgoCDOpsTab.svelte';
  import DatenbankTab from './ops/DatenbankTab.svelte';
  import DnsZertTab from './ops/DnsZertTab.svelte';

  type Tab = 'gesundheit' | 'dienste' | 'logs' | 'argocd' | 'datenbank' | 'dns';
  const VALID_TABS: Tab[] = ['gesundheit', 'dienste', 'logs', 'argocd', 'datenbank', 'dns'];

  let activeTab: Tab = 'gesundheit';

  onMount(() => {
    const hash = location.hash.slice(1) as Tab;
    if (VALID_TABS.includes(hash)) activeTab = hash;
  });

  function setTab(tab: Tab) {
    activeTab = tab;
    history.replaceState(null, '', `#${tab}`);
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'gesundheit', label: '🩺 Gesundheit' },
    { id: 'dienste',    label: '🔄 Dienste' },
    { id: 'logs',       label: '📋 Logs' },
    { id: 'argocd',     label: '🚀 ArgoCD' },
    { id: 'datenbank',  label: '💾 Datenbank' },
    { id: 'dns',        label: '🌐 DNS & Zertifikate' },
  ];
</script>

<div class="space-y-0">
  <div class="flex border-b border-gray-700 bg-gray-950 -mx-4 px-4 sm:-mx-6 sm:px-6 overflow-x-auto">
    {#each tabs as tab}
      <button
        on:click={() => setTab(tab.id)}
        class="px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap {activeTab === tab.id
          ? 'border-blue-500 text-blue-400'
          : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}"
      >
        {tab.label}
      </button>
    {/each}
  </div>

  <div class="pt-5">
    {#if activeTab === 'gesundheit'}
      <GesundheitTab />
    {:else if activeTab === 'dienste'}
      <DienstTab />
    {:else if activeTab === 'logs'}
      <LogsTab />
    {:else if activeTab === 'argocd'}
      <ArgoCDOpsTab />
    {:else if activeTab === 'datenbank'}
      <DatenbankTab />
    {:else if activeTab === 'dns'}
      <DnsZertTab />
    {/if}
  </div>
</div>
```

- [ ] **Step 3: Create stub tab files**

Create each of these with a minimal placeholder (will be filled in subsequent tasks):

`website/src/components/admin/ops/GesundheitTab.svelte`:
```svelte
<script lang="ts">
</script>
<p class="text-gray-400 text-sm">Gesundheit — wird implementiert…</p>
```

Do the same for `DienstTab.svelte`, `LogsTab.svelte`, `ArgoCDOpsTab.svelte`, `DatenbankTab.svelte`, `DnsZertTab.svelte` — same stub content, different name in the comment.

- [ ] **Step 4: Add Ops nav link to AdminLayout**

In `website/src/layouts/AdminLayout.astro`, find the line:
```typescript
      { href: '/admin/monitoring', label: 'Monitoring', icon: 'monitor' },
```
Add immediately after it:
```typescript
      { href: '/admin/ops', label: 'Cluster-Steuerung', icon: 'server' },
```

- [ ] **Step 5: Verify page loads**
```bash
cd website && task website:dev &
# open http://localhost:4321/admin/ops in browser
# Expected: page loads with 6 tabs, each showing placeholder text
```

- [ ] **Step 6: Commit**
```bash
git add website/src/pages/admin/ops.astro website/src/components/admin/OpsConsole.svelte \
        website/src/components/admin/ops/ website/src/layouts/AdminLayout.astro
git commit -m "feat(ops): skeleton page, tab shell, nav link"
```

---

## Task 4: Gesundheit Tab

**Files:**
- Create: `website/src/pages/api/admin/ops/health.ts`
- Modify: `website/src/components/admin/ops/GesundheitTab.svelte`

- [ ] **Step 1: Create health API endpoint**

`website/src/pages/api/admin/ops/health.ts`:
```typescript
import type { APIRoute } from 'astro';
import http from 'node:http';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../lib/auth';

type ServiceCheck = {
  name: string;
  url: string;
  status: 'ok' | 'slow' | 'error';
  latencyMs: number | null;
  error?: string;
};

const SERVICES: Record<string, { name: string; internalUrl: string }[]> = {
  mentolder: [
    { name: 'Keycloak',     internalUrl: 'http://keycloak.workspace.svc.cluster.local:8080/health/ready' },
    { name: 'Nextcloud',    internalUrl: 'http://nextcloud.workspace.svc.cluster.local/status.php' },
    { name: 'Collabora',    internalUrl: 'http://collabora.workspace.svc.cluster.local/hosting/capabilities' },
    { name: 'Vaultwarden',  internalUrl: 'http://vaultwarden.workspace.svc.cluster.local/alive' },
    { name: 'DocuSeal',     internalUrl: 'http://docuseal.workspace.svc.cluster.local:3000' },
    { name: 'Website',      internalUrl: 'http://website.website.svc.cluster.local' },
  ],
  korczewski: [
    { name: 'Keycloak',     internalUrl: 'http://keycloak.workspace-korczewski.svc.cluster.local:8080/health/ready' },
    { name: 'Nextcloud',    internalUrl: 'http://nextcloud.workspace-korczewski.svc.cluster.local/status.php' },
    { name: 'Collabora',    internalUrl: 'http://collabora.workspace-korczewski.svc.cluster.local/hosting/capabilities' },
    { name: 'Vaultwarden',  internalUrl: 'http://vaultwarden.workspace-korczewski.svc.cluster.local/alive' },
    { name: 'Website',      internalUrl: 'http://website.website-korczewski.svc.cluster.local' },
  ],
};

function checkUrl(url: string, timeoutMs = 5000): Promise<{ latencyMs: number; ok: boolean }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      const latencyMs = Date.now() - start;
      resolve({ latencyMs, ok: (res.statusCode ?? 500) < 500 });
    });
    req.on('error', () => resolve({ latencyMs: Date.now() - start, ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ latencyMs: timeoutMs, ok: false }); });
  });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const results: Record<string, ServiceCheck[]> = {};

  for (const [cluster, services] of Object.entries(SERVICES)) {
    results[cluster] = await Promise.all(
      services.map(async (svc) => {
        try {
          const { latencyMs, ok } = await checkUrl(svc.internalUrl);
          return {
            name: svc.name,
            url: svc.internalUrl,
            status: !ok ? 'error' : latencyMs > 2000 ? 'slow' : 'ok',
            latencyMs,
          } satisfies ServiceCheck;
        } catch (e: any) {
          return { name: svc.name, url: svc.internalUrl, status: 'error', latencyMs: null, error: e.message };
        }
      })
    );
  }

  return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Implement GesundheitTab**

Replace `website/src/components/admin/ops/GesundheitTab.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type ServiceCheck = { name: string; url: string; status: 'ok' | 'slow' | 'error'; latencyMs: number | null; error?: string };
  type HealthData = { results: Record<string, ServiceCheck[]>; checkedAt: string };

  let data: HealthData | null = null;
  let loading = true;
  let error: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function check() {
    try {
      loading = data === null;
      const res = await fetch('/api/admin/ops/health');
      if (res.ok) { data = await res.json(); error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  onMount(() => { check(); interval = setInterval(check, 30_000); });
  onDestroy(() => clearInterval(interval));

  function ampel(status: string) {
    if (status === 'ok') return { dot: '🟢', cls: 'bg-green-900/30 border-green-800', text: 'text-green-300' };
    if (status === 'slow') return { dot: '🟡', cls: 'bg-yellow-900/30 border-yellow-800', text: 'text-yellow-300' };
    return { dot: '🔴', cls: 'bg-red-900/30 border-red-800', text: 'text-red-300' };
  }

  const CLUSTER_LABELS: Record<string, string> = {
    mentolder: 'mentolder.de',
    korczewski: 'korczewski.de',
  };
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    <span class="text-xs text-gray-500">
      {#if data?.checkedAt}Geprüft um {new Date(data.checkedAt).toLocaleTimeString('de-DE')}{/if}
    </span>
    <button on:click={check} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Prüfe…' : '↻ Jetzt prüfen'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  {#if data}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each Object.entries(data.results) as [cluster, services]}
        <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 class="text-sm font-semibold text-gray-200 mb-3">{CLUSTER_LABELS[cluster] ?? cluster}</h3>
          <div class="space-y-2">
            {#each services as svc}
              {@const a = ampel(svc.status)}
              <div class="flex items-center justify-between px-3 py-2 rounded border {a.cls}">
                <span class="text-sm {a.text}">{a.dot} {svc.name}</span>
                <span class="text-xs text-gray-400">
                  {#if svc.latencyMs !== null}{svc.latencyMs} ms{:else}—{/if}
                </span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:4321/admin/ops#gesundheit`. Expected: two columns (mentolder, korczewski) showing service health cards. In dev (no real services) they will all be red — that's correct.

- [ ] **Step 4: Commit**
```bash
git add website/src/pages/api/admin/ops/health.ts website/src/components/admin/ops/GesundheitTab.svelte
git commit -m "feat(ops/gesundheit): HTTP health checks für beide Cluster"
```

---

## Task 5: Dienste Tab

**Files:**
- Create: `website/src/pages/api/admin/ops/deployments/list.ts`
- Create: `website/src/pages/api/admin/ops/deployments/[ns]/[name]/restart.ts`
- Create: `website/src/pages/api/admin/ops/deployments/[ns]/[name]/scale.ts`
- Modify: `website/src/components/admin/ops/DienstTab.svelte`

- [ ] **Step 1: Create deployments list endpoint**

`website/src/pages/api/admin/ops/deployments/list.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const NAMESPACES = [
  { ns: 'workspace',            label: 'mentolder' },
  { ns: 'workspace-korczewski', label: 'korczewski' },
  { ns: 'website',              label: 'website (mentolder)' },
  { ns: 'website-korczewski',   label: 'website (korczewski)' },
];

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const deployments: Array<{ ns: string; nsLabel: string; name: string; desired: number; ready: number; status: string }> = [];

  await Promise.allSettled(
    NAMESPACES.map(async ({ ns, label }) => {
      const data = await k8s.get(`/apis/apps/v1/namespaces/${ns}/deployments`);
      for (const d of data.items ?? []) {
        const desired = d.spec?.replicas ?? 0;
        const ready = d.status?.readyReplicas ?? 0;
        const status = ready === desired && desired > 0 ? 'healthy' : desired === 0 ? 'stopped' : 'degraded';
        deployments.push({ ns, nsLabel: label, name: d.metadata.name, desired, ready, status });
      }
    })
  );

  deployments.sort((a, b) => a.nsLabel.localeCompare(b.nsLabel) || a.name.localeCompare(b.name));
  return new Response(JSON.stringify({ deployments }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create namespace-aware restart endpoint**

`website/src/pages/api/admin/ops/deployments/[ns]/[name]/restart.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../../../lib/auth';

const ALLOWED_NS = ['workspace', 'workspace-korczewski', 'website', 'website-korczewski'];

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { ns, name } = params;
  if (!ns || !ALLOWED_NS.includes(ns)) return new Response(JSON.stringify({ error: 'Ungültiger Namespace' }), { status: 400 });
  if (!name || !/^[a-z0-9-]+$/.test(name)) return new Response(JSON.stringify({ error: 'Ungültiger Name' }), { status: 400 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  await k8s.patch(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`, {
    spec: { template: { metadata: { annotations: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } } } },
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Create namespace-aware scale endpoint**

`website/src/pages/api/admin/ops/deployments/[ns]/[name]/scale.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../../../lib/auth';

const ALLOWED_NS = ['workspace', 'workspace-korczewski', 'website', 'website-korczewski'];

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { ns, name } = params;
  if (!ns || !ALLOWED_NS.includes(ns)) return new Response(JSON.stringify({ error: 'Ungültiger Namespace' }), { status: 400 });
  if (!name || !/^[a-z0-9-]+$/.test(name)) return new Response(JSON.stringify({ error: 'Ungültiger Name' }), { status: 400 });

  const body = await request.json().catch(() => ({}));
  const replicas = parseInt(body.replicas);
  if (isNaN(replicas) || replicas < 0 || replicas > 20) {
    return new Response(JSON.stringify({ error: 'Ungültige Replica-Anzahl (0–20)' }), { status: 400 });
  }

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  await k8s.patch(`/apis/apps/v1/namespaces/${ns}/deployments/${name}`, { spec: { replicas } });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Implement DienstTab**

Replace `website/src/components/admin/ops/DienstTab.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Deployment = { ns: string; nsLabel: string; name: string; desired: number; ready: number; status: string };
  type Action = { type: 'restart' | 'scale'; deployment: Deployment };

  let deployments: Deployment[] = [];
  let loading = true;
  let error: string | null = null;
  let pending: Action | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;
  let successMsg: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function load() {
    try {
      loading = deployments.length === 0;
      const res = await fetch('/api/admin/ops/deployments/list');
      if (res.ok) { const j = await res.json(); deployments = j.deployments; error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  async function confirm() {
    if (!pending) return;
    actionLoading = true; actionError = null;
    const { type, deployment: d } = pending;
    try {
      const body = type === 'scale' ? JSON.stringify({ replicas: scaleTarget }) : '{}';
      const res = await fetch(`/api/admin/ops/deployments/${d.ns}/${d.name}/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      const j = await res.json();
      if (!res.ok) { actionError = j.error ?? 'Fehler'; return; }
      successMsg = type === 'restart' ? `${d.name} wird neu gestartet…` : `${d.name} skaliert auf ${scaleTarget}`;
      pending = null;
      setTimeout(() => { successMsg = null; load(); }, 2000);
    } catch { actionError = 'Netzwerkfehler'; }
    finally { actionLoading = false; }
  }

  function statusCls(s: string) {
    if (s === 'healthy') return 'text-green-400';
    if (s === 'degraded') return 'text-yellow-400';
    return 'text-gray-500';
  }
  function statusLabel(s: string) {
    if (s === 'healthy') return '🟢 Läuft';
    if (s === 'degraded') return '🟡 Teils';
    return '⚫ Gestoppt';
  }

  onMount(() => { load(); interval = setInterval(load, 30_000); });
  onDestroy(() => clearInterval(interval));

  // Group by nsLabel
  $: grouped = deployments.reduce<Record<string, Deployment[]>>((acc, d) => {
    (acc[d.nsLabel] ??= []).push(d); return acc;
  }, {});
</script>

<div class="space-y-6">
  <div class="flex justify-between items-center">
    {#if successMsg}<p class="text-green-400 text-sm">{successMsg}</p>{:else}<span />{/if}
    <button on:click={load} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}

  {#each Object.entries(grouped) as [label, deps]}
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 class="text-sm font-semibold text-gray-200 mb-3">{label}</h3>
      <div class="space-y-2">
        {#each deps as d}
          <div class="flex items-center justify-between">
            <div>
              <span class="text-sm text-gray-200 font-mono">{d.name}</span>
              <span class="ml-3 text-xs {statusCls(d.status)}">{statusLabel(d.status)} ({d.ready}/{d.desired})</span>
            </div>
            <div class="flex gap-2">
              <button on:click={() => { pending = { type: 'restart', deployment: d }; }}
                class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded">
                Neu starten
              </button>
              <button on:click={() => { pending = { type: 'scale', deployment: d }; scaleTarget = d.desired; }}
                class="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded">
                Skalieren
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/each}
</div>

<!-- Confirmation dialog -->
{#if pending}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-sm w-full mx-4">
      {#if pending.type === 'restart'}
        <h3 class="text-base font-semibold text-white mb-2">Wirklich neu starten?</h3>
        <p class="text-sm text-gray-300 mb-4">
          <span class="font-mono text-blue-300">{pending.deployment.name}</span> ({pending.deployment.nsLabel}) wird sofort neu gestartet.
        </p>
      {:else}
        <h3 class="text-base font-semibold text-white mb-2">Replicas anpassen</h3>
        <p class="text-sm text-gray-300 mb-3">
          <span class="font-mono text-blue-300">{pending.deployment.name}</span> ({pending.deployment.nsLabel})
        </p>
        <input type="number" min="0" max="20" bind:value={scaleTarget}
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-4" />
      {/if}
      {#if actionError}<p class="text-red-400 text-sm mb-3">{actionError}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button on:click={() => pending = null}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white">Abbrechen</button>
        <button on:click={confirm} disabled={actionLoading}
          class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
          {actionLoading ? 'Lädt…' : 'Bestätigen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 5: Verify in browser**

Navigate to `http://localhost:4321/admin/ops#dienste`. Expected: deployments grouped by namespace (all fail in dev — normal). In prod after deploy: list of pods with restart/scale buttons.

- [ ] **Step 6: Commit**
```bash
git add website/src/pages/api/admin/ops/deployments/ website/src/components/admin/ops/DienstTab.svelte
git commit -m "feat(ops/dienste): deployment list + restart/scale für alle Namespaces"
```

---

## Task 6: Logs Tab — Live SSE Streaming

**Files:**
- Create: `website/src/pages/api/admin/ops/logs/stream.ts`
- Modify: `website/src/components/admin/ops/LogsTab.svelte`

- [ ] **Step 1: Create SSE log stream endpoint**

`website/src/pages/api/admin/ops/logs/stream.ts`:
```typescript
import type { APIRoute } from 'astro';
import https from 'node:https';
import { readK8sCredentials } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const ALLOWED_NS = ['workspace', 'workspace-korczewski', 'argocd', 'website', 'website-korczewski'];

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const ns = url.searchParams.get('ns') ?? 'workspace';
  const pod = url.searchParams.get('pod') ?? '';
  const container = url.searchParams.get('container') ?? '';
  const tail = Math.min(parseInt(url.searchParams.get('tail') ?? '200'), 1000);

  if (!ALLOWED_NS.includes(ns) || !pod || !/^[a-z0-9-]+$/.test(pod.split('-').join(''))) {
    return new Response('Ungültige Parameter', { status: 400 });
  }

  let creds: { token: string; ca: string };
  try { creds = await readK8sCredentials(); }
  catch { return new Response('Kein Service-Account-Token.', { status: 503 }); }

  const logPath = `/api/v1/namespaces/${ns}/pods/${pod}/log?follow=true&tailLines=${tail}${container ? `&container=${container}` : ''}`;
  const encoder = new TextEncoder();

  let k8sReq: ReturnType<typeof https.request> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      k8sReq = https.request(
        {
          hostname: 'kubernetes.default.svc.cluster.local',
          path: logPath,
          method: 'GET',
          headers: { Authorization: `Bearer ${creds.token}`, Accept: 'text/plain' },
          ca: creds.ca,
        },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(Boolean);
            for (const line of lines) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(line)}\n\n`));
            }
          });
          res.on('end', () => { controller.enqueue(encoder.encode('data: {"_eof":true}\n\n')); controller.close(); });
          res.on('error', (e) => controller.error(e));
        }
      );
      k8sReq.on('error', (e) => controller.error(e));
      k8sReq.end();
    },
    cancel() { k8sReq?.destroy(); },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
      'Connection': 'keep-alive',
    },
  });
};
```

Note: The existing `/api/admin/cluster/pods-list` endpoint already returns pod+container lists for all namespaces — reuse it.

- [ ] **Step 2: Implement LogsTab**

Replace `website/src/components/admin/ops/LogsTab.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';

  const NAMESPACES = [
    { id: 'workspace',            label: 'mentolder (workspace)' },
    { id: 'workspace-korczewski', label: 'korczewski (workspace-korczewski)' },
    { id: 'argocd',               label: 'argocd' },
    { id: 'website',              label: 'website (mentolder)' },
    { id: 'website-korczewski',   label: 'website (korczewski)' },
  ];

  type Pod = { name: string; phase: string; ready: boolean; restarts: number; containers: string[] };

  let ns = 'workspace';
  let pods: Pod[] = [];
  let selectedPod = '';
  let selectedContainer = '';
  let tail = 200;
  let filter = '';
  let autoScroll = true;

  let lines: string[] = [];
  let streaming = false;
  let podsLoading = false;
  let podsError: string | null = null;

  let logEl: HTMLElement;
  let es: EventSource | null = null;

  async function loadPods() {
    podsLoading = true; podsError = null;
    try {
      const res = await fetch(`/api/admin/cluster/pods-list?ns=${encodeURIComponent(ns)}`);
      const j = await res.json();
      if (!res.ok) { podsError = j.error ?? `Fehler ${res.status}`; return; }
      pods = j.pods;
      selectedPod = pods[0]?.name ?? '';
      selectedContainer = pods[0]?.containers?.[0] ?? '';
    } catch (e) { podsError = (e as Error).message; }
    finally { podsLoading = false; }
  }

  function startStream() {
    stopStream();
    lines = [];
    streaming = true;
    const params = new URLSearchParams({ ns, pod: selectedPod, tail: String(tail) });
    if (selectedContainer) params.set('container', selectedContainer);
    es = new EventSource(`/api/admin/ops/logs/stream?${params}`);
    es.onmessage = async (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data._eof) { streaming = false; return; }
        lines = [...lines.slice(-2000), data]; // keep last 2000 lines
        if (autoScroll) { await tick(); logEl?.scrollTo(0, logEl.scrollHeight); }
      } catch {}
    };
    es.onerror = () => { streaming = false; es?.close(); };
  }

  function stopStream() {
    es?.close(); es = null; streaming = false;
  }

  function levelClass(line: string) {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('fatal') || l.includes('err ')) return 'text-red-400';
    if (l.includes('warn')) return 'text-yellow-400';
    return 'text-green-300';
  }

  $: filteredLines = filter ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase())) : lines;

  onMount(loadPods);
  onDestroy(stopStream);
</script>

<div class="space-y-4">
  <!-- Controls -->
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <label class="text-xs text-gray-400 block mb-1">Namespace</label>
      <select bind:value={ns} on:change={loadPods}
        class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each NAMESPACES as n}<option value={n.id}>{n.label}</option>{/each}
      </select>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Pod</label>
      <select bind:value={selectedPod} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each pods as p}<option value={p.name}>{p.name}</option>{/each}
      </select>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Container</label>
      <select bind:value={selectedContainer} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each (pods.find(p => p.name === selectedPod)?.containers ?? []) as c}<option value={c}>{c}</option>{/each}
      </select>
    </div>
    <div>
      <label class="text-xs text-gray-400 block mb-1">Letzte Zeilen</label>
      <select bind:value={tail} class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        {#each [50, 100, 200, 500] as n}<option value={n}>{n}</option>{/each}
      </select>
    </div>
    {#if streaming}
      <button on:click={stopStream} class="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded">⏹ Stopp</button>
    {:else}
      <button on:click={startStream} disabled={!selectedPod}
        class="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
        ▶ Live-Stream starten
      </button>
    {/if}
  </div>

  <!-- Filter + auto-scroll -->
  <div class="flex gap-3 items-center">
    <input bind:value={filter} placeholder="Filter…"
      class="flex-1 max-w-xs bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white" />
    <label class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
      <input type="checkbox" bind:checked={autoScroll} class="rounded" />
      Auto-Scroll
    </label>
    <span class="text-xs text-gray-500">{lines.length} Zeilen</span>
  </div>

  <!-- Log output -->
  <div bind:this={logEl}
    class="bg-gray-950 border border-gray-700 rounded-lg p-3 h-96 overflow-y-auto font-mono text-xs leading-relaxed">
    {#if lines.length === 0}
      <p class="text-gray-600">{streaming ? 'Warte auf Logs…' : 'Stream starten um Logs anzuzeigen.'}</p>
    {/if}
    {#each filteredLines as line}
      <div class="{levelClass(line)} break-all">{line}</div>
    {/each}
  </div>

  {#if podsError}<p class="text-red-400 text-xs">{podsError}</p>{/if}
</div>
```

- [ ] **Step 3: Verify SSE works in dev**

Since in dev there's no real k8s API, the stream will immediately error. Verify:
- The EventSource connects without JS errors
- `stopStream` button appears when streaming is true
- Stopping clears the connection

- [ ] **Step 4: Commit**
```bash
git add website/src/pages/api/admin/ops/logs/ website/src/components/admin/ops/LogsTab.svelte
git commit -m "feat(ops/logs): live SSE log streaming für alle Namespaces"
```

---

## Task 7: ArgoCD Ops Tab

**Files:**
- Create: `website/src/pages/api/admin/ops/argocd/sync.ts`
- Modify: `website/src/components/admin/ops/ArgoCDOpsTab.svelte`

The existing `/api/admin/cluster/argocd-apps` endpoint already lists apps. We only add the sync endpoint.

- [ ] **Step 1: Create ArgoCD sync endpoint**

`website/src/pages/api/admin/ops/argocd/sync.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const app = body.app as string;
  const hard = body.hard === true;

  if (!app || !/^[a-z0-9-]+$/.test(app)) {
    return new Response(JSON.stringify({ error: 'Ungültiger App-Name' }), { status: 400 });
  }

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  // Trigger sync by patching the Application resource with an operation
  await k8s.patch(`/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/${app}`, {
    operation: {
      sync: {
        revision: 'HEAD',
        prune: false,
        dryRun: false,
        force: hard,
      },
    },
  });

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Implement ArgoCDOpsTab**

Replace `website/src/components/admin/ops/ArgoCDOpsTab.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type App = {
    name: string; project: string; syncStatus: string; health: string;
    lastSyncedAt: string | null; operationPhase: string;
  };

  let apps: App[] = [];
  let loading = true;
  let error: string | null = null;
  let syncingApp: string | null = null;
  let syncError: string | null = null;
  let syncSuccess: string | null = null;
  let interval: ReturnType<typeof setInterval>;

  async function load() {
    try {
      loading = apps.length === 0;
      const res = await fetch('/api/admin/cluster/argocd-apps');
      if (res.ok) { const j = await res.json(); apps = j.apps; error = null; }
      else { const j = await res.json().catch(() => ({})); error = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { error = (e as Error).message; }
    finally { loading = false; }
  }

  async function sync(appName: string, hard = false) {
    syncingApp = appName; syncError = null; syncSuccess = null;
    try {
      const res = await fetch('/api/admin/ops/argocd/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appName, hard }),
      });
      const j = await res.json();
      if (!res.ok) { syncError = j.error ?? 'Fehler'; return; }
      syncSuccess = `${appName} Sync gestartet`;
      setTimeout(() => { syncSuccess = null; load(); }, 3000);
    } catch { syncError = 'Netzwerkfehler'; }
    finally { syncingApp = null; }
  }

  function syncCls(s: string) {
    if (s === 'Synced') return 'bg-green-900/40 text-green-300';
    if (s === 'OutOfSync') return 'bg-yellow-900/40 text-yellow-300';
    return 'bg-gray-700 text-gray-400';
  }
  function healthCls(h: string) {
    if (h === 'Healthy') return 'bg-green-900/40 text-green-300';
    if (h === 'Degraded' || h === 'Missing') return 'bg-red-900/40 text-red-300';
    if (h === 'Progressing') return 'bg-blue-900/40 text-blue-300';
    return 'bg-gray-700 text-gray-400';
  }
  function fmtTime(t: string | null) {
    if (!t) return '–';
    const mins = Math.floor((Date.now() - new Date(t).getTime()) / 60000);
    return mins < 60 ? `vor ${mins}m` : `vor ${Math.floor(mins / 60)}h`;
  }

  onMount(() => { load(); interval = setInterval(load, 30_000); });
  onDestroy(() => clearInterval(interval));
</script>

<div class="space-y-4">
  <div class="flex justify-between items-center">
    {#if syncSuccess}<p class="text-green-400 text-sm">{syncSuccess}</p>{:else}<span />{/if}
    <button on:click={load} disabled={loading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {loading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if error}<p class="text-red-400 text-sm">{error}</p>{/if}
  {#if syncError}<p class="text-red-400 text-sm">{syncError}</p>{/if}

  <div class="space-y-2">
    {#each apps as app}
      <div class="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <div class="flex-1 min-w-0">
          <span class="text-sm font-mono text-gray-100">{app.name}</span>
          <span class="ml-2 text-xs text-gray-500">{app.project}</span>
        </div>
        <span class="px-2 py-0.5 rounded text-xs {syncCls(app.syncStatus)}">{app.syncStatus}</span>
        <span class="px-2 py-0.5 rounded text-xs {healthCls(app.health)}">{app.health}</span>
        <span class="text-xs text-gray-500 whitespace-nowrap">{fmtTime(app.lastSyncedAt)}</span>
        <div class="flex gap-2">
          <button on:click={() => sync(app.name)} disabled={syncingApp === app.name}
            class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded">
            {syncingApp === app.name ? '…' : 'Sync'}
          </button>
          <button on:click={() => sync(app.name, true)} disabled={syncingApp === app.name}
            class="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white rounded">
            Hard Refresh
          </button>
        </div>
      </div>
    {/each}
    {#if !loading && apps.length === 0}
      <p class="text-gray-500 text-sm">Keine ArgoCD-Apps gefunden. RBAC korrekt konfiguriert?</p>
    {/if}
  </div>
</div>
```

- [ ] **Step 3: Commit**
```bash
git add website/src/pages/api/admin/ops/argocd/ website/src/components/admin/ops/ArgoCDOpsTab.svelte
git commit -m "feat(ops/argocd): sync + hard-refresh via k8s Application patch"
```

---

## Task 8: Datenbank Tab

**Files:**
- Create: `website/src/pages/api/admin/ops/backup/trigger.ts`
- Create: `website/src/pages/api/admin/ops/backup/list.ts`
- Create: `website/src/pages/api/admin/ops/restore.ts`
- Modify: `website/src/components/admin/ops/DatenbankTab.svelte`

- [ ] **Step 1: Create backup trigger endpoint**

`website/src/pages/api/admin/ops/backup/trigger.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const NS: Record<string, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const ns = NS[cluster];
  if (!ns) return new Response(JSON.stringify({ error: 'Ungültiger Cluster (mentolder|korczewski)' }), { status: 400 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const cronJob = await k8s.get(`/apis/batch/v1/namespaces/${ns}/cronjobs/db-backup`);
  const jobName = `db-backup-manual-${Date.now()}`;
  const job = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name: jobName, namespace: ns, labels: { app: 'db-backup', trigger: 'manual' } },
    spec: cronJob.spec.jobTemplate.spec,
  };
  await k8s.post(`/apis/batch/v1/namespaces/${ns}/jobs`, job);

  return new Response(JSON.stringify({ ok: true, jobName }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 2: Create backup list endpoint**

`website/src/pages/api/admin/ops/backup/list.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../../lib/auth';

const NS: Record<string, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const url = new URL(request.url);
  const cluster = url.searchParams.get('cluster') ?? 'mentolder';
  const ns = NS[cluster];
  if (!ns) return new Response(JSON.stringify({ error: 'Ungültiger Cluster' }), { status: 400 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const data = await k8s.get(`/apis/batch/v1/namespaces/${ns}/jobs?labelSelector=app%3Ddb-backup`);
  const jobs = (data.items ?? [])
    .map((j: any) => ({
      name: j.metadata.name,
      trigger: j.metadata.labels?.trigger ?? 'cron',
      startTime: j.status?.startTime ?? null,
      completionTime: j.status?.completionTime ?? null,
      succeeded: (j.status?.succeeded ?? 0) > 0,
      failed: (j.status?.failed ?? 0) > 0,
    }))
    .sort((a: any, b: any) => new Date(b.startTime ?? 0).getTime() - new Date(a.startTime ?? 0).getTime())
    .slice(0, 20);

  return new Response(JSON.stringify({ jobs }), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3: Create restore endpoint**

`website/src/pages/api/admin/ops/restore.ts`:
```typescript
import type { APIRoute } from 'astro';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const NS: Record<string, string> = { mentolder: 'workspace', korczewski: 'workspace-korczewski' };
const VALID_DBS = ['keycloak', 'nextcloud', 'vaultwarden', 'website', 'docuseal', 'all'];

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const db = body.db as string;
  const backupJobName = body.backupJobName as string; // used as timestamp reference

  const ns = NS[cluster];
  if (!ns) return new Response(JSON.stringify({ error: 'Ungültiger Cluster' }), { status: 400 });
  if (!VALID_DBS.includes(db)) return new Response(JSON.stringify({ error: 'Ungültige DB' }), { status: 400 });
  if (!backupJobName || !/^[a-z0-9-]+$/.test(backupJobName)) {
    return new Response(JSON.stringify({ error: 'Ungültiger Backup-Job-Name' }), { status: 400 });
  }

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  // Get the backup job to extract its startTime (used as timestamp for restore)
  const jobData = await k8s.get(`/apis/batch/v1/namespaces/${ns}/jobs/${backupJobName}`);
  const startTime = jobData.status?.startTime;
  if (!startTime) return new Response(JSON.stringify({ error: 'Backup-Job hat keinen Startzeitstempel' }), { status: 400 });

  // Format: YYYYMMDD_HHMMSS (matching backup script naming)
  const ts = new Date(startTime);
  const timestamp = [
    ts.getUTCFullYear(),
    String(ts.getUTCMonth() + 1).padStart(2, '0'),
    String(ts.getUTCDate()).padStart(2, '0'),
    '_',
    String(ts.getUTCHours()).padStart(2, '0'),
    String(ts.getUTCMinutes()).padStart(2, '0'),
    String(ts.getUTCSeconds()).padStart(2, '0'),
  ].join('');

  // Create a restore Job from the backup CronJob template with restore env vars
  const cronJob = await k8s.get(`/apis/batch/v1/namespaces/${ns}/cronjobs/db-backup`);
  const jobName = `db-restore-${db}-${Date.now()}`;
  const spec = structuredClone(cronJob.spec.jobTemplate.spec);

  // Inject restore-mode env vars into the backup container
  const container = spec.template.spec.containers[0];
  container.env = [
    ...(container.env ?? []),
    { name: 'RESTORE_MODE', value: 'true' },
    { name: 'RESTORE_DB', value: db },
    { name: 'RESTORE_TIMESTAMP', value: timestamp },
  ];

  const job = {
    apiVersion: 'batch/v1', kind: 'Job',
    metadata: { name: jobName, namespace: ns, labels: { app: 'db-backup', trigger: 'restore' } },
    spec,
  };
  await k8s.post(`/apis/batch/v1/namespaces/${ns}/jobs`, job);

  return new Response(JSON.stringify({ ok: true, jobName, timestamp }), { headers: { 'Content-Type': 'application/json' } });
};
```

**Note:** The restore endpoint creates a Job with `RESTORE_MODE=true`, `RESTORE_DB`, `RESTORE_TIMESTAMP` env vars. The actual backup script in the container must support these env vars to perform a restore. If the backup script doesn't support restore mode yet, the Job will be created but will do nothing useful — a warning should be shown in the UI. Verify with `kubectl exec` or check the backup script source.

- [ ] **Step 4: Implement DatenbankTab**

Replace `website/src/components/admin/ops/DatenbankTab.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  type BackupJob = { name: string; trigger: string; startTime: string | null; completionTime: string | null; succeeded: boolean; failed: boolean };

  let cluster = 'mentolder';
  let jobs: BackupJob[] = [];
  let jobsLoading = false;
  let triggerLoading = false;
  let triggerMsg: string | null = null;
  let triggerError: string | null = null;

  // Restore
  let restoreJob: BackupJob | null = null;
  let restoreDb = 'all';
  let restoreLoading = false;
  let restoreError: string | null = null;
  let restoreMsg: string | null = null;
  let confirmRestore = false;

  const DBS = ['all', 'keycloak', 'nextcloud', 'vaultwarden', 'website', 'docuseal'];

  async function loadJobs() {
    jobsLoading = true;
    try {
      const res = await fetch(`/api/admin/ops/backup/list?cluster=${cluster}`);
      const j = await res.json();
      if (res.ok) jobs = j.jobs;
      else triggerError = j.error ?? `Fehler ${res.status}`;
    } catch (e) { triggerError = (e as Error).message; }
    finally { jobsLoading = false; }
  }

  async function triggerBackup() {
    triggerLoading = true; triggerMsg = null; triggerError = null;
    try {
      const res = await fetch('/api/admin/ops/backup/trigger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster }),
      });
      const j = await res.json();
      if (!res.ok) { triggerError = j.error ?? 'Fehler'; return; }
      triggerMsg = `Backup gestartet: ${j.jobName}`;
      setTimeout(() => { triggerMsg = null; loadJobs(); }, 3000);
    } catch { triggerError = 'Netzwerkfehler'; }
    finally { triggerLoading = false; }
  }

  async function doRestore() {
    if (!restoreJob) return;
    restoreLoading = true; restoreError = null;
    try {
      const res = await fetch('/api/admin/ops/restore', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, db: restoreDb, backupJobName: restoreJob.name }),
      });
      const j = await res.json();
      if (!res.ok) { restoreError = j.error ?? 'Fehler'; return; }
      restoreMsg = `Restore-Job gestartet: ${j.jobName}`;
      restoreJob = null; confirmRestore = false;
      setTimeout(() => { restoreMsg = null; loadJobs(); }, 3000);
    } catch { restoreError = 'Netzwerkfehler'; }
    finally { restoreLoading = false; }
  }

  function fmtTime(t: string | null) {
    if (!t) return '–';
    return new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  }

  onMount(loadJobs);
</script>

<div class="space-y-6">
  <!-- Cluster selector + trigger -->
  <div class="flex flex-wrap gap-3 items-end">
    <div>
      <label class="text-xs text-gray-400 block mb-1">Cluster</label>
      <select bind:value={cluster} on:change={loadJobs}
        class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
        <option value="mentolder">mentolder.de</option>
        <option value="korczewski">korczewski.de</option>
      </select>
    </div>
    <button on:click={triggerBackup} disabled={triggerLoading}
      class="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
      {triggerLoading ? '…' : '💾 Backup jetzt auslösen'}
    </button>
    <button on:click={loadJobs} disabled={jobsLoading}
      class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
      {jobsLoading ? 'Lädt…' : '↻ Aktualisieren'}
    </button>
  </div>

  {#if triggerMsg}<p class="text-green-400 text-sm">{triggerMsg}</p>{/if}
  {#if triggerError}<p class="text-red-400 text-sm">{triggerError}</p>{/if}
  {#if restoreMsg}<p class="text-green-400 text-sm">{restoreMsg}</p>{/if}

  <!-- Backup list -->
  <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-gray-700 text-xs text-gray-400">
          <th class="px-4 py-2 text-left">Job</th>
          <th class="px-4 py-2 text-left">Gestartet</th>
          <th class="px-4 py-2 text-left">Abgeschlossen</th>
          <th class="px-4 py-2 text-left">Status</th>
          <th class="px-4 py-2 text-left">Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each jobs as job}
          <tr class="border-b border-gray-700/50 hover:bg-gray-700/30">
            <td class="px-4 py-2 font-mono text-xs text-gray-300">{job.name}</td>
            <td class="px-4 py-2 text-xs text-gray-400">{fmtTime(job.startTime)}</td>
            <td class="px-4 py-2 text-xs text-gray-400">{fmtTime(job.completionTime)}</td>
            <td class="px-4 py-2">
              {#if job.succeeded}
                <span class="text-xs text-green-400">✓ Erfolgreich</span>
              {:else if job.failed}
                <span class="text-xs text-red-400">✗ Fehlgeschlagen</span>
              {:else}
                <span class="text-xs text-yellow-400">⏳ Läuft</span>
              {/if}
            </td>
            <td class="px-4 py-2">
              {#if job.succeeded}
                <button on:click={() => { restoreJob = job; restoreError = null; confirmRestore = false; }}
                  class="px-2 py-0.5 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded">
                  Wiederherstellen
                </button>
              {/if}
            </td>
          </tr>
        {/each}
        {#if jobs.length === 0 && !jobsLoading}
          <tr><td colspan="5" class="px-4 py-4 text-center text-gray-500 text-xs">Keine Backup-Jobs gefunden</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<!-- Restore dialog -->
{#if restoreJob}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog">
    <div class="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-base font-semibold text-white mb-2">Datenbank wiederherstellen</h3>
      <p class="text-sm text-gray-300 mb-1">
        Aus Backup: <span class="font-mono text-blue-300">{restoreJob.name}</span>
      </p>
      <p class="text-xs text-gray-500 mb-4">Gestartet: {fmtTime(restoreJob.startTime)}</p>

      <div class="mb-4">
        <label class="text-xs text-gray-400 block mb-1">Datenbank</label>
        <select bind:value={restoreDb}
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm">
          {#each DBS as db}<option value={db}>{db === 'all' ? 'Alle' : db}</option>{/each}
        </select>
      </div>

      <div class="bg-red-900/30 border border-red-700 rounded p-3 mb-4">
        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" bind:checked={confirmRestore} class="mt-0.5 rounded" />
          <span class="text-xs text-red-300">
            Achtung: Diese Aktion überschreibt die aktuelle Datenbank unwiderruflich. Ich habe verstanden, dass alle neueren Daten verloren gehen.
          </span>
        </label>
      </div>

      {#if restoreError}<p class="text-red-400 text-sm mb-3">{restoreError}</p>{/if}
      <div class="flex gap-3 justify-end">
        <button on:click={() => restoreJob = null}
          class="px-4 py-2 text-sm text-gray-300 hover:text-white">Abbrechen</button>
        <button on:click={doRestore} disabled={!confirmRestore || restoreLoading}
          class="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded">
          {restoreLoading ? 'Lädt…' : 'Jetzt wiederherstellen'}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 5: Commit**
```bash
git add website/src/pages/api/admin/ops/backup/ website/src/pages/api/admin/ops/restore.ts \
        website/src/components/admin/ops/DatenbankTab.svelte
git commit -m "feat(ops/datenbank): backup trigger, job-liste, restore mit Bestätigung"
```

---

## Task 9: DNS & Zertifikate Tab

**Files:**
- Create: `website/src/pages/api/admin/ops/certs.ts`
- Create: `website/src/pages/api/admin/ops/dns/pin.ts`
- Modify: `website/src/components/admin/ops/DnsZertTab.svelte`

- [ ] **Step 1: Create certs endpoint**

`website/src/pages/api/admin/ops/certs.ts`:
```typescript
import type { APIRoute } from 'astro';
import { X509Certificate } from 'node:crypto';
import { createK8sClient } from '../../../../lib/k8s';
import { getSession, isAdmin } from '../../../../lib/auth';

const TLS_SECRETS: Record<string, { ns: string; name: string }> = {
  mentolder:  { ns: 'workspace',            name: 'workspace-wildcard-tls' },
  korczewski: { ns: 'workspace-korczewski', name: 'korczewski-tls' },
};

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let k8s;
  try { k8s = await createK8sClient(); }
  catch { return new Response(JSON.stringify({ error: 'Kein Service-Account-Token.' }), { status: 503 }); }

  const results: Record<string, { notAfter: string | null; daysLeft: number | null; error?: string }> = {};

  for (const [cluster, { ns, name }] of Object.entries(TLS_SECRETS)) {
    try {
      const secret = await k8s.get(`/api/v1/namespaces/${ns}/secrets/${name}`);
      const certBase64 = secret.data?.['tls.crt'];
      if (!certBase64) { results[cluster] = { notAfter: null, daysLeft: null, error: 'Kein tls.crt im Secret' }; continue; }
      const cert = new X509Certificate(Buffer.from(certBase64, 'base64'));
      const notAfter = cert.validTo;
      const daysLeft = Math.floor((new Date(notAfter).getTime() - Date.now()) / 86400000);
      results[cluster] = { notAfter, daysLeft };
    } catch (e: any) {
      results[cluster] = { notAfter: null, daysLeft: null, error: e.message };
    }
  }

  return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 2: Create DNS pin endpoint**

`website/src/pages/api/admin/ops/dns/pin.ts`:
```typescript
import type { APIRoute } from 'astro';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../../lib/auth';

const CONFIG: Record<string, { domain: string; pinIp: string; hashEnvVar: string }> = {
  mentolder:  { domain: 'mentolder.de',  pinIp: process.env.LIVEKIT_PIN_IP_MENTOLDER  ?? '46.225.125.59', hashEnvVar: 'IPV64_UPDATE_HASH_MENTOLDER' },
  korczewski: { domain: 'korczewski.de', pinIp: process.env.LIVEKIT_PIN_IP_KORCZEWSKI ?? '37.27.251.38',  hashEnvVar: 'IPV64_UPDATE_HASH_KORCZEWSKI' },
};

function ipv64Update(hash: string, subdomain: string, ip: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const path = `/update.php?key=${encodeURIComponent(hash)}&domain=${encodeURIComponent(subdomain)}&ip=${encodeURIComponent(ip)}`;
    const req = https.get({ hostname: 'ipv64.net', path, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body.trim()));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const body = await request.json().catch(() => ({}));
  const cluster = body.cluster as string;
  const cfg = CONFIG[cluster];
  if (!cfg) return new Response(JSON.stringify({ error: 'Ungültiger Cluster (mentolder|korczewski)' }), { status: 400 });

  const hash = process.env[cfg.hashEnvVar] ?? '';
  if (!hash) return new Response(JSON.stringify({ error: `${cfg.hashEnvVar} nicht konfiguriert. Bitte in website-secrets setzen.` }), { status: 503 });

  const results: string[] = [];
  for (const sub of ['livekit', 'stream']) {
    const fqdn = `${sub}.${cfg.domain}`;
    const resp = await ipv64Update(hash, fqdn, cfg.pinIp);
    results.push(`${fqdn} → ${cfg.pinIp}: ${resp}`);
  }

  return new Response(JSON.stringify({ ok: true, results, pinIp: cfg.pinIp }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3: Implement DnsZertTab**

Replace `website/src/components/admin/ops/DnsZertTab.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  type CertResult = { notAfter: string | null; daysLeft: number | null; error?: string };
  type CertsData = { results: Record<string, CertResult>; checkedAt: string };

  let certsData: CertsData | null = null;
  let certsLoading = true;
  let certsError: string | null = null;

  let pinCluster = 'mentolder';
  let pinLoading = false;
  let pinResults: string[] = [];
  let pinError: string | null = null;

  const CLUSTER_LABELS: Record<string, string> = { mentolder: 'mentolder.de', korczewski: 'korczewski.de' };

  async function loadCerts() {
    certsLoading = true; certsError = null;
    try {
      const res = await fetch('/api/admin/ops/certs');
      if (res.ok) { certsData = await res.json(); }
      else { const j = await res.json().catch(() => ({})); certsError = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { certsError = (e as Error).message; }
    finally { certsLoading = false; }
  }

  async function pinDns() {
    pinLoading = true; pinError = null; pinResults = [];
    try {
      const res = await fetch('/api/admin/ops/dns/pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster: pinCluster }),
      });
      const j = await res.json();
      if (!res.ok) { pinError = j.error ?? 'Fehler'; return; }
      pinResults = j.results;
    } catch { pinError = 'Netzwerkfehler'; }
    finally { pinLoading = false; }
  }

  function certStatusCls(days: number | null) {
    if (days === null) return 'bg-gray-700 text-gray-400';
    if (days < 10) return 'bg-red-900/40 text-red-300';
    if (days < 30) return 'bg-yellow-900/40 text-yellow-300';
    return 'bg-green-900/40 text-green-300';
  }

  onMount(loadCerts);
</script>

<div class="space-y-8">

  <!-- Zertifikate -->
  <div>
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-semibold text-gray-200">🔐 Wildcard-Zertifikate</h3>
      <button on:click={loadCerts} disabled={certsLoading}
        class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
        {certsLoading ? 'Prüfe…' : '↻ Prüfen'}
      </button>
    </div>
    {#if certsError}<p class="text-red-400 text-sm">{certsError}</p>{/if}
    {#if certsData}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each Object.entries(certsData.results) as [cluster, cert]}
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div class="text-sm font-medium text-gray-200 mb-2">{CLUSTER_LABELS[cluster] ?? cluster}</div>
            {#if cert.error}
              <p class="text-red-400 text-xs">{cert.error}</p>
            {:else}
              <div class="px-3 py-2 rounded {certStatusCls(cert.daysLeft)}">
                {#if cert.daysLeft !== null}
                  <span class="text-sm font-semibold">Noch {cert.daysLeft} Tage gültig</span>
                {/if}
                <div class="text-xs mt-1 opacity-80">
                  Läuft ab: {cert.notAfter ? new Date(cert.notAfter).toLocaleDateString('de-DE') : '–'}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- DNS Pinning -->
  <div>
    <h3 class="text-sm font-semibold text-gray-200 mb-3">📌 LiveKit DNS-Pinning</h3>
    <p class="text-xs text-gray-400 mb-4">
      Setzt <code>livekit.*</code> und <code>stream.*</code> DNS-Einträge auf die Pin-Node-IP (mentolder: 46.225.125.59, korczewski: 37.27.251.38).
      Nötig nach Node-Wechsel oder IP-Änderung.
    </p>
    <div class="flex flex-wrap gap-3 items-end">
      <div>
        <label class="text-xs text-gray-400 block mb-1">Cluster</label>
        <select bind:value={pinCluster}
          class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
          <option value="mentolder">mentolder.de</option>
          <option value="korczewski">korczewski.de</option>
        </select>
      </div>
      <button on:click={pinDns} disabled={pinLoading}
        class="px-3 py-1.5 text-sm bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white rounded">
        {pinLoading ? '…' : '📌 DNS jetzt pinnen'}
      </button>
    </div>
    {#if pinError}<p class="text-red-400 text-sm mt-3">{pinError}</p>{/if}
    {#if pinResults.length > 0}
      <div class="mt-3 bg-gray-900 border border-gray-700 rounded p-3 font-mono text-xs space-y-1">
        {#each pinResults as line}<div class="text-green-300">{line}</div>{/each}
      </div>
    {/if}
  </div>

</div>
```

- [ ] **Step 4: Commit**
```bash
git add website/src/pages/api/admin/ops/certs.ts website/src/pages/api/admin/ops/dns/ \
        website/src/components/admin/ops/DnsZertTab.svelte
git commit -m "feat(ops/dns-zert): Zertifikat-Status und LiveKit DNS-Pinning"
```

---

## Task 10: Deploy to Production

- [ ] **Step 1: Apply new RBAC to both clusters**
```bash
task workspace:deploy ENV=mentolder
task workspace:deploy ENV=korczewski
```
Expected: no errors, RBAC resources created/updated.

- [ ] **Step 2: Add IPV64_UPDATE_HASH values to prod secrets**

Edit `environments/.secrets/mentolder.yaml` and `environments/.secrets/korczewski.yaml`:
```yaml
IPV64_UPDATE_HASH_MENTOLDER: "<the domain_update_hash from ipv64.net for mentolder.de>"
IPV64_UPDATE_HASH_KORCZEWSKI: "<the domain_update_hash from ipv64.net for korczewski.de>"
```

Then reseal and redeploy:
```bash
task env:seal ENV=mentolder
task env:seal ENV=korczewski
task feature:website
```

- [ ] **Step 3: Verify the page loads on both clusters**

Open `https://web.mentolder.de/admin/ops` and `https://web.korczewski.de/admin/ops`.
Expected: 6 tabs load, Gesundheit shows real service status, Dienste shows deployments.

- [ ] **Step 4: Test each tab manually**

- Gesundheit: check that all 🟢/🟡/🔴 indicators match real service state
- Dienste: restart one non-critical deployment (e.g. brett), confirm it recovers
- Logs: stream logs from `nextcloud` container, verify live output appears
- ArgoCD: confirm app list loads, trigger a Sync on a synced app (should be no-op)
- Datenbank: trigger a backup, wait ~2 minutes, refresh list and confirm job shows ✓ Erfolgreich
- DNS & Zertifikate: verify cert days match reality; DO NOT trigger DNS pin unless LiveKit is misbehaving

- [ ] **Step 5: Final commit + PR**
```bash
git add environments/sealed-secrets/
git commit -m "chore(secrets): seal IPV64_UPDATE_HASH vars for ops DNS-pinning"
```
Then open a PR per the normal workflow.
