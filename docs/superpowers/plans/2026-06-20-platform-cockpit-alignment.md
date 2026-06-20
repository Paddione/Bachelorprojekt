---
title: Platform Control Center — Cockpit Visual Alignment + Centralized Logging Integration Implementation Plan
ticket_id: T000000
plan_ref: docs/superpowers/plans/2026-06-20-platform-cockpit-alignment.md
status: active
date: 2026-06-20
domains: [website]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Platform Control Center — Cockpit Visual Alignment + Centralized Logging Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Platform Control Center (`/admin/platform`) visually indistinguishable from the Cockpit by moving its header into the Astro shell and migrating its ops tabs to the admin CSS design tokens, and surface the four Grafana dashboards from PR #1913 inside a new "Observability" tab.

**Architecture:** `platform.astro` becomes a thin shell like `cockpit.astro` — it renders `AdminPageHeader` (with the cluster badge in the `actions` slot) and derives a `grafanaUrl` server-side from `PROD_DOMAIN`, then passes both `cluster` and `grafanaUrl` into `PlatformHub`. `PlatformHub.svelte` drops its in-component `<header>` and swaps inline Tailwind tab classes for a scoped `<style>` block driven by `var(--admin-*)` tokens. The `logs` tab now renders a compositional `ObservabilityTab.svelte` wrapper that stacks a new `CentralizedLoggingPanel.svelte` (a 2×2 grid of Grafana dashboard cards) above the existing pod-log stream. `LogsTab.svelte` and `DienstTab.svelte` are migrated from raw Tailwind color utilities to the same CSS custom properties.

**Tech Stack:** Astro 6 / TypeScript, Svelte 5, `@testing-library/svelte` + Vitest (jsdom project), admin design tokens in `website/src/styles/admin-foundation.css`, global helper classes (`admin-card`) in `website/src/styles/admin-premium.css`.

## Global Constraints

- **No new env vars.** `PROD_DOMAIN` already exists in `environments/schema.yaml`; the Grafana base URL is derived from it at request time. Do **not** add a schema entry.
- **No hardcoded brand hostnames (S3).** Never write `*.mentolder.de` / `*.korczewski.de` literals into `website/src/`. The Grafana host is always built from `process.env.PROD_DOMAIN` (prod) with a `*.localhost` fallback (dev) — never a brand-domain literal.
- **No iframe embedding.** Grafana dashboards open in a new tab (`target="_blank"` + `rel="noopener noreferrer"`). oauth2-proxy header handling makes reliable same-origin iframe embedding brittle; plain links carry the existing session cookie and have no auth friction.
- **Design-token-only colors in migrated files.** After this plan, `LogsTab.svelte` and `DienstTab.svelte` contain **no** raw `bg-gray-*`, `text-gray-*`, `text-green-*`, `text-yellow-*`, `text-red-*`, `bg-blue-*`, `border-gray-*` Tailwind utilities. All colors resolve through `var(--admin-*)` in scoped `<style>` blocks. Layout/spacing Tailwind utilities (`flex`, `gap-*`, `rounded-*`, `px-*`, `space-y-*`, `h-96`, etc.) stay as-is — only the **color** utilities are migrated.
- **S1 line budgets (effective threshold − live `wc -l`; none of these files are baselined, so the threshold is the static extension limit):**
  - `website/src/pages/admin/platform.astro` — `.astro` limit 400, ist 19 → **budget 381**. Adds ~16 lines. Safe.
  - `website/src/components/admin/PlatformHub.svelte` — `.svelte` limit 500, ist 98 → **budget 402**. Header removal + style block is net-neutral-to-negative. Safe.
  - `website/src/components/admin/ops/LogsTab.svelte` — `.svelte` limit 500, ist 140 → **budget 360**. Token migration adds a `<style>` block (~30 lines). Safe.
  - `website/src/components/admin/ops/DienstTab.svelte` — `.svelte` limit 500, ist 132 → **budget 368**. Same pattern (~30 lines). Safe.
  - `website/src/components/admin/ops/CentralizedLoggingPanel.svelte` — NEW `.svelte`, limit 500. Target ~120 lines, cut with large reserve. Safe.
  - `website/src/components/admin/ops/ObservabilityTab.svelte` — NEW `.svelte`, limit 500. Target ~30 lines. Safe.
  - Test files (`*.test.ts`) — `.ts` limit 600 each, all new/small. Safe.

**Key repo facts (verified):**
- `platform.astro` **already imports and renders** `AdminPageHeader` (currently `title="Plattform Hub"` at 72rem) AND `PlatformHub` **also renders its own `<header>`** — so the title is duplicated today. This plan removes the duplication: the shell owns the header, the component owns content only.
- `cockpit.astro` is the reference pattern: `max-width:88rem`, `AdminPageHeader title="Cockpit" description="…"`, then the Svelte component with `client:load`.
- `AdminPageHeader.svelte` (`website/src/components/admin/ui/AdminPageHeader.svelte`) accepts `title`, `description?`, `breadcrumbs?` and exposes a named **`actions`** slot (`<slot name="actions" />`) — that is where the cluster badge goes.
- The admin tokens exist in `website/src/styles/admin-foundation.css`: `--admin-bg`, `--admin-sidebar-bg`, `--admin-surface`, `--admin-surface-hover`, `--admin-border`, `--admin-border-bright`, `--admin-primary`, `--admin-accent`, `--admin-text`, `--admin-text-mute`, `--admin-success`, `--admin-warning`, `--admin-danger`. The global `.admin-card` helper is in `website/src/styles/admin-premium.css`.
- Svelte component tests use `@testing-library/svelte` `render()` and run in the **jsdom** Vitest project; the include glob is `src/components/**/*.{test,spec}.ts` (so a test under `src/components/admin/ops/` is automatically picked up). Run a single file with `pnpm vitest run <path>` from `website/`.
- `PlatformHub.svelte` currently uses Tailwind `admin-*` *utility* classes (`bg-admin-primary`, `text-admin-text-mute`, …) for the tab bar plus a raw `text-white` in the header. The tab bar is migrated to a scoped `<style>` using the CSS custom properties directly; the footer and `admin-card`-wrapped tab bodies are left untouched.
- The four dashboards from PR #1913 are provisioned with stable Grafana UIDs: `log-explorer`, `api-errors`, `traefik-access`, `keycloak-audit`. A dashboard opens at `{grafanaUrl}/d/{uid}`.
- `process.env.PROD_DOMAIN` is the established way to build prod URLs in the website (`sitemap.xml.ts`, `api/admin/questionnaires/assign.ts`, …). Server-only Astro frontmatter can read it directly.

---

## File Structure

```
website/
  src/
    pages/admin/
      platform.astro                          # MODIFY: shell — 88rem, AdminPageHeader+badge, derive grafanaUrl, pass props
    components/admin/
      PlatformHub.svelte                      # MODIFY: remove <header>, add grafanaUrl prop, tab bar → CSS tokens, "Logs"→"Observability", render ObservabilityTab
      ops/
        ObservabilityTab.svelte               # NEW: wrapper — CentralizedLoggingPanel above pod-log stream
        CentralizedLoggingPanel.svelte        # NEW: 2×2 grid of 4 Grafana dashboard cards
        CentralizedLoggingPanel.test.ts       # NEW: render test — 4 cards, correct hrefs, new-tab attrs
        LogsTab.svelte                         # MODIFY: color Tailwind utilities → var(--admin-*) in scoped <style>
        DienstTab.svelte                       # MODIFY: color Tailwind utilities → var(--admin-*) in scoped <style>
```

---

## Task 1: CentralizedLoggingPanel.svelte — Grafana dashboard cards (TDD)

**Files:**
- Create: `website/src/components/admin/ops/CentralizedLoggingPanel.svelte`
- Test: `website/src/components/admin/ops/CentralizedLoggingPanel.test.ts`

**Interfaces:**
- Produces: a Svelte component with a single prop `grafanaUrl: string`. Renders one anchor per dashboard with `href={`${grafanaUrl}/d/${uid}`}`, `target="_blank"`, `rel="noopener noreferrer"`. Each anchor is reachable by its accessible name (the dashboard title).

- [ ] **Step 1: Write the failing test**

Create `website/src/components/admin/ops/CentralizedLoggingPanel.test.ts`:

```typescript
import { render, screen } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import CentralizedLoggingPanel from './CentralizedLoggingPanel.svelte';

describe('CentralizedLoggingPanel', () => {
  it('renders one link per Grafana dashboard with the correct UID path', () => {
    render(CentralizedLoggingPanel, { props: { grafanaUrl: 'http://grafana.test' } });
    const expected: Record<string, string> = {
      'Log Explorer': 'http://grafana.test/d/log-explorer',
      'API Error Tracker': 'http://grafana.test/d/api-errors',
      'Traefik Access Analytics': 'http://grafana.test/d/traefik-access',
      'Keycloak Audit Trail': 'http://grafana.test/d/keycloak-audit',
    };
    for (const [name, href] of Object.entries(expected)) {
      const link = screen.getByRole('link', { name: new RegExp(name, 'i') }) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe(href);
    }
  });

  it('opens every dashboard in a new tab with noopener', () => {
    render(CentralizedLoggingPanel, { props: { grafanaUrl: 'http://grafana.test' } });
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd website && pnpm vitest run src/components/admin/ops/CentralizedLoggingPanel.test.ts`
Expected: FAIL — `Cannot find module './CentralizedLoggingPanel.svelte'`.

- [ ] **Step 3: Implement the component**

Create `website/src/components/admin/ops/CentralizedLoggingPanel.svelte`:

```svelte
<script lang="ts">
  export let grafanaUrl: string;

  // Stable Grafana UIDs provisioned by the centralized-logging change (PR #1913).
  const dashboards = [
    {
      uid: 'log-explorer',
      title: 'Log Explorer',
      description: 'Live-Logs aller Pods — nach App, Namespace und Level filtern.',
    },
    {
      uid: 'api-errors',
      title: 'API Error Tracker',
      description: 'Top-10 fehlschlagende Endpunkte + Request-ID-Suche.',
    },
    {
      uid: 'traefik-access',
      title: 'Traefik Access Analytics',
      description: 'HTTP-Status-Verteilung, langsame Endpunkte, 4xx/5xx-Rate.',
    },
    {
      uid: 'keycloak-audit',
      title: 'Keycloak Audit Trail',
      description: 'Login-Events und fehlgeschlagene Authentifizierungen.',
    },
  ];
</script>

<section class="panel">
  <header class="panel-head">
    <h3 class="panel-title">Grafana Dashboards</h3>
    <p class="panel-subtitle">Zentrale Observability-Infrastruktur</p>
  </header>

  <div class="grid">
    {#each dashboards as d}
      <a
        class="card"
        href={`${grafanaUrl}/d/${d.uid}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="card-title">{d.title}</span>
        <span class="card-desc">{d.description}</span>
        <span class="card-cta">Öffnen →</span>
      </a>
    {/each}
  </div>
</section>

<style>
  .panel-title {
    font-weight: 700;
    color: var(--admin-text);
    margin: 0;
  }
  .panel-subtitle {
    color: var(--admin-text-mute);
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
  }
  .panel-head {
    margin-bottom: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 16px;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    text-decoration: none;
    transition: border-color 0.2s ease;
  }
  .card:hover {
    border-color: var(--admin-border-bright);
  }
  .card-title {
    font-weight: 700;
    color: var(--admin-text);
  }
  .card-desc {
    font-size: 0.8rem;
    color: var(--admin-text-mute);
  }
  .card-cta {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--admin-accent);
  }
</style>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd website && pnpm vitest run src/components/admin/ops/CentralizedLoggingPanel.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Commit**

```bash
git add website/src/components/admin/ops/CentralizedLoggingPanel.svelte website/src/components/admin/ops/CentralizedLoggingPanel.test.ts
git commit -m "feat(admin): CentralizedLoggingPanel with 4 Grafana dashboard cards [T000000]"
```

---

## Task 2: ObservabilityTab.svelte — compositional wrapper

**Files:**
- Create: `website/src/components/admin/ops/ObservabilityTab.svelte`

**Interfaces:**
- Consumes: `CentralizedLoggingPanel` (Task 1, prop `grafanaUrl`) and the existing `LogsTab` (prop `cluster`).
- Produces: a Svelte component with props `cluster: string` and `grafanaUrl: string`. Stacks the panel above an `admin-card`-wrapped pod-log stream. No business logic.

- [ ] **Step 1: Implement the wrapper**

Create `website/src/components/admin/ops/ObservabilityTab.svelte`:

```svelte
<script lang="ts">
  import CentralizedLoggingPanel from './CentralizedLoggingPanel.svelte';
  import LogsTab from './LogsTab.svelte';

  export let cluster: string;
  export let grafanaUrl: string;
</script>

<div class="space-y-8">
  <CentralizedLoggingPanel {grafanaUrl} />
  <div class="admin-card">
    <h3 class="pod-heading">Pod-Logs</h3>
    <LogsTab {cluster} />
  </div>
</div>

<style>
  .pod-heading {
    font-weight: 700;
    color: var(--admin-text);
    margin: 0 0 1rem;
  }
</style>
```

- [ ] **Step 2: Typecheck the new component**

Run: `cd website && pnpm astro check 2>&1 | tail -20`
Expected: no new type errors referencing `ObservabilityTab`, `cluster`, or `grafanaUrl`.

- [ ] **Step 3: Commit**

```bash
git add website/src/components/admin/ops/ObservabilityTab.svelte
git commit -m "feat(admin): ObservabilityTab wrapper (logging panel + pod stream) [T000000]"
```

---

## Task 3: platform.astro — shell pattern (header + grafanaUrl)

**Files:**
- Modify: `website/src/pages/admin/platform.astro`

**Interfaces:**
- Produces: `grafanaUrl: string` derived from `process.env.PROD_DOMAIN` (prod → `https://grafana.<domain>`; dev fallback → `http://grafana.localhost`). Passes `cluster={brandId}` and `{grafanaUrl}` to `PlatformHub`. Renders the page title via `AdminPageHeader` with the cluster badge in the `actions` slot.

- [ ] **Step 1: Rewrite platform.astro to the shell pattern**

Replace the entire contents of `website/src/pages/admin/platform.astro` with:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader.svelte';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import PlatformHub from '../../components/admin/PlatformHub.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brandId = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

// Grafana base URL is derived from PROD_DOMAIN (no new env var). Dev falls back to
// the in-cluster *.localhost host. Never hardcode a brand domain here (S3).
const grafanaUrl = process.env.PROD_DOMAIN
  ? `https://grafana.${process.env.PROD_DOMAIN}`
  : 'http://grafana.localhost';
---

<AdminLayout title="Platform Control Center">
  <div style="max-width:88rem; margin:0 auto; padding:1.5rem 1.5rem 0;">
    <AdminPageHeader
      title="Platform Control Center"
      description="Zentralisierte Steuerung der Multicluster-Infrastruktur"
    >
      <span slot="actions" class="cluster-badge">{brandId} node</span>
    </AdminPageHeader>
  </div>
  <PlatformHub client:load cluster={brandId} {grafanaUrl} />
</AdminLayout>

<style>
  .cluster-badge {
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    background: var(--admin-primary-muted);
    border: 1px solid var(--admin-border-bright);
    color: var(--admin-primary);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
</style>
```

- [ ] **Step 2: Verify no brand-domain literal leaked in (S3)**

Run: `cd /tmp/wt-platform-cockpit-alignment && grep -nE 'mentolder\.de|korczewski\.de' website/src/pages/admin/platform.astro || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Typecheck**

Run: `cd website && pnpm astro check 2>&1 | tail -20`
Expected: no new type errors referencing `platform.astro` or `grafanaUrl`.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/platform.astro
git commit -m "feat(admin): platform.astro shell — AdminPageHeader + grafanaUrl [T000000]"
```

---

## Task 4: PlatformHub.svelte — header removal + tab-bar token migration

**Files:**
- Modify: `website/src/components/admin/PlatformHub.svelte`

**Interfaces:**
- Consumes: `cluster: string` (existing) and a new `grafanaUrl: string` prop (from Task 3), forwarded to `ObservabilityTab` (Task 2).
- Produces: content-only component (no `<header>`); the `logs` tab renders `<ObservabilityTab {cluster} {grafanaUrl} />`; the tab label "Logs" is renamed "Observability"; the tab-bar colors resolve through `var(--admin-*)` in a scoped `<style>`.

- [ ] **Step 1: Import ObservabilityTab and add the grafanaUrl prop**

In `website/src/components/admin/PlatformHub.svelte`, add the import alongside the other ops imports (after the `LogsTab` import on line 7):

```svelte
  import ObservabilityTab from './ops/ObservabilityTab.svelte';
```

Then add the new prop directly below `export let cluster: string;`:

```svelte
  export let grafanaUrl: string;
```

- [ ] **Step 2: Rename the "Logs" tab label to "Observability"**

In the `tabs` array, change the `logs` entry from:

```svelte
    { id: 'logs', label: 'Logs' },
```

to:

```svelte
    { id: 'logs', label: 'Observability' },
```

- [ ] **Step 3: Remove the in-component header**

Delete the entire `<header>` block (currently lines 28–34):

```svelte
  <header class="mb-10">
    <div class="flex items-center gap-3 mb-2">
      <span class="px-2 py-0.5 rounded-full bg-admin-primary/10 border border-admin-primary/20 text-[10px] font-bold text-admin-primary uppercase tracking-wider">{cluster} node</span>
      <h1 class="text-4xl font-extrabold text-white tracking-tight">Platform Control Center</h1>
    </div>
    <p class="text-admin-text-mute">Zentralisierte Steuerung der Multicluster-Infrastruktur.</p>
  </header>
```

The header is now owned by `platform.astro` (Task 3). Leave the outer `<div class="p-6 max-w-7xl mx-auto">` wrapper and everything below it in place.

- [ ] **Step 4: Swap the tab bar to scoped CSS-token classes**

Replace the tab-bar block (the `<div style="overflow-x: auto; …">` wrapper containing the `{#each tabs}` loop) with this token-driven version:

```svelte
  <div class="tab-scroll">
    <div class="tab-bar">
      {#each tabs as tab}
        <button
          on:click={() => activeTab = tab.id}
          class="tab"
          class:tab-active={activeTab === tab.id}
        >
          {tab.label}
          {#if tab.premium}
            <span class="tab-premium">✨</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>
```

- [ ] **Step 5: Render ObservabilityTab for the logs tab**

In the `<main>` block, replace the `logs` branch from:

```svelte
    {:else if activeTab === 'logs'}
      <div class="admin-card">
        <LogsTab {cluster} />
      </div>
```

to (no `admin-card` wrapper here — `ObservabilityTab` wraps the pod stream itself):

```svelte
    {:else if activeTab === 'logs'}
      <ObservabilityTab {cluster} {grafanaUrl} />
```

> `LogsTab` stays imported because `ObservabilityTab` imports it; do not remove the `LogsTab` import line from `PlatformHub.svelte` — leaving an unused import is a lint warning, so verify in Step 7 and remove the `PlatformHub` `LogsTab` import only if `pnpm astro check` flags it as unused.

- [ ] **Step 6: Add the scoped tab-bar style block**

At the end of the file (after the closing `</div>` of the component markup), add a `<style>` block:

```svelte
<style>
  .tab-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .tab-bar {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.25rem;
    width: fit-content;
    margin-bottom: 2rem;
    padding: 0.25rem;
    border-radius: 1rem;
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
  }
  .tab {
    white-space: nowrap;
    min-height: 44px;
    padding: 0.5rem 1.25rem;
    border-radius: 0.75rem;
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--admin-text-mute);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease, background 0.2s ease;
  }
  .tab:hover {
    color: var(--admin-text);
  }
  .tab-active {
    background: var(--admin-primary);
    color: var(--admin-bg);
  }
  .tab-premium {
    margin-left: 0.25rem;
    font-size: 0.5rem;
    opacity: 0.5;
  }
</style>
```

- [ ] **Step 7: Typecheck and confirm the prop chain**

Run: `cd website && pnpm astro check 2>&1 | tail -20`
Expected: no new type errors. If it reports `LogsTab` as an unused import in `PlatformHub.svelte`, delete that import line and re-run.

- [ ] **Step 8: Commit**

```bash
git add website/src/components/admin/PlatformHub.svelte
git commit -m "feat(admin): PlatformHub header removal + tab bar CSS tokens + Observability tab [T000000]"
```

---

## Task 5: LogsTab.svelte — color token migration

**Files:**
- Modify: `website/src/components/admin/ops/LogsTab.svelte`

**Interfaces:**
- No interface change. `levelClass(line)` keeps returning a class name, but the returned classes (`log-error`/`log-warn`/`log-info`) now resolve through `var(--admin-*)` in a scoped `<style>` block instead of Tailwind `text-red-400`/`text-yellow-400`/`text-green-300`.

- [ ] **Step 1: Migrate `levelClass` return values**

In the `<script>`, change the `levelClass` function from:

```svelte
  function levelClass(line: string) {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('fatal') || l.includes('err ')) return 'text-red-400';
    if (l.includes('warn')) return 'text-yellow-400';
    return 'text-green-300';
  }
```

to:

```svelte
  function levelClass(line: string) {
    const l = line.toLowerCase();
    if (l.includes('error') || l.includes('fatal') || l.includes('err ')) return 'log-error';
    if (l.includes('warn')) return 'log-warn';
    return 'log-info';
  }
```

- [ ] **Step 2: Replace color utilities in the markup with token classes**

Apply these exact replacements in the `LogsTab.svelte` template (color utilities only — keep all layout/spacing utilities):

- Every label `class="text-xs text-gray-400 block mb-1"` → `class="ctl-label"`.
- Every `<select>`/`<input>` with `class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white"` (and the filter input variant `class="flex-1 max-w-xs bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white"`) → drop `bg-gray-700 border-gray-600 text-white` and add the token class `field`: e.g. `class="field rounded px-2 py-1.5 text-sm"` and `class="field flex-1 max-w-xs rounded px-3 py-1.5 text-sm"`.
- Stop button `class="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded"` → `class="btn-danger px-3 py-1.5 text-sm rounded"`.
- Start button `class="px-3 py-1.5 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded"` → `class="btn-success px-3 py-1.5 text-sm disabled:opacity-50 rounded"`.
- Auto-scroll label `class="flex items-center gap-2 text-xs text-gray-400 cursor-pointer"` → `class="flex items-center gap-2 text-xs cursor-pointer ctl-label"`.
- Line count `class="text-xs text-gray-500"` → `class="text-xs count-label"`.
- Log container `class="bg-gray-950 border border-gray-700 rounded-lg p-3 h-96 overflow-y-auto font-mono text-xs leading-relaxed"` → `class="log-box rounded-lg p-3 h-96 overflow-y-auto font-mono text-xs leading-relaxed"`.
- Empty-state `<p class="text-gray-600">` → `<p class="empty-hint">`.
- Error `<p class="text-red-400 text-xs">` → `<p class="log-error text-xs">`.

- [ ] **Step 3: Add the scoped style block**

At the end of `LogsTab.svelte`, append:

```svelte
<style>
  .ctl-label {
    color: var(--admin-text-mute);
  }
  .count-label {
    color: var(--admin-text-mute);
  }
  .empty-hint {
    color: var(--admin-text-mute);
  }
  .field {
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
    color: var(--admin-text);
  }
  .log-box {
    background: var(--admin-bg);
    border: 1px solid var(--admin-border);
  }
  .btn-danger {
    background: var(--admin-danger);
    color: var(--admin-bg);
    border: none;
  }
  .btn-success {
    background: var(--admin-success);
    color: var(--admin-bg);
    border: none;
  }
  .log-error {
    color: var(--admin-danger);
  }
  .log-warn {
    color: var(--admin-warning);
  }
  .log-info {
    color: var(--admin-success);
  }
</style>
```

- [ ] **Step 4: Verify no raw color utilities remain**

Run: `cd /tmp/wt-platform-cockpit-alignment && grep -nE 'bg-gray-|text-gray-|text-green-|text-yellow-|text-red-|bg-red-|bg-green-|bg-blue-|border-gray-' website/src/components/admin/ops/LogsTab.svelte || echo "clean"`
Expected: `clean`.

- [ ] **Step 5: Typecheck**

Run: `cd website && pnpm astro check 2>&1 | tail -20`
Expected: no new type errors referencing `LogsTab`.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/ops/LogsTab.svelte
git commit -m "refactor(admin): LogsTab color utilities → admin CSS tokens [T000000]"
```

---

## Task 6: DienstTab.svelte — color token migration

**Files:**
- Modify: `website/src/components/admin/ops/DienstTab.svelte`

**Interfaces:**
- No interface change. `statusCls(s)` keeps returning a class name, but returns `status-healthy`/`status-degraded`/`status-stopped` resolving through `var(--admin-*)` instead of `text-green-400`/`text-yellow-400`/`text-gray-500`.

- [ ] **Step 1: Migrate `statusCls` return values**

In the `<script>`, change `statusCls` from:

```svelte
  function statusCls(s: string) {
    if (s === 'healthy') return 'text-green-400';
    if (s === 'degraded') return 'text-yellow-400';
    return 'text-gray-500';
  }
```

to:

```svelte
  function statusCls(s: string) {
    if (s === 'healthy') return 'status-healthy';
    if (s === 'degraded') return 'status-degraded';
    return 'status-stopped';
  }
```

- [ ] **Step 2: Replace color utilities in the markup with token classes**

Apply these exact replacements in `DienstTab.svelte` (color utilities only — keep layout/spacing):

- Success message `<p class="text-green-400 text-sm">` → `<p class="msg-success text-sm">`.
- Refresh button `class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"` → `class="btn-accent px-3 py-1.5 text-sm disabled:opacity-50 rounded"`.
- Error `<p class="text-red-400 text-sm">` → `<p class="msg-error text-sm">`.
- Group card `class="bg-gray-800 border border-gray-700 rounded-lg p-4"` → `class="group-card rounded-lg p-4"`.
- Group heading `class="text-sm font-semibold text-gray-200 mb-3"` → `class="text-sm font-semibold mb-3 group-heading"`.
- Deployment name `class="text-sm text-gray-200 font-mono"` → `class="text-sm font-mono dep-name"`.
- Status span `class="ml-3 text-xs {statusCls(d.status)}"` → keep `{statusCls(d.status)}` (now a token class); the surrounding utilities (`ml-3 text-xs`) stay: `class="ml-3 text-xs {statusCls(d.status)}"` (unchanged — only `statusCls` output changed in Step 1).
- "Neu starten" button `class="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded"` → `class="btn-accent px-2 py-1 text-xs rounded"`.
- "Skalieren" button `class="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded"` → `class="btn-neutral px-2 py-1 text-xs rounded"`.
- Dialog overlay `class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"` → keep (the `bg-black/60` scrim is an intentional modal backdrop, not a gray surface token; leave it).
- Dialog panel `class="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-sm w-full mx-4"` → `class="dialog-panel rounded-lg p-6 max-w-sm w-full mx-4"`.
- Both dialog headings `class="text-base font-semibold text-white mb-2"` → `class="text-base font-semibold mb-2 dialog-title"`.
- Both dialog paragraphs `class="text-sm text-gray-300 mb-4"` / `class="text-sm text-gray-300 mb-3"` → `class="text-sm mb-4 dialog-text"` / `class="text-sm mb-3 dialog-text"`.
- Both `<span class="font-mono text-blue-300">` → `<span class="font-mono dep-accent">`.
- Scale `<input type="number" … class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm mb-4" />` → `class="field w-full rounded px-3 py-2 text-sm mb-4"`.
- Dialog error `<p class="text-red-400 text-sm mb-3">` → `<p class="msg-error text-sm mb-3">`.
- Cancel button `class="px-4 py-2 text-sm text-gray-300 hover:text-white"` → `class="btn-ghost px-4 py-2 text-sm"`.
- Confirm button `class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"` → `class="btn-accent px-4 py-2 text-sm disabled:opacity-50 rounded"`.

- [ ] **Step 3: Add the scoped style block**

At the end of `DienstTab.svelte`, append:

```svelte
<style>
  .status-healthy {
    color: var(--admin-success);
  }
  .status-degraded {
    color: var(--admin-warning);
  }
  .status-stopped {
    color: var(--admin-text-mute);
  }
  .msg-success {
    color: var(--admin-success);
  }
  .msg-error {
    color: var(--admin-danger);
  }
  .group-card,
  .dialog-panel {
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
  }
  .group-heading {
    color: var(--admin-text);
  }
  .dep-name {
    color: var(--admin-text);
  }
  .dialog-title {
    color: var(--admin-text);
  }
  .dialog-text {
    color: var(--admin-text-mute);
  }
  .dep-accent {
    color: var(--admin-accent);
  }
  .field {
    background: var(--admin-sidebar-bg);
    border: 1px solid var(--admin-border);
    color: var(--admin-text);
  }
  .btn-accent {
    background: var(--admin-accent);
    color: var(--admin-bg);
    border: none;
  }
  .btn-neutral {
    background: var(--admin-surface-hover);
    color: var(--admin-text);
    border: none;
  }
  .btn-ghost {
    color: var(--admin-text-mute);
    background: transparent;
    border: none;
  }
  .btn-ghost:hover {
    color: var(--admin-text);
  }
</style>
```

- [ ] **Step 4: Verify no raw color utilities remain (modal scrim excepted)**

Run: `cd /tmp/wt-platform-cockpit-alignment && grep -nE 'bg-gray-|text-gray-|text-green-|text-yellow-|text-red-|bg-red-|bg-green-|bg-blue-|text-blue-|text-white|border-gray-' website/src/components/admin/ops/DienstTab.svelte || echo "clean"`
Expected: `clean` (the only remaining color literal is the intentional `bg-black/60` modal backdrop, which the grep above does not match).

- [ ] **Step 5: Typecheck**

Run: `cd website && pnpm astro check 2>&1 | tail -20`
Expected: no new type errors referencing `DienstTab`.

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/ops/DienstTab.svelte
git commit -m "refactor(admin): DienstTab color utilities → admin CSS tokens [T000000]"
```

---

## Task 7: Final verification (PFLICHT)

**Files:** none (verification + generated-artifact regeneration only).

- [ ] **Step 1: Full component + node unit tests for the website**

Run: `cd website && pnpm vitest run src/components/admin/ops/CentralizedLoggingPanel.test.ts`
Expected: PASS (2 passing) — the new component test stays green.

- [ ] **Step 2: Targeted tests for changed domains**

Run: `cd /tmp/wt-platform-cockpit-alignment && task test:changed`
Expected: vitest (website, including the new CentralizedLoggingPanel test under the jsdom project), the BATS selection, and `quality:check` (S1–S4 ratchet) all pass.

- [ ] **Step 3: Regenerate freshness artifacts**

Run: `cd /tmp/wt-platform-cockpit-alignment && task freshness:regenerate`
Expected: regenerates generated artifacts (test-inventory, repo-index, …). Stage and commit anything it changes (see Step 6).

- [ ] **Step 4: Regenerate the test inventory (a test file was added)**

Run: `cd /tmp/wt-platform-cockpit-alignment && task test:inventory`
Expected: `website/src/data/test-inventory.json` updates to include `CentralizedLoggingPanel.test.ts`.

- [ ] **Step 5: Freshness + quality gate (CI equivalent)**

Run: `cd /tmp/wt-platform-cockpit-alignment && task freshness:check`
Expected: green — freshness + `quality:check` (S1–S4) + the baseline key-count assertion all pass. No file should trip S1 (all budgets are large per the Global Constraints block); if one unexpectedly does, split it rather than adding a baseline entry.

- [ ] **Step 6: OpenSpec validation**

Run: `cd /tmp/wt-platform-cockpit-alignment && bash scripts/openspec.sh validate`
Expected: the `platform-cockpit-alignment` change tree validates clean.

- [ ] **Step 7: Commit any regenerated artifacts**

```bash
cd /tmp/wt-platform-cockpit-alignment && git add -A && \
  git commit -m "chore(admin): regenerate test-inventory + freshness artifacts [T000000]" || echo "nothing to commit"
```

---

## Self-Review (author checklist — completed)

- **Spec coverage:** Section 1 platform.astro shell (Task 3) · Section 2 PlatformHub header removal + token tab bar + Observability rename + ObservabilityTab wiring (Task 4) · Section 3 design-token migration of LogsTab (Task 5) and DienstTab (Task 6) · Section 4 CentralizedLoggingPanel 4-card grid (Task 1) · Section 5 ObservabilityTab wrapper (Task 2) · final verification with `task test:changed` / `freshness:regenerate` / `freshness:check` (Task 7). All 5 success criteria mapped: (1) header via AdminPageHeader → Task 3; (2) no raw color utilities in LogsTab/DienstTab → Tasks 5/6 grep gates; (3) Observability tab shows 4 cards above pod stream → Tasks 1/2/4; (4) each card link resolves to the correct dashboard URL → Task 1 test; (5) `task test:changed` + `task freshness:check` pass → Task 7.
- **No placeholders:** every code step shows complete content; no unfilled markers or "repeat-from-another-task" references.
- **No hardcoded brand hostnames (S3):** `grafanaUrl` is derived from `process.env.PROD_DOMAIN` with a `*.localhost` fallback; Task 3 Step 2 greps `platform.astro` for brand-domain literals.
- **Type consistency:** the `grafanaUrl: string` prop is defined identically in `platform.astro` (Task 3) → `PlatformHub` (Task 4) → `ObservabilityTab` (Task 2) → `CentralizedLoggingPanel` (Task 1); the link pattern `${grafanaUrl}/d/${uid}` is identical in the component (Task 1) and its test.
- **S1 budgets:** all six files have triple-digit residual budgets against the static `.svelte` (500) / `.astro` (400) limits; no split needed and no baseline entry added.
- **TDD:** Task 1 writes a failing test first (Step 2 expects FAIL) before implementing the component.
