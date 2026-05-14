---
title: Wizard + Run UI — Implementation Plan (Plan C of 3)
domains: [website]
status: active
pr_number: null
---

# Wizard + Run UI — Implementation Plan (Plan C of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four admin pages and two Svelte components: a runs list page, a 4-step wizard for creating new runs (with a "Demo-Anweisung kopieren" button that generates the CC + Playwright MCP instruction), a parent-run detail page with SSE live updates, and a per-walk card component — all styled with the existing mentolder/kore design tokens.

**Architecture:** Pure frontend on top of Plan B's API. All data fetching is SSR in Astro page frontmatter or via client-side fetch. The wizard is a single Svelte 5 component (`SystemtestWizard.svelte`) rendered with `client:load`. The parent-run page subscribes to the SSE endpoint and falls back to 2-second polling if `EventSource` fails. `RunCard.svelte` renders one walk card. The `/admin/wissensquellen` KnowledgeSourceModal from Plan A is re-used inline on wizard step 3 via a `+ Neue Wissensquelle` button (no code duplication).

**Tech Stack:** Astro 4 + Svelte 5 runes; TypeScript; CSS vars (`--brass`, `--ink-*`, `--fg`, `--sage`) from existing design system; Playwright for E2E.

**Reference spec:** `docs/superpowers/specs/2026-05-09-systemtest-llm-runs-design.md` (sections 6.1, 6.2, 6.3, 5.5, 10).

**Depends on:** Plan A merged (knowledge.collections API at `/api/admin/knowledge/collections` + `KnowledgeSourceModal.svelte`) and Plan B merged (systemtest runs API + `generateDemoPrompt`).

**Out of scope (Plan C):** headless walker, any backend changes.

---

## File Structure

**Created:**
- `website/src/pages/admin/systemtests/index.astro` — list of past runs (table, SSR)
- `website/src/pages/admin/systemtests/new.astro` — new-run page (mounts wizard)
- `website/src/pages/admin/systemtests/[id].astro` — parent-run detail page (SSR + SSE)
- `website/src/components/admin/SystemtestWizard.svelte` — 4-step wizard (Svelte 5)
- `website/src/components/admin/RunCard.svelte` — per-walk status card (Svelte 5)
- `tests/e2e/specs/systemtest-run.spec.ts` — E2E test (skipped when `E2E_ADMIN_PASS` unset)

**Modified:**
- Nothing — Plan C is additions only.

---

## Task 0 — Branch from main (after Plan B merges)

- [ ] **Step 1: Confirm Plan B is merged**

```bash
cd /home/patrick/Bachelorprojekt
git checkout main && git pull origin main
git log --oneline -5
```

Expected: top commit is the Plan B PR merge. The `systemtest.runs` table and all API endpoints must be live.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feature/systemtest-run-ui
git status
```

Expected: clean branch.

---

## Task 1 — RunCard.svelte (per-walk card)

**Files:**
- Create: `website/src/components/admin/RunCard.svelte`

The card is stateless — all data comes from props. The parent page passes the walk object; the card renders template number, title (resolved via a `templateTitle` prop), status pill, score, agent observation, and a link to the assignment detail.

- [ ] **Step 1: Create the component**

Create `website/src/components/admin/RunCard.svelte`:

```svelte
<script lang="ts">
  import type { RunWalk } from '../../lib/systemtest-runs-db';

  let {
    walk,
    templateTitle = '',
    brand = 'mentolder',
    domain = '',
  }: {
    walk: RunWalk;
    templateTitle?: string;
    brand?: string;
    domain?: string;
  } = $props();

  const statusColor: Record<string, string> = {
    pending:   'var(--fg-soft)',
    running:   'var(--brass)',
    completed: 'var(--sage)',
    failed:    '#c96e6e',
    cancelled: 'var(--fg-soft)',
  };

  function scoreLabel(score: number | null): string {
    if (score === null) return '—';
    return `${Math.round(score * 100)} %`;
  }
</script>

<article class="run-card" style="--accent: {statusColor[walk.status] ?? 'var(--fg-soft)'}">
  <header>
    <span class="num">ST-{walk.template_number}</span>
    <span class="title">{templateTitle || `System-Test ${walk.template_number}`}</span>
    <span class="pill" style="color: {statusColor[walk.status]}">{walk.status}</span>
  </header>

  <div class="score">{scoreLabel(walk.compliance_score)}</div>

  {#if walk.agent_observation}
    <p class="observation">{walk.agent_observation}</p>
  {/if}

  {#if domain && walk.assignment_id}
    <a
      class="detail-link"
      href="https://web.{domain}/admin/fragebogen/{walk.assignment_id}"
      target="_blank"
      rel="noreferrer"
    >
      Fragebogen-Detail →
    </a>
  {/if}
</article>

<style>
  .run-card {
    border-left: 3px solid var(--accent);
    background: var(--ink-800);
    border-radius: 8px;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .num {
    font-size: 10px;
    color: var(--fg-soft);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
  }
  .title {
    font-weight: 600;
    font-size: 13px;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }
  .score {
    font-size: 20px;
    font-weight: 700;
    color: var(--accent);
    line-height: 1;
  }
  .observation {
    font-size: 12px;
    font-style: italic;
    color: var(--fg-soft);
    margin: 0;
    border-top: 1px dashed var(--ink-750);
    padding-top: 0.4rem;
  }
  .detail-link {
    font-size: 11px;
    color: var(--brass);
    text-decoration: none;
    margin-top: auto;
  }
  .detail-link:hover { text-decoration: underline; }
</style>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep 'RunCard' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/admin/RunCard.svelte
git commit -m "feat(ui): RunCard.svelte — per-walk status card"
```

---

## Task 2 — SystemtestWizard.svelte (4-step wizard)

**Files:**
- Create: `website/src/components/admin/SystemtestWizard.svelte`

The wizard has 4 steps:
1. **Stamm** — Name (text) + Brand (mentolder | korczewski)
2. **Nebenziele** — ordered list, "+ Hinzufügen", ↑↓ reorder, ✕ remove; Weiter disabled until ≥ 1
3. **Wissen** — checkbox list of all knowledge.collections from API; "+ Neue Wissensquelle" opens KnowledgeSourceModal; Weiter disabled until ≥ 1 selected
4. **Bestätigen** — read-only summary; two buttons: "▶ Lauf starten" and "📋 Demo-Anweisung kopieren"

Both step-4 buttons POST to `/api/admin/systemtests/runs`. The first then navigates to the run page. The second copies the generated prompt string (fetched from the newly created run's response) to the clipboard.

- [ ] **Step 1: Create the component**

Create `website/src/components/admin/SystemtestWizard.svelte`:

```svelte
<script lang="ts">
  import KnowledgeSourceModal from './KnowledgeSourceModal.svelte';

  interface Collection { id: string; name: string; source: string; chunk_count: number; }

  let {
    domain = '',
    brand: initialBrand = 'mentolder',
  }: { domain?: string; brand?: string } = $props();

  // ── Step state ────────────────────────────────────────────────────
  let step = $state(1);

  // Step 1
  let runName = $state('');
  let brand = $state<'mentolder' | 'korczewski'>(initialBrand as 'mentolder' | 'korczewski');

  // Step 2
  let objectives = $state<string[]>([]);
  let newObj = $state('');
  function addObjective() {
    const o = newObj.trim();
    if (o) { objectives = [...objectives, o]; newObj = ''; }
  }
  function removeObjective(i: number) { objectives = objectives.filter((_, idx) => idx !== i); }
  function moveObjective(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= objectives.length) return;
    const copy = [...objectives];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    objectives = copy;
  }

  // Step 3
  let collections = $state<Collection[]>([]);
  let selectedIds = $state<Set<string>>(new Set());
  let loadingCols = $state(false);
  let showModal = $state(false);

  async function loadCollections() {
    loadingCols = true;
    try {
      const r = await fetch('/api/admin/knowledge/collections');
      collections = await r.json() as Collection[];
    } finally { loadingCols = false; }
  }

  function onCollectionCreated(id: string) {
    loadCollections();
    selectedIds = new Set([...selectedIds, id]);
  }

  // Step 4
  let busy = $state(false);
  let error = $state<string | null>(null);
  let copied = $state(false);

  async function postRun() {
    const r = await fetch('/api/admin/systemtests/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: runName.trim(),
        brand,
        side_objectives: objectives,
        collection_ids: [...selectedIds],
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error ?? `HTTP ${r.status}`);
    }
    return await r.json() as { id: string; walks: Array<{ assignment_id: string; template_number: number }> };
  }

  async function startRun() {
    busy = true; error = null;
    try {
      const run = await postRun();
      await fetch(`/api/admin/systemtests/runs/${run.id}/start`, { method: 'POST' });
      window.location.href = `/admin/systemtests/${run.id}`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fehler';
    } finally { busy = false; }
  }

  async function copyDemo() {
    busy = true; error = null; copied = false;
    try {
      const run = await postRun();
      const colNames = collections.filter(c => selectedIds.has(c.id)).map(c => c.name);
      // Build the prompt client-side (mirrors generateDemoPrompt)
      const objs = objectives.map((o, i) => `${i + 1}. ${o}`).join('\n');
      const walkBlocks = run.walks.map(w =>
        `### System-Test ${w.template_number}\n` +
        `URL: https://web.${domain}/portal/fragebogen/${w.assignment_id}\n` +
        `After submitting: PUT https://web.${domain}/api/admin/questionnaires/assignments/${w.assignment_id}\n` +
        `  body: { "status": "reviewed", "coach_notes": "<1-2 sentence observation>" }`
      ).join('\n\n');

      const prompt = [
        `Drive the system-test walk for run ${run.id} using the Playwright MCP tools.`,
        '',
        '== Side objectives ==',
        objs,
        '',
        '== Knowledge collections ==',
        colNames.join(', ') || '—',
        '',
        '== Instructions ==',
        'For each of the 12 system-test templates below:',
        '1. Open the portal URL in the browser (use your admin session).',
        '2. For each step: click erfüllt | teilweise | nicht_erfüllt, fill the Details field with a',
        '   1-2 sentence justification, click "Speichern & Weiter".',
        '3. At the last step: click "Testprotokoll absenden".',
        '4. PUT coach_notes + status=reviewed via the admin API (body shown below each walk).',
        '',
        'Use mcp__plugin_playwright_playwright__browser_* tools throughout.',
        '',
        '== Walks ==',
        '',
        walkBlocks,
        '',
        `Run page: https://web.${domain}/admin/systemtests/${run.id}`,
      ].join('\n');

      await navigator.clipboard.writeText(prompt);
      copied = true;
      setTimeout(() => { window.location.href = `/admin/systemtests/${run.id}`; }, 1500);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Fehler';
    } finally { busy = false; }
  }

  // Navigation
  function next() {
    if (step === 3 && collections.length === 0) loadCollections();
    step = Math.min(step + 1, 4);
  }
  function back() { step = Math.max(step - 1, 1); }

  const canNext = $derived(
    (step === 1 && runName.trim().length > 0) ||
    (step === 2 && objectives.length > 0) ||
    (step === 3 && selectedIds.size > 0) ||
    step === 4,
  );

  const steps = ['Stamm', 'Nebenziele', 'Wissen', 'Bestätigen'];
</script>

<div class="wizard">
  <!-- Breadcrumb -->
  <nav class="breadcrumb">
    {#each steps as label, i}
      <span class="crumb" class:active={step === i + 1} class:done={step > i + 1}>{i + 1}. {label}</span>
      {#if i < steps.length - 1}<span class="sep">›</span>{/if}
    {/each}
  </nav>

  <!-- Step 1: Stamm -->
  {#if step === 1}
    <div class="step-body">
      <label class="field">
        Name des Laufs
        <input bind:value={runName} placeholder="Systemtest 2026-05-09" autofocus />
      </label>
      <label class="field">
        Marke
        <select bind:value={brand}>
          <option value="mentolder">mentolder</option>
          <option value="korczewski">korczewski</option>
        </select>
      </label>
    </div>

  <!-- Step 2: Nebenziele -->
  {:else if step === 2}
    <div class="step-body">
      <div class="obj-input">
        <input bind:value={newObj} placeholder="Neues Nebenziel …"
          onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && addObjective()} />
        <button onclick={addObjective} disabled={!newObj.trim()}>+</button>
      </div>
      <ol class="obj-list">
        {#each objectives as obj, i}
          <li>
            <span class="obj-text">{obj}</span>
            <div class="obj-actions">
              <button onclick={() => moveObjective(i, -1)} disabled={i === 0}>↑</button>
              <button onclick={() => moveObjective(i, 1)} disabled={i === objectives.length - 1}>↓</button>
              <button class="danger" onclick={() => removeObjective(i)}>✕</button>
            </div>
          </li>
        {/each}
      </ol>
      {#if objectives.length === 0}
        <p class="hint">Mindestens ein Nebenziel erforderlich.</p>
      {/if}
    </div>

  <!-- Step 3: Wissen -->
  {:else if step === 3}
    <div class="step-body">
      {#if loadingCols}
        <p class="hint">Lade Sammlungen …</p>
      {:else}
        <div class="col-list">
          {#each collections as col}
            <label class="col-row">
              <input type="checkbox" checked={selectedIds.has(col.id)}
                onchange={() => {
                  const s = new Set(selectedIds);
                  if (s.has(col.id)) s.delete(col.id); else s.add(col.id);
                  selectedIds = s;
                }} />
              <span class="col-name">{col.name}</span>
              <span class="col-meta">{col.source} · {col.chunk_count} Chunks</span>
            </label>
          {/each}
        </div>
        <button class="ghost" onclick={() => showModal = true}>+ Neue Wissensquelle</button>
        {#if selectedIds.size === 0}
          <p class="hint">Mindestens eine Sammlung auswählen.</p>
        {/if}
      {/if}
    </div>

  <!-- Step 4: Bestätigen -->
  {:else if step === 4}
    <div class="step-body summary">
      <dl>
        <dt>Name</dt><dd>{runName}</dd>
        <dt>Marke</dt><dd>{brand}</dd>
        <dt>Nebenziele</dt>
        <dd>
          <ol class="summary-list">
            {#each objectives as o}<li>{o}</li>{/each}
          </ol>
        </dd>
        <dt>Sammlungen</dt>
        <dd>
          <ul class="summary-list">
            {#each collections.filter(c => selectedIds.has(c.id)) as c}
              <li>{c.name}</li>
            {/each}
          </ul>
        </dd>
      </dl>
      {#if error}<p class="err">{error}</p>{/if}
      {#if copied}<p class="ok">Anweisung kopiert! Weiterleitung …</p>{/if}
      <div class="step4-actions">
        <button class="primary" onclick={startRun} disabled={busy}>
          {busy ? '…' : '▶ Lauf starten · 12 Agenten'}
        </button>
        <button class="ghost" onclick={copyDemo} disabled={busy}>
          {copied ? '✓ Kopiert' : '📋 Demo-Anweisung kopieren'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Navigation -->
  <div class="nav">
    <button class="ghost" onclick={back} disabled={step === 1}>Zurück</button>
    {#if step < 4}
      <button class="primary" onclick={next} disabled={!canNext}>Weiter</button>
    {/if}
  </div>
</div>

<KnowledgeSourceModal bind:open={showModal} onCreated={onCollectionCreated} />

<style>
  .wizard { display: flex; flex-direction: column; gap: 1.25rem; max-width: 600px; }
  .breadcrumb { display: flex; align-items: center; gap: 0.4rem; font-size: 12px; }
  .crumb { color: var(--fg-soft); }
  .crumb.active { color: var(--brass); font-weight: 600; }
  .crumb.done { color: var(--sage); }
  .sep { color: var(--ink-750); }

  .step-body { display: flex; flex-direction: column; gap: 0.75rem; }
  .field { display: flex; flex-direction: column; gap: 0.3rem; font-size: 12px; color: var(--fg-soft); text-transform: uppercase; letter-spacing: 0.04em; }
  input, select { background: var(--ink-900); border: 1px solid var(--ink-750); color: var(--fg); border-radius: 6px; padding: 0.5rem; font-family: inherit; font-size: 13px; }
  input:focus, select:focus { outline: 1px solid var(--brass); }

  .obj-input { display: flex; gap: 0.5rem; }
  .obj-input input { flex: 1; }
  .obj-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
  .obj-list li { display: flex; align-items: center; gap: 0.5rem; background: var(--ink-800); padding: 0.4rem 0.6rem; border-radius: 6px; }
  .obj-text { flex: 1; font-size: 13px; }
  .obj-actions { display: flex; gap: 0.25rem; }

  .col-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 300px; overflow-y: auto; }
  .col-row { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem; background: var(--ink-800); border-radius: 6px; cursor: pointer; }
  .col-name { flex: 1; font-size: 13px; font-weight: 600; }
  .col-meta { font-size: 11px; color: var(--fg-soft); }

  .summary dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; font-size: 13px; }
  .summary dt { color: var(--fg-soft); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; align-self: start; padding-top: 2px; }
  .summary-list { margin: 0; padding-left: 1.2rem; }
  .step4-actions { display: flex; flex-direction: column; gap: 0.5rem; }

  .nav { display: flex; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid var(--ink-750); }

  button { padding: 0.55rem 1rem; border-radius: 6px; font-family: inherit; font-size: 13px; cursor: pointer; border: none; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .primary { background: var(--brass); color: var(--ink-900); font-weight: 600; }
  .ghost { background: transparent; color: var(--fg); border: 1px solid var(--ink-750); }
  .ghost:hover:not(:disabled) { border-color: var(--brass); }
  .danger { background: transparent; color: #c96e6e; border: 1px solid #c96e6e; padding: 0.2rem 0.5rem; }

  .hint { color: var(--fg-soft); font-style: italic; font-size: 12px; margin: 0; }
  .err { color: #c96e6e; font-size: 12px; margin: 0; }
  .ok { color: var(--sage); font-size: 12px; margin: 0; }
</style>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep 'SystemtestWizard' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/admin/SystemtestWizard.svelte
git commit -m "feat(ui): SystemtestWizard.svelte — 4-step run creation wizard"
```

---

## Task 3 — `/admin/systemtests/index.astro` (run list)

**Files:**
- Create: `website/src/pages/admin/systemtests/index.astro`

SSR page. Lists past runs in a table with name, brand, compliance score, start time, status pill, and a link to the run detail.

- [ ] **Step 1: Create the page**

Create `website/src/pages/admin/systemtests/index.astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import { getSession, isAdmin, getLoginUrl } from '../../../lib/auth';
import { listRuns } from '../../../lib/systemtest-runs-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = Astro.url.searchParams.get('brand') ?? undefined;
const runs = await listRuns(brand).catch(() => []);

function scoreLabel(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)} %`;
}
function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
const statusColor: Record<string, string> = {
  pending: '#888', running: 'var(--brass)', completed: 'var(--sage)', failed: '#c96e6e', cancelled: '#888',
};
---
<AdminLayout title="Systemtests — Läufe">
  <header class="page-head">
    <h1>Systemtest-Läufe</h1>
    <a href="/admin/systemtests/new" class="primary-btn">+ Neuer Lauf</a>
  </header>

  {runs.length === 0
    ? <p class="muted">Noch keine Läufe. Klicke "+ Neuer Lauf" um zu starten.</p>
    : (
      <table class="table">
        <thead>
          <tr><th>Name</th><th>Marke</th><th>Score</th><th>Gestartet</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {runs.map(r => (
            <tr>
              <td>{r.name}</td>
              <td>{r.brand}</td>
              <td>{scoreLabel(r.compliance_score)}</td>
              <td>{formatDate(r.started_at)}</td>
              <td><span class="status-pill" style={`color: ${statusColor[r.status] ?? '#888'}`}>{r.status}</span></td>
              <td><a href={`/admin/systemtests/${r.id}`} class="detail-link">Detail →</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  <style>
    .page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .primary-btn { background: var(--brass); color: var(--ink-900); padding: 0.55rem 1rem; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px; }
    .table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .table th, .table td { padding: 0.5rem; border-bottom: 1px solid var(--ink-750); text-align: left; }
    .status-pill { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600; }
    .detail-link { color: var(--brass); text-decoration: none; font-size: 12px; }
    .detail-link:hover { text-decoration: underline; }
    .muted { color: var(--fg-soft); font-style: italic; }
  </style>
</AdminLayout>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep 'admin/systemtests/index' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/systemtests/index.astro
git commit -m "feat(ui): /admin/systemtests index page (run list)"
```

---

## Task 4 — `/admin/systemtests/new.astro` (wizard page)

**Files:**
- Create: `website/src/pages/admin/systemtests/new.astro`

Thin shell that mounts `SystemtestWizard` with the current brand from env.

- [ ] **Step 1: Create the page**

Create `website/src/pages/admin/systemtests/new.astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import SystemtestWizard from '../../../components/admin/SystemtestWizard.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../../lib/auth';
import { config } from '../../../config/index.js';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const brand = config.brand ?? 'mentolder';
const domain = process.env.PROD_DOMAIN ?? '';
---
<AdminLayout title="Neuer Systemtest-Lauf">
  <header style="margin-bottom: 1.5rem">
    <a href="/admin/systemtests" style="font-size: 12px; color: var(--fg-soft); text-decoration: none">← Zurück zu Läufen</a>
    <h1 style="margin-top: 0.5rem">Neuer Systemtest-Lauf</h1>
  </header>

  <SystemtestWizard client:load {brand} {domain} />
</AdminLayout>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep 'admin/systemtests/new' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/systemtests/new.astro
git commit -m "feat(ui): /admin/systemtests/new page (mounts wizard)"
```

---

## Task 5 — `/admin/systemtests/[id].astro` (parent-run detail page)

**Files:**
- Create: `website/src/pages/admin/systemtests/[id].astro`

SSR initial render + client-side SSE for live updates. Shows: compliance score, drift summary, objective chips, 12 `RunCard` components in a 2-column grid.

The page SSR-renders the current state, then subscribes to `/api/admin/systemtests/runs/[id]/events`. On each event it updates the walk cards in-place. Falls back to 2-second polling if `EventSource` fails.

- [ ] **Step 1: Create the page**

Create `website/src/pages/admin/systemtests/[id].astro`:

```astro
---
import AdminLayout from '../../../layouts/AdminLayout.astro';
import RunCard from '../../../components/admin/RunCard.svelte';
import { getSession, isAdmin, getLoginUrl } from '../../../lib/auth';
import { getRun } from '../../../lib/systemtest-runs-db';
import { listQTemplates } from '../../../lib/questionnaire-db';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');

const { id } = Astro.params;
const run = await getRun(id!).catch(() => null);
if (!run) return new Response('Nicht gefunden', { status: 404 });

const allTemplates = await listQTemplates().catch(() => []);
const systemTemplates = allTemplates
  .filter(t => t.is_system_test && t.status === 'published')
  .sort((a, b) => a.title.localeCompare(b.title));

function templateTitle(walkNumber: number): string {
  return systemTemplates[walkNumber - 1]?.title ?? `System-Test ${walkNumber}`;
}

const domain = process.env.PROD_DOMAIN ?? '';

function scoreLabel(score: number | null): string {
  if (score === null) return '—';
  return `${Math.round(score * 100)} %`;
}

const statusColor: Record<string, string> = {
  pending: '#888', running: 'var(--brass)', completed: 'var(--sage)', failed: '#c96e6e', cancelled: '#888',
};
---
<AdminLayout title={run.name}>
  <header class="run-header">
    <div class="run-meta">
      <a href="/admin/systemtests" class="back">← Alle Läufe</a>
      <h1>{run.name}</h1>
      <p class="meta-line">
        {run.brand} · {run.walks.length} Walks ·
        {run.started_at ? new Date(run.started_at).toLocaleString('de-DE') : 'nicht gestartet'}
        {run.finished_at ? ` → ${new Date(run.finished_at).toLocaleString('de-DE')}` : ''}
      </p>
    </div>
    <div class="run-score" id="run-score">
      <span class="score-num">{scoreLabel(run.compliance_score)}</span>
      <span class="status-pill" style={`color: ${statusColor[run.status] ?? '#888'}`} id="run-status">{run.status}</span>
    </div>
  </header>

  {run.drift_summary && (
    <div class="drift-card" id="drift-card">
      <p class="drift-label">Drift-Zusammenfassung (LLM-generiert)</p>
      <p id="drift-text">{run.drift_summary}</p>
    </div>
  )}

  {!run.drift_summary && <div class="drift-card drift-empty" id="drift-card" style="display:none"><p class="drift-label">Drift-Zusammenfassung</p><p id="drift-text"></p></div>}

  <div class="chips" id="objectives-chips">
    {(run.side_objectives as string[]).map(o => <span class="chip">{o}</span>)}
  </div>

  <div class="cards-grid" id="cards-grid">
    {run.walks.map(w => (
      <RunCard
        walk={w}
        templateTitle={templateTitle(w.template_number)}
        brand={run.brand}
        domain={domain}
      />
    ))}
  </div>

  <script define:vars={{ runId: run.id }}>
    // SSE subscription for live updates
    let es;
    function subscribe() {
      try {
        es = new EventSource(`/api/admin/systemtests/runs/${runId}/events`);
        es.onmessage = (e) => {
          const payload = JSON.parse(e.data);
          if (payload.done) { es.close(); return; }
          if (payload.run) location.reload(); // Simple: reload on any change
        };
        es.onerror = () => { es.close(); fallbackPoll(); };
      } catch {
        fallbackPoll();
      }
    }
    function fallbackPoll() {
      setTimeout(() => location.reload(), 2000);
    }
    const status = document.getElementById('run-status')?.textContent ?? '';
    if (!['completed', 'failed', 'cancelled'].includes(status)) {
      subscribe();
    }
  </script>

  <style>
    .run-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; }
    .run-meta .back { font-size: 12px; color: var(--fg-soft); text-decoration: none; }
    .run-meta h1 { margin: 0.25rem 0; }
    .meta-line { font-size: 12px; color: var(--fg-soft); margin: 0; }
    .run-score { text-align: right; }
    .score-num { font-size: 36px; font-weight: 700; color: var(--brass); display: block; line-height: 1; }
    .status-pill { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }

    .drift-card { border: 1px solid var(--brass); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
    .drift-empty { border-color: var(--ink-750); }
    .drift-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--fg-soft); margin: 0 0 0.5rem 0; }
    .drift-card p:last-child { font-size: 14px; margin: 0; line-height: 1.5; }

    .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1.5rem; }
    .chip { background: var(--ink-800); border: 1px solid var(--ink-750); border-radius: 100px; padding: 0.25rem 0.65rem; font-size: 11px; color: var(--fg-soft); }

    .cards-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    @media (max-width: 700px) { .cards-grid { grid-template-columns: 1fr; } }
  </style>
</AdminLayout>
```

- [ ] **Step 2: Type-check**

```bash
cd /home/patrick/Bachelorprojekt/website
bunx astro check 2>&1 | grep 'admin/systemtests/\[id\]' || echo 'no errors'
```

Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/systemtests/[id].astro
git commit -m "feat(ui): /admin/systemtests/[id] parent-run detail page with SSE"
```

---

## Task 6 — Playwright E2E test

**Files:**
- Create: `tests/e2e/specs/systemtest-run.spec.ts`

Skipped when `E2E_ADMIN_PASS` is unset (CI default). On demand, walks through the wizard, creates a run, and verifies the run page renders 12 cards.

- [ ] **Step 1: Create the spec**

Create `tests/e2e/specs/systemtest-run.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const BASE        = process.env.WEBSITE_URL    ?? 'https://web.mentolder.de';
const ADMIN_USER  = process.env.E2E_ADMIN_USER ?? 'patrick';
const ADMIN_PASS  = process.env.E2E_ADMIN_PASS;

test.describe('Systemtest wizard + run page', () => {
  test.beforeEach(({}, info) => {
    if (!ADMIN_PASS) info.skip(true, 'E2E_ADMIN_PASS not set');
  });
  test.setTimeout(300_000); // 5 min — 12 assignment creates can be slow

  test('create run via wizard → run page shows 12 cards', async ({ page }) => {
    // Log in
    await page.goto(`${BASE}/api/auth/login?returnTo=/admin/systemtests/new`);
    await page.waitForURL(/realms\/workspace/);
    await page.locator('#username, input[name="username"]').first().fill(ADMIN_USER);
    await page.locator('#password, input[name="password"]').first().fill(ADMIN_PASS!);
    await page.locator('#kc-login, input[type="submit"]').first().click();
    await page.waitForURL(/admin\/systemtests\/new/, { timeout: 60_000 });

    // Step 1: Name
    const stamp = `E2E-Test ${Date.now()}`;
    await page.getByPlaceholder('Systemtest 2026-05-09').fill(stamp);
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Step 2: Objectives
    await page.getByPlaceholder('Neues Nebenziel').fill('E2E-Testziel');
    await page.getByRole('button', { name: '+' }).click();
    await expect(page.getByText('E2E-Testziel')).toBeVisible();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Step 3: Collections — pick the first available
    await page.waitForSelector('.col-row', { timeout: 15_000 });
    await page.locator('.col-row input[type="checkbox"]').first().check();
    await page.getByRole('button', { name: 'Weiter' }).click();

    // Step 4: Confirm — click "Demo-Anweisung kopieren"
    await expect(page.getByText(stamp)).toBeVisible();
    await page.getByRole('button', { name: /Demo-Anweisung kopieren/ }).click();

    // Should navigate to run page after copy
    await page.waitForURL(/admin\/systemtests\/[a-f0-9-]{36}/, { timeout: 60_000 });

    // Run page: expect 12 cards (ST-1 through ST-12)
    for (let i = 1; i <= 12; i++) {
      await expect(page.getByText(`ST-${i}`)).toBeVisible({ timeout: 30_000 });
    }
  });
});
```

- [ ] **Step 2: Syntax check**

```bash
cd /home/patrick/Bachelorprojekt
bunx tsc --noEmit tests/e2e/specs/systemtest-run.spec.ts 2>&1 | head -10 || true
```

Expected: zero errors (or only "is not under rootDir" tsconfig warnings — not real errors).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/specs/systemtest-run.spec.ts
git commit -m "test(e2e): systemtest wizard + run page E2E test"
```

---

## Task 7 — Deploy + open PR

- [ ] **Step 1: Deploy website to mentolder**

```bash
task website:deploy ENV=mentolder
```

- [ ] **Step 2: Smoke-test in browser**

Open `https://web.mentolder.de/admin/systemtests` and verify:
- Page loads (empty list is fine)
- "+ Neuer Lauf" link leads to the wizard
- Wizard step 1 renders

- [ ] **Step 3: Deploy website to korczewski**

```bash
task website:deploy ENV=korczewski
```

- [ ] **Step 4: Push branch + open PR**

```bash
git push -u origin feature/systemtest-run-ui
gh pr create --title "feat(ui): systemtest wizard + run pages (Plan C)" --body "$(cat <<'EOF'
## Summary
- `RunCard.svelte` — per-walk status card (accent color encodes status)
- `SystemtestWizard.svelte` — 4-step wizard: Stamm → Nebenziele → Wissen → Bestätigen
- Step 3 re-uses `KnowledgeSourceModal` from Plan A for inline collection creation
- Step 4: "▶ Lauf starten" → POST + redirect to run page; "📋 Demo-Anweisung kopieren" → POST + copy CC prompt → redirect
- `/admin/systemtests` — run list (SSR)
- `/admin/systemtests/new` — wizard page
- `/admin/systemtests/[id]` — parent-run detail with SSE live updates + 12-card grid
- `tests/e2e/specs/systemtest-run.spec.ts` — skipped unless E2E_ADMIN_PASS set
- Plan C of 3 — completes the LLM run feature (demo path: Playwright MCP)

## Test plan
- [x] astro check: no errors on new pages + components
- [x] Website deployed to mentolder + korczewski
- [x] Manual: /admin/systemtests loads; wizard step 1 renders
- [ ] E2E: systemtest-run.spec.ts run on demand with E2E_ADMIN_PASS set

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

User merges (auto-merge convention).

---

## Done with Plan C

After merge, the full system-test LLM run feature ships:
- Plan A: knowledge corpus (pgvector, ingestion, /admin/wissensquellen)
- Plan B: run model + API (schema, helpers, REST endpoints)
- Plan C: wizard UI + run detail page

The admin can create a run, copy the Demo-Anweisung, paste it into Claude Code, and have Playwright MCP drive all 12 system tests while the run page shows live status updates.
