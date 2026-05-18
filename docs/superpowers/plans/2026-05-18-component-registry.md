---
ticket_id: T000455
title: Component Registry Implementation Plan
domains: []
status: active
pr_number: null
---

# Component Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken AI-classifier-based software-history approach with a simple, manually-maintained component registry table tracking physical (hardware) and non-physical (software) platform components.

**Architecture:** A single `bachelorprojekt.components` table in the `website` PostgreSQL database holds the registry. CRUD is exposed via four Astro API routes. A Svelte component at `/admin/software-history` renders the registry in grouped card grids with inline editing. All old software-history machinery (classifier, events table, views) is deleted.

**Tech Stack:** PostgreSQL 16, Astro API routes, Svelte 4, Zod, `pool` from `website-db.ts`

---

## File Map

| Action | File |
|---|---|
| Modify | `k3d/website-schema.yaml` |
| Modify | `k3d/website.yaml` |
| Create | `scripts/one-shot/20260518-components-seed.sql` |
| Create | `website/src/lib/components-db.ts` |
| Create | `website/src/pages/api/admin/components/index.ts` |
| Create | `website/src/pages/api/admin/components/[id].ts` |
| Create | `website/src/components/admin/Components.svelte` |
| Modify | `website/src/pages/admin/software-history.astro` |
| Delete | `website/src/lib/software-history-db.ts` |
| Delete | `website/src/lib/software-history-classifier.ts` |
| Delete | `website/src/pages/api/admin/software-history/index.ts` |
| Delete | `website/src/pages/api/admin/software-history/[id].ts` |
| Delete | `website/src/components/admin/SoftwareHistory.svelte` |
| Delete | `scripts/software-history-classify.mts` |

---

### Task 1: Schema — add `bachelorprojekt.components`, remove stale env var

**Files:**
- Modify: `k3d/website-schema.yaml` (before the `GRANT USAGE ON SCHEMA bachelorprojekt TO website;` line, currently ~line 1460)
- Modify: `k3d/website.yaml` (remove `TRACKING_DB_URL` env var, currently ~lines 222-223)

- [ ] **Step 1: Add components table to website-schema.yaml**

Find the line `      GRANT USAGE ON SCHEMA bachelorprojekt TO website;` and insert the following block immediately before it:

```yaml
      CREATE TABLE IF NOT EXISTS bachelorprojekt.components (
        id         BIGSERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL CHECK (kind IN ('physical','non-physical')),
        area       TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive','deprecated')),
        cluster    TEXT NOT NULL DEFAULT 'both'
                     CHECK (cluster IN ('mentolder','korczewski','both')),
        url        TEXT,
        hostname   TEXT,
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_components_name
        ON bachelorprojekt.components (lower(name));

```

- [ ] **Step 2: Remove TRACKING_DB_URL from k3d/website.yaml**

Delete these two lines from the env block:
```yaml
            - name: TRACKING_DB_URL
              value: "postgresql://website:$(WEBSITE_DB_PASSWORD)@shared-db.${WORKSPACE_NAMESPACE}.svc.cluster.local:5432/postgres"
```

- [ ] **Step 3: Validate manifests**

```bash
task workspace:validate
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add k3d/website-schema.yaml k3d/website.yaml
git commit -m "feat(schema): add bachelorprojekt.components table, remove TRACKING_DB_URL"
```

---

### Task 2: Seed Script

**Files:**
- Create: `scripts/one-shot/20260518-components-seed.sql`

- [ ] **Step 1: Create seed script**

```sql
-- scripts/one-shot/20260518-components-seed.sql
-- Idempotent seed for bachelorprojekt.components.
-- Run on BOTH clusters after schema deploy:
--   task workspace:psql ENV=mentolder -- website < scripts/one-shot/20260518-components-seed.sql
--   task workspace:psql ENV=korczewski -- website < scripts/one-shot/20260518-components-seed.sql

INSERT INTO bachelorprojekt.components (name, kind, area, status, cluster, hostname, notes) VALUES
  -- mentolder control-planes (Hetzner Helsinki)
  ('gekko-hetzner-2', 'physical', 'infra', 'active', 'mentolder', '185.207.228.24', 'CP1, dev k3d host'),
  ('gekko-hetzner-3', 'physical', 'infra', 'active', 'mentolder', '46.225.125.59',  'CP2, LiveKit pin node'),
  ('gekko-hetzner-4', 'physical', 'infra', 'active', 'mentolder', '185.207.228.118','CP3'),
  -- mentolder home-LAN workers (WireGuard mesh)
  ('k3s-1', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3s-2', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3s-3', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3w-1', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3w-2', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  ('k3w-3', 'physical', 'infra', 'active', 'mentolder', NULL, 'Home LAN worker'),
  -- mentolder GPU host
  ('GPU-Host (RTX 5070 Ti)', 'physical', 'ai', 'active', 'mentolder', '10.10.0.3', 'wg-mesh, LLM + embed + rerank'),
  -- korczewski nodes
  ('pk-hetzner-4', 'physical', 'infra', 'active', 'korczewski', NULL, 'CP1'),
  ('pk-hetzner-6', 'physical', 'infra', 'active', 'korczewski', NULL, 'Worker'),
  ('pk-hetzner-8', 'physical', 'infra', 'active', 'korczewski', NULL, 'Worker')
ON CONFLICT DO NOTHING;

INSERT INTO bachelorprojekt.components (name, kind, area, status, cluster, url, notes) VALUES
  ('Keycloak',            'non-physical', 'auth',      'active', 'both',       NULL, 'SSO/OIDC provider'),
  ('Nextcloud',           'non-physical', 'files',     'active', 'both',       NULL, 'Files + Talk + Calendar'),
  ('Collabora',           'non-physical', 'office',    'active', 'both',       NULL, 'Online office suite'),
  ('Vaultwarden',         'non-physical', 'auth',      'active', 'both',       NULL, 'Password manager'),
  ('DocuSeal',            'non-physical', 'signing',   'active', 'both',       NULL, 'Document signing'),
  ('LiveKit',             'non-physical', 'streaming', 'active', 'mentolder',  NULL, 'WebRTC server, hostNetwork on gekko-hetzner-3'),
  ('LiveKit Ingress',     'non-physical', 'streaming', 'active', 'mentolder',  NULL, 'RTMP ingress for OBS'),
  ('Arena-Server',        'non-physical', 'gaming',    'active', 'korczewski', NULL, 'Multiplayer via arena-ws.korczewski.de'),
  ('Brett (Systembrett)', 'non-physical', 'tools',     'active', 'both',       NULL, '3D systemic-constellation board'),
  ('Website (Astro)',     'non-physical', 'web',       'active', 'both',       NULL, 'Main website + messaging'),
  ('PostgreSQL shared-db','non-physical', 'data',      'active', 'both',       NULL, 'Shared database, one per cluster'),
  ('Claude Code',         'non-physical', 'ai',        'active', 'both',       NULL, 'AI assistant + MCP monolith'),
  ('Whisper Transcriber', 'non-physical', 'ai',        'active', 'mentolder',  NULL, 'Talk transcription bot'),
  ('Traefik',             'non-physical', 'infra',     'active', 'both',       NULL, 'k3s built-in ingress'),
  ('cert-manager',        'non-physical', 'infra',     'active', 'both',       NULL, 'TLS cert automation via DNS-01'),
  ('Sealed Secrets',      'non-physical', 'infra',     'active', 'both',       NULL, 'Bitnami sealed-secrets controller'),
  ('Mailpit',             'non-physical', 'messaging', 'active', 'mentolder',  NULL, 'Dev SMTP trap'),
  ('Janus + coturn',      'non-physical', 'webrtc',    'active', 'both',       NULL, 'Talk HPB signaling + TURN relay')
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/one-shot/20260518-components-seed.sql
git commit -m "feat(seed): add components seed script with 31 known platform entries"
```

---

### Task 3: DB Helpers

**Files:**
- Create: `website/src/lib/components-db.ts`

- [ ] **Step 1: Create components-db.ts**

```typescript
// website/src/lib/components-db.ts
import type { Pool } from 'pg';
import { pool } from './website-db';

export interface ComponentRow {
  id: number;
  name: string;
  kind: 'physical' | 'non-physical';
  area: string;
  status: 'active' | 'inactive' | 'deprecated';
  cluster: 'mentolder' | 'korczewski' | 'both';
  url: string | null;
  hostname: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComponentInput {
  name: string;
  kind: 'physical' | 'non-physical';
  area: string;
  status?: 'active' | 'inactive' | 'deprecated';
  cluster?: 'mentolder' | 'korczewski' | 'both';
  url?: string | null;
  hostname?: string | null;
  notes?: string | null;
}

export interface ListFilters {
  kind?: string;
  cluster?: string;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

const SELECT = `SELECT id, name, kind, area, status, cluster, url, hostname, notes, created_at, updated_at
                FROM bachelorprojekt.components`;

export async function listComponents(f: ListFilters = {}): Promise<ComponentRow[]> {
  const where: string[] = [];
  const args: unknown[] = [];
  if (f.kind)    { args.push(f.kind);      where.push(`kind = $${args.length}`); }
  if (f.cluster) { args.push(f.cluster);   where.push(`cluster = $${args.length}`); }
  if (f.status)  { args.push(f.status);    where.push(`status = $${args.length}`); }
  if (f.q)       { args.push(`%${f.q}%`);  where.push(`(name ILIKE $${args.length} OR area ILIKE $${args.length} OR notes ILIKE $${args.length})`); }
  const limit  = Math.max(1, Math.min(f.limit  ?? 200, 1000));
  const offset = Math.max(0, f.offset ?? 0);
  args.push(limit); args.push(offset);
  const sql = SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY kind, area, name LIMIT $${args.length - 1} OFFSET $${args.length}`;
  const { rows } = await pool.query<ComponentRow>(sql, args);
  return rows;
}

export async function createComponent(data: ComponentInput): Promise<ComponentRow> {
  const { rows } = await pool.query<ComponentRow>(
    `INSERT INTO bachelorprojekt.components (name, kind, area, status, cluster, url, hostname, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, kind, area, status, cluster, url, hostname, notes, created_at, updated_at`,
    [data.name, data.kind, data.area,
     data.status ?? 'active', data.cluster ?? 'both',
     data.url ?? null, data.hostname ?? null, data.notes ?? null],
  );
  return rows[0];
}

export async function updateComponent(
  id: number,
  patch: Partial<ComponentInput>,
): Promise<ComponentRow | null> {
  const sets: string[] = [];
  const args: unknown[] = [];
  const field = (val: unknown, col: string) => { args.push(val); sets.push(`${col} = $${args.length}`); };
  if (patch.name     !== undefined) field(patch.name,     'name');
  if (patch.kind     !== undefined) field(patch.kind,     'kind');
  if (patch.area     !== undefined) field(patch.area,     'area');
  if (patch.status   !== undefined) field(patch.status,   'status');
  if (patch.cluster  !== undefined) field(patch.cluster,  'cluster');
  if (patch.url      !== undefined) field(patch.url,      'url');
  if (patch.hostname !== undefined) field(patch.hostname, 'hostname');
  if (patch.notes    !== undefined) field(patch.notes,    'notes');
  if (sets.length === 0) return null;
  sets.push(`updated_at = now()`);
  args.push(id);
  const { rows } = await pool.query<ComponentRow>(
    `UPDATE bachelorprojekt.components SET ${sets.join(', ')}
     WHERE id = $${args.length}
     RETURNING id, name, kind, area, status, cluster, url, hostname, notes, created_at, updated_at`,
    args,
  );
  return rows[0] ?? null;
}

export async function deleteComponent(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE bachelorprojekt.components SET status = 'deprecated', updated_at = now()
     WHERE id = $1 RETURNING id`,
    [id],
  );
  return rows.length > 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add website/src/lib/components-db.ts
git commit -m "feat(db): add components-db helpers (list/create/update/delete)"
```

---

### Task 4: API Routes

**Files:**
- Create: `website/src/pages/api/admin/components/index.ts`
- Create: `website/src/pages/api/admin/components/[id].ts`

- [ ] **Step 1: Create index.ts (GET + POST)**

```typescript
// website/src/pages/api/admin/components/index.ts
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listComponents, createComponent } from '../../../../lib/components-db';

export const prerender = false;

const CreateBody = z.object({
  name:     z.string().min(1).max(100),
  kind:     z.enum(['physical', 'non-physical']),
  area:     z.string().min(1).max(50),
  status:   z.enum(['active', 'inactive', 'deprecated']).optional(),
  cluster:  z.enum(['mentolder', 'korczewski', 'both']).optional(),
  url:      z.string().url().nullable().optional(),
  hostname: z.string().max(100).nullable().optional(),
  notes:    z.string().max(500).nullable().optional(),
});

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const sp = url.searchParams;
  const components = await listComponents({
    kind:    sp.get('kind')    ?? undefined,
    cluster: sp.get('cluster') ?? undefined,
    status:  sp.get('status')  ?? undefined,
    q:       sp.get('q')       ?? undefined,
    limit:   sp.get('limit')   ? parseInt(sp.get('limit')!, 10)  : undefined,
    offset:  sp.get('offset')  ? parseInt(sp.get('offset')!, 10) : undefined,
  });
  return new Response(JSON.stringify({ components }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify(parsed.error.flatten()), { status: 400 });

  const row = await createComponent(parsed.data);
  return new Response(JSON.stringify(row), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
};
```

- [ ] **Step 2: Create [id].ts (PATCH + DELETE)**

```typescript
// website/src/pages/api/admin/components/[id].ts
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getSession, isAdmin } from '../../../../lib/auth';
import { updateComponent, deleteComponent } from '../../../../lib/components-db';

export const prerender = false;

const PatchBody = z.object({
  name:     z.string().min(1).max(100).optional(),
  kind:     z.enum(['physical', 'non-physical']).optional(),
  area:     z.string().min(1).max(50).optional(),
  status:   z.enum(['active', 'inactive', 'deprecated']).optional(),
  cluster:  z.enum(['mentolder', 'korczewski', 'both']).optional(),
  url:      z.string().url().nullable().optional(),
  hostname: z.string().max(100).nullable().optional(),
  notes:    z.string().max(500).nullable().optional(),
});

export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const id = parseInt(params.id ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) return new Response('bad id', { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return new Response(JSON.stringify(parsed.error.flatten()), { status: 400 });

  const row = await updateComponent(id, parsed.data);
  if (!row) return new Response('not found', { status: 404 });
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('forbidden', { status: 403 });

  const id = parseInt(params.id ?? '', 10);
  if (!Number.isFinite(id) || id <= 0) return new Response('bad id', { status: 400 });

  const ok = await deleteComponent(id);
  if (!ok) return new Response('not found', { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/components/
git commit -m "feat(api): add /api/admin/components GET/POST/PATCH/DELETE routes"
```

---

### Task 5: Admin UI

**Files:**
- Create: `website/src/components/admin/Components.svelte`
- Modify: `website/src/pages/admin/software-history.astro`

- [ ] **Step 1: Create Components.svelte**

```svelte
<!-- website/src/components/admin/Components.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  interface ComponentRow {
    id: number; name: string;
    kind: 'physical' | 'non-physical'; area: string;
    status: 'active' | 'inactive' | 'deprecated';
    cluster: 'mentolder' | 'korczewski' | 'both';
    url: string | null; hostname: string | null; notes: string | null;
    created_at: string; updated_at: string;
  }

  const EMPTY: Omit<ComponentRow, 'id' | 'created_at' | 'updated_at'> = {
    name: '', kind: 'non-physical', area: '', status: 'active',
    cluster: 'both', url: null, hostname: null, notes: null,
  };

  let components: ComponentRow[] = [];
  let kindFilter = '';
  let clusterFilter = '';
  let statusFilter = 'active';
  let q = '';
  let loadError = '';
  let editing: (Partial<ComponentRow> & { _new?: boolean }) | null = null;

  const STATUS_BADGE = { active: '🟢', inactive: '🟡', deprecated: '🔴' } as const;
  const CLUSTER_BADGE = { mentolder: 'M', korczewski: 'K', both: 'M+K' } as const;

  async function load() {
    loadError = '';
    const sp = new URLSearchParams();
    if (kindFilter)    sp.set('kind', kindFilter);
    if (clusterFilter) sp.set('cluster', clusterFilter);
    if (statusFilter)  sp.set('status', statusFilter);
    if (q)             sp.set('q', q);
    try {
      const r = await fetch(`/api/admin/components?${sp}`);
      if (!r.ok) { loadError = `Fehler ${r.status}`; return; }
      components = (await r.json()).components ?? [];
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Fehler';
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout>;
  const debouncedLoad = () => { clearTimeout(debounceTimer); debounceTimer = setTimeout(load, 250); };

  onMount(load);

  const startNew  = () => { editing = { ...EMPTY, _new: true }; };
  const startEdit = (row: ComponentRow) => { editing = { ...row }; };
  const cancelEdit = () => { editing = null; };

  async function saveEdit() {
    if (!editing) return;
    const isNew = editing._new;
    const body = {
      name: editing.name, kind: editing.kind, area: editing.area,
      status: editing.status, cluster: editing.cluster,
      url: editing.url || null, hostname: editing.hostname || null,
      notes: editing.notes || null,
    };
    const r = await fetch(isNew ? '/api/admin/components' : `/api/admin/components/${editing.id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) { alert(`Fehler ${r.status}`); return; }
    editing = null;
    await load();
  }

  async function deprecate(id: number) {
    if (!confirm('Als deprecated markieren?')) return;
    const r = await fetch(`/api/admin/components/${id}`, { method: 'DELETE' });
    if (!r.ok) { alert(`Fehler ${r.status}`); return; }
    await load();
  }

  function groupByArea(rows: ComponentRow[]): Record<string, ComponentRow[]> {
    return rows.reduce<Record<string, ComponentRow[]>>((acc, r) => {
      (acc[r.area] ??= []).push(r); return acc;
    }, {});
  }

  $: physical = components.filter(c => c.kind === 'physical');
  $: software = components.filter(c => c.kind === 'non-physical');
  $: physicalByArea = groupByArea(physical);
  $: softwareByArea = groupByArea(software);
</script>

{#if loadError}<p class="error">{loadError}</p>{/if}

<div class="toolbar">
  <div class="filters">
    <select bind:value={kindFilter} on:change={load}>
      <option value="">Alle Typen</option>
      <option value="physical">Physical</option>
      <option value="non-physical">Software</option>
    </select>
    <select bind:value={clusterFilter} on:change={load}>
      <option value="">Alle Cluster</option>
      <option value="mentolder">mentolder</option>
      <option value="korczewski">korczewski</option>
      <option value="both">both</option>
    </select>
    <select bind:value={statusFilter} on:change={load}>
      <option value="">Alle Status</option>
      <option value="active">active</option>
      <option value="inactive">inactive</option>
      <option value="deprecated">deprecated</option>
    </select>
    <input type="text" placeholder="Suche…" bind:value={q} on:input={debouncedLoad} />
  </div>
  <button class="btn-new" on:click={startNew}>+ Neue Komponente</button>
</div>

<div class="sections">
  {#if physical.length > 0}
    <section>
      <h2>Physisch</h2>
      <div class="area-grid">
        {#each Object.entries(physicalByArea) as [area, rows]}
          <article class="area-card">
            <h3>{area}</h3>
            <ul>
              {#each rows as c (c.id)}
                <li>
                  <span title={c.status}>{STATUS_BADGE[c.status]}</span>
                  <span class="name">{c.name}</span>
                  <span class="badge">{CLUSTER_BADGE[c.cluster]}</span>
                  {#if c.hostname}<small class="dim">{c.hostname}</small>{/if}
                  <button class="btn-sm" on:click={() => startEdit(c)}>edit</button>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if software.length > 0}
    <section>
      <h2>Software</h2>
      <div class="area-grid">
        {#each Object.entries(softwareByArea) as [area, rows]}
          <article class="area-card">
            <h3>{area}</h3>
            <ul>
              {#each rows as c (c.id)}
                <li>
                  <span title={c.status}>{STATUS_BADGE[c.status]}</span>
                  {#if c.url}
                    <a href={c.url} target="_blank" rel="noopener" class="name">{c.name}</a>
                  {:else}
                    <span class="name">{c.name}</span>
                  {/if}
                  <span class="badge">{CLUSTER_BADGE[c.cluster]}</span>
                  <button class="btn-sm" on:click={() => startEdit(c)}>edit</button>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</div>

{#if editing}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="backdrop" on:click|self={cancelEdit}>
    <form class="modal" on:submit|preventDefault={saveEdit}>
      <h3>{editing._new ? 'Neue Komponente' : `Bearbeiten: ${editing.name}`}</h3>
      <label>Name<input bind:value={editing.name} required /></label>
      <label>Typ
        <select bind:value={editing.kind}>
          <option value="non-physical">Software (non-physical)</option>
          <option value="physical">Hardware (physical)</option>
        </select>
      </label>
      <label>Area<input bind:value={editing.area} required placeholder="auth, infra, files, ai…" /></label>
      <label>Status
        <select bind:value={editing.status}>
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="deprecated">deprecated</option>
        </select>
      </label>
      <label>Cluster
        <select bind:value={editing.cluster}>
          <option value="both">both</option>
          <option value="mentolder">mentolder</option>
          <option value="korczewski">korczewski</option>
        </select>
      </label>
      <label>URL<input type="url" bind:value={editing.url} placeholder="https://…" /></label>
      <label>Hostname / IP<input bind:value={editing.hostname} /></label>
      <label>Notizen<textarea bind:value={editing.notes} rows="3"></textarea></label>
      <footer>
        {#if !editing._new}
          <button type="button" class="btn-depr" on:click={() => { deprecate(editing!.id!); cancelEdit(); }}>als deprecated markieren</button>
        {/if}
        <button type="button" on:click={cancelEdit}>Abbrechen</button>
        <button type="submit">Speichern</button>
      </footer>
    </form>
  </div>
{/if}

<style>
  .toolbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; flex-wrap:wrap; gap:.5rem; }
  .filters { display:flex; gap:.5rem; flex-wrap:wrap; }
  .btn-new { padding:.4rem .85rem; background:var(--brass); color:var(--ink-900); border:none; border-radius:.375rem; cursor:pointer; font-weight:600; font-size:.875rem; }
  .sections { display:flex; flex-direction:column; gap:2rem; }
  h2 { font-size:.95rem; font-weight:600; margin-bottom:.75rem; color:var(--brass); }
  .area-grid { display:flex; flex-wrap:wrap; gap:.75rem; }
  .area-card { border:1px solid var(--line,#ccc); padding:.75rem 1rem; border-radius:.5rem; min-width:220px; }
  .area-card h3 { font-family:var(--font-mono); font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; color:var(--mute); margin-bottom:.5rem; }
  ul { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:.3rem; }
  li { display:flex; align-items:center; gap:.35rem; font-size:.85rem; }
  .name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  a.name { color:var(--brass); text-decoration:none; }
  .badge { font-family:var(--font-mono); font-size:.7rem; color:var(--mute); flex-shrink:0; }
  .dim { font-size:.72rem; color:var(--mute); flex-shrink:0; }
  .btn-sm { font-size:.68rem; padding:.1rem .3rem; border:1px solid var(--line,#ccc); border-radius:.2rem; cursor:pointer; background:none; color:var(--mute); flex-shrink:0; }
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.45); display:grid; place-items:center; z-index:100; }
  .modal { background:var(--ink-850,white); padding:1.5rem; border-radius:.5rem; min-width:360px; max-width:460px; width:100%; display:grid; gap:.45rem; box-shadow:0 8px 32px rgba(0,0,0,.4); }
  .modal label { display:grid; gap:.2rem; font-size:.875rem; }
  .modal input, .modal select, .modal textarea { padding:.3rem .5rem; border:1px solid var(--line,#ccc); border-radius:.25rem; background:var(--ink-800,#fff); color:var(--fg); font-size:.875rem; }
  .modal footer { display:flex; justify-content:flex-end; gap:.5rem; margin-top:.4rem; }
  .btn-depr { margin-right:auto; background:none; border:1px solid #f87171; color:#f87171; border-radius:.25rem; padding:.25rem .5rem; cursor:pointer; font-size:.8rem; }
  .error { color:red; font-weight:bold; margin-bottom:1rem; }
</style>
```

- [ ] **Step 2: Update software-history.astro**

Replace the entire file content with:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import Components from '../../components/admin/Components.svelte';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname + Astro.url.search));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Komponenten-Registrierung">
  <h1>Komponenten-Registrierung</h1>
  <p class="lede">Physische und Software-Komponenten der Plattform.</p>
  <Components client:load />
</AdminLayout>
```

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/Components.svelte website/src/pages/admin/software-history.astro
git commit -m "feat(ui): add Components.svelte admin view, replace SoftwareHistory"
```

---

### Task 6: Delete Old Files

**Files:**
- Delete: `website/src/lib/software-history-db.ts`
- Delete: `website/src/lib/software-history-classifier.ts`
- Delete: `website/src/pages/api/admin/software-history/index.ts`
- Delete: `website/src/pages/api/admin/software-history/[id].ts`
- Delete: `website/src/components/admin/SoftwareHistory.svelte`
- Delete: `scripts/software-history-classify.mts`

- [ ] **Step 1: Delete the files**

```bash
rm website/src/lib/software-history-db.ts
rm website/src/lib/software-history-classifier.ts
rm website/src/pages/api/admin/software-history/index.ts
rm website/src/pages/api/admin/software-history/[id].ts
rmdir website/src/pages/api/admin/software-history/
rm website/src/components/admin/SoftwareHistory.svelte
rm scripts/software-history-classify.mts
```

- [ ] **Step 2: Verify no remaining imports**

```bash
grep -r "software-history-db\|software-history-classifier\|SoftwareHistory\|software-history-classify" \
  website/src/ scripts/ --include="*.ts" --include="*.astro" --include="*.svelte" --include="*.mts"
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "chore: delete old software-history classifier, views, and routes"
```

---

### Task 7: Build Verification

- [ ] **Step 1: TypeScript check**

```bash
cd website && npx tsc --noEmit 2>&1 | head -40
```
Expected: no errors referencing components-db, software-history, or Components.

- [ ] **Step 2: Manifest validation**

```bash
task workspace:validate
```
Expected: exit 0.

- [ ] **Step 3: Unit test suite**

```bash
task test:unit
```
Expected: all pass.

- [ ] **Step 4: Final commit and push**

```bash
git push -u origin feature/component-registry
```

---

## Post-Merge Deployment Steps

After the PR is merged and deployed (`task feature:deploy` + `task feature:website`), run the seed script on both clusters:

```bash
# mentolder
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec -i "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website < scripts/one-shot/20260518-components-seed.sql

# korczewski
PGPOD=$(kubectl get pod -n workspace-korczewski --context korczewski -l app=shared-db -o name | head -1)
kubectl exec -i "$PGPOD" -n workspace-korczewski --context korczewski -- \
  psql -U website -d website < scripts/one-shot/20260518-components-seed.sql
```

Then verify at: `https://web.mentolder.de/admin/software-history`
