---
title: Content-Hub UX Overhaul Implementation Plan
ticket_id: T000569
domains: [website, db]
status: active
pr_number: null
---

# Content-Hub UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four concrete problems in `/admin/inhalte`: replace the unusable horizontal section tabs with a proper sidebar, extract a reusable split-view HTML editor, seed a newsletter example draft on first open, and add `ensureTables()` to `documents-db.ts` so the Verträge tab never 500-errors on fresh environments.

**Architecture:** A new `HtmlEditor.svelte` component encapsulates the textarea+iframe split-view pattern currently duplicated in both `NewsletterAdmin.svelte` and `VertragsvorlagenSection.svelte`. `InhalteEditor.svelte` gets a true left-sidebar layout for the Website tab. The `documents-db.ts` module gains lazy table creation identical to the `newsletter-db.ts` pattern. Newsletter seeding is purely client-side (one-time flag per mount).

**Tech Stack:** Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`), TypeScript, PostgreSQL via `pg` pool, Astro SSR endpoints, Tailwind CSS utility classes matching existing dark-theme.

---

## File Map

| File | Status | Change |
|------|--------|--------|
| `website/src/components/admin/HtmlEditor.svelte` | **CREATE** | New reusable split-view HTML editor component |
| `website/src/components/admin/InhalteEditor.svelte` | **MODIFY** | Replace horizontal section tab row with left-sidebar layout |
| `website/src/components/admin/NewsletterAdmin.svelte` | **MODIFY** | Use `HtmlEditor`, add example-draft seeding on campaigns tab |
| `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte` | **MODIFY** | Use `HtmlEditor` in compose form |
| `website/src/lib/documents-db.ts` | **MODIFY** | Add `ensureTables()` + call it before every exported function |

---

## Task 1: Add `ensureTables()` to `documents-db.ts`

**Files:**
- Modify: `website/src/lib/documents-db.ts`

This is the highest-priority fix — without it every Verträge API call throws a 500 on any fresh environment.

- [ ] **Step 1: Read the current file to know exact insertion point**

The file already has a `pool` declaration on line 15. We insert the lazy-init block immediately after it, before the `getPool` export.

- [ ] **Step 2: Add the `tablesReady` flag and `ensureTables()` function**

In `website/src/lib/documents-db.ts`, after line 17 (`const pool = new pg.Pool(...)`), insert:

```typescript
let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      html_body TEXT NOT NULL,
      docuseal_template_id INTEGER,
      stand_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS document_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL,
      template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      signature_data JSONB,
      signed_html TEXT,
      signed_pdf BYTEA,
      expires_at TIMESTAMPTZ,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      signed_at TIMESTAMPTZ
    )
  `);
  tablesReady = true;
}
```

- [ ] **Step 3: Add `await ensureTables()` to every exported function that touches the DB**

The functions that need it are: `listDocumentTemplates`, `getDocumentTemplate`, `createDocumentTemplate`, `updateDocumentTemplate`, `deleteDocumentTemplate`, `createDocumentAssignment`, `listAssignmentsForCustomer`, `countPendingAssignmentsForCustomer`, `markAssignmentSigned`, `getAssignmentPdf`, `revokeAssignment`, `extendAssignmentDeadline`, `getDocumentAssignmentById`.

For each one, add `await ensureTables();` as the **first line of the function body**, before any `pool.query(...)` call. Example for `listDocumentTemplates`:

```typescript
export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
  await ensureTables();
  const r = await pool.query(
    `SELECT id, title, html_body, stand_date, created_at, updated_at
     FROM document_templates ORDER BY created_at DESC`,
  );
  return r.rows;
}
```

The `getPool()` function does NOT need `ensureTables()` — it just returns the pool reference.

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors from `documents-db.ts`.

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-content-hub-ux
git add website/src/lib/documents-db.ts
git commit -m "fix(documents-db): add ensureTables() so document_templates auto-creates on fresh envs"
```

---

## Task 2: Create `HtmlEditor.svelte` — Split-View HTML Editor Component

**Files:**
- Create: `website/src/components/admin/HtmlEditor.svelte`

This component replaces the duplicated textarea+iframe blocks in both `NewsletterAdmin.svelte` (server-preview mode) and `VertragsvorlagenSection.svelte` (direct srcdoc mode).

- [ ] **Step 1: Understand the two preview modes from existing code**

- `previewMode='direct'`: iframe uses `srcdoc={value}` — instant, no server round-trip. Used in Verträge.
- `previewMode='server'`: component calls `previewUrl` with a POST body built by `previewBody()`, stores the response text, feeds it to `srcdoc`. Used in Newsletter (URL: `/api/admin/newsletter/preview`, body: `{subject, html_body}`).

The debounce is 250ms in both cases (already used in `NewsletterAdmin.svelte`).

- [ ] **Step 2: Create the component file**

Create `/tmp/wt-content-hub-ux/website/src/components/admin/HtmlEditor.svelte` with this content:

```svelte
<script lang="ts">
  type ViewMode = 'editor' | 'split' | 'preview';

  let {
    value = $bindable(''),
    previewMode = 'direct' as 'direct' | 'server',
    previewUrl = '',
    previewBody = (() => ({})) as () => object,
    placeholder = '<p>HTML hier eingeben…</p>',
    rows = 20,
    label = 'HTML-Inhalt',
  }: {
    value?: string;
    previewMode?: 'direct' | 'server';
    previewUrl?: string;
    previewBody?: () => object;
    placeholder?: string;
    rows?: number;
    label?: string;
  } = $props();

  let viewMode = $state<ViewMode>('split');
  let serverPreviewHtml = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // For direct mode: srcdoc is always the live value.
  // For server mode: srcdoc is the last server response (serverPreviewHtml).
  const iframeSrcdoc = $derived(
    previewMode === 'direct'
      ? (value || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>')
      : (serverPreviewHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>')
  );

  async function fetchServerPreview() {
    if (previewMode !== 'server' || !previewUrl) return;
    try {
      const res = await fetch(previewUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(previewBody()),
      });
      serverPreviewHtml = res.ok
        ? await res.text()
        : '<p style="color:#a33;font-family:sans-serif;padding:20px;">Vorschau konnte nicht geladen werden.</p>';
    } catch {
      serverPreviewHtml = '<p style="color:#a33;font-family:sans-serif;padding:20px;">Vorschau-Fehler (Verbindung).</p>';
    }
  }

  $effect(() => {
    // Register value as dependency (synchronous read).
    void value;
    if (previewMode !== 'server') return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchServerPreview, 250);
  });

  const btnCls = (active: boolean) =>
    `px-2.5 py-1 text-xs rounded transition-colors ${active ? 'bg-gold text-dark font-semibold' : 'bg-dark-lighter text-muted hover:text-light'}`;
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <label class="block text-sm text-muted">{label}</label>
    <div class="flex gap-1">
      <button type="button" onclick={() => viewMode = 'editor'} class={btnCls(viewMode === 'editor')}>✏️ Editor</button>
      <button type="button" onclick={() => viewMode = 'split'} class={btnCls(viewMode === 'split')}>⬜ Split</button>
      <button type="button" onclick={() => viewMode = 'preview'} class={btnCls(viewMode === 'preview')}>👁 Vorschau</button>
    </div>
  </div>

  <div class={`flex gap-3 ${viewMode === 'split' ? 'flex-row' : 'flex-col'}`} style="min-height: {rows * 24}px">
    {#if viewMode !== 'preview'}
      <textarea
        bind:value
        {placeholder}
        {rows}
        class={`bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}
      ></textarea>
    {/if}

    {#if viewMode !== 'editor'}
      <iframe
        srcdoc={iframeSrcdoc}
        title="HTML Vorschau"
        class={`rounded-xl border border-dark-lighter bg-white block ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}
        style="height: {rows * 24}px"
      ></iframe>
    {/if}
  </div>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-content-hub-ux
git add website/src/components/admin/HtmlEditor.svelte
git commit -m "feat(admin): add HtmlEditor.svelte — reusable split-view HTML editor with editor/split/preview modes"
```

---

## Task 3: Wire `HtmlEditor` into `VertragsvorlagenSection.svelte`

**Files:**
- Modify: `website/src/components/admin/inhalte/VertragsvorlagenSection.svelte`

Replace the raw `<textarea>` + `<iframe srcdoc>` block in the compose form with `<HtmlEditor>`.

- [ ] **Step 1: Add import at top of `<script>`**

In `VertragsvorlagenSection.svelte`, add to the imports (after the opening `<script lang="ts">`):

```typescript
import HtmlEditor from '../HtmlEditor.svelte';
```

- [ ] **Step 2: Remove the inline textarea + iframe block from the compose form**

In the template, find the block between the comment `<!-- HTML editor — DIN-A4 width (794 px) -->` and the closing `</div>` of `overflow-x-auto`. This spans roughly lines 229–263 in the current file. Replace the entire `<div class="overflow-x-auto">` block (the one containing the textarea and the placeholder hint paragraph) with:

```svelte
<HtmlEditor
  bind:value={composeHtml}
  previewMode="direct"
  label="HTML-Inhalt *"
  placeholder="<h1>Vertrag</h1><p>Inhalt hier…</p>"
  rows={18}
/>
<p class="text-xs text-muted mt-1">
  Feste Platzhalter (direkt ins PDF eingebettet):
  <span class="font-mono text-gold/80">&#123;&#123;KUNDENNUMMER&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;DATUM&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;JAHR&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;Stand&#125;&#125;</span>
  — Editierbare Felder:
  <span class="font-mono text-gold/80">&#123;&#123;KUNDENNAME&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;EMAIL&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;TELEFON&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;FIRMA&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;VORNAME&#125;&#125;</span>
  <span class="font-mono text-gold/80">&#123;&#123;NACHNAME&#125;&#125;</span>
</p>
```

Also remove the old standalone `<div class="overflow-x-auto">` wrapper that contained the preview `<iframe>` (the second `overflow-x-auto` div, the one with the "Vorschau (DIN A4)" paragraph and the 794×1123 iframe). `HtmlEditor` now owns the preview.

Remove the `previewHtml` state variable and the debounce logic from `<script>` if they exist in `VertragsvorlagenSection.svelte` (they don't — the preview there was always direct `srcdoc={composeHtml}`). No dead code to remove in script.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /tmp/wt-content-hub-ux
git add website/src/components/admin/inhalte/VertragsvorlagenSection.svelte
git commit -m "refactor(vertraege): replace inline textarea+iframe with HtmlEditor component"
```

---

## Task 4: Wire `HtmlEditor` into `NewsletterAdmin.svelte` + Add Example-Draft Seeding

**Files:**
- Modify: `website/src/components/admin/NewsletterAdmin.svelte`

Two changes here: (a) extract the compose textarea+iframe into `HtmlEditor`, (b) auto-seed an example draft when campaigns list is empty.

### 4a — Replace inline compose editor with `HtmlEditor`

- [ ] **Step 1: Add import**

In `<script lang="ts">`, add:

```typescript
import HtmlEditor from './HtmlEditor.svelte';
```

- [ ] **Step 2: Remove dead state and effect for the server preview**

The following `<script>` declarations become redundant once `HtmlEditor` manages its own preview:

```typescript
// REMOVE these lines:
let previewHtml = $state('');
let previewDebounce: ReturnType<typeof setTimeout> | null = null;

async function refreshPreview() { ... }   // entire function

$effect(() => {
  if (activeTab !== 'compose') return;
  void composeSubject;
  void composeHtml;
  if (previewDebounce) clearTimeout(previewDebounce);
  previewDebounce = setTimeout(refreshPreview, 250);
});
```

- [ ] **Step 3: Replace the textarea + preview blocks in the compose template**

In the `{:else if activeTab === 'compose'}` section, find:

```svelte
<!-- HTML editor — DIN-A4 width (794 px) -->
<div class="overflow-x-auto">
  <div>
    <label class="block text-sm text-muted mb-1">HTML-Inhalt *</label>
    <textarea
      bind:value={composeHtml}
      ...
    ></textarea>
    {#if nextAusgabe}
      <p ...>Platzhalter: ...</p>
    {/if}
  </div>
</div>
```

And separately the preview block:

```svelte
<!-- Preview — full DIN-A4 page (794 × 1123 px). Server-rendered with ... -->
<div class="overflow-x-auto">
  <div>
    <p class="text-sm text-muted mb-1">Vorschau (1:1 wie versendet)</p>
    <iframe srcdoc={previewHtml || ...} ... ></iframe>
  </div>
</div>
```

Replace BOTH blocks with a single `HtmlEditor` usage:

```svelte
<HtmlEditor
  bind:value={composeHtml}
  previewMode="server"
  previewUrl="/api/admin/newsletter/preview"
  previewBody={() => ({ subject: composeSubject, html_body: composeHtml })}
  label="HTML-Inhalt *"
  placeholder="<h1>Hallo!</h1><p>Dein Newsletter-Inhalt hier.</p>"
  rows={20}
/>
{#if nextAusgabe}
  <p class="text-xs text-muted mt-1">
    Platzhalter: <span class="font-mono text-gold/80">&#123;&#123;AUSGABE&#125;&#125;</span>
    wird beim Versenden durch <span class="font-mono text-gold font-semibold">{nextAusgabe}</span> ersetzt.
  </p>
{/if}
```

### 4b — Auto-seed example draft when campaigns list is empty

- [ ] **Step 4: Add seeding state and constant**

In `<script lang="ts">`, after the campaigns state block, add:

```typescript
let hasSeededExample = $state(false);

const EXAMPLE_SUBJECT = 'mentolder Newsletter #01 — Führung & digitaler Wandel';
const EXAMPLE_HTML = `<div style="font-family: Georgia, serif; max-width: 600px; margin: 0 auto; color: #1a1a1a;">
  <h1 style="font-size: 1.8rem; color: #c9a84c; border-bottom: 2px solid #c9a84c; padding-bottom: 0.5rem;">
    mentolder Newsletter #{{AUSGABE}}
  </h1>
  <p style="font-size: 1.05rem; margin-top: 1.5rem;">
    Liebe Leserin, lieber Leser,
  </p>
  <p>
    willkommen zur ersten Ausgabe des mentolder Newsletters — für Führungskräfte, die den digitalen Wandel
    nicht nur managen, sondern gestalten wollen.
  </p>

  <h2 style="color: #c9a84c; margin-top: 2rem;">Führung in Zeiten des Wandels</h2>
  <p>
    Die Digitalisierung verändert nicht nur Prozesse — sie verändert, was Führung bedeutet.
    Teams arbeiten dezentral, Entscheidungen müssen schneller getroffen werden, und gleichzeitig
    steigen die Erwartungen an Transparenz und Vertrauen. Was bleibt, ist die Kernkompetenz
    jeder Führungspersönlichkeit: Orientierung geben, auch wenn der Weg noch nicht vollständig klar ist.
  </p>

  <h2 style="color: #c9a84c; margin-top: 2rem;">KI-Transition: Angst oder Aufbruch?</h2>
  <p>
    Viele meiner Klientinnen und Klienten begegnen KI-Tools zunächst mit Skepsis. Verständlich —
    denn es geht um mehr als neue Software. Es geht um die eigene Rolle, um Relevanz, um Kontrolle.
    In meinen Coaching-Sessions erlebe ich immer wieder: Wer KI als Werkzeug begreift und nicht als
    Bedrohung, gewinnt enormen Handlungsspielraum.
  </p>

  <div style="margin-top: 2rem; text-align: center;">
    <a href="https://mentolder.de/kontakt"
       style="display: inline-block; background: #c9a84c; color: white; padding: 12px 28px;
              text-decoration: none; border-radius: 6px; font-weight: bold;">
      Erstgespräch vereinbaren
    </a>
  </div>

  <p style="margin-top: 2.5rem; color: #555;">
    Mit herzlichen Grüßen,<br/>
    <strong>Ihr mentolder-Team</strong>
  </p>
</div>`;
```

- [ ] **Step 5: Add seeding call inside `loadCampaigns()`**

In `loadCampaigns()`, after `campaigns = res.ok ? await res.json() : [];`, add:

```typescript
// Auto-seed example draft on first empty load
if (campaigns.length === 0 && !hasSeededExample) {
  hasSeededExample = true;
  try {
    const seedRes = await fetch('/api/admin/newsletter/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: EXAMPLE_SUBJECT, html_body: EXAMPLE_HTML }),
    });
    if (seedRes.ok) {
      const seeded = await seedRes.json() as Campaign;
      campaigns = [seeded];
    }
  } catch { /* non-fatal, ignore */ }
}
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-content-hub-ux
git add website/src/components/admin/NewsletterAdmin.svelte
git commit -m "feat(newsletter): use HtmlEditor component + auto-seed example draft on empty campaigns"
```

---

## Task 5: Rebuild Website-Tab Layout in `InhalteEditor.svelte` — Left Sidebar

**Files:**
- Modify: `website/src/components/admin/InhalteEditor.svelte`

The goal is to replace the horizontal secondary tab row with a proper left sidebar. The state (`sectionSearch`, `filteredSections`, `activeSection`, `showNewDialog`, etc.) already exists and is correct — only the template needs restructuring.

- [ ] **Step 1: Understand the current layout**

Current structure in the template when `activeTab === 'website'`:
1. A search bar row (`<div class="flex items-center gap-2 px-2 py-1.5 ...">`)
2. A horizontal tab row (`<div class="flex items-center gap-0 border-b ...">`)
3. The section content (`<div class="max-w-4xl px-8">` with the big `{#if}` block)

Target structure: a flex row containing a fixed-width sidebar (left) and the section content (right), all within the `{#if activeTab === 'website'}` block.

- [ ] **Step 2: Replace the Website-tab layout**

In `InhalteEditor.svelte`, replace the entire `{#if activeTab === 'website'}` template block (the search bar div, the horizontal tab row div, and the content div that follows) with:

```svelte
{#if activeTab === 'website'}
  <div class="flex" style="min-height: 600px">
    <!-- Left sidebar -->
    <div class="flex-shrink-0 border-r border-dark-lighter flex flex-col" style="width: 180px">
      <!-- Search -->
      <div class="p-2 border-b border-dark-lighter/60">
        <input
          type="search"
          bind:value={sectionSearch}
          onkeydown={onSectionSearchKeydown}
          placeholder="Suchen…"
          class="w-full px-2 py-1 text-xs rounded bg-dark border border-dark-lighter text-light placeholder:text-muted focus:outline-none focus:border-gold/60"
        />
      </div>
      <!-- Navigation groups -->
      <div class="flex-1 overflow-y-auto py-1">
        <!-- SEO & Struktur -->
        <p class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted/60">SEO & Struktur</p>
        {#each filteredSections.staticEntries.filter(([s]) => ['seo','stammdaten','navigation','footer'].includes(s)) as [sec, label]}
          <button
            onclick={() => activeSection = sec}
            class={`w-full text-left px-3 py-1.5 text-xs border-l-2 transition-colors ${activeSection === sec ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-muted hover:text-light hover:bg-dark/30'}`}
          >{label}</button>
        {/each}

        <!-- Hauptseiten -->
        <p class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted/60">Hauptseiten</p>
        {#each filteredSections.staticEntries.filter(([s]) => ['startseite','uebermich','angebote','faq','kontakt','referenzen'].includes(s)) as [sec, label]}
          <button
            onclick={() => activeSection = sec}
            class={`w-full text-left px-3 py-1.5 text-xs border-l-2 transition-colors ${activeSection === sec ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-muted hover:text-light hover:bg-dark/30'}`}
          >{label}</button>
        {/each}

        <!-- Services -->
        <p class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted/60">Services</p>
        {#each filteredSections.staticEntries.filter(([s]) => ['coaching','fuehrung-persoenlichkeit','50plus-digital','ki-transition','beratung'].includes(s)) as [sec, label]}
          <button
            onclick={() => activeSection = sec}
            class={`w-full text-left px-3 py-1.5 text-xs border-l-2 transition-colors ${activeSection === sec ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-muted hover:text-light hover:bg-dark/30'}`}
          >{label}</button>
        {/each}

        <!-- Rechtliches -->
        <p class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted/60">Rechtliches</p>
        {#each filteredSections.staticEntries.filter(([s]) => ['rechtliches'].includes(s)) as [sec, label]}
          <button
            onclick={() => activeSection = sec}
            class={`w-full text-left px-3 py-1.5 text-xs border-l-2 transition-colors ${activeSection === sec ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-muted hover:text-light hover:bg-dark/30'}`}
          >{label}</button>
        {/each}

        <!-- Kore-Flags (korczewski only) -->
        {#each filteredSections.staticEntries.filter(([s]) => ['kore-flags'].includes(s)) as [sec, label]}
          <button
            onclick={() => activeSection = sec}
            class={`w-full text-left px-3 py-1.5 text-xs border-l-2 transition-colors ${activeSection === sec ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-muted hover:text-light hover:bg-dark/30'}`}
          >{label}</button>
        {/each}

        <!-- Custom sections -->
        {#if filteredSections.customEntries.length > 0 || !sectionSearch}
          <p class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-widest text-muted/60">Custom ★</p>
          {#each filteredSections.customEntries as cs}
            <button
              onclick={() => activeSection = cs.slug}
              class={`w-full text-left px-3 py-1.5 text-xs border-l-2 transition-colors ${activeSection === cs.slug ? 'border-gold text-gold bg-gold/5' : 'border-transparent text-muted hover:text-light hover:bg-dark/30'}`}
            >{cs.title} ★</button>
          {/each}
        {/if}
      </div>
      <!-- New section button -->
      <div class="p-2 border-t border-dark-lighter/60">
        <button
          onclick={() => showNewDialog = true}
          class="w-full px-2 py-1.5 text-xs bg-gold text-dark font-semibold rounded-md hover:bg-gold/80 transition-colors"
        >+ Abschnitt</button>
      </div>
    </div>

    <!-- Right content area -->
    <div class="flex-1 min-w-0 px-6 py-4 overflow-y-auto">
      {#if activeSection === 'seo'}<SeoEditor />
      {:else if activeSection === 'startseite'}<StartseiteSection initialData={initialData.startseite} />
      {:else if activeSection === 'uebermich'}<UebermichSection initialData={initialData.uebermich} />
      {:else if activeSection === 'coaching'}<SchemaEditor schema={schemaFor('service:coaching')!} initialValue={initialData.coaching?.value ?? null} initialVersion={initialData.coaching?.version ?? 0} />
      {:else if activeSection === 'fuehrung-persoenlichkeit'}<SchemaEditor schema={schemaFor('service:fuehrung-persoenlichkeit')!} initialValue={initialData.fuehrung?.value ?? null} initialVersion={initialData.fuehrung?.version ?? 0} />
      {:else if activeSection === '50plus-digital'}
        <ServicePageSection initialData={initialData['50plus-digital']} slug="50plus-digital" pageLabel="50+ digital" />
      {:else if activeSection === 'ki-transition'}
        <ServicePageSection initialData={initialData['ki-transition']} slug="ki-transition" pageLabel="KI-Transition Coaching" />
      {:else if activeSection === 'beratung'}
        <ServicePageSection initialData={initialData.beratung} slug="beratung" pageLabel="Unternehmensberatung" />
      {:else if activeSection === 'angebote'}
        <AngeboteSection initialServices={initialData.services} initialLeistungen={initialData.leistungen} initialPriceListUrl={initialData.priceListUrl} staticSlugs={staticServiceSlugs} />
      {:else if activeSection === 'faq'}<FaqSection initialData={initialData.faq} />
      {:else if activeSection === 'kontakt'}<KontaktSection initialData={initialData.kontakt} />
      {:else if activeSection === 'referenzen'}<ReferenzenSection initialData={initialData.referenzen} />
      {:else if activeSection === 'rechtliches'}
        <RechtlichesSection initialData={initialData.rechtliches} rechtlichesHasCustom={initialData.rechtlichesHasCustom} />
      {:else if activeSection === 'stammdaten'}<StammdatenSection initialData={initialData.stammdaten} />
      {:else if activeSection === 'navigation'}<NavigationSection initialData={initialData.navigation} />
      {:else if activeSection === 'footer'}<FooterSection initialData={initialData.footer} />
      {:else if activeSection === 'kore-flags' && brand === 'korczewski'}<KoreFlagsSection initialData={initialData.koreFlags} />
      {:else}
        {@const cs = customSections.find(s => s.slug === activeSection)}
        {#if cs}<CustomSection section={cs} onDeleted={() => onCustomDeleted(cs.slug)} />{/if}
      {/if}
    </div>
  </div>
```

- [ ] **Step 3: Remove now-dead `secBtnCls` helper from `<script>`**

The `secBtnCls` function (used only by the old horizontal tab row) can be removed:

```typescript
// REMOVE this line:
const secBtnCls = (a: boolean) => `px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${a ? 'border-green-500 text-green-400' : 'border-transparent text-muted hover:text-light'}`;
```

- [ ] **Step 4: Also remove the outer `<div class="max-w-4xl px-8">` wrapper**

The old content area was wrapped in `<div class="max-w-4xl px-8">` which constrained all tabs. Now that Website has its own layout, move the other tabs outside a shared wrapper. The template structure should be:

```svelte
<div>
  <!-- Primary tab bar (unchanged) -->
  <div class="flex gap-0 border-b border-dark-lighter overflow-x-auto flex-shrink-0">
    ...buttons...
  </div>

  {#if activeTab === 'website'}
    <div class="flex" ...>
      ...sidebar + content as above...
    </div>
  {:else if activeTab === 'newsletter'}
    <div class="max-w-4xl px-8 pt-6 pb-20"><NewsletterAdmin /></div>
  {:else if activeTab === 'fragebogen'}
    <div class="max-w-4xl px-8 pt-6 pb-20">
      <QuestionnaireTemplateEditor />
      ...
    </div>
  {:else if activeTab === 'vertraege'}
    <div class="max-w-4xl px-8 pt-6 pb-20"><VertragsvorlagenSection /></div>
  {:else if activeTab === 'rechnungen'}
    <div class="max-w-4xl px-8 pt-6 pb-20"><RechnungsvorlagenSection initialData={rechnungsvorlagen} /></div>
  {/if}
</div>
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 6: Run CI-equivalent checks**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm run build 2>&1 | tail -20
```

Expected: build succeeds, no Svelte component errors.

- [ ] **Step 7: Commit**

```bash
cd /tmp/wt-content-hub-ux
git add website/src/components/admin/InhalteEditor.svelte
git commit -m "feat(inhalte-editor): replace horizontal section tabs with grouped left sidebar navigation"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Full TypeScript check across website**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm exec tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2: Astro build**

```bash
cd /tmp/wt-content-hub-ux/website && pnpm run build 2>&1 | tail -30
```

Expected: build completes without errors.

- [ ] **Step 3: Verify all 5 changed files exist with expected content**

```bash
ls -la /tmp/wt-content-hub-ux/website/src/components/admin/HtmlEditor.svelte
grep -n "ensureTables" /tmp/wt-content-hub-ux/website/src/lib/documents-db.ts | head -5
grep -n "HtmlEditor" /tmp/wt-content-hub-ux/website/src/components/admin/NewsletterAdmin.svelte
grep -n "HtmlEditor" /tmp/wt-content-hub-ux/website/src/components/admin/inhalte/VertragsvorlagenSection.svelte
grep -n "flex.*min-h" /tmp/wt-content-hub-ux/website/src/components/admin/InhalteEditor.svelte
```

Expected: all files exist, each grep returns at least one line.

- [ ] **Step 4: Run offline tests**

```bash
cd /tmp/wt-content-hub-ux && bash scripts/task-oracle.sh 'run all offline tests' 2>/dev/null || task test:all 2>&1 | tail -30
```

Expected: passes (or only pre-existing failures, none introduced by this branch).

- [ ] **Step 5: Final commit if any cleanup needed**

```bash
cd /tmp/wt-content-hub-ux
git status
# if clean, nothing to do; if there are stray changes, git add + commit them
```

---

## Spec Coverage Self-Check

| Spec requirement | Task | Status |
|-----------------|------|--------|
| Website-Tab: left sidebar 180px with grouped categories | Task 5 | Covered |
| Sidebar search field + Enter-to-first-match | Task 5 (search input + `onSectionSearchKeydown` already exists) | Covered |
| Active section: gold left border + light bg | Task 5 (`border-gold text-gold bg-gold/5`) | Covered |
| Custom sections with ★ + Neu-button | Task 5 | Covered |
| `HtmlEditor.svelte` — new reusable component | Task 2 | Covered |
| Toggle buttons: Editor / Split / Vorschau | Task 2 | Covered |
| Split mode default (50%/50%) | Task 2 | Covered |
| Preview debounce 250ms | Task 2 | Covered |
| `previewMode='server'` for newsletter | Task 4 | Covered |
| `previewMode='direct'` for verträge | Task 3 | Covered |
| Newsletter example draft seeding on empty list | Task 4 (4b) | Covered |
| Draft subject: `mentolder Newsletter #01…` | Task 4 | Covered |
| Draft has `{{AUSGABE}}` placeholder | Task 4 | Covered |
| Draft status: `draft` (POST to campaigns = default draft) | Task 4 | Covered |
| `hasSeededExample` flag prevents re-seeding | Task 4 | Covered |
| `documents-db.ts` ensureTables() — document_templates | Task 1 | Covered |
| `documents-db.ts` ensureTables() — document_assignments | Task 1 | Covered |
| Lazy call (tablesReady flag) | Task 1 | Covered |
| Called before every exported DB function | Task 1 | Covered |
| RechnungsvorlagenSection: no code change needed | — | Spec confirms no action |
| No Monaco/CodeMirror | Tasks 2–4 (plain textarea) | Confirmed |
