---
ticket_id: T000060
title: Platform Asset Inventory Implementation Plan
domains: []
status: active
pr_number: null
---

# Platform Asset Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Software + Hardware asset tabs to the Platform Control Center (`/admin/platform`) backed by a `platform` DB schema, live k8s status overlay, and ticket linking via `component` slug.

**Architecture:** New `platform.software_assets` (CRUD) and `platform.hardware_assets` (migration-only) tables in the shared `website` PostgreSQL DB. Six new Astro API routes fetch DB metadata and overlay live k8s status via the existing `createK8sClient()` helper. Four new Svelte components render the asset grid, create/edit modal, and ticket drawer. `PlatformHub.svelte` gets two new tabs.

**Tech Stack:** PostgreSQL 16, Astro API routes (Node.js), Svelte 4, `website/src/lib/k8s.ts` for cluster access, Playwright for E2E.

---

## File Map

**Create:**
- `website/src/db/migrations/20260521_create_platform_assets.sql` — schema, tables, grants, seed
- `website/src/pages/api/admin/platform/software.ts` — GET (list+status) + POST (create)
- `website/src/pages/api/admin/platform/software/[id].ts` — PUT + DELETE
- `website/src/pages/api/admin/platform/hardware.ts` — GET (list+status)
- `website/src/pages/api/admin/platform/assets/[slug]/tickets.ts` — GET tickets by slug
- `website/src/components/admin/platform/SoftwareTab.svelte`
- `website/src/components/admin/platform/HardwareTab.svelte`
- `website/src/components/admin/platform/AssetModal.svelte`
- `website/src/components/admin/platform/AssetTicketDrawer.svelte`
- `tests/e2e/specs/fa-42-platform-assets.spec.ts`

**Modify:**
- `website/src/components/admin/PlatformHub.svelte` — add Software + Hardware tabs
- `website/src/data/test-inventory.json` — add FA-42 entry

---

## Task 1: Database Migration

**Files:**
- Create: `website/src/db/migrations/20260521_create_platform_assets.sql`

- [ ] **Step 1.1: Write the migration file**

```sql
-- website/src/db/migrations/20260521_create_platform_assets.sql
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.software_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'other',
  emoji           TEXT NOT NULL DEFAULT '📦',
  clusters        TEXT[] NOT NULL DEFAULT '{}',
  namespace       TEXT,
  deployment_name TEXT,
  image_tag       TEXT,
  url             TEXT,
  base_status     TEXT NOT NULL DEFAULT 'live',
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform.hardware_assets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT,
  role          TEXT NOT NULL,
  cluster       TEXT NOT NULL,
  location      TEXT,
  ip            TEXT,
  os            TEXT,
  k8s_node_name TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA platform TO website;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA platform TO website;

-- ── Software Seed ────────────────────────────────────────────────────────────
INSERT INTO platform.software_assets
  (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, base_status, sort_order)
VALUES
  ('website',            'Website',            'Astro + Svelte frontend',               'frontend',   '🌐', ARRAY['mentolder','korczewski'], 'website',              'website',           ':latest',  'live',     10),
  ('keycloak',           'Keycloak',           'SSO / OIDC identity provider',          'auth',       '🔑', ARRAY['mentolder','korczewski'], 'workspace',            'keycloak',          ':22.0',    'live',     20),
  ('nextcloud',          'Nextcloud',          'File storage + groupware',              'storage',    '☁️', ARRAY['mentolder','korczewski'], 'workspace',            'nextcloud',         ':29',      'live',     30),
  ('collabora',          'Collabora',          'Online office suite',                   'storage',    '📄', ARRAY['mentolder','korczewski'], 'workspace',            'collabora',         ':latest',  'live',     40),
  ('vaultwarden',        'Vaultwarden',        'Password manager (Bitwarden-compat)',   'security',   '🔒', ARRAY['mentolder','korczewski'], 'workspace',            'vaultwarden',       ':latest',  'live',     50),
  ('nextcloud-talk-hpb', 'Talk HPB',           'Nextcloud Talk signaling server',       'messaging',  '📡', ARRAY['mentolder','korczewski'], 'workspace',            'talk-hpb',          ':latest',  'live',     60),
  ('brett',              'Brett',              '3D systemic-constellation board',       'dev',        '🧩', ARRAY['mentolder','korczewski'], 'workspace',            'brett',             ':latest',  'live',     70),
  ('mailpit',            'Mailpit',            'SMTP dev mailbox',                      'dev',        '📬', ARRAY['mentolder','korczewski'], 'workspace',            'mailpit',           ':latest',  'live',     80),
  ('docuseal',           'DocuSeal',           'Document signing',                      'other',      '📝', ARRAY['mentolder','korczewski'], 'workspace',            'docuseal',          ':latest',  'live',     90),
  ('tracking',           'Tracking',           'PR + milestone tracking dashboard',     'monitoring', '📊', ARRAY['mentolder','korczewski'], 'workspace',            'tracking',          ':latest',  'live',    100),
  ('docs',               'Docs',               'Internal documentation (Docsify)',      'other',      '📚', ARRAY['mentolder','korczewski'], 'workspace',            'docs',              ':latest',  'live',    110),
  ('whiteboard',         'Whiteboard',         'Collaborative whiteboard',              'other',      '🖊️', ARRAY['mentolder','korczewski'], 'workspace',            'whiteboard',        ':latest',  'live',    120),
  ('livekit',            'LiveKit Server',     'WebRTC media server',                   'media',      '🎙', ARRAY['mentolder'],              'workspace',            'livekit-server',    ':latest',  'live',    130),
  ('livekit-ingress',    'LiveKit Ingress',    'RTMP stream ingestion',                 'media',      '📡', ARRAY['mentolder'],              'workspace',            'livekit-ingress',   ':latest',  'optional',140),
  ('livekit-egress',     'LiveKit Egress',     'Stream recording',                      'media',      '🎞', ARRAY['mentolder'],              'workspace',            'livekit-egress',    ':latest',  'optional',150),
  ('arena-server',       'Arena Server',       'Multiplayer game server',               'dev',        '🎮', ARRAY['korczewski'],             'workspace-korczewski', 'arena-server',      ':latest',  'live',    160),
  ('whisper',            'Whisper',            'Speech-to-text transcription',          'ai',         '🎤', ARRAY['mentolder'],              'workspace',            'whisper',           ':latest',  'optional',170),
  ('talk-transcriber',   'Talk Transcriber',   'Nextcloud Talk transcription bot',      'ai',         '📝', ARRAY['mentolder'],              'workspace',            'talk-transcriber',  ':latest',  'optional',180),
  ('mcp',                'MCP Monolith',       'Model Context Protocol servers',        'ai',         '🤖', ARRAY['mentolder'],              'workspace',            'mcp-monolith',      ':latest',  'live',    190),
  ('brainstorm',         'Brainstorm Sish',    'Reverse-SSH brainstorm tunnel',         'dev',        '💡', ARRAY['mentolder'],              'workspace',            'brainstorm-sish',   ':latest',  'live',    200)
ON CONFLICT (slug) DO NOTHING;

-- ── Hardware Seed ────────────────────────────────────────────────────────────
INSERT INTO platform.hardware_assets
  (slug, name, description, role, cluster, location, ip, os, k8s_node_name, sort_order)
VALUES
  ('gekko-hetzner-2', 'gekko-hetzner-2', 'Hetzner CX21 control-plane',  'control-plane', 'mentolder',  'Hetzner Helsinki', '178.104.169.206', 'Ubuntu 24.04 LTS',   'gekko-hetzner-2', 10),
  ('gekko-hetzner-3', 'gekko-hetzner-3', 'Hetzner CX21 control-plane',  'control-plane', 'mentolder',  'Hetzner Helsinki', '46.225.125.59',   'Ubuntu 24.04 LTS',   'gekko-hetzner-3', 20),
  ('gekko-hetzner-4', 'gekko-hetzner-4', 'Hetzner CX21 control-plane',  'control-plane', 'mentolder',  'Hetzner Helsinki', '178.104.159.79',  'Ubuntu 24.04 LTS',   'gekko-hetzner-4', 30),
  ('k3s-1',           'k3s-1',           'Home LAN Ubuntu worker',       'worker',        'mentolder',  'Home LAN',         '192.168.100.20',  'Ubuntu 24.04 LTS',   'k3s-1',           40),
  ('k3s-2',           'k3s-2',           'Home LAN Ubuntu worker',       'worker',        'mentolder',  'Home LAN',         '192.168.100.21',  'Ubuntu 24.04 LTS',   'k3s-2',           50),
  ('k3s-3',           'k3s-3',           'Home LAN Ubuntu worker',       'worker',        'mentolder',  'Home LAN',         '192.168.100.22',  'Ubuntu 24.04 LTS',   'k3s-3',           60),
  ('k3w-1',           'k3w-1',           'Raspberry Pi 5 worker',        'worker',        'mentolder',  'Home LAN RPi',     '192.168.100.11',  'Debian 13 (trixie)', 'k3w-1',           70),
  ('k3w-2',           'k3w-2',           'Raspberry Pi 5 worker',        'worker',        'mentolder',  'Home LAN RPi',     '192.168.100.12',  'Debian 13 (trixie)', 'k3w-2',           80),
  ('k3w-3',           'k3w-3',           'Raspberry Pi 4 worker',        'worker',        'mentolder',  'Home LAN RPi',     '192.168.100.13',  'Debian 13 (trixie)', 'k3w-3',           90),
  ('pk-hetzner-4',    'pk-hetzner-4',    'Hetzner CX21 control-plane',  'control-plane', 'korczewski', 'Hetzner Helsinki', '10.13.14.1',      'Ubuntu 24.04 LTS',   'pk-hetzner-4',   100),
  ('pk-hetzner-6',    'pk-hetzner-6',    'Hetzner CX21 control-plane',  'control-plane', 'korczewski', 'Hetzner Helsinki', '10.13.14.2',      'Ubuntu 24.04 LTS',   'pk-hetzner-6',   110),
  ('pk-hetzner-8',    'pk-hetzner-8',    'Hetzner CX21 control-plane',  'control-plane', 'korczewski', 'Hetzner Helsinki', '10.13.14.3',      'Ubuntu 24.04 LTS',   'pk-hetzner-8',   120)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 1.2: Apply migration to mentolder**

```bash
task workspace:psql ENV=mentolder -- website < website/src/db/migrations/20260521_create_platform_assets.sql
```

Expected: no errors, ends with `INSERT 0 12` (hardware) and `INSERT 0 20` (software) or `INSERT 0 0` if already seeded.

- [ ] **Step 1.3: Apply migration to korczewski**

```bash
task workspace:psql ENV=korczewski -- website < website/src/db/migrations/20260521_create_platform_assets.sql
```

- [ ] **Step 1.4: Verify tables exist on mentolder**

```bash
task workspace:psql ENV=mentolder -- website -c "SELECT slug, name, base_status FROM platform.software_assets ORDER BY sort_order LIMIT 5;"
task workspace:psql ENV=mentolder -- website -c "SELECT slug, cluster, role FROM platform.hardware_assets ORDER BY sort_order LIMIT 5;"
```

Expected: 5 rows each with slugs matching seed data.

- [ ] **Step 1.5: Commit**

```bash
cd .claude/worktrees/platform-asset-inventory
git add website/src/db/migrations/20260521_create_platform_assets.sql
git commit -m "chore(db): add platform.software_assets + platform.hardware_assets schema with seed"
```

---

## Task 2: Write Failing E2E Tests (TDD)

**Files:**
- Create: `tests/e2e/specs/fa-42-platform-assets.spec.ts`

- [ ] **Step 2.1: Write the failing E2E spec**

```typescript
// tests/e2e/specs/fa-42-platform-assets.spec.ts
import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'https://web.mentolder.de';

test.describe('FA-42: Platform Asset Inventory', () => {
  // ── Auth-Gating ────────────────────────────────────────────────
  test('T1: GET /api/admin/platform/software returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/software`);
    expect([401, 403]).toContain(res.status());
  });

  test('T2: GET /api/admin/platform/hardware returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/hardware`);
    expect([401, 403]).toContain(res.status());
  });

  test('T3: GET /api/admin/platform/assets/website/tickets returns 401 without auth', async ({ request }) => {
    const res = await request.get(`${BASE}/api/admin/platform/assets/website/tickets`);
    expect([401, 403]).toContain(res.status());
  });

  test('T4: POST /api/admin/platform/software returns 401 without auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/admin/platform/software`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  // ── Software tab renders ───────────────────────────────────────
  test('T5: /admin/platform Software tab shows asset cards', async ({ page }) => {
    await page.goto(`${BASE}/admin/platform`);
    // Must redirect to login if not authenticated — that means auth is working
    await expect(page).not.toHaveURL(`${BASE}/admin/platform`);
  });
});
```

- [ ] **Step 2.2: Run to confirm T1–T4 pass (auth routes don't exist yet — expect 404, not 401)**

```bash
cd /home/patrick/Bachelorprojekt
npx playwright test tests/e2e/specs/fa-42-platform-assets.spec.ts --config tests/e2e/playwright.config.ts 2>&1 | tail -20
```

Expected: T1–T4 likely fail with `404` (routes not created yet). T5 passes. This confirms the tests are live and will catch when routes go missing.

- [ ] **Step 2.3: Commit failing tests**

```bash
git add tests/e2e/specs/fa-42-platform-assets.spec.ts
git commit -m "test(e2e): add FA-42 platform asset inventory tests (failing — routes not yet created)"
```

---

## Task 3: GET Endpoints — Software + Hardware List with Live Status

**Files:**
- Create: `website/src/pages/api/admin/platform/software.ts`
- Create: `website/src/pages/api/admin/platform/hardware.ts`

- [ ] **Step 3.1: Write the software GET+POST endpoint**

```typescript
// website/src/pages/api/admin/platform/software.ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createK8sClient } from '../../../../lib/k8s';

const brandId = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

function resolveNamespace(namespace: string | null): string | null {
  if (!namespace) return null;
  if (brandId === 'korczewski') {
    if (namespace === 'workspace') return 'workspace-korczewski';
    if (namespace === 'website') return 'website-korczewski';
  }
  return namespace;
}

async function fetchSoftwareStatus(assets: any[]): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  try {
    const k8s = await createK8sClient();
    await Promise.all(
      assets
        .filter(a => a.namespace && a.deployment_name && a.clusters.includes(brandId))
        .map(async (a) => {
          const ns = resolveNamespace(a.namespace);
          try {
            const dep = await k8s.get(`/apis/apps/v1/namespaces/${ns}/deployments/${a.deployment_name}`);
            const ready = dep?.status?.readyReplicas ?? 0;
            statusMap.set(a.slug, ready >= 1 ? 'live' : 'degraded');
          } catch {
            statusMap.set(a.slug, a.base_status);
          }
        })
    );
  } catch {
    // k8s unreachable — all statuses fall back to base_status
  }
  return statusMap;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { rows } = await pool.query(
    'SELECT * FROM platform.software_assets ORDER BY sort_order, name'
  );
  const statusMap = await fetchSoftwareStatus(rows);
  const result = rows.map(a => ({
    ...a,
    live_status: statusMap.get(a.slug) ?? a.base_status,
  }));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();
  const { slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, url, base_status, sort_order } = body;
  if (!slug || !name) return new Response(JSON.stringify({ error: 'slug and name required' }), { status: 400 });

  const { rows } = await pool.query(
    `INSERT INTO platform.software_assets
       (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, url, base_status, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [slug, name, description ?? null, category ?? 'other', emoji ?? '📦',
     clusters ?? [], namespace ?? null, deployment_name ?? null,
     image_tag ?? null, url ?? null, base_status ?? 'live', sort_order ?? 0]
  );
  return new Response(JSON.stringify(rows[0]), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3.2: Write the hardware GET endpoint**

```typescript
// website/src/pages/api/admin/platform/hardware.ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../lib/auth';
import { createK8sClient } from '../../../../lib/k8s';

async function fetchNodeStatuses(): Promise<Map<string, string>> {
  const statusMap = new Map<string, string>();
  try {
    const k8s = await createK8sClient();
    const result = await k8s.get('/api/v1/nodes');
    for (const node of result.items ?? []) {
      const name: string = node.metadata.name;
      const readyCond = node.status?.conditions?.find((c: any) => c.type === 'Ready');
      statusMap.set(name, readyCond?.status === 'True' ? 'ready' : 'not-ready');
    }
  } catch {
    // k8s unreachable — all fall back to 'unknown'
  }
  return statusMap;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { rows } = await pool.query(
    'SELECT * FROM platform.hardware_assets ORDER BY sort_order, name'
  );
  const nodeStatuses = await fetchNodeStatuses();
  const result = rows.map(a => ({
    ...a,
    live_status: nodeStatuses.get(a.k8s_node_name) ?? 'unknown',
  }));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 3.3: Run E2E auth tests — should now return 401 not 404**

```bash
npx playwright test tests/e2e/specs/fa-42-platform-assets.spec.ts --config tests/e2e/playwright.config.ts -g "T1|T2|T3|T4" 2>&1 | tail -15
```

Expected: T1 + T2 PASS (401 from the new routes). T3 still fails (tickets route not yet created).

- [ ] **Step 3.4: Commit**

```bash
git add website/src/pages/api/admin/platform/software.ts website/src/pages/api/admin/platform/hardware.ts
git commit -m "feat(api): GET /platform/software + GET /platform/hardware with live k8s status"
```

---

## Task 4: PUT + DELETE /api/admin/platform/software/[id]

**Files:**
- Create: `website/src/pages/api/admin/platform/software/[id].ts`

- [ ] **Step 4.1: Write the file**

```typescript
// website/src/pages/api/admin/platform/software/[id].ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../../lib/auth';

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  const body = await request.json();
  const { slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, url, base_status, sort_order } = body;

  const { rows } = await pool.query(
    `UPDATE platform.software_assets SET
       slug=$1, name=$2, description=$3, category=$4, emoji=$5,
       clusters=$6, namespace=$7, deployment_name=$8, image_tag=$9,
       url=$10, base_status=$11, sort_order=$12, updated_at=now()
     WHERE id=$13 RETURNING *`,
    [slug, name, description ?? null, category ?? 'other', emoji ?? '📦',
     clusters ?? [], namespace ?? null, deployment_name ?? null,
     image_tag ?? null, url ?? null, base_status ?? 'live',
     sort_order ?? 0, id]
  );
  if (!rows.length) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  return new Response(JSON.stringify(rows[0]), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  const { rowCount } = await pool.query('DELETE FROM platform.software_assets WHERE id=$1', [id]);
  if (!rowCount) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  return new Response(null, { status: 204 });
};
```

- [ ] **Step 4.2: Commit**

```bash
git add website/src/pages/api/admin/platform/software/[id].ts
git commit -m "feat(api): PUT + DELETE /platform/software/[id]"
```

---

## Task 5: GET /api/admin/platform/assets/[slug]/tickets

**Files:**
- Create: `website/src/pages/api/admin/platform/assets/[slug]/tickets.ts`

- [ ] **Step 5.1: Write the endpoint**

```typescript
// website/src/pages/api/admin/platform/assets/[slug]/tickets.ts
import type { APIRoute } from 'astro';
import { pool } from '../../../../../../lib/website-db';
import { getSession, isAdmin } from '../../../../../../lib/auth';

export const GET: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const { slug } = params;
  const { rows } = await pool.query(
    `SELECT external_id, title, status, priority, severity, created_at
     FROM tickets.tickets
     WHERE component = $1
       AND status NOT IN ('done', 'archived')
     ORDER BY created_at DESC
     LIMIT 50`,
    [slug]
  );
  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 5.2: Run auth E2E tests — all four should now pass**

```bash
npx playwright test tests/e2e/specs/fa-42-platform-assets.spec.ts --config tests/e2e/playwright.config.ts -g "T1|T2|T3|T4" 2>&1 | tail -15
```

Expected: T1, T2, T3, T4 all PASS.

- [ ] **Step 5.3: Commit**

```bash
git add website/src/pages/api/admin/platform/assets/[slug]/tickets.ts
git commit -m "feat(api): GET /platform/assets/[slug]/tickets — open tickets by component slug"
```

---

## Task 6: AssetTicketDrawer.svelte

**Files:**
- Create: `website/src/components/admin/platform/AssetTicketDrawer.svelte`

- [ ] **Step 6.1: Write the component**

```svelte
<!-- website/src/components/admin/platform/AssetTicketDrawer.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  export let asset: { slug: string; name: string; emoji: string } | null = null;
  export let onClose: () => void = () => {};

  let tickets: any[] = [];
  let loading = false;
  let error: string | null = null;

  $: if (asset) loadTickets(asset.slug);

  async function loadTickets(slug: string) {
    loading = true;
    error = null;
    try {
      const r = await fetch(`/api/admin/platform/assets/${slug}/tickets`);
      if (!r.ok) throw new Error('Fetch failed');
      tickets = await r.json();
    } catch (e: any) {
      error = e.message;
      tickets = [];
    } finally {
      loading = false;
    }
  }

  const statusColor: Record<string, string> = {
    triage:      'bg-yellow-500/20 text-yellow-400',
    backlog:     'bg-gray-500/20 text-gray-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    in_review:   'bg-purple-500/20 text-purple-400',
    blocked:     'bg-red-500/20 text-red-400',
  };
</script>

{#if asset}
  <!-- Backdrop -->
  <button class="fixed inset-0 bg-black/40 z-40" on:click={onClose} aria-label="Close drawer" />

  <!-- Drawer -->
  <div class="fixed right-0 top-0 h-full w-96 bg-admin-sidebar-bg border-l border-admin-border z-50 flex flex-col shadow-2xl">
    <div class="p-6 border-b border-admin-border flex items-center gap-3">
      <span class="text-2xl">{asset.emoji}</span>
      <div class="flex-1">
        <h3 class="font-bold text-white">{asset.name}</h3>
        <p class="text-xs text-admin-text-mute font-mono">{asset.slug}</p>
      </div>
      <button on:click={onClose} class="text-admin-text-mute hover:text-white transition-colors text-xl">✕</button>
    </div>

    <div class="p-6 flex-1 overflow-y-auto">
      <div class="flex items-center justify-between mb-4">
        <h4 class="text-sm font-bold text-admin-text-mute uppercase tracking-wider">Offene Tickets</h4>
        <a
          href="/admin/bugs?component={asset.slug}"
          class="text-xs text-admin-primary hover:underline"
        >Alle anzeigen →</a>
      </div>

      {#if loading}
        <div class="space-y-3">
          {#each Array(3) as _}
            <div class="h-14 bg-admin-surface rounded-xl animate-pulse"></div>
          {/each}
        </div>
      {:else if error}
        <p class="text-red-400 text-sm">{error}</p>
      {:else if tickets.length === 0}
        <div class="py-10 text-center">
          <p class="text-admin-text-mute text-sm">Keine offenen Tickets</p>
        </div>
      {:else}
        <div class="space-y-2">
          {#each tickets as ticket}
            <a
              href="/admin/bugs?id={ticket.external_id}"
              class="block p-3 rounded-xl bg-admin-surface border border-admin-border hover:border-admin-primary/30 transition-all"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-white truncate">{ticket.title}</p>
                  <p class="text-[10px] text-admin-text-disabled font-mono mt-0.5">{ticket.external_id}</p>
                </div>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 {statusColor[ticket.status] ?? 'bg-gray-500/20 text-gray-400'}">
                  {ticket.status}
                </span>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <div class="p-4 border-t border-admin-border">
      <a
        href="/admin/bugs/new?component={asset.slug}"
        class="block w-full text-center py-2 px-4 rounded-xl bg-admin-primary text-admin-bg text-sm font-bold hover:opacity-90 transition-opacity"
      >
        + Ticket anlegen
      </a>
    </div>
  </div>
{/if}
```

- [ ] **Step 6.2: Commit**

```bash
git add website/src/components/admin/platform/AssetTicketDrawer.svelte
git commit -m "feat(ui): AssetTicketDrawer — shows open tickets per asset slug"
```

---

## Task 7: AssetModal.svelte

**Files:**
- Create: `website/src/components/admin/platform/AssetModal.svelte`

- [ ] **Step 7.1: Write the component**

```svelte
<!-- website/src/components/admin/platform/AssetModal.svelte -->
<script lang="ts">
  export let asset: any | null = null;   // null = create mode
  export let onSave: (saved: any) => void = () => {};
  export let onDelete: (id: string) => void = () => {};
  export let onClose: () => void = () => {};

  const CATEGORIES = ['frontend','auth','storage','messaging','ai','media','monitoring','security','dev','other'];
  const CLUSTER_OPTIONS = ['mentolder', 'korczewski'];

  let form = {
    slug: asset?.slug ?? '',
    name: asset?.name ?? '',
    description: asset?.description ?? '',
    category: asset?.category ?? 'other',
    emoji: asset?.emoji ?? '📦',
    clusters: (asset?.clusters ?? []) as string[],
    namespace: asset?.namespace ?? '',
    deployment_name: asset?.deployment_name ?? '',
    image_tag: asset?.image_tag ?? '',
    url: asset?.url ?? '',
    base_status: asset?.base_status ?? 'live',
    sort_order: asset?.sort_order ?? 0,
  };

  let saving = false;
  let deleting = false;
  let errorMsg: string | null = null;

  function toggleCluster(c: string) {
    form.clusters = form.clusters.includes(c)
      ? form.clusters.filter(x => x !== c)
      : [...form.clusters, c];
  }

  async function handleSave() {
    if (!form.slug || !form.name) { errorMsg = 'Slug und Name sind Pflichtfelder.'; return; }
    saving = true; errorMsg = null;
    try {
      const url = asset ? `/api/admin/platform/software/${asset.id}` : '/api/admin/platform/software';
      const method = asset ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error(await r.text());
      onSave(await r.json());
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      saving = false;
    }
  }

  async function handleDelete() {
    if (!asset || !confirm(`"${asset.name}" wirklich löschen?`)) return;
    deleting = true;
    try {
      const r = await fetch(`/api/admin/platform/software/${asset.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await r.text());
      onDelete(asset.id);
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      deleting = false;
    }
  }
</script>

<button class="fixed inset-0 bg-black/40 z-40" on:click={onClose} aria-label="Close modal" />

<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div class="bg-admin-sidebar-bg border border-admin-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
    <div class="p-6 border-b border-admin-border flex items-center justify-between">
      <h3 class="font-bold text-white text-lg">{asset ? 'Asset bearbeiten' : 'Software-Asset anlegen'}</h3>
      <button on:click={onClose} class="text-admin-text-mute hover:text-white">✕</button>
    </div>

    <div class="p-6 overflow-y-auto flex-1 space-y-4">
      {#if errorMsg}
        <p class="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{errorMsg}</p>
      {/if}

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Emoji *</label>
          <input bind:value={form.emoji} class="admin-input w-full text-center text-2xl" maxlength="4" />
        </div>
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Slug * <span class="text-admin-text-disabled">(tickets.component)</span></label>
          <input bind:value={form.slug} class="admin-input w-full font-mono text-sm" placeholder="keycloak" />
        </div>
      </div>

      <div>
        <label class="block text-xs text-admin-text-mute mb-1">Name *</label>
        <input bind:value={form.name} class="admin-input w-full" placeholder="Keycloak" />
      </div>

      <div>
        <label class="block text-xs text-admin-text-mute mb-1">Beschreibung</label>
        <input bind:value={form.description} class="admin-input w-full" placeholder="SSO / OIDC identity provider" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Kategorie</label>
          <select bind:value={form.category} class="admin-input w-full">
            {#each CATEGORIES as c}<option value={c}>{c}</option>{/each}
          </select>
        </div>
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Basis-Status</label>
          <select bind:value={form.base_status} class="admin-input w-full">
            <option value="live">live</option>
            <option value="optional">optional</option>
            <option value="deprecated">deprecated</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-xs text-admin-text-mute mb-2">Cluster</label>
        <div class="flex gap-3">
          {#each CLUSTER_OPTIONS as c}
            <button
              type="button"
              on:click={() => toggleCluster(c)}
              class="px-4 py-1.5 rounded-lg text-sm font-bold border transition-all {form.clusters.includes(c) ? 'bg-admin-primary text-admin-bg border-admin-primary' : 'border-admin-border text-admin-text-mute hover:text-white'}"
            >{c}</button>
          {/each}
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Namespace</label>
          <input bind:value={form.namespace} class="admin-input w-full font-mono text-sm" placeholder="workspace" />
        </div>
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Deployment-Name</label>
          <input bind:value={form.deployment_name} class="admin-input w-full font-mono text-sm" placeholder="keycloak" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Image-Tag</label>
          <input bind:value={form.image_tag} class="admin-input w-full font-mono text-sm" placeholder=":latest" />
        </div>
        <div>
          <label class="block text-xs text-admin-text-mute mb-1">Sort-Order</label>
          <input type="number" bind:value={form.sort_order} class="admin-input w-full" />
        </div>
      </div>

      <div>
        <label class="block text-xs text-admin-text-mute mb-1">URL</label>
        <input bind:value={form.url} class="admin-input w-full" placeholder="https://auth.mentolder.de" />
      </div>
    </div>

    <div class="p-6 border-t border-admin-border flex items-center gap-3">
      {#if asset}
        <button on:click={handleDelete} disabled={deleting} class="px-4 py-2 rounded-xl text-sm font-bold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-all disabled:opacity-50">
          {deleting ? '…' : 'Löschen'}
        </button>
      {/if}
      <div class="flex-1" />
      <button on:click={onClose} class="px-4 py-2 rounded-xl text-sm text-admin-text-mute hover:text-white transition-colors">Abbrechen</button>
      <button on:click={handleSave} disabled={saving} class="px-5 py-2 rounded-xl text-sm font-bold bg-admin-primary text-admin-bg hover:opacity-90 transition-opacity disabled:opacity-50">
        {saving ? '…' : asset ? 'Speichern' : 'Anlegen'}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 7.2: Commit**

```bash
git add website/src/components/admin/platform/AssetModal.svelte
git commit -m "feat(ui): AssetModal — create/edit/delete software assets"
```

---

## Task 8: SoftwareTab.svelte

**Files:**
- Create: `website/src/components/admin/platform/SoftwareTab.svelte`

- [ ] **Step 8.1: Write the component**

```svelte
<!-- website/src/components/admin/platform/SoftwareTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import AssetModal from './AssetModal.svelte';
  import AssetTicketDrawer from './AssetTicketDrawer.svelte';

  let assets: any[] = [];
  let loading = true;
  let error: string | null = null;
  let showModal = false;
  let editingAsset: any | null = null;
  let drawerAsset: { slug: string; name: string; emoji: string } | null = null;

  async function fetchAssets() {
    loading = true; error = null;
    try {
      const r = await fetch('/api/admin/platform/software');
      if (!r.ok) throw new Error('Fetch failed');
      assets = await r.json();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(fetchAssets);

  function openCreate() { editingAsset = null; showModal = true; }
  function openEdit(asset: any) { editingAsset = asset; showModal = true; }

  function handleSave(saved: any) {
    if (editingAsset) {
      assets = assets.map(a => a.id === saved.id ? { ...saved, live_status: a.live_status } : a);
    } else {
      assets = [...assets, { ...saved, live_status: saved.base_status }];
    }
    showModal = false;
  }

  function handleDelete(id: string) {
    assets = assets.filter(a => a.id !== id);
    showModal = false;
  }

  const statusBadge: Record<string, string> = {
    live:       'bg-green-500/20 border-green-500/40 text-green-400',
    degraded:   'bg-red-500/20 border-red-500/40 text-red-400',
    optional:   'bg-amber-500/20 border-amber-500/40 text-amber-400',
    deprecated: 'bg-gray-500/20 border-gray-500/40 text-gray-400',
    unknown:    'bg-gray-700/40 border-gray-600/40 text-gray-500',
  };

  const statusLabel: Record<string, string> = {
    live: 'LIVE', degraded: 'DOWN', optional: 'OPT',
    deprecated: 'DEP', unknown: '???',
  };

  const categoryColor: Record<string, string> = {
    frontend: 'text-violet-400', auth: 'text-blue-400', storage: 'text-cyan-400',
    messaging: 'text-teal-400', ai: 'text-pink-400', media: 'text-orange-400',
    monitoring: 'text-yellow-400', security: 'text-red-400', dev: 'text-emerald-400', other: 'text-gray-400',
  };
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-white">Software-Assets</h3>
    <div class="flex gap-3">
      <button on:click={fetchAssets} class="text-xs text-admin-primary hover:underline">Aktualisieren</button>
      <button on:click={openCreate} class="px-4 py-1.5 rounded-xl text-xs font-bold bg-admin-primary text-admin-bg hover:opacity-90 transition-opacity">
        + Neu anlegen
      </button>
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each Array(6) as _}
        <div class="h-32 bg-admin-surface rounded-2xl animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each assets as asset}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          on:click={() => drawerAsset = { slug: asset.slug, name: asset.name, emoji: asset.emoji }}
          on:keydown={e => e.key === 'Enter' && (drawerAsset = { slug: asset.slug, name: asset.name, emoji: asset.emoji })}
          role="button"
          tabindex="0"
          class="relative cursor-pointer p-4 rounded-2xl bg-admin-surface border border-admin-border hover:border-admin-primary/30 transition-all group"
        >
          <!-- Edit button — appears on hover, does not open drawer -->
          <button
            on:click|stopPropagation={() => openEdit(asset)}
            class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-admin-text-mute hover:text-white text-xs px-2 py-1 rounded-lg bg-admin-sidebar-bg border border-admin-border z-10"
            title="Bearbeiten"
          >✎</button>

          <div class="text-[10px] font-bold uppercase tracking-wider mb-2 {categoryColor[asset.category] ?? 'text-gray-400'}">
            Software · {asset.category}
          </div>
          <div class="flex items-center gap-3 mb-2">
            <div class="w-9 h-9 rounded-xl bg-admin-sidebar-bg border border-admin-border flex items-center justify-center text-lg flex-shrink-0">
              {asset.emoji}
            </div>
            <div class="flex-1 min-w-0 pr-6">
              <div class="font-bold text-white text-sm truncate">{asset.name}</div>
              <div class="text-xs text-admin-text-mute truncate">{asset.description ?? ''}</div>
            </div>
            <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold flex-shrink-0 {statusBadge[asset.live_status] ?? statusBadge.unknown}">
              {statusLabel[asset.live_status] ?? '???'}
            </span>
          </div>
          <div class="flex gap-1.5 flex-wrap mb-2">
            {#each asset.clusters as c}
              <span class="px-2 py-0.5 rounded-full text-[10px] {c === 'mentolder' ? 'bg-violet-500/20 border border-violet-500/40 text-violet-400' : 'bg-blue-500/20 border border-blue-500/40 text-blue-400'}">
                {c}
              </span>
            {/each}
          </div>
          <div class="pt-2 border-t border-admin-border flex justify-between text-[10px] text-admin-text-disabled font-mono">
            <span>ns: {asset.namespace ?? '—'}</span>
            <span>{asset.image_tag ?? '—'}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal}
  <AssetModal
    asset={editingAsset}
    onSave={handleSave}
    onDelete={handleDelete}
    onClose={() => showModal = false}
  />
{/if}

{#if drawerAsset}
  <AssetTicketDrawer
    asset={drawerAsset}
    onClose={() => drawerAsset = null}
  />
{/if}
```

- [ ] **Step 8.2: Commit**

```bash
git add website/src/components/admin/platform/SoftwareTab.svelte
git commit -m "feat(ui): SoftwareTab — asset grid with hover-edit + ticket drawer"
```

---

## Task 9: HardwareTab.svelte

**Files:**
- Create: `website/src/components/admin/platform/HardwareTab.svelte`

- [ ] **Step 9.1: Write the component**

```svelte
<!-- website/src/components/admin/platform/HardwareTab.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import AssetTicketDrawer from './AssetTicketDrawer.svelte';

  let assets: any[] = [];
  let loading = true;
  let error: string | null = null;
  let drawerAsset: { slug: string; name: string; emoji: string } | null = null;

  async function fetchAssets() {
    loading = true; error = null;
    try {
      const r = await fetch('/api/admin/platform/hardware');
      if (!r.ok) throw new Error('Fetch failed');
      assets = await r.json();
    } catch (e: any) {
      error = e.message;
    } finally {
      loading = false;
    }
  }

  onMount(fetchAssets);

  const clusters = ['mentolder', 'korczewski'];

  const statusBadge: Record<string, string> = {
    ready:     'bg-green-500/20 border-green-500/40 text-green-400',
    'not-ready': 'bg-red-500/20 border-red-500/40 text-red-400',
    unknown:   'bg-gray-700/40 border-gray-600/40 text-gray-500',
  };
  const statusLabel: Record<string, string> = { ready: 'READY', 'not-ready': 'DOWN', unknown: '???' };

  const roleEmoji: Record<string, string> = { 'control-plane': '🖥', worker: '⚙️' };
  const locationColor: Record<string, string> = {
    'Hetzner Helsinki': 'text-orange-400',
    'Home LAN':         'text-emerald-400',
    'Home LAN RPi':     'text-pink-400',
  };
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-semibold text-white">Hardware-Assets</h3>
    <button on:click={fetchAssets} class="text-xs text-admin-primary hover:underline">Aktualisieren</button>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each Array(9) as _}
        <div class="h-32 bg-admin-surface rounded-2xl animate-pulse"></div>
      {/each}
    </div>
  {:else if error}
    <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
  {:else}
    {#each clusters as cluster}
      {@const clusterAssets = assets.filter(a => a.cluster === cluster)}
      {#if clusterAssets.length > 0}
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="w-2 h-2 rounded-full {cluster === 'mentolder' ? 'bg-violet-500' : 'bg-blue-500'}"></div>
            <h4 class="text-xs font-bold uppercase tracking-wider text-admin-text-mute">{cluster} Cluster</h4>
            <span class="text-xs text-admin-text-disabled">({clusterAssets.length} Nodes)</span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each clusterAssets as asset}
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                on:click={() => drawerAsset = { slug: asset.slug, name: asset.name, emoji: roleEmoji[asset.role] ?? '🖥' }}
                on:keydown={e => e.key === 'Enter' && (drawerAsset = { slug: asset.slug, name: asset.name, emoji: roleEmoji[asset.role] ?? '🖥' })}
                role="button"
                tabindex="0"
                class="cursor-pointer p-4 rounded-2xl bg-admin-surface border border-admin-border hover:border-admin-primary/30 transition-all"
              >
                <div class="text-[10px] font-bold uppercase tracking-wider mb-2 {locationColor[asset.location ?? ''] ?? 'text-gray-400'}">
                  Hardware · {asset.role}
                </div>
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-9 h-9 rounded-xl bg-admin-sidebar-bg border border-admin-border flex items-center justify-center text-lg flex-shrink-0">
                    {roleEmoji[asset.role] ?? '🖥'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="font-bold text-white text-sm font-mono truncate">{asset.name}</div>
                    <div class="text-xs text-admin-text-mute truncate">{asset.os ?? ''}</div>
                  </div>
                  <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold flex-shrink-0 {statusBadge[asset.live_status] ?? statusBadge.unknown}">
                    {statusLabel[asset.live_status] ?? '???'}
                  </span>
                </div>
                <div class="flex gap-1.5 flex-wrap mb-2">
                  <span class="px-2 py-0.5 rounded-full text-[10px] {locationColor[asset.location ?? ''] ?? 'text-gray-400'} bg-white/5 border border-white/10">
                    {asset.location ?? '—'}
                  </span>
                </div>
                <div class="pt-2 border-t border-admin-border flex justify-between text-[10px] text-admin-text-disabled font-mono">
                  <span>{asset.ip ?? '—'}</span>
                  <span>k3s {asset.k8s_node_name}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>

{#if drawerAsset}
  <AssetTicketDrawer asset={drawerAsset} onClose={() => drawerAsset = null} />
{/if}
```

- [ ] **Step 9.2: Commit**

```bash
git add website/src/components/admin/platform/HardwareTab.svelte
git commit -m "feat(ui): HardwareTab — node grid grouped by cluster with live k8s status"
```

---

## Task 10: Wire Into PlatformHub.svelte

**Files:**
- Modify: `website/src/components/admin/PlatformHub.svelte`

- [ ] **Step 10.1: Read the current file**

Read `website/src/components/admin/PlatformHub.svelte` to confirm current imports and tabs array.

- [ ] **Step 10.2: Add imports**

After the existing imports, add:
```svelte
import SoftwareTab from './platform/SoftwareTab.svelte';
import HardwareTab from './platform/HardwareTab.svelte';
```

- [ ] **Step 10.3: Add two tabs to the tabs array**

In the `const tabs = [...]` array, add after the last existing entry:
```js
{ id: 'software', label: 'Software' },
{ id: 'hardware', label: 'Hardware' },
```

- [ ] **Step 10.4: Add tab panels**

In the `<main>` section, after the last `{:else if}` block and before `{/if}`, add:
```svelte
{:else if activeTab === 'software'}
  <SoftwareTab />
{:else if activeTab === 'hardware'}
  <HardwareTab />
```

- [ ] **Step 10.5: Build check**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/platform-asset-inventory
task website:dev &
sleep 8
curl -s http://localhost:4321/admin/platform -o /dev/null -w "%{http_code}" && echo " OK"
kill %1 2>/dev/null || true
```

Expected: `200 OK` (or redirect to login — either is fine, confirms no build error).

- [ ] **Step 10.6: Commit**

```bash
git add website/src/components/admin/PlatformHub.svelte
git commit -m "feat(ui): add Software + Hardware tabs to PlatformHub"
```

---

## Task 11: Update Test Inventory + Final E2E

**Files:**
- Modify: `website/src/data/test-inventory.json`

- [ ] **Step 11.1: Add FA-42 to test inventory**

Open `website/src/data/test-inventory.json`. Add this entry in the array (sorted by ID, after the FA-41 entry):
```json
{
  "id": "FA-42",
  "title": "Platform Asset Inventory",
  "description": "Software and hardware asset registry in the Platform Control Center with live k8s status and ticket linking.",
  "category": "functional",
  "file": "tests/e2e/specs/fa-42-platform-assets.spec.ts",
  "status": "active"
}
```

- [ ] **Step 11.2: Regenerate inventory and verify no diff**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/platform-asset-inventory
task test:inventory 2>/dev/null || true
git diff website/src/data/test-inventory.json | head -20
```

If `task test:inventory` doesn't exist or fails, the manual edit in Step 11.1 is sufficient.

- [ ] **Step 11.3: Run all auth E2E tests for FA-42**

```bash
npx playwright test tests/e2e/specs/fa-42-platform-assets.spec.ts --config tests/e2e/playwright.config.ts 2>&1 | tail -20
```

Expected: T1–T4 PASS (401), T5 PASS (redirect to login).

- [ ] **Step 11.4: Run offline test suite**

```bash
task test:all 2>&1 | tail -20
```

Expected: all green.

- [ ] **Step 11.5: Commit**

```bash
git add website/src/data/test-inventory.json
git commit -m "test(inventory): add FA-42 platform asset inventory"
```

---

## Task 12: Deploy + Verify

- [ ] **Step 12.1: Deploy to mentolder**

```bash
task feature:website
```

- [ ] **Step 12.2: Verify UI on mentolder**

Open `https://web.mentolder.de/admin/platform` in a browser. Navigate to the "Software" tab — should show a grid of 20 asset cards. Navigate to "Hardware" — should show 9 mentolder nodes (korczewski nodes show `unknown` status since this is the mentolder cluster). Click any card — ticket drawer should slide in.

- [ ] **Step 12.3: Deploy to korczewski**

```bash
task feature:website
# (feature:website fans out to both clusters)
```

- [ ] **Step 12.4: Commit final state and push**

```bash
git push -u origin feature/platform-asset-inventory
```
