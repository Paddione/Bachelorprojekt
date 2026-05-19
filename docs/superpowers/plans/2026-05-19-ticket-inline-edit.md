---
ticket_id: T000029
title: Ticket Inline Quick-Edit + AI/Human Workflow — Implementation Plan
domains: []
status: active
pr_number: null
---

# Ticket Inline Quick-Edit + AI/Human Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline status-select, AI/Human 3-pill toggle, and an expandable AI-question/human-answer widget directly in the `/admin/tickets` table — no modal needed for these three interactions.

**Architecture:** DB migration adds `ai_question` + `human_answer` columns; TypeScript lib + API whitelist extended; existing Astro table-body loop replaced by a single Svelte 5 island (`TicketsTableBody.svelte`) that owns all row-level state and fires PATCH/transition fetches; answer widget is a hidden second `<tr>` per ticket that expands when `attentionMode=needs_human && aiQuestion !== null`.

**Tech Stack:** PostgreSQL 16, Astro 5, Svelte 5 (runes), TypeScript, Tailwind

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `scripts/migrations/2026-05-19-ai-question-human-answer.sql` | **Create** | DB migration: 2 new columns |
| `website/src/lib/tickets/admin.ts` | **Modify** | `ListedTicket` interface + `LIST_COLS` SQL + `patchAdminTicket()` |
| `website/src/pages/api/admin/tickets/[id].ts` | **Modify** | Add `aiQuestion`/`humanAnswer` to PATCH whitelist |
| `website/src/components/admin/TicketsTableBody.svelte` | **Create** | Inline table with status select, pill, answer widget |
| `website/src/pages/admin/tickets.astro` | **Modify** | Import + mount `TicketsTableBody` island; remove old `tickets.map()` table-body |

---

## Task 1: DB Migration

**Files:**
- Create: `scripts/migrations/2026-05-19-ai-question-human-answer.sql`

- [ ] **Step 1.1 — Write migration SQL**

```sql
-- scripts/migrations/2026-05-19-ai-question-human-answer.sql
-- Adds ai_question (set by AI when blocking on human) and human_answer
-- (set by human when answering; never auto-cleared — permanent audit trail).
ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS ai_question  TEXT,
  ADD COLUMN IF NOT EXISTS human_answer TEXT;
```

- [ ] **Step 1.2 — Apply to mentolder**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec -i "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website < scripts/migrations/2026-05-19-ai-question-human-answer.sql
```

Expected output: `ALTER TABLE`

- [ ] **Step 1.3 — Verify mentolder columns exist**

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_schema='tickets' AND table_name='tickets'
   AND column_name IN ('ai_question','human_answer');"
```

Expected: 2 rows — `ai_question` and `human_answer`.

- [ ] **Step 1.4 — Apply to korczewski**

```bash
PGPOD_K=$(kubectl get pod -n workspace-korczewski --context korczewski -l app=shared-db -o name | head -1)
kubectl exec -i "$PGPOD_K" -n workspace-korczewski --context korczewski -- \
  psql -U website -d website < scripts/migrations/2026-05-19-ai-question-human-answer.sql
```

Expected: `ALTER TABLE`

- [ ] **Step 1.5 — Verify korczewski**

```bash
kubectl exec "$PGPOD_K" -n workspace-korczewski --context korczewski -- \
  psql -U website -d website -c \
  "SELECT column_name FROM information_schema.columns
   WHERE table_schema='tickets' AND table_name='tickets'
   AND column_name IN ('ai_question','human_answer');"
```

Expected: 2 rows.

- [ ] **Step 1.6 — Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit
git add scripts/migrations/2026-05-19-ai-question-human-answer.sql
git commit -m "chore(db): add ai_question + human_answer columns to tickets.tickets [T000029]"
```

---

## Task 2: Extend `ListedTicket` + `LIST_COLS` + `patchAdminTicket()`

**Files:**
- Modify: `website/src/lib/tickets/admin.ts`

- [ ] **Step 2.1 — Add fields to `ListedTicket` interface**

In `website/src/lib/tickets/admin.ts`, find the `ListedTicket` interface (around line 25).
After `updatedAt: Date;` add:

```ts
  aiQuestion:   string | null;
  humanAnswer:  string | null;
```

Full updated interface tail:
```ts
  createdAt: Date;
  updatedAt: Date;
  aiQuestion:   string | null;
  humanAnswer:  string | null;
}
```

- [ ] **Step 2.2 — Add columns to `LIST_COLS`**

In `LIST_COLS` (around line 130), find the last line before the closing backtick:
```ts
    t.created_at AS "createdAt", t.updated_at AS "updatedAt"
```

Replace with:
```ts
    t.created_at AS "createdAt", t.updated_at AS "updatedAt",
    t.ai_question AS "aiQuestion", t.human_answer AS "humanAnswer"
```

- [ ] **Step 2.3 — Add params to `patchAdminTicket()`**

Find the `patchAdminTicket(p: {...})` parameter block (around line 459). After `estimateMinutes?: number | null;` add:

```ts
  aiQuestion?:   string | null;
  humanAnswer?:  string | null;
```

Then find the push-calls block (around line 501, after `estimateMinutes` push). Add:

```ts
  if (p.aiQuestion   !== undefined) push('ai_question',  p.aiQuestion);
  if (p.humanAnswer  !== undefined) push('human_answer', p.humanAnswer);
```

- [ ] **Step 2.4 — Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `aiQuestion` or `humanAnswer`.

- [ ] **Step 2.5 — Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit
git add website/src/lib/tickets/admin.ts
git commit -m "feat(tickets): add aiQuestion/humanAnswer to ListedTicket + patchAdminTicket [T000029]"
```

---

## Task 3: Extend the PATCH API Endpoint

**Files:**
- Modify: `website/src/pages/api/admin/tickets/[id].ts`

- [ ] **Step 3.1 — Add fields to the `allowed` whitelist**

Find (around line 44):
```ts
  const allowed = ['title','description','notes','url','priority','severity','component',
                   'attentionMode', 'thesisTag','parentId','customerId','assigneeId','reporterEmail',
                   'startDate','dueDate','estimateMinutes'] as const;
```

Replace with:
```ts
  const allowed = ['title','description','notes','url','priority','severity','component',
                   'attentionMode', 'thesisTag','parentId','customerId','assigneeId','reporterEmail',
                   'startDate','dueDate','estimateMinutes',
                   'aiQuestion','humanAnswer'] as const;
```

- [ ] **Step 3.2 — Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3.3 — Quick smoke-test (needs a running cluster)**

```bash
# Pick any real ticket UUID from mentolder
TICKET_ID="<uuid-of-any-test-ticket>"
curl -sS -X PATCH "https://web.mentolder.de/api/admin/tickets/$TICKET_ID" \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin-session-cookie>" \
  -d '{"aiQuestion": "Is this a smoke test?"}' | jq .
```

Expected: `{"ok":true}`

_(Skip if no convenient session cookie; the TypeScript compile check is the gate.)_

- [ ] **Step 3.4 — Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit
git add website/src/pages/api/admin/tickets/[id].ts
git commit -m "feat(api): accept aiQuestion + humanAnswer in PATCH /admin/tickets/:id [T000029]"
```

---

## Task 4: Create `TicketsTableBody.svelte`

**Files:**
- Create: `website/src/components/admin/TicketsTableBody.svelte`

This component renders **all table rows** for `/admin/tickets`. It owns per-row state for status, attentionMode, and the answer draft.

- [ ] **Step 4.1 — Create the component**

Create `website/src/components/admin/TicketsTableBody.svelte` with the following full content:

```svelte
<script lang="ts">
  import type { ListedTicket, TicketStatus } from '../../lib/tickets/admin';

  type AttentionMode = 'auto' | 'ai_ready' | 'needs_human';

  interface RowState {
    status:        TicketStatus;
    attentionMode: AttentionMode;
    aiQuestion:    string | null;
    humanAnswer:   string | null;
    saving:        boolean;
    error:         string | null;
    answer:        string;
    answerSaving:  boolean;
    answerSaved:   boolean;
  }

  let {
    tickets = [],
    admins  = [],
  }: {
    tickets: ListedTicket[];
    admins:  { id: string; name: string }[];
  } = $props();

  // Initialise per-row state map from SSR-resolved ticket list
  const rows = $state(
    new Map<string, RowState>(
      tickets.map(t => [t.id, {
        status:        t.status,
        attentionMode: t.attentionMode,
        aiQuestion:    t.aiQuestion,
        humanAnswer:   t.humanAnswer,
        saving:        false,
        error:         null,
        answer:        '',
        answerSaving:  false,
        answerSaved:   false,
      }])
    )
  );

  function row(id: string): RowState {
    return rows.get(id)!;
  }

  function setRow(id: string, patch: Partial<RowState>) {
    const current = rows.get(id)!;
    rows.set(id, { ...current, ...patch });
  }

  // ── Status transition ───────────────────────────────────────────────────────
  async function patchStatus(ticketId: string, newStatus: TicketStatus) {
    const prev = row(ticketId).status;
    setRow(ticketId, { status: newStatus, saving: true, error: null });
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}/transition`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Fehler' }));
        setRow(ticketId, { status: prev, error: d.error ?? 'Fehler' });
      }
    } catch {
      setRow(ticketId, { status: prev, error: 'Verbindungsfehler' });
    } finally {
      setRow(ticketId, { saving: false });
    }
  }

  // ── Attention mode toggle ───────────────────────────────────────────────────
  async function patchAttentionMode(ticketId: string, mode: AttentionMode) {
    const prev = row(ticketId).attentionMode;
    setRow(ticketId, { attentionMode: mode, saving: true, error: null });
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ attentionMode: mode }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({ error: 'Fehler' }));
        setRow(ticketId, { attentionMode: prev, error: d.error ?? 'Fehler' });
      }
    } catch {
      setRow(ticketId, { attentionMode: prev, error: 'Verbindungsfehler' });
    } finally {
      setRow(ticketId, { saving: false });
    }
  }

  // ── Answer & back to AI-ready ───────────────────────────────────────────────
  async function submitAnswer(ticketId: string) {
    const answer = row(ticketId).answer.trim();
    if (!answer) return;
    setRow(ticketId, { answerSaving: true, error: null });
    try {
      const r = await fetch(`/api/admin/tickets/${ticketId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ humanAnswer: answer, attentionMode: 'ai_ready' }),
      });
      if (r.ok) {
        setRow(ticketId, {
          humanAnswer:   answer,
          attentionMode: 'ai_ready',
          answerSaved:   true,
          answer:        '',
        });
        setTimeout(() => setRow(ticketId, { answerSaved: false }), 1500);
      } else {
        const d = await r.json().catch(() => ({ error: 'Fehler' }));
        setRow(ticketId, { error: d.error ?? 'Fehler' });
      }
    } catch {
      setRow(ticketId, { error: 'Verbindungsfehler' });
    } finally {
      setRow(ticketId, { answerSaving: false });
    }
  }

  // ── Display helpers ─────────────────────────────────────────────────────────
  const STATUS_LABEL: Record<string, string> = {
    triage: 'Triage', backlog: 'Backlog', in_progress: 'In Arbeit',
    in_review: 'Review', blocked: 'Blockiert', done: 'Fertig', archived: 'Archiviert',
  };
  const STATUS_OPTIONS: TicketStatus[] = [
    'triage', 'backlog', 'in_progress', 'in_review', 'blocked', 'done', 'archived',
  ];
  const TYPE_LABEL: Record<string, string> = {
    bug: '🐛 Bug', feature: '✨ Feature', task: '📋 Task', project: '📁 Projekt',
  };
  const PRIO_CLS: Record<string, string> = {
    hoch: 'text-red-400', mittel: 'text-yellow-400', niedrig: 'text-green-400',
  };
  const PRIO_ICON: Record<string, string> = { hoch: '▲', mittel: '●', niedrig: '▼' };

  function formatDate(d: Date | null | string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
</script>

{#each tickets as t (t.id)}
  {@const rs = row(t.id)}
  {@const showWidget = rs.attentionMode === 'needs_human' && !!t.aiQuestion}

  <!-- Main ticket row -->
  <tr class="border-b border-dark-lighter/50 hover:bg-dark/30 transition-colors {rs.status === 'archived' ? 'opacity-50' : ''}">

    <!-- ID -->
    <td class="px-4 py-3 font-mono text-xs text-gold whitespace-nowrap align-top">
      <a href={`/admin/tickets/${t.id}`} class="hover:underline">
        {t.externalId ?? t.id.slice(0, 8)}
      </a>
    </td>

    <!-- Typ -->
    <td class="px-4 py-3 text-xs whitespace-nowrap align-top">
      {TYPE_LABEL[t.type] ?? t.type}
    </td>

    <!-- Titel + tags -->
    <td class="px-4 py-3 align-top">
      <div class="flex items-center gap-2 flex-wrap">
        <a href={`/admin/tickets/${t.id}`} class="text-light hover:text-gold text-sm font-medium">
          {t.title}
        </a>
      </div>
      {#if t.tagNames.length > 0}
        <div class="flex flex-wrap gap-1 mt-1">
          {#each t.tagNames as tag}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-dark border border-dark-lighter text-muted">
              {tag}
            </span>
          {/each}
        </div>
      {/if}
    </td>

    <!-- Status — inline select -->
    <td class="px-4 py-3 align-top">
      <div class="relative">
        <select
          value={rs.status}
          disabled={rs.saving}
          onchange={(e) => patchStatus(t.id, (e.currentTarget as HTMLSelectElement).value as TicketStatus)}
          class="appearance-none text-xs px-2 py-1 pr-6 rounded-full border bg-dark-light text-light cursor-pointer
                 border-dark-lighter hover:border-gold/40 transition-colors disabled:opacity-50
                 focus:outline-none focus:border-gold/60"
        >
          {#each STATUS_OPTIONS as s}
            <option value={s}>{STATUS_LABEL[s]}</option>
          {/each}
        </select>
        {#if rs.saving}
          <span class="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-muted animate-pulse">…</span>
        {/if}
      </div>
      {#if rs.error}
        <p class="text-[10px] text-red-400 mt-1">{rs.error}</p>
      {/if}
    </td>

    <!-- Prio -->
    <td class="px-4 py-3 text-sm whitespace-nowrap align-top {PRIO_CLS[t.priority] ?? ''}">
      {PRIO_ICON[t.priority]} {t.priority}
    </td>

    <!-- Zuständig -->
    <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">
      {t.assigneeLabel ?? '—'}
    </td>

    <!-- Kunde -->
    <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">
      {t.customerLabel ?? '—'}
    </td>

    <!-- Fällig -->
    <td class="px-4 py-3 text-sm text-muted whitespace-nowrap align-top">
      {formatDate(t.dueDate)}
    </td>

    <!-- AI/Human pill + Edit -->
    <td class="px-4 py-3 align-top">
      <div class="flex flex-col gap-2 items-end">

        <!-- 3-segment pill -->
        <div class="flex rounded-md border border-dark-lighter overflow-hidden text-[10px]">
          {#each [
            { mode: 'ai_ready'    as AttentionMode, label: '🤖', activeClass: 'bg-green-900/30 text-green-400'  },
            { mode: 'auto'        as AttentionMode, label: '⚙️', activeClass: 'bg-indigo-900/30 text-indigo-400'},
            { mode: 'needs_human' as AttentionMode, label: '👤', activeClass: 'bg-red-900/30 text-red-400'     },
          ] as seg}
            <button
              type="button"
              disabled={rs.saving}
              onclick={() => patchAttentionMode(t.id, seg.mode)}
              class="px-2 py-1 border-r border-dark-lighter last:border-r-0 transition-colors disabled:opacity-50
                     {rs.attentionMode === seg.mode ? seg.activeClass : 'text-muted hover:text-light bg-dark-light'}"
              title={seg.mode}
            >{seg.label}</button>
          {/each}
        </div>

        <!-- Edit button -->
        <button
          type="button"
          class="quick-edit-btn text-xs px-2 py-1 bg-dark-lighter border border-dark-border rounded
                 hover:border-gold/40 hover:text-gold transition-colors"
          data-ticket={JSON.stringify(t)}
        >✏️ Edit</button>

      </div>
    </td>
  </tr>

  <!-- Answer widget row — only for needs_human + ai_question -->
  {#if showWidget}
    <tr class="border-b border-dark-lighter/50 bg-red-950/10">
      <td colspan="9" class="px-6 py-3">
        <div class="flex flex-col gap-2 max-w-2xl">

          <!-- AI question block -->
          <div class="rounded-lg border border-red-800/40 bg-red-900/10 px-4 py-3">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-red-400 mb-1">🤖 KI-Frage</p>
            <p class="text-sm text-red-200 leading-relaxed">{t.aiQuestion}</p>
            {#if rs.humanAnswer}
              <p class="text-[10px] text-muted mt-2 italic">Letzte Antwort: {rs.humanAnswer}</p>
            {/if}
          </div>

          <!-- Answer textarea + submit -->
          <div class="flex gap-2 items-end">
            <textarea
              bind:value={rs.answer}
              rows="2"
              placeholder="Antwort eingeben…"
              disabled={rs.answerSaving}
              class="flex-1 px-3 py-2 text-sm bg-dark border border-dark-lighter rounded-lg text-light
                     resize-none focus:outline-none focus:border-green-600/60 disabled:opacity-50"
            ></textarea>
            <button
              type="button"
              disabled={rs.answerSaving || !rs.answer.trim()}
              onclick={() => submitAnswer(t.id)}
              class="px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap
                     {rs.answerSaved
                       ? 'bg-green-900/30 border-green-700 text-green-400'
                       : 'bg-dark-lighter border-dark-border text-light hover:border-green-700 hover:text-green-400'}
                     disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {rs.answerSaving ? '…' : rs.answerSaved ? '✓ Gespeichert' : '✓ Antworten → 🤖'}
            </button>
          </div>

        </div>
      </td>
    </tr>
  {/if}
{/each}
```

- [ ] **Step 4.2 — Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4.3 — Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit
git add website/src/components/admin/TicketsTableBody.svelte
git commit -m "feat(tickets): add TicketsTableBody Svelte island with inline status/AI/answer widgets [T000029]"
```

---

## Task 5: Wire Up `TicketsTableBody` in `tickets.astro`

**Files:**
- Modify: `website/src/pages/admin/tickets.astro`

- [ ] **Step 5.1 — Add import**

In the Astro frontmatter (between `---`), the existing imports already include `TicketQuickEdit`. Add directly below it:

```ts
import TicketsTableBody from '../../components/admin/TicketsTableBody.svelte';
```

- [ ] **Step 5.2 — Replace the table body loop**

Find the entire `<tbody>` block in `tickets.astro` (from `<tbody>` to `</tbody>`, currently around lines 246–308). Replace it with:

```astro
<tbody>
  <TicketsTableBody
    client:load
    tickets={tickets}
    admins={admins}
  />
</tbody>
```

Note: the `<script>` block at the bottom of `tickets.astro` still mounts `TicketQuickEdit` on `.quick-edit-btn` clicks — this **stays unchanged** because `TicketsTableBody` still emits those buttons with `data-ticket={JSON.stringify(t)}`.

- [ ] **Step 5.3 — Remove now-unused inline helpers**

In the Astro frontmatter, the following are no longer used by the template (they were only for the deleted `tickets.map()` body). Remove them:

```ts
// DELETE these — now handled inside TicketsTableBody.svelte:
const STATUS_LABEL: Record<string, string> = { ... };
const STATUS_CLS:   Record<string, string> = { ... };
const TYPE_LABEL:   Record<string, string> = { ... };
const PRIO_CLS:     Record<string, string> = { ... };
const PRIO_ICON:    Record<string, string> = { ... };
function formatDate(...) { ... }
```

Keep `SAVED_VIEWS`, `buildLink`, `filters`, and all other frontmatter that still feeds the filter form and page header.

- [ ] **Step 5.4 — Verify TypeScript compiles**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit/website
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 5.5 — Smoke-test locally**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit/website
npm run dev
```

Open `http://localhost:4321/admin/tickets`. Verify:
- Ticket rows render (same as before)
- Status column shows a dropdown instead of a static badge
- AI/Human pill (🤖/⚙️/👤) appears in the action column
- Clicking a pill segment fires a PATCH and the pill highlights
- Changing a status dropdown fires the transition and the dropdown updates without reload
- For any ticket manually set to `needs_human` via the pill + having `ai_question` set: answer widget expands below the row
- ✏️ Edit button still opens the `TicketQuickEdit` modal

- [ ] **Step 5.6 — Commit**

```bash
cd /home/patrick/Bachelorprojekt/.claude/worktrees/ticket-inline-edit
git add website/src/pages/admin/tickets.astro
git commit -m "feat(tickets): wire TicketsTableBody island into /admin/tickets [T000029]"
```

---

## Task 6: Deploy + Verify Live

- [ ] **Step 6.1 — Deploy to both clusters**

```bash
cd /home/patrick/Bachelorprojekt
task feature:website
```

Expected: build succeeds, both `web.mentolder.de` and `web.korczewski.de` pods roll.

- [ ] **Step 6.2 — Smoke-test live: status change**

1. Open `https://web.mentolder.de/admin/tickets`
2. Pick any open ticket — change its status via the dropdown
3. Verify: no page reload, dropdown reflects new value, no error message

- [ ] **Step 6.3 — Smoke-test live: AI/Human pill**

1. Click `👤` on any ticket → verify PATCH fires, pill highlights red
2. Click `🤖` → verify pill turns green, no page reload

- [ ] **Step 6.4 — Smoke-test live: answer widget**

```bash
# Set a test ticket to needs_human + add an ai_question via psql
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -c \
  "UPDATE tickets.tickets
   SET attention_mode = 'needs_human',
       ai_question = 'Soll die Komponente X oder Y verwendet werden?'
   WHERE external_id = 'T000029';"
```

1. Reload `/admin/tickets`
2. Verify T000029 row shows the answer widget below it
3. Type an answer and click "✓ Antworten → 🤖"
4. Verify: widget collapses, pill turns 🤖, row no longer red-tinted

- [ ] **Step 6.5 — Reset test ticket**

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- psql -U website -d website -c \
  "UPDATE tickets.tickets
   SET attention_mode = 'auto', ai_question = NULL, human_answer = NULL
   WHERE external_id = 'T000029';"
```

---

## Self-Review

**Spec coverage:**
- ✅ DB: `ai_question` + `human_answer` columns — Task 1
- ✅ `ListedTicket` + `LIST_COLS` + `patchAdminTicket()` — Task 2
- ✅ API PATCH whitelist — Task 3
- ✅ Inline status `<select>` per row — Task 4 (`TicketsTableBody`)
- ✅ 3-pill AI/Human toggle — Task 4
- ✅ Answer widget (reads `aiQuestion`, saves `humanAnswer`, flips to `ai_ready`) — Task 4
- ✅ `humanAnswer` shown as "Letzte Antwort" on re-open — Task 4 (line in answer widget)
- ✅ Modal (✏️ Edit) unchanged — Task 5 note, `quick-edit-btn` wiring preserved
- ✅ Both clusters — Task 1 (migration) + Task 6 (deploy)

**Placeholder scan:** No TBDs. All code blocks are complete.

**Type consistency:**
- `AttentionMode` defined in Task 4 and used throughout that component only — consistent.
- `TicketStatus` imported from `admin.ts` — same type used in `patchStatus()` and the select options.
- `rs.answer` (textarea draft) vs `humanAnswer` (saved) — distinct names, no confusion.
- `data-ticket={JSON.stringify(t)}` uses the full `ListedTicket` — same shape as the existing `quick-edit-btn` handler expects — consistent.
