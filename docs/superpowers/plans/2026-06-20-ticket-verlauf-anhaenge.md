---
title: Ticket-Detail Downloads & Verlauf-Collapse — Implementierungsplan
ticket_id: T000956
domains: [website]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Ticket-Detail Downloads & Verlauf-Collapse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fünf fehlende Interaktionen auf der Admin-Ticket-Detailseite implementieren: Verlauf-Collapse (A), Anhang-Download via neues Panel (B+C), Fragebogen-Export (D) und Plan-Download (E).

**Architecture:** Features A/D/E sind reine client-side Svelte-Änderungen (kein neuer Endpoint). Feature B extrahiert den Anhänge-Block aus `[id].astro` in eine neue Svelte-Komponente `TicketAttachmentsPanel.svelte`, um das kritische Zeilenlimit von `[id].astro` (398/400, Budget=2) zu entlasten. Feature C fügt einen neuen API-Endpoint `[aid].ts` mit inline DB-Abfrage hinzu — `admin.ts` (677/677, Budget=0) wird NICHT angefasst.

**Tech Stack:** Astro 5, Svelte 5 (`$state`, `$props`, `$derived`), TypeScript, PostgreSQL via `pool` aus `website/src/lib/website-db.ts`, Vitest + Testing Library Svelte für Tests.

---

## Quality-Gates — Vorab-Accounting (verbindlich)

| Datei | Aktion | Ist-Zeilen | Wirksame Schwelle | Budget | Strategie |
|-------|--------|-----------|-------------------|--------|-----------|
| `website/src/components/admin/TicketActivityTimeline.svelte` | Modify | 149 | 500 (nicht-baselined) | +351 | +~22 Zeilen für $state + Prop + Button |
| `website/src/components/admin/TicketAttachmentsPanel.svelte` | Create | 0 | 500 (nicht-baselined) | <150 Ziel | extrahiert aus [id].astro |
| `website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts` | Create | 0 | 600 (nicht-baselined) | <80 Ziel | inline DB, kein admin.ts |
| `website/src/pages/admin/tickets/[id].astro` | Modify (−45 eff.) | 398 | 400 (nicht-baselined) | Budget=2 → nach Extract ≤355 | Block ersetzen durch 1 Zeile |
| `website/src/components/admin/GrillingStepper.svelte` | Modify | 116 | 500 (nicht-baselined) | +384 | +~15 Zeilen Export-Button |
| `website/src/components/admin/TicketPlanPanel.svelte` | Modify | 22 | 500 (nicht-baselined) | +478 | +~10 Zeilen Download-Button |
| `website/src/lib/tickets/admin.ts` | **NICHT anfassen** | 677 | 677 (baselined) | **Budget=0** | DB inline in [aid].ts |

**S2-Guard:** `TicketAttachmentsPanel.svelte` und `[aid].ts` importieren NICHT aus `admin.ts`. Beide importieren nur: auth (`lib/auth`), DB pool (`lib/website-db`).

---

## Global Constraints

- Svelte 5 Runes-Syntax: `$state`, `$props`, `$derived`, `$effect` — KEIN `export let` in neuen Dateien
- `TicketActivityTimeline.svelte` benutzt noch Svelte-4-Syntax (`export let`) — bei Modify die bestehende Syntax beibehalten, NICHT auf Runes migrieren
- `admin.ts` wird nicht angefasst (Budget=0 / baselined auf 677)
- Keine hardcodierten Hostnamen (`*.mentolder.de`, `*.korczewski.de`) in Code-Snippets
- Neue Svelte-Dateien unter 150 Zeilen halten; neuer API-Endpoint unter 80 Zeilen
- Baseline-Key-Count in `docs/code-quality/baseline.json` darf nicht wachsen (keine neuen Baseline-Einträge)
- `task test:all` und `task freshness:check` müssen grün sein vor Merge

---

## File Structure

```
Modify:
  website/src/components/admin/TicketActivityTimeline.svelte   [A]
  website/src/components/admin/GrillingStepper.svelte          [D]
  website/src/components/admin/TicketPlanPanel.svelte          [E]
  website/src/pages/admin/tickets/[id].astro                   [B refactor + E prop]

Create:
  website/src/components/admin/TicketAttachmentsPanel.svelte   [B]
  website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts [C]

Test (extend existing):
  website/src/components/admin/GrillingStepper.test.ts         [D]

Test (create new):
  website/src/components/admin/TicketPlanPanel.test.ts         [E]
  website/src/components/admin/TicketAttachmentsPanel.test.ts  [B]
```

---

### Task 1: Feature A — Verlauf-Collapse in `TicketActivityTimeline.svelte`

**Files:**
- Modify: `website/src/components/admin/TicketActivityTimeline.svelte` (149 → ~171 Zeilen)

**Interfaces:**
- Consumes: prop `entries: TimelineEntry[]` (unchanged), new optional prop `initialCount: number = 5`
- Produces: same component, now collapses to `initialCount` entries by default with an expand button

- [ ] **Step 1: Versteh die aktuelle Implementierung**

  Die Datei hat 149 Zeilen. Der `<script lang="ts">`-Block endet bei Zeile 49, dann kommt das Template. Das Component nutzt Svelte-4-Syntax mit `export let`. Das Template iteriert über `entries as e, i` mit `{#each ... }`.

  Zeile 6: `export let entries: TimelineEntry[] = [];`

  Das ist die einzige Prop. Wir fügen eine zweite hinzu und nutzen `let expanded` als reaktive Variable.

- [ ] **Step 2: Test schreiben — expand/collapse Verhalten**

  Da `TicketActivityTimeline.svelte` bisher kein Testfile hat, zuerst prüfen ob eines existiert:

  ```bash
  ls /tmp/wt-ticket-verlauf-anhaenge/website/src/components/admin/TicketActivityTimeline*.test* 2>/dev/null || echo "none"
  ```

  Kein Test existiert. Wir erstellen eine Test-Datei:

  **Neue Datei:** `website/src/components/admin/TicketActivityTimeline.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/svelte';
  import TicketActivityTimeline from './TicketActivityTimeline.svelte';
  import type { TimelineEntry } from '../../lib/tickets/admin';

  function makeEntries(n: number): TimelineEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      kind: 'created' as const,
      at: new Date(2026, 0, i + 1).toISOString(),
      actor: `user${i}`,
    }));
  }

  describe('TicketActivityTimeline — collapse/expand', () => {
    it('shows only initialCount entries by default when entries > initialCount', () => {
      const entries = makeEntries(10);
      render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
      // 10 entries → only 5 rendered (li elements with class ticket-timeline-row)
      const rows = document.querySelectorAll('.ticket-timeline-row');
      expect(rows.length).toBe(5);
    });

    it('shows all entries after clicking the expand button', async () => {
      const entries = makeEntries(10);
      render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
      const btn = screen.getByRole('button', { name: /10 Einträge/ });
      await fireEvent.click(btn);
      const rows = document.querySelectorAll('.ticket-timeline-row');
      expect(rows.length).toBe(10);
    });

    it('shows "Weniger anzeigen" button after expanding', async () => {
      const entries = makeEntries(10);
      render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
      await fireEvent.click(screen.getByRole('button', { name: /10 Einträge/ }));
      expect(screen.getByRole('button', { name: /Weniger anzeigen/ })).toBeTruthy();
    });

    it('shows all entries when entries <= initialCount (no button)', () => {
      const entries = makeEntries(3);
      render(TicketActivityTimeline, { props: { entries, initialCount: 5 } });
      const rows = document.querySelectorAll('.ticket-timeline-row');
      expect(rows.length).toBe(3);
      expect(screen.queryByRole('button', { name: /Einträge/ })).toBeNull();
    });

    it('shows all entries when initialCount is omitted (defaults to 5)', () => {
      const entries = makeEntries(3);
      render(TicketActivityTimeline, { props: { entries } });
      const rows = document.querySelectorAll('.ticket-timeline-row');
      expect(rows.length).toBe(3);
    });
  });
  ```

- [ ] **Step 3: Run test to verify it fails**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/TicketActivityTimeline.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — `initialCount` prop not yet defined; all entries are rendered instead of 5.

- [ ] **Step 4: `TicketActivityTimeline.svelte` modifizieren**

  Ersetze den gesamten `<script lang="ts">`-Block und das Template. Der `<style>`-Block bleibt unverändert.

  Im `<script>`-Block nach Zeile 6 (`export let entries`) eine neue Prop und reaktive Variable hinzufügen:

  ```svelte
  <!-- Die neue Datei: Zeilen 1-49 aus script + neue Zeilen + unverändertes Template -->
  <script lang="ts">
    import type { TimelineEntry } from '../../lib/tickets/admin';
    import { renderMarkdown } from '../../lib/markdown';
    import '../../styles/markdown.css';
    export let entries: TimelineEntry[] = [];
    export let initialCount: number = 5;

    let expanded = false;

    $: visibleEntries = expanded || entries.length <= initialCount
      ? entries
      : entries.slice(0, initialCount);

    const FIELD_LABEL: Record<string, string> = {
      status:        'Status',
      resolution:    'Resolution',
      priority:      'Priorität',
      severity:      'Severität',
      assignee_id:   'Zuständig',
      customer_id:   'Kunde',
      reporter_id:   'Reporter',
      reporter_email:'Reporter-E-Mail',
      title:         'Titel',
      description:   'Beschreibung',
      url:           'URL',
      component:     'Komponente',
      thesis_tag:    'Thesis-Tag',
      parent_id:     'Parent',
      start_date:    'Start',
      due_date:      'Fällig',
      estimate_minutes: 'Schätzung',
    };

    const LINK_KIND_LABEL: Record<string, string> = {
      blocks:        'blockt',
      blocked_by:    'blockiert von',
      duplicate_of:  'Duplikat von',
      relates_to:    'verwandt mit',
      fixes:         'behebt',
      fixed_by:      'behoben durch',
    };

    function fmt(d: Date | string): string {
      return new Date(d).toLocaleString('de-DE',
        { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function fmtVal(v: unknown): string {
      if (v === null || v === undefined || v === '') return '∅';
      if (typeof v === 'string')  return v.length > 80 ? v.slice(0, 80) + '…' : v;
      if (typeof v === 'number')  return String(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      return JSON.stringify(v).slice(0, 80);
    }
  </script>
  ```

  Dann das Template: Ersetze `{#each entries as e, i ...}` durch `{#each visibleEntries as e, i ...}` und füge nach der `</ol>` den Collapse-Button ein:

  Der vollständige neue Template-Teil (nach `</script>`):

  ```svelte
  <ol class="ticket-timeline">
    {#each visibleEntries as e, i (i + '-' + (typeof e.at === 'string' ? e.at : (e.at as Date).toISOString()) + '-' + e.kind)}
      <li class="ticket-timeline-row">
        <span class="ticket-timeline-dot" data-kind={e.kind}></span>
        <div class="ticket-timeline-body">
          <div class="ticket-timeline-meta">
            <span class="ticket-timeline-actor">{e.actor ?? 'system'}</span>
            <span class="ticket-timeline-when">{fmt(e.at)}</span>
          </div>

          {#if e.kind === 'created'}
            <p>Ticket erstellt</p>
          {:else if e.kind === 'updated'}
            <ul class="ticket-timeline-diff">
              {#each Object.entries(e.diff) as [field, change]}
                <li>
                  <strong>{FIELD_LABEL[field] ?? field}:</strong>
                  <span class="old">{fmtVal(change.old)}</span>
                  →
                  <span class="new">{fmtVal(change.new)}</span>
                </li>
              {/each}
            </ul>
          {:else if e.kind === 'comment'}
            <div class="ticket-timeline-comment" data-visibility={e.visibility}>
              {#if e.visibility === 'public'}
                <span class="ticket-timeline-badge">öffentlich</span>
              {:else}
                <span class="ticket-timeline-badge">intern</span>
              {/if}
              {#if e.commentKind !== 'comment'}
                <span class="ticket-timeline-badge alt">{e.commentKind}</span>
              {/if}
              <div class="md-body" style="margin: 4px 0 0;">{@html renderMarkdown(e.body)}</div>
            </div>
          {:else if e.kind === 'link_added'}
            <p>
              Verknüpfung: <strong>{LINK_KIND_LABEL[e.linkKind] ?? e.linkKind}</strong>
              <a href={`/admin/tickets/${e.otherId}`}>{e.otherTitle}</a>
              {#if e.prNumber}
                <span class="ticket-timeline-pr">(PR #{e.prNumber})</span>
              {/if}
            </p>
          {:else if e.kind === 'pr_merged'}
            <p>
              PR <a href={`https://github.com/Paddione/Bachelorprojekt/pull/${e.prNumber}`}
                    target="_blank" rel="noopener">#{e.prNumber}</a>
              gemergt: {e.prTitle}
              {#if e.mergedBy} — {e.mergedBy}{/if}
            </p>
          {/if}
        </div>
      </li>
    {/each}
    {#if entries.length === 0}
      <li class="ticket-timeline-empty">Noch keine Aktivität.</li>
    {/if}
  </ol>

  {#if entries.length > initialCount}
    <div class="ticket-timeline-toggle">
      <button type="button" class="ticket-timeline-expand-btn" on:click={() => (expanded = !expanded)}>
        {expanded ? 'Weniger anzeigen' : `Alle ${entries.length} Einträge anzeigen`}
      </button>
    </div>
  {/if}
  ```

  Der `<style>`-Block wird unverändert übernommen und folgende CSS-Klassen kommen ans Ende hinzu (vor `</style>`):

  ```css
  .ticket-timeline-toggle { margin-top: 8px; text-align: center; }
  .ticket-timeline-expand-btn {
    font-size: 12px; color: var(--brass, #e8c870); background: none; border: none;
    cursor: pointer; padding: 4px 8px; border-radius: 4px;
  }
  .ticket-timeline-expand-btn:hover { text-decoration: underline; }
  ```

- [ ] **Step 5: Test laufen lassen — muss PASS sein**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/TicketActivityTimeline.test.ts 2>&1 | tail -20
  ```

  Erwartet: `5 passed`.

- [ ] **Step 6: Test-Inventar regenerieren**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task test:inventory
  ```

- [ ] **Step 7: Commit**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge
  git add website/src/components/admin/TicketActivityTimeline.svelte \
          website/src/components/admin/TicketActivityTimeline.test.ts \
          website/src/data/test-inventory.json
  git commit -m "feat(admin): TicketActivityTimeline collapse — initialCount prop + expand button [T000956]"
  ```

---

### Task 2: Feature B — `TicketAttachmentsPanel.svelte` (neu) + `[id].astro` refactoring

**Files:**
- Create: `website/src/components/admin/TicketAttachmentsPanel.svelte`
- Modify: `website/src/pages/admin/tickets/[id].astro` (398 → ~355 Zeilen)

**Interfaces:**
- Consumes:
  - `attachments: Array<{ id: string; filename: string; mimeType: string; fileSize: number | null; hasDataUrl: boolean }>` (matches `TicketAttachmentRow` shape from `admin.ts`)
  - `ticketId: string`
- Produces: Upload-Dialog + Anhang-Liste mit Download-Links für `hasDataUrl === true`; emittiert keine Events (reload via `location.reload()` nach erfolgreichem Upload, genau wie vorher)

- [ ] **Step 1: Test schreiben für `TicketAttachmentsPanel.svelte`**

  **Neue Datei:** `website/src/components/admin/TicketAttachmentsPanel.test.ts`

  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/svelte';
  import TicketAttachmentsPanel from './TicketAttachmentsPanel.svelte';

  const baseAttachment = {
    id: 'att-1',
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    hasDataUrl: true,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  describe('TicketAttachmentsPanel', () => {
    it('renders "Keine Anhänge" when empty', () => {
      render(TicketAttachmentsPanel, { props: { ticketId: 't1', attachments: [] } });
      expect(screen.getByText(/Keine Anhänge/)).toBeTruthy();
    });

    it('renders attachment filename as download link when hasDataUrl is true', () => {
      render(TicketAttachmentsPanel, {
        props: { ticketId: 't1', attachments: [baseAttachment] },
      });
      const link = screen.getByRole('link', { name: 'test.pdf' }) as HTMLAnchorElement;
      expect(link.href).toContain('/api/admin/tickets/t1/attachments/att-1');
      expect(link.getAttribute('download')).toBe('test.pdf');
    });

    it('renders filename as plain text when hasDataUrl is false', () => {
      render(TicketAttachmentsPanel, {
        props: {
          ticketId: 't1',
          attachments: [{ ...baseAttachment, hasDataUrl: false }],
        },
      });
      // No <a> link for this attachment
      expect(screen.queryByRole('link', { name: 'test.pdf' })).toBeNull();
      expect(screen.getByText('test.pdf')).toBeTruthy();
    });

    it('formats file sizes correctly', () => {
      render(TicketAttachmentsPanel, {
        props: {
          ticketId: 't1',
          attachments: [
            { ...baseAttachment, id: 'a1', filename: 'small.txt', fileSize: 500 },
            { ...baseAttachment, id: 'a2', filename: 'medium.jpg', fileSize: 2048 },
            { ...baseAttachment, id: 'a3', filename: 'large.zip', fileSize: 2 * 1024 * 1024 },
          ],
        },
      });
      expect(screen.getByText('500 B')).toBeTruthy();
      expect(screen.getByText('2.0 KB')).toBeTruthy();
      expect(screen.getByText('2.0 MB')).toBeTruthy();
    });

    it('shows the count in the header', () => {
      render(TicketAttachmentsPanel, {
        props: { ticketId: 't1', attachments: [baseAttachment] },
      });
      expect(screen.getByText(/Anhänge \(1\)/)).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/TicketAttachmentsPanel.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — component file does not exist yet.

- [ ] **Step 3: `TicketAttachmentsPanel.svelte` erstellen**

  **Neue Datei:** `website/src/components/admin/TicketAttachmentsPanel.svelte`

  ```svelte
  <script lang="ts">
    // TicketAttachmentsPanel.svelte — Upload-Dialog + Anhang-Liste + Download-Links
    // Extrahiert aus [id].astro. Kein Import von admin.ts (Budget=0 dort).
    let {
      ticketId,
      attachments = [],
    }: {
      ticketId: string;
      attachments: {
        id: string;
        filename: string;
        mimeType: string;
        fileSize: number | null;
        hasDataUrl: boolean;
      }[];
    } = $props();

    let dialogEl = $state<HTMLDialogElement | null>(null);
    let uploadError = $state('');

    function fmtSize(bytes: number | null): string {
      if (!bytes) return '—';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    async function handleUpload(e: Event) {
      e.preventDefault();
      uploadError = '';
      const form = e.target as HTMLFormElement;
      const fd = new FormData(form);
      const r = await fetch(`/api/admin/tickets/${ticketId}/attachments`, {
        method: 'POST',
        body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: 'Upload-Fehler' }));
        uploadError = j.error ?? 'Upload-Fehler';
        return;
      }
      location.reload();
    }
  </script>

  <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">
        Anhänge ({attachments.length})
      </h2>
      <button
        type="button"
        onclick={() => dialogEl?.showModal()}
        class="px-3 py-1 text-xs bg-gold/20 text-gold border border-gold/30 rounded hover:bg-gold/30 transition-colors"
      >
        + Datei
      </button>
    </div>

    {#if attachments.length === 0}
      <p class="text-sm text-muted italic">Keine Anhänge.</p>
    {:else}
      <ul class="space-y-1 text-sm">
        {#each attachments as a (a.id)}
          <li class="flex items-center gap-3">
            {#if a.hasDataUrl}
              <a
                href={`/api/admin/tickets/${ticketId}/attachments/${a.id}`}
                download={a.filename}
                class="text-gold hover:underline flex-1 truncate"
              >{a.filename}</a>
            {:else}
              <span class="text-light flex-1 truncate">{a.filename}</span>
            {/if}
            <span class="text-xs text-muted">{a.mimeType}</span>
            <span class="text-xs text-muted font-mono">{fmtSize(a.fileSize)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <dialog
    bind:this={dialogEl}
    class="bg-dark-light border border-dark-lighter rounded-2xl p-6 w-full max-w-md backdrop:bg-black/60"
  >
    <h2 class="text-lg font-semibold text-light mb-4 font-serif">Datei anhängen</h2>
    <form onsubmit={handleUpload} enctype="multipart/form-data" class="space-y-4">
      <div>
        <label class="block text-xs text-muted mb-1">Datei <span class="text-red-400">*</span></label>
        <input
          type="file" name="file" required
          class="w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gold/20 file:text-gold hover:file:bg-gold/30 file:cursor-pointer cursor-pointer"
        />
        <p class="text-xs text-muted mt-1">Max. 5 MB</p>
      </div>
      {#if uploadError}
        <p class="text-red-400 text-xs">{uploadError}</p>
      {/if}
      <div class="flex gap-3 justify-end">
        <button
          type="button"
          onclick={() => dialogEl?.close()}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors"
        >Abbrechen</button>
        <button
          type="submit"
          class="px-4 py-2 text-sm bg-gold hover:bg-gold-light text-dark font-semibold rounded-lg transition-colors"
        >Hochladen</button>
      </div>
    </form>
  </dialog>
  ```

- [ ] **Step 4: Test laufen lassen — muss PASS sein**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/TicketAttachmentsPanel.test.ts 2>&1 | tail -20
  ```

  Erwartet: `5 passed`.

- [ ] **Step 5: `[id].astro` refactoren — Anhänge-Block ersetzen**

  Füge den Import hinzu (in der Frontmatter, nach der letzten `import`-Zeile, Zeile ~24):

  ```typescript
  import TicketAttachmentsPanel from '../../../components/admin/TicketAttachmentsPanel.svelte';
  ```

  Ersetze den gesamten Anhänge-Block (Zeilen 231–259 im Template, der `{/* Attachments */}`-Kommentar bis zum schließenden `</div>`):

  **Alt (28 Zeilen):**
  ```astro
          {/* Attachments */}
          <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">
                Anhänge ({ticket.attachments.length})
              </h2>
              <button type="button" id="upload-btn"
                class="px-3 py-1 text-xs bg-gold/20 text-gold border border-gold/30 rounded hover:bg-gold/30 transition-colors">
                + Datei
              </button>
            </div>
            {ticket.attachments.length === 0 ? (
              <p class="text-sm text-muted italic">Keine Anhänge.</p>
            ) : (
              <ul class="space-y-1 text-sm">
                {ticket.attachments.map(a => (
                  <li class="flex items-center gap-3">
                    <span class="text-light flex-1 truncate">{a.filename}</span>
                    <span class="text-xs text-muted">{a.mimeType}</span>
                    <span class="text-xs text-muted font-mono">
                      {a.fileSize ? (a.fileSize < 1024 ? `${a.fileSize} B` :
                                     a.fileSize < 1024 * 1024 ? `${(a.fileSize / 1024).toFixed(1)} KB` :
                                     `${(a.fileSize / 1024 / 1024).toFixed(1)} MB`) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
  ```

  **Neu (1 Zeile):**
  ```astro
          <TicketAttachmentsPanel client:load ticketId={ticket.id} attachments={ticket.attachments} />
  ```

  Dann den alten Upload-`<dialog>` und das zugehörige Upload-Script aus `[id].astro` entfernen. Das sind:
  - Zeilen 345–366: der `<dialog id="upload-dialog">` Block
  - Zeilen 369–388: der Fetch-Teil des `<script>` (der `upload-btn`/`upload-dialog`/`upload-form`-Handler)

  Der `unlink-btn`-Handler im `<script>`-Block (Zeilen 389–396) **bleibt** erhalten.

  Nach den Änderungen sollte `[id].astro` ca. 355 Zeilen haben (398 − 28 Anhänge-Block − 22 Dialog − 20 Upload-Script + 1 neue Zeile ≈ 329 Zeilen). Zeilengenau: entfernt werden ~45 Zeilen, hinzugefügt wird 1 Zeile → netto ~−44 Zeilen → ~354 Zeilen.

- [ ] **Step 6: Zeilenzahl prüfen**

  ```bash
  wc -l /tmp/wt-ticket-verlauf-anhaenge/website/src/pages/admin/tickets/\[id\].astro
  ```

  Erwartet: ≤ 395 (Limit ist 400 ohne Baseline; muss deutlich darunter sein).

- [ ] **Step 7: Test-Inventar regenerieren**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task test:inventory
  ```

- [ ] **Step 8: Commit**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge
  git add website/src/components/admin/TicketAttachmentsPanel.svelte \
          website/src/components/admin/TicketAttachmentsPanel.test.ts \
          website/src/pages/admin/tickets/\[id\].astro \
          website/src/data/test-inventory.json
  git commit -m "feat(admin): TicketAttachmentsPanel — extract upload+list into Svelte component [T000956]"
  ```

---

### Task 3: Feature C — `GET /api/admin/tickets/[id]/attachments/[aid].ts`

**Files:**
- Create: `website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts`

**Interfaces:**
- Consumes: URL params `id` (ticket UUID), `aid` (attachment UUID); Admin-Session cookie
- Produces: Binary Response mit `Content-Disposition: attachment; filename="<filename>"` + korrektem MIME-Typ; 404 wenn nicht gefunden; 403 bei fehlendem Admin-Recht

**S2-Guard:** Importiert NUR `lib/auth` und `lib/website-db` — KEIN Import von `lib/tickets/admin` (Budget=0 dort).

- [ ] **Step 1: Verzeichnis-Struktur prüfen**

  ```bash
  ls /tmp/wt-ticket-verlauf-anhaenge/website/src/pages/api/admin/tickets/\[id\]/
  ```

  Erwartet: `attachments.ts`, `classify.ts`, `comments.ts`, `links.ts`, `transition.ts`, `triage.ts`.
  Das neue File liegt in einem Sub-Verzeichnis `attachments/[aid].ts`.

  ```bash
  mkdir -p /tmp/wt-ticket-verlauf-anhaenge/website/src/pages/api/admin/tickets/\[id\]/attachments/
  ```

- [ ] **Step 2: `[aid].ts` erstellen**

  **Neue Datei:** `website/src/pages/api/admin/tickets/[id]/attachments/[aid].ts`

  ```typescript
  // GET /api/admin/tickets/[id]/attachments/[aid]
  // Binary download of a ticket attachment (stored as data_url in DB).
  // Inline DB access — does NOT import from lib/tickets/admin.ts (budget=0 there).
  import type { APIRoute } from 'astro';
  import { getSession, isAdmin } from '../../../../../../lib/auth';
  import { pool } from '../../../../../../lib/website-db';

  export const GET: APIRoute = async ({ request, params }) => {
    const session = await getSession(request.headers.get('cookie'));
    if (!session || !isAdmin(session)) return new Response(null, { status: 403 });

    const ticketId = String(params.id ?? '');
    const aid = String(params.aid ?? '');
    if (!ticketId || !aid) return new Response(null, { status: 400 });

    const BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

    // Brand-guard: verify ticket belongs to this brand, then fetch attachment
    const r = await pool.query<{
      data_url: string;
      filename: string;
      mime_type: string;
    }>(
      `SELECT a.data_url, a.filename, a.mime_type
         FROM tickets.ticket_attachments a
         JOIN tickets.tickets t ON t.id = a.ticket_id
        WHERE a.id = $1 AND a.ticket_id = $2 AND t.brand = $3
          AND a.data_url IS NOT NULL`,
      [aid, ticketId, BRAND],
    );

    if (r.rows.length === 0) return new Response(null, { status: 404 });

    const { data_url, filename, mime_type } = r.rows[0];
    // data_url format: "data:<mime>;base64,<data>"
    const commaIdx = data_url.indexOf(',');
    if (commaIdx === -1) return new Response(null, { status: 500 });

    const binary = Buffer.from(data_url.slice(commaIdx + 1), 'base64');
    const safeFilename = encodeURIComponent(filename).replace(/%20/g, '+');

    return new Response(binary, {
      status: 200,
      headers: {
        'Content-Type': mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${safeFilename}`,
        'Content-Length': String(binary.length),
        'Cache-Control': 'private, no-store',
      },
    });
  };
  ```

- [ ] **Step 3: Zeilenzahl prüfen**

  ```bash
  wc -l /tmp/wt-ticket-verlauf-anhaenge/website/src/pages/api/admin/tickets/\[id\]/attachments/\[aid\].ts
  ```

  Erwartet: ≤ 80 (weit unter dem `.ts`-Limit von 600).

- [ ] **Step 4: TypeScript-Compilation prüfen**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge/website && npx tsc --noEmit 2>&1 | grep -E "aid|attachments" | head -10
  ```

  Erwartet: keine Fehler für die neue Datei.

- [ ] **Step 5: Commit**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge
  git add website/src/pages/api/admin/tickets/\[id\]/attachments/\[aid\].ts
  git commit -m "feat(admin): GET /api/admin/tickets/[id]/attachments/[aid] — binary download endpoint [T000956]"
  ```

---

### Task 4: Feature D — Fragebögen-Export in `GrillingStepper.svelte`

**Files:**
- Modify: `website/src/components/admin/GrillingStepper.svelte` (116 → ~131 Zeilen)
- Extend: `website/src/components/admin/GrillingStepper.test.ts`

**Interfaces:**
- Consumes: `answers: GrillingAnswers` (bereits im State), `questionnaireId: string`, `resolveQuestions()` aus `grilling.ts`
- Produces: client-side `.txt`-Download via `URL.createObjectURL(new Blob([text], { type: 'text/plain' }))`
- Export-Format:
  ```
  # Grilling: coaching-sessions-v1

  ## <Sektionsname>
  **<Frage>**
  <Antwort oder "(keine Antwort)">

  ```

- [ ] **Step 1: Bestehende Tests erweitern**

  Füge am Ende von `website/src/components/admin/GrillingStepper.test.ts` (nach dem letzten `it(...)`) hinzu:

  ```typescript
  describe('GrillingStepper — Export', () => {
    it('Export button is not shown when answers is empty', () => {
      setup(null, null);
      expect(screen.queryByRole('button', { name: /Export/ })).toBeNull();
    });

    it('Export button is shown when at least one answer exists', () => {
      setup({ [QN]: { q1: 'meine Antwort' } }, null);
      expect(screen.getByRole('button', { name: /Export/ })).toBeTruthy();
    });

    it('clicking Export triggers a blob download', async () => {
      const createObjectURL = vi.fn(() => 'blob:mock-url');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

      const clickSpy = vi.fn();
      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        (node as HTMLAnchorElement).click = clickSpy;
        return node;
      });
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      setup({ [QN]: { q1: 'meine Antwort' } }, null);
      await fireEvent.click(screen.getByRole('button', { name: /Export/ }));

      expect(createObjectURL).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/GrillingStepper.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — the three new Export tests fail because the Export button does not exist yet.

- [ ] **Step 3: `GrillingStepper.svelte` modifizieren**

  Füge nach der letzten Funktion `next()` (Zeile 89, vor `</script>`) eine neue Export-Funktion ein:

  ```typescript
  function exportAnswers() {
    const qs = resolveQuestions(questionnaireId, QUESTIONNAIRES, meta);
    const qn = QUESTIONNAIRES[questionnaireId];
    const title = qn?.title ?? questionnaireId;
    const lines: string[] = [`# Grilling: ${title}`, ''];

    let currentSection = '';
    for (const q of qs) {
      if (q.section && q.section !== currentSection) {
        currentSection = q.section;
        lines.push(`## ${currentSection}`, '');
      }
      const answer = answers[questionnaireId]?.[q.id] ?? '';
      lines.push(`**${q.prompt}**`, answer || '(keine Antwort)', '');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grilling-${questionnaireId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasAnswers = $derived(
    Object.values(answers[questionnaireId] ?? {}).some((v) => v.trim() !== '')
  );
  ```

  Dann im Template den Header-Block (Zeile 93–102) so anpassen, dass der Export-Button im `<header>` erscheint — nach dem Modus-Toggle-Button:

  ```svelte
  <section class="bg-dark-light rounded-2xl border border-dark-lighter p-6 space-y-4">
    <header class="flex items-center justify-between">
      <h3 class="font-semibold">Grilling — Schritt für Schritt</h3>
      <span data-testid="grilling-progress" class="text-sm text-muted">
        Frage {Math.min(currentIdx + 1, ordered.length)}/{ordered.length} ·
        {progress.answered} beantwortet · {progress.dismissed} verworfen
      </span>
      <div class="flex gap-2">
        <button type="button" data-testid="grilling-mode" onclick={() => (mode = mode === 'step' ? 'all' : 'step')}>
          {mode === 'step' ? 'Alle anzeigen' : 'Schritt für Schritt'}
        </button>
        {#if hasAnswers}
          <button type="button" onclick={exportAnswers} class="text-xs text-gold/80 hover:text-gold border border-gold/30 rounded px-2 py-1">
            Export
          </button>
        {/if}
      </div>
    </header>
    ...
  ```

  Der Rest des Templates (`{#if current}` ... bis `</section>`) bleibt unverändert.

- [ ] **Step 4: Tests laufen lassen — muss PASS sein**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/GrillingStepper.test.ts 2>&1 | tail -20
  ```

  Erwartet: alle 8 Tests pass (5 bestehende + 3 neue).

- [ ] **Step 5: Zeilenzahl prüfen**

  ```bash
  wc -l /tmp/wt-ticket-verlauf-anhaenge/website/src/components/admin/GrillingStepper.svelte
  ```

  Erwartet: ≤ 140 (weit unter dem `.svelte`-Limit von 500).

- [ ] **Step 6: Test-Inventar regenerieren**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task test:inventory
  ```

- [ ] **Step 7: Commit**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge
  git add website/src/components/admin/GrillingStepper.svelte \
          website/src/components/admin/GrillingStepper.test.ts \
          website/src/data/test-inventory.json
  git commit -m "feat(admin): GrillingStepper Export-Button — client-side .txt download [T000956]"
  ```

---

### Task 5: Feature E — Plan-Download in `TicketPlanPanel.svelte`

**Files:**
- Modify: `website/src/components/admin/TicketPlanPanel.svelte` (22 → ~38 Zeilen)
- Modify: `website/src/pages/admin/tickets/[id].astro` (nur ein zusätzliches Prop)
- Create: `website/src/components/admin/TicketPlanPanel.test.ts`

**Interfaces:**
- Consumes: new optional prop `planContent: string = ''` (raw Markdown)
- Produces: client-side download `plan-{plan.slug}.md` via Blob; nur sichtbar wenn `planContent` nicht leer

- [ ] **Step 1: Test schreiben für `TicketPlanPanel.svelte`**

  **Neue Datei:** `website/src/components/admin/TicketPlanPanel.test.ts`

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { render, screen, fireEvent } from '@testing-library/svelte';
  import TicketPlanPanel from './TicketPlanPanel.svelte';

  const mockPlan = {
    id: 'plan-1',
    slug: '2026-06-20-mein-plan',
    branch: 'feature/mein-plan',
    prNumber: 42,
    content: '# Mein Plan\n\nInhalt hier.',
    archivedAt: null,
  };

  describe('TicketPlanPanel', () => {
    it('renders plan slug and PR link', () => {
      render(TicketPlanPanel, {
        props: { plan: mockPlan, renderedHtml: '<h1>Mein Plan</h1>', planContent: mockPlan.content },
      });
      expect(screen.getByText(mockPlan.slug)).toBeTruthy();
      const prLink = screen.getByRole('link', { name: /#42/ });
      expect(prLink.getAttribute('href')).toContain('/pull/42');
    });

    it('shows download button when planContent is non-empty', () => {
      render(TicketPlanPanel, {
        props: { plan: mockPlan, renderedHtml: '', planContent: '# Inhalt' },
      });
      expect(screen.getByRole('button', { name: /\.md/ })).toBeTruthy();
    });

    it('does NOT show download button when planContent is empty', () => {
      render(TicketPlanPanel, {
        props: { plan: mockPlan, renderedHtml: '', planContent: '' },
      });
      expect(screen.queryByRole('button', { name: /\.md/ })).toBeNull();
    });

    it('clicking download button triggers blob download with correct filename', async () => {
      const createObjectURL = vi.fn(() => 'blob:mock');
      const revokeObjectURL = vi.fn();
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

      const clickSpy = vi.fn();
      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        (node as HTMLAnchorElement).click = clickSpy;
        return node;
      });
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      render(TicketPlanPanel, {
        props: { plan: mockPlan, renderedHtml: '', planContent: '# Test' },
      });
      await fireEvent.click(screen.getByRole('button', { name: /\.md/ }));
      expect(clickSpy).toHaveBeenCalled();
      const blob = (createObjectURL as any).mock.calls[0][0] as Blob;
      expect(blob.type).toBe('text/markdown');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/TicketPlanPanel.test.ts 2>&1 | tail -20
  ```

  Expected: FAIL — `planContent` prop and download button do not exist yet.

- [ ] **Step 3: `TicketPlanPanel.svelte` modifizieren**

  Ersetze den gesamten Dateiinhalt (22 Zeilen) durch:

  ```svelte
  <script lang="ts">
    import type { TicketPlan } from '../../lib/tickets/container-detail';

    let {
      plan,
      renderedHtml,
      planContent = '',
    }: {
      plan: TicketPlan;
      renderedHtml: string;
      planContent?: string;
    } = $props();

    function downloadPlan() {
      const blob = new Blob([planContent], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-${plan.slug}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>

  <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6">
    <div class="flex items-center justify-between mb-2">
      <h2 class="text-sm font-semibold text-light font-serif uppercase tracking-wide">Plan</h2>
      {#if planContent}
        <button
          type="button"
          onclick={downloadPlan}
          class="text-xs text-gold/80 hover:text-gold border border-gold/30 rounded px-2 py-1"
          title="Plan als Markdown herunterladen"
        >
          plan-{plan.slug}.md ↓
        </button>
      {/if}
    </div>
    <dl class="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-3">
      <div><dt class="text-muted uppercase">Slug</dt><dd class="text-light font-mono">{plan.slug}</dd></div>
      {#if plan.branch}<div><dt class="text-muted uppercase">Branch</dt><dd class="text-light font-mono">{plan.branch}</dd></div>{/if}
      {#if plan.prNumber}
        <div><dt class="text-muted uppercase">PR</dt>
          <dd><a href={`https://github.com/Paddione/Bachelorprojekt/pull/${plan.prNumber}`}
                 target="_blank" rel="noopener" class="text-gold hover:underline font-mono">#{plan.prNumber}</a></dd></div>
      {/if}
    </dl>
    <details>
      <summary class="cursor-pointer text-sm text-gold hover:underline">Plan-Inhalt anzeigen</summary>
      <div class="md-body text-light/90 mt-3">{@html renderedHtml}</div>
    </details>
  </div>
  ```

  **Hinweis:** Der `<script>`-Block wechselt von Svelte-4-Syntax (`export let`) auf Svelte-5-Runes-Syntax (`$props()`) — das ist korrekt für eine 22-Zeilen-Datei, die von Svelte 5 unterstützt wird. Keine externe Abhängigkeit auf den alten Syntax-Stil.

- [ ] **Step 4: `[id].astro` — `planContent` Prop ergänzen**

  In `[id].astro` die Zeile mit `<TicketPlanPanel client:load ...>` suchen (aktuell Zeile 176 ungefähr, nach dem Refactoring aus Task 2):

  **Alt:**
  ```astro
          {containerPlan && <TicketPlanPanel client:load plan={containerPlan} renderedHtml={planHtml} />}
  ```

  **Neu:**
  ```astro
          {containerPlan && <TicketPlanPanel client:load plan={containerPlan} renderedHtml={planHtml} planContent={containerPlan.content ?? ''} />}
  ```

- [ ] **Step 5: Tests laufen lassen — muss PASS sein**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && npx vitest run website/src/components/admin/TicketPlanPanel.test.ts 2>&1 | tail -20
  ```

  Erwartet: `4 passed`.

- [ ] **Step 6: Zeilenzahl prüfen**

  ```bash
  wc -l /tmp/wt-ticket-verlauf-anhaenge/website/src/components/admin/TicketPlanPanel.svelte \
        /tmp/wt-ticket-verlauf-anhaenge/website/src/pages/admin/tickets/\[id\].astro
  ```

  Erwartet: `TicketPlanPanel.svelte` ≤ 50, `[id].astro` ≤ 356 (bleibt unter 400).

- [ ] **Step 7: Test-Inventar regenerieren**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task test:inventory
  ```

- [ ] **Step 8: Commit**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge
  git add website/src/components/admin/TicketPlanPanel.svelte \
          website/src/components/admin/TicketPlanPanel.test.ts \
          website/src/pages/admin/tickets/\[id\].astro \
          website/src/data/test-inventory.json
  git commit -m "feat(admin): TicketPlanPanel download-button — plan-{slug}.md [T000956]"
  ```

---

### Task 6: Verifikation & Abschluss

**Files:**
- Keine neuen Dateien

- [ ] **Step 1: Alle Tests laufen lassen**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task test:changed
  ```

  Erwartet: alle Vitest + BATS-Tests grün.

- [ ] **Step 2: Freshness regenerieren**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task freshness:regenerate
  ```

- [ ] **Step 3: Freshness-Check (S1–S4 Ratchet)**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task freshness:check
  ```

  Erwartet: grün. Insbesondere:
  - `[id].astro`: Ist ≤ 356 < 400 (nicht-baselined-Limit) ✓
  - `TicketActivityTimeline.svelte`: Ist ~171 < 500 ✓
  - `GrillingStepper.svelte`: Ist ~131 < 500 ✓
  - `TicketPlanPanel.svelte`: Ist ~48 < 500 ✓
  - `TicketAttachmentsPanel.svelte`: Ist ~110 < 500 ✓
  - `[aid].ts`: Ist ~55 < 600 ✓
  - `admin.ts`: **nicht verändert** (bleibt bei 677) ✓
  - Baseline-Key-Count: unverändert ✓

- [ ] **Step 4: Test-Inventar final prüfen**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task test:inventory
  git diff --name-only website/src/data/test-inventory.json
  ```

  Wenn Diff: `git add website/src/data/test-inventory.json && git commit -m "chore: regenerate test-inventory [T000956]"`

- [ ] **Step 5: S2-Import-Zyklen prüfen**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge/website && npx tsc --noEmit 2>&1 | head -20
  ```

  Erwartet: keine Errors. Insbesondere: `[aid].ts` importiert nicht aus `admin.ts`, `TicketAttachmentsPanel.svelte` importiert nicht aus `admin.ts`.

- [ ] **Step 6: Manifest-Validierung (keine Manifest-Änderungen in diesem PR, aber Gate trotzdem laufen)**

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge && task workspace:validate 2>&1 | tail -5
  ```

  Erwartet: kein Fehler (nur website-Dateien geändert, keine k8s-Manifeste).

- [ ] **Step 7: Abschluss-Commit falls nötig**

  Wenn nach `freshness:regenerate` noch Diff existiert:

  ```bash
  cd /tmp/wt-ticket-verlauf-anhaenge
  git add docs/generated/ docs/code-quality/repo-index.json 2>/dev/null || true
  git commit -m "chore: freshness regenerate [T000956]" 2>/dev/null || echo "nothing to commit"
  ```
