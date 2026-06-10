# Qualitätssicherungs-Stufe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QS-Abnahme als 5. Spalte im Factory Floor — Tickets wechseln nach Deploy zu `qa_review`, der Admin prüft per Checklisten-Modal und nimmt ab (→ `done`) oder schickt mit Feedback zurück (→ `in_progress` + factory_injection).

**Architecture:** Neuer DB-Status `qa_review` + Tabelle `tickets.qa_reviews`. DAL `qa-dal.ts` kapselt alle Queries. Drei Admin-API-Endpunkte. Zwei neue Svelte-Komponenten (`QaChip`, `QaModal`), integriert in `FactoryFloor.svelte`. Pipeline.js und ticket.sh setzen nach Deploy auf `qa_review` statt `done`.

**Tech Stack:** PostgreSQL, Astro API Routes, Svelte 5, Playwright E2E, BATS

---

## Dateiübersicht

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `website/src/lib/tickets-db.ts` | Modify | `qa_review` in Status-Constraint + `qa_reviews` Tabelle anlegen |
| `website/src/lib/qa-dal.ts` | Create | DAL: `getQaQueue`, `createQaReview`, `QA_CRITERIA` |
| `website/src/pages/api/admin/qa-queue.ts` | Create | GET: Tickets mit `status = qa_review` |
| `website/src/pages/api/admin/qa-reviews.ts` | Create | POST: Abnahme oder Ablehnung verarbeiten |
| `website/src/pages/api/admin/qa-criteria.ts` | Create | GET: globale Kriterienliste |
| `website/src/components/QaChip.svelte` | Create | Chip-Komponente mit Farbe+Badge |
| `website/src/components/QaModal.svelte` | Create | Modal mit Checkliste, Textarea, Phase-Selector |
| `website/src/components/FactoryFloor.svelte` | Modify | 5. Spalte + Modal-Host + API-Aufruf |
| `scripts/factory/pipeline.js` | Modify | `status done` → `qa_review` nach Deploy |
| `scripts/ticket.sh` | Modify | `qa_review` nicht `done_at` setzen, slot behalten |
| `tests/e2e/specs/fa-qa-review.spec.ts` | Create | E2E: FA-QS-01 bis FA-QS-06 |

---

## Task 1: DB-Schema — Status-Constraint + qa_reviews Tabelle

**Files:**
- Modify: `website/src/lib/tickets-db.ts`

- [ ] **Schritt 1: Failing-Test schreiben**

Neue Datei `tests/e2e/specs/fa-qa-review.spec.ts` anlegen:

```typescript
import { test, expect } from '@playwright/test';

// FA-QS-01: Ticket mit status=qa_review erscheint in der 5. Spalte
test.describe('QS-Abnahme', () => {
  test('FA-QS-01 qa_review Ticket erscheint in QS-Spalte', async ({ page }) => {
    await page.route('**/api/admin/qa-queue', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [
          { extId: 'T000099', title: 'Smoke QS', prNumber: 1234, deployedAt: new Date().toISOString(), lastReview: null }
        ]}),
      })
    );
    await page.route('**/api/factory-floor', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        control: { killSwitch: false, slotsUsed: 0, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
        metrics: { shippedToday: 0, avgCycleH: null },
        loadingDock: [], hall: [], shipped: [], fetchedAt: new Date().toISOString(),
      })})
    );
    await page.goto('/dev-status');
    await expect(page.getByTestId('floor-qa')).toBeVisible();
    await expect(page.getByTestId('qa-chip-T000099')).toBeVisible();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — muss FAIL sein**

```bash
cd tests/e2e && npx playwright test fa-qa-review.spec.ts --project=website 2>&1 | tail -20
```
Erwartetes Ergebnis: `Error: locator.toBeVisible: Timeout` (Elemente existieren noch nicht)

- [ ] **Schritt 3: Status-Constraint erweitern**

In `website/src/lib/tickets-db.ts`, die bestehenden Zeilen:
```typescript
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('triage','planning','plan_staged','backlog','in_progress','in_review','blocked','done','archived'))
  `);
```
ersetzen durch:
```typescript
  await pool.query(`ALTER TABLE tickets.tickets DROP CONSTRAINT IF EXISTS tickets_status_check`);
  await pool.query(`
    ALTER TABLE tickets.tickets ADD CONSTRAINT tickets_status_check
      CHECK (status IN ('triage','planning','plan_staged','backlog','in_progress','in_review','blocked','qa_review','done','archived'))
  `);
```

- [ ] **Schritt 4: qa_reviews Tabelle in `initTicketsSchema` einhängen**

Am Ende von `initTicketsSchema()` in `website/src/lib/tickets-db.ts` anhängen (nach dem letzten `await pool.query`):

```typescript
  // QS-Abnahme [qualitaetssicherung]: menschliche Abnahme-Stufe zwischen deploy und done.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets.qa_reviews (
      id             BIGSERIAL PRIMARY KEY,
      ticket_id      UUID NOT NULL REFERENCES tickets.tickets(id) ON DELETE CASCADE,
      criteria       JSONB NOT NULL,
      notes          TEXT,
      verdict        TEXT NOT NULL CHECK (verdict IN ('approved','rejected')),
      re_entry_phase TEXT CHECK (re_entry_phase IN ('scout','implement','verify')),
      reviewed_by    TEXT NOT NULL DEFAULT 'admin',
      reviewed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS qa_reviews_ticket_idx ON tickets.qa_reviews (ticket_id)`);
```

- [ ] **Schritt 5: Commit**

```bash
git add website/src/lib/tickets-db.ts tests/e2e/specs/fa-qa-review.spec.ts
git commit -m "feat(qs): db-schema — qa_review status + qa_reviews table"
```

---

## Task 2: QA DAL

**Files:**
- Create: `website/src/lib/qa-dal.ts`

- [ ] **Schritt 1: Datei anlegen**

```typescript
// website/src/lib/qa-dal.ts
import { pool } from './website-db';

export const QA_CRITERIA = [
  { key: 'spec_match',    label: 'Feature verhält sich wie spezifiziert' },
  { key: 'no_regression', label: 'Keine sichtbaren Regressions' },
  { key: 'responsive',    label: 'Mobile / Responsive OK' },
  { key: 'performance',   label: 'Ladezeit akzeptabel' },
  { key: 'copy',          label: 'Texte / Übersetzungen korrekt' },
] as const;

export type CriterionKey = (typeof QA_CRITERIA)[number]['key'];

export interface CriterionResult { key: string; label: string; passed: boolean; }

export interface QaItem {
  ticketId: string;
  extId: string;
  title: string;
  prNumber: number | null;
  deployedAt: string | null;
  lastReview: { criteria: CriterionResult[]; notes: string | null } | null;
}

export interface QaReviewInput {
  ticketId: string;
  criteria: { key: string; passed: boolean }[];
  notes?: string;
  verdict: 'approved' | 'rejected';
  re_entry_phase?: 'scout' | 'implement' | 'verify';
}

/** Returns all tickets currently awaiting QS review. */
export async function getQaQueue(): Promise<QaItem[]> {
  const r = await pool.query<{
    ticket_id: string; ext_id: string; title: string;
    pr_number: number | null; deployed_at: string | null;
    last_criteria: CriterionResult[] | null; last_notes: string | null;
  }>(`
    SELECT
      t.id            AS ticket_id,
      t.external_id   AS ext_id,
      t.title,
      tl.pr_number,
      pe.at           AS deployed_at,
      qr.criteria     AS last_criteria,
      qr.notes        AS last_notes
    FROM tickets.tickets t
    LEFT JOIN ticket_links tl ON tl.ticket_id = t.id AND tl.pr_number IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT at FROM tickets.factory_phase_events
      WHERE ticket_id = t.id AND phase = 'deploy' AND state = 'done'
      ORDER BY at DESC LIMIT 1
    ) pe ON true
    LEFT JOIN LATERAL (
      SELECT criteria, notes FROM tickets.qa_reviews
      WHERE ticket_id = t.id
      ORDER BY reviewed_at DESC LIMIT 1
    ) qr ON true
    WHERE t.status = 'qa_review'
    ORDER BY pe.at ASC NULLS LAST
  `);
  return r.rows.map((row) => ({
    ticketId: row.ticket_id,
    extId: row.ext_id,
    title: row.title,
    prNumber: row.pr_number ?? null,
    deployedAt: row.deployed_at ? new Date(row.deployed_at).toISOString() : null,
    lastReview: row.last_criteria
      ? { criteria: row.last_criteria, notes: row.last_notes ?? null }
      : null,
  }));
}

/** Approve or reject a ticket. Runs in a transaction. */
export async function createQaReview(input: QaReviewInput): Promise<void> {
  const criteriaSnapshot: CriterionResult[] = QA_CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    passed: input.criteria.find((r) => r.key === c.key)?.passed ?? false,
  }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tickets.qa_reviews (ticket_id, criteria, notes, verdict, re_entry_phase)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.ticketId, JSON.stringify(criteriaSnapshot), input.notes ?? null,
       input.verdict, input.re_entry_phase ?? null],
    );

    if (input.verdict === 'approved') {
      await client.query(
        `UPDATE tickets.tickets
         SET status = 'done', done_at = now(), pipeline_slot = NULL
         WHERE id = $1`,
        [input.ticketId],
      );
    } else {
      await client.query(
        `UPDATE tickets.tickets SET status = 'in_progress' WHERE id = $1`,
        [input.ticketId],
      );
      const failedLabels = criteriaSnapshot
        .filter((c) => !c.passed)
        .map((c) => `- ${c.label}`)
        .join('\n');
      const content = `QS-Abnahme fehlgeschlagen.\n\nNicht bestanden:\n${failedLabels}${input.notes ? `\n\nKommentar: ${input.notes}` : ''}`;
      await client.query(
        `INSERT INTO tickets.ticket_injections
           (ticket_id, phase, kind, title, content, injected_by)
         VALUES ($1, $2, 'note', 'QS-Feedback', $3, 'qa-admin')`,
        [input.ticketId, input.re_entry_phase ?? 'implement', content],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Schritt 2: TypeScript-Compile prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep qa-dal
```
Erwartetes Ergebnis: keine Ausgabe (kein Fehler)

- [ ] **Schritt 3: Commit**

```bash
git add website/src/lib/qa-dal.ts
git commit -m "feat(qs): qa-dal — getQaQueue + createQaReview + QA_CRITERIA"
```

---

## Task 3: API-Endpunkte

**Files:**
- Create: `website/src/pages/api/admin/qa-queue.ts`
- Create: `website/src/pages/api/admin/qa-reviews.ts`
- Create: `website/src/pages/api/admin/qa-criteria.ts`

- [ ] **Schritt 1: qa-criteria.ts anlegen**

```typescript
// website/src/pages/api/admin/qa-criteria.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { QA_CRITERIA } from '../../../lib/qa-dal';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ criteria: QA_CRITERIA }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Schritt 2: qa-queue.ts anlegen**

```typescript
// website/src/pages/api/admin/qa-queue.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { getQaQueue } from '../../../lib/qa-dal';

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  try {
    const items = await getQaQueue();
    return new Response(JSON.stringify({ items }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Schritt 3: qa-reviews.ts anlegen**

```typescript
// website/src/pages/api/admin/qa-reviews.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { createQaReview } from '../../../lib/qa-dal';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { ticket_id, criteria, notes, verdict, re_entry_phase } = body ?? {};

  if (!ticket_id || !Array.isArray(criteria) || !verdict)
    return new Response(JSON.stringify({ error: 'ticket_id, criteria, verdict required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (!['approved', 'rejected'].includes(verdict))
    return new Response(JSON.stringify({ error: 'verdict must be approved or rejected' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (verdict === 'rejected' && !notes?.trim())
    return new Response(JSON.stringify({ error: 'notes required when rejecting' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (verdict === 'rejected' && !re_entry_phase)
    return new Response(JSON.stringify({ error: 're_entry_phase required when rejecting' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  try {
    await createQaReview({ ticketId: ticket_id, criteria, notes, verdict, re_entry_phase });
    return new Response(JSON.stringify({ ok: true }), {
      status: 201, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Schritt 4: TypeScript-Compile prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "qa-"
```
Erwartetes Ergebnis: keine Ausgabe

- [ ] **Schritt 5: Commit**

```bash
git add website/src/pages/api/admin/qa-criteria.ts \
        website/src/pages/api/admin/qa-queue.ts \
        website/src/pages/api/admin/qa-reviews.ts
git commit -m "feat(qs): admin API endpoints — qa-queue, qa-reviews, qa-criteria"
```

---

## Task 4: QaChip.svelte

**Files:**
- Create: `website/src/components/QaChip.svelte`

- [ ] **Schritt 1: Komponente anlegen**

```svelte
<!-- website/src/components/QaChip.svelte -->
<script lang="ts">
  import type { QaItem } from '../lib/qa-dal';

  export let item: QaItem;
  export let isActive: boolean = false;
  export let draftCount: number = 0; // wie viele Checkboxen im Draft gecheckt sind

  const CRITERIA_TOTAL = 5;

  function relTime(iso: string | null): string {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)} Min.`;
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
</script>

<button
  class="qa-chip"
  class:active={isActive}
  data-testid="qa-chip-{item.extId}"
  on:click
  title="{item.title}{item.deployedAt ? ` · vor ${relTime(item.deployedAt)}` : ''}"
>
  <span class="ext-id">{item.extId}</span>
  <span class="badge">{draftCount}/{CRITERIA_TOTAL}</span>
</button>

<style>
  .qa-chip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: monospace;
    cursor: pointer;
    border: 1px solid transparent;
    background: #f0c040;
    color: #000;
    transition: opacity 0.15s;
  }
  .qa-chip.active {
    background: #6366f1;
    color: #fff;
    border-color: #818cf8;
  }
  .badge {
    font-size: 9px;
    background: rgba(0, 0, 0, 0.18);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: monospace;
  }
</style>
```

- [ ] **Schritt 2: TypeScript-Compile prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep QaChip
```
Erwartetes Ergebnis: keine Ausgabe

- [ ] **Schritt 3: Commit**

```bash
git add website/src/components/QaChip.svelte
git commit -m "feat(qs): QaChip — Farbe+Badge Chip-Komponente"
```

---

## Task 5: QaModal.svelte

**Files:**
- Create: `website/src/components/QaModal.svelte`

- [ ] **Schritt 1: Komponente anlegen**

```svelte
<!-- website/src/components/QaModal.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { QaItem } from '../lib/qa-dal';

  export let item: QaItem;
  export let criteria: { key: string; label: string }[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    submitted: { verdict: 'approved' | 'rejected' };
  }>();

  // Draft-State — lebt nur im Speicher
  let checked: Record<string, boolean> = {};
  let notes = '';
  let reEntryPhase: 'implement' | 'verify' | 'scout' = 'implement';
  let submitting = false;
  let error = '';

  // Bei Re-Review: letztes Review als Vorausfüllung
  $: if (item.lastReview) {
    for (const c of item.lastReview.criteria) checked[c.key] = c.passed;
    notes = item.lastReview.notes ?? '';
  }

  $: checkedCount = criteria.filter((c) => checked[c.key]).length;
  $: anyUnchecked = criteria.some((c) => !checked[c.key]);
  $: allChecked = criteria.length > 0 && criteria.every((c) => checked[c.key]);
  $: canApprove = allChecked && !submitting;
  $: canReject = anyUnchecked && notes.trim().length > 0 && !submitting;

  function relTime(iso: string | null): string {
    if (!iso) return '?';
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return `${Math.floor(diff / 60000)} Min.`;
    if (h < 24) return `${h} Std.`;
    return `${Math.floor(h / 24)} Tage`;
  }

  async function submit(verdict: 'approved' | 'rejected') {
    submitting = true;
    error = '';
    try {
      const res = await fetch('/api/admin/qa-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: item.ticketId,
          criteria: criteria.map((c) => ({ key: c.key, passed: !!checked[c.key] })),
          notes: notes || undefined,
          verdict,
          re_entry_phase: verdict === 'rejected' ? reEntryPhase : undefined,
        }),
      });
      if (!res.ok) {
        const { error: e } = await res.json();
        throw new Error(e ?? 'Unbekannter Fehler');
      }
      dispatch('submitted', { verdict });
      dispatch('close');
    } catch (err: any) {
      error = err.message;
    } finally {
      submitting = false;
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="overlay" on:click|self={() => dispatch('close')} data-testid="qa-modal-overlay">
  <div class="modal" data-testid="qa-modal">
    <header>
      <div class="header-left">
        <span class="ext-id">{item.extId}</span>
        <span class="title">{item.title}</span>
        {#if item.prNumber}
          <a href="https://github.com/Paddione/Bachelorprojekt/pull/{item.prNumber}"
             target="_blank" rel="noopener" class="pr-link">PR #{item.prNumber}</a>
        {/if}
      </div>
      <div class="header-right">
        {#if item.deployedAt}
          <span class="age">vor {relTime(item.deployedAt)}</span>
        {/if}
        <button class="close-btn" on:click={() => dispatch('close')} aria-label="Schließen">✕</button>
      </div>
    </header>

    <section class="checklist" data-testid="qa-checklist">
      <div class="section-label">Abnahme-Kriterien</div>
      {#if item.lastReview}
        <p class="re-review-hint">Vorheriges Review: {item.lastReview.notes ?? '–'}</p>
      {/if}
      {#each criteria as c}
        <label class="criterion">
          <input
            type="checkbox"
            bind:checked={checked[c.key]}
            data-testid="qa-criterion-{c.key}"
          />
          <span>{c.label}</span>
        </label>
      {/each}
    </section>

    {#if anyUnchecked}
      <section class="feedback">
        <div class="section-label">Kommentar <span class="required">*</span></div>
        <textarea
          bind:value={notes}
          placeholder="Was muss behoben werden?"
          data-testid="qa-notes"
          rows="3"
        ></textarea>

        <div class="section-label phase-label">Zurück in Pipeline bei Phase</div>
        <select bind:value={reEntryPhase} data-testid="qa-phase-select">
          <option value="implement">implement — neu bauen</option>
          <option value="verify">verify — nochmal prüfen</option>
          <option value="scout">scout — neu scopen</option>
        </select>
      </section>
    {/if}

    {#if error}
      <p class="error-msg">{error}</p>
    {/if}

    <footer>
      <span class="progress">{checkedCount}/{criteria.length} bestanden</span>
      <div class="actions">
        <button
          class="btn btn-reject"
          disabled={!canReject}
          on:click={() => submit('rejected')}
          data-testid="qa-btn-reject"
        >↺ Zurückschicken</button>
        <button
          class="btn btn-approve"
          disabled={!canApprove}
          on:click={() => submit('approved')}
          data-testid="qa-btn-approve"
        >✓ Abnehmen</button>
      </div>
    </footer>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center; z-index: 50;
  }
  .modal {
    background: #1a2035; border: 1px solid #22c55e; border-radius: 6px;
    padding: 20px; width: min(560px, 95vw); max-height: 90vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 14px;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .header-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .ext-id { font-family: monospace; font-size: 13px; color: #f0c040; }
  .title { font-weight: 600; font-size: 14px; }
  .pr-link { font-size: 11px; color: #6366f1; text-decoration: none; }
  .pr-link:hover { text-decoration: underline; }
  .header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .age { font-size: 11px; color: #8892a4; }
  .close-btn { background: none; border: none; color: #8892a4; cursor: pointer; font-size: 16px; }
  .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #8892a4; margin-bottom: 6px; }
  .required { color: #ef4444; }
  .re-review-hint { font-size: 11px; color: #8892a4; background: rgba(255,255,255,0.05); padding: 6px 8px; border-radius: 3px; margin-bottom: 8px; }
  .criterion { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; font-size: 13px; }
  .criterion input { accent-color: #22c55e; width: 15px; height: 15px; }
  .feedback { display: flex; flex-direction: column; gap: 6px; }
  .phase-label { margin-top: 8px; }
  textarea {
    background: #0d1117; border: 1px solid #333; border-radius: 4px;
    color: #e6edf3; font-size: 12px; padding: 8px; resize: vertical; width: 100%; box-sizing: border-box;
  }
  select {
    background: #0d1117; border: 1px solid #333; border-radius: 4px;
    color: #e6edf3; font-size: 12px; padding: 6px; width: 100%;
  }
  .error-msg { color: #ef4444; font-size: 12px; }
  footer { display: flex; justify-content: space-between; align-items: center; }
  .progress { font-size: 11px; color: #8892a4; }
  .actions { display: flex; gap: 8px; }
  .btn { border: none; border-radius: 4px; padding: 7px 14px; font-size: 12px; cursor: pointer; font-weight: 600; }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .btn-approve { background: #22c55e; color: #000; }
  .btn-reject { background: #ef4444; color: #fff; }
</style>
```

- [ ] **Schritt 2: TypeScript-Compile prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep QaModal
```
Erwartetes Ergebnis: keine Ausgabe

- [ ] **Schritt 3: Commit**

```bash
git add website/src/components/QaModal.svelte
git commit -m "feat(qs): QaModal — Checkliste, Textarea, Phase-Selector, Approve/Reject"
```

---

## Task 6: FactoryFloor — 5. Spalte integrieren

**Files:**
- Modify: `website/src/components/FactoryFloor.svelte`

- [ ] **Schritt 1: Imports ergänzen**

Am Anfang des `<script>`-Blocks in `FactoryFloor.svelte` folgende Imports hinzufügen:

```svelte
import QaChip from './QaChip.svelte';
import QaModal from './QaModal.svelte';
import type { QaItem, CriterionResult } from '../lib/qa-dal';
```

- [ ] **Schritt 2: State-Variablen hinzufügen**

Im `<script>`-Block nach den bestehenden `$state`-Variablen (FactoryFloor nutzt Svelte 5):

```svelte
let qaItems = $state<QaItem[]>([]);
let qaCriteria = $state<{ key: string; label: string }[]>([]);
let qaModalItem = $state<QaItem | null>(null);
```

- [ ] **Schritt 3: refresh()-Funktion erweitern**

Die bestehende `refresh()`-Funktion (fetcht `/api/factory-floor`) um parallele QA-Fetches ergänzen:

```svelte
async function refresh() {
  try {
    const [floorRes, qaRes, criteriaRes] = await Promise.all([
      fetch('/api/factory-floor', { credentials: 'same-origin' }),
      fetch('/api/admin/qa-queue', { credentials: 'same-origin' }),
      fetch('/api/admin/qa-criteria', { credentials: 'same-origin' }),
    ]);
    if (!floorRes.ok) { stale = true; return; }
    data = await floorRes.json() as FloorPayload;
    stale = false;
    if (qaRes.ok) { const { items } = await qaRes.json(); qaItems = items ?? []; }
    if (criteriaRes.ok) { const { criteria } = await criteriaRes.json(); qaCriteria = criteria ?? []; }
  } catch { stale = true; }
}
```

- [ ] **Schritt 4: 5. Spalte im Template hinzufügen**

Nach dem bestehenden `<!-- ④ Versand -->` Panel im Template:

```svelte
<!-- ⑤ QS-Abnahme -->
<div class="panel" data-testid="floor-qa">
  <h3 class="font-semibold mb-2">QS-Abnahme</h3>
  {#if qaItems.length === 0}
    <p class="text-muted text-sm">Keine Tickets warten auf Abnahme.</p>
  {:else}
    <div class="chips">
      {#each qaItems as item (item.extId)}
        <QaChip
          {item}
          isActive={qaModalItem?.extId === item.extId}
          draftCount={qaDraftCounts[item.extId] ?? 0}
          on:click={() => { qaModalItem = item; }}
        />
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Schritt 5: Modal-Host und Handler hinzufügen**

Am Ende des `<template>`, direkt vor dem schließenden `</div>` des äußersten Floor-Containers:

```svelte
{#if qaModalItem}
  <QaModal
    item={qaModalItem}
    criteria={qaCriteria}
    on:close={() => { qaModalItem = null; }}
    on:submitted={() => { qaModalItem = null; load(); }}
  />
{/if}
```

- [ ] **Schritt 6: Draft-Count Tracking — Callback von QaModal einbinden**

`QaModal` dispatcht kein laufendes Count-Event, weil der Draft nur im Modal lebt. Der Badge-Count bleibt `0/5` solange das Modal geschlossen ist — das ist gewollt (zeigt "noch nicht geprüft"). Nach dem Schließen wird `refresh()` aufgerufen — das ist ausreichend.

- [ ] **Schritt 7: TypeScript-Compile prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep FactoryFloor
```
Erwartetes Ergebnis: keine Ausgabe

- [ ] **Schritt 8: Commit**

```bash
git add website/src/components/FactoryFloor.svelte
git commit -m "feat(qs): FactoryFloor — 5. Spalte QS-Abnahme + QaModal-Host"
```

---

## Task 7: Pipeline-Integration

**Files:**
- Modify: `scripts/factory/pipeline.js`
- Modify: `scripts/ticket.sh`

- [ ] **Schritt 1: pipeline.js — deploy → qa_review**

In `scripts/factory/pipeline.js`, Zeile ~567. Die Zeile:

```bash
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status done --resolution shipped
```

ersetzen durch:

```bash
      bash ${REPO}/scripts/ticket.sh update-status --id ${A.ticket_id} --status qa_review
```

Den Block mit `archive-plan` und den Feature-Flag-Seeds danach NICHT entfernen — die laufen weiterhin, aber `done_at` wird erst beim QS-Approve gesetzt.

- [ ] **Schritt 2: ticket.sh — qa_review beachten**

In `scripts/ticket.sh`, die UPDATE-Query (Zeilen ~123–129). Aktuell:

```sql
  done_at = CASE WHEN :'status' = 'done' THEN now() ELSE done_at END,
  pipeline_slot = CASE WHEN :'status' IN ('done','archived') THEN NULL ELSE pipeline_slot END,
```

Unverändert lassen — `qa_review` setzt weder `done_at` noch löscht es `pipeline_slot`. Der Slot bleibt erhalten damit das Ticket im Floor weiter als "belegt" zählt. Das ist korrekt, kein Change nötig.

- [ ] **Schritt 3: Verifizieren dass ticket.sh qa_review erlaubt**

```bash
grep "CHECK.*status\|status.*CHECK\|status.*valid\|valid.*status" scripts/ticket.sh | head -5
```

Falls ticket.sh einen expliziten Status-Whitelist hat, `qa_review` dort ergänzen. Falls nicht (die Validierung liegt in der DB), kein Change nötig.

- [ ] **Schritt 4: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "feat(qs): pipeline — deploy setzt qa_review statt done"
```

---

## Task 8: E2E-Tests (FA-QS-01 bis FA-QS-06)

**Files:**
- Modify: `tests/e2e/specs/fa-qa-review.spec.ts`

- [ ] **Schritt 1: Vollständige Test-Datei schreiben**

```typescript
// tests/e2e/specs/fa-qa-review.spec.ts
import { test, expect } from '@playwright/test';

const MOCK_ITEM = {
  ticketId: 'mock-uuid-0001',
  extId: 'T000099',
  title: 'Smoke QS Dark Mode',
  prNumber: 1234,
  deployedAt: new Date(Date.now() - 7200000).toISOString(), // vor 2h
  lastReview: null,
};

const MOCK_CRITERIA = [
  { key: 'spec_match',    label: 'Feature verhält sich wie spezifiziert' },
  { key: 'no_regression', label: 'Keine sichtbaren Regressions' },
  { key: 'responsive',    label: 'Mobile / Responsive OK' },
  { key: 'performance',   label: 'Ladezeit akzeptabel' },
  { key: 'copy',          label: 'Texte / Übersetzungen korrekt' },
];

async function setupMocks(page: any, qaItems = [MOCK_ITEM]) {
  await page.route('**/api/factory-floor', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      control: { killSwitch: false, slotsUsed: 0, slotsCap: 4, dailyCap: 5, dailyUsed: 0, dryRun: false, watchdogStale: 0 },
      metrics: { shippedToday: 0, avgCycleH: null },
      loadingDock: [], hall: [], shipped: [], fetchedAt: new Date().toISOString(),
    })}),
  );
  await page.route('**/api/admin/qa-queue', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: qaItems }) }),
  );
  await page.route('**/api/admin/qa-criteria', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ criteria: MOCK_CRITERIA }) }),
  );
}

test.describe('FA-QS: QS-Abnahme', () => {
  test('FA-QS-01 Ticket mit qa_review erscheint in QS-Spalte', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    await expect(page.getByTestId('floor-qa')).toBeVisible();
    await expect(page.getByTestId('qa-chip-T000099')).toBeVisible();
  });

  test('FA-QS-02 Modal öffnet sich beim Klick und zeigt 5 Checkboxen', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    await expect(page.getByTestId('qa-modal')).toBeVisible();
    await expect(page.getByTestId('qa-checklist').locator('input[type="checkbox"]')).toHaveCount(5);
  });

  test('FA-QS-03 Abnehmen-Button disabled wenn nicht alle 5 gecheckt', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    await expect(page.getByTestId('qa-btn-approve')).toBeDisabled();
    // 4 von 5 checken
    const boxes = page.getByTestId('qa-checklist').locator('input[type="checkbox"]');
    for (let i = 0; i < 4; i++) await boxes.nth(i).check();
    await expect(page.getByTestId('qa-btn-approve')).toBeDisabled();
    // alle 5 checken
    await boxes.nth(4).check();
    await expect(page.getByTestId('qa-btn-approve')).toBeEnabled();
  });

  test('FA-QS-04 Approve: POST an qa-reviews, Modal schliesst sich', async ({ page }) => {
    await setupMocks(page);
    let posted = false;
    await page.route('**/api/admin/qa-reviews', (route: any) => {
      posted = true;
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    const boxes = page.getByTestId('qa-checklist').locator('input[type="checkbox"]');
    for (let i = 0; i < 5; i++) await boxes.nth(i).check();
    await page.getByTestId('qa-btn-approve').click();
    await expect.poll(() => posted).toBe(true);
    await expect(page.getByTestId('qa-modal')).not.toBeVisible();
  });

  test('FA-QS-05 Reject: POST mit re_entry_phase und Kommentar, Modal schliesst sich', async ({ page }) => {
    await setupMocks(page);
    let requestBody: any;
    await page.route('**/api/admin/qa-reviews', async (route: any) => {
      requestBody = await route.request().postDataJSON();
      route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.goto('/dev-status');
    await page.getByTestId('qa-chip-T000099').click();
    // Einen Punkt nicht abhaken → Kommentar-Bereich erscheint
    const boxes = page.getByTestId('qa-checklist').locator('input[type="checkbox"]');
    await boxes.nth(0).check();
    // nicht alle checken → anyUnchecked=true
    await page.getByTestId('qa-notes').fill('Responsive auf Mobile kaputt');
    await expect(page.getByTestId('qa-btn-reject')).toBeEnabled();
    await page.getByTestId('qa-btn-reject').click();
    await expect.poll(() => requestBody).toBeTruthy();
    expect(requestBody.verdict).toBe('rejected');
    expect(requestBody.notes).toContain('Responsive');
    expect(requestBody.re_entry_phase).toBe('implement');
    await expect(page.getByTestId('qa-modal')).not.toBeVisible();
  });

  test('FA-QS-06 Badge zeigt 0/5 initial, keine Interaktion nötig', async ({ page }) => {
    await setupMocks(page);
    await page.goto('/dev-status');
    const chip = page.getByTestId('qa-chip-T000099');
    await expect(chip).toContainText('0/5');
  });
});
```

- [ ] **Schritt 2: Tests laufen lassen**

```bash
cd tests/e2e && npx playwright test fa-qa-review.spec.ts --project=website 2>&1 | tail -30
```
Erwartetes Ergebnis: alle 6 Tests grün

- [ ] **Schritt 3: Commit**

```bash
git add tests/e2e/specs/fa-qa-review.spec.ts
git commit -m "test(qs): E2E FA-QS-01 bis FA-QS-06"
```

---

## Task 9: BATS Unit-Tests für qa-dal

**Files:**
- Create: `tests/unit/qa-dal.bats`

BATS-Tests für den DAL setzen eine echte DB voraus (postgres-MCP oder lokale Testinstanz). Falls keine DB verfügbar ist, werden diese Tests als `skip` markiert. Das Pattern folgt bestehenden DAL-Tests.

- [ ] **Schritt 1: Testdatei anlegen**

```bash
# tests/unit/qa-dal.bats
#!/usr/bin/env bats
# FA-QS-07 / FA-QS-08: qa-dal Unit-Tests (benötigt postgres MCP)
# Offline-skip wenn DB nicht erreichbar.

load assert_lib

setup() {
  if ! psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
    skip "keine DB verfügbar (offline)"
  fi
  # Seed: ein Test-Ticket in qa_review
  TICKET_ID=$(psql "$DATABASE_URL" -t -A -c "
    INSERT INTO tickets.tickets (title, status, is_test_data)
    VALUES ('QS-DAL-Test', 'qa_review', true)
    RETURNING id
  ")
}

teardown() {
  [ -n "$TICKET_ID" ] && psql "$DATABASE_URL" -c "
    DELETE FROM tickets.tickets WHERE id = '$TICKET_ID'
  " >/dev/null 2>&1 || true
}

@test "FA-QS-07 approve setzt status=done und done_at" {
  node -e "
    const { createQaReview } = require('./website/src/lib/qa-dal');
    createQaReview({
      ticketId: '$TICKET_ID',
      criteria: [{key:'spec_match',passed:true},{key:'no_regression',passed:true},{key:'responsive',passed:true},{key:'performance',passed:true},{key:'copy',passed:true}],
      verdict: 'approved'
    }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
  "
  row=$(psql "$DATABASE_URL" -t -A -c "SELECT status, done_at IS NOT NULL FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$row" = "done|t" ]
}

@test "FA-QS-08 reject setzt status=in_progress und legt factory_injection an" {
  node -e "
    const { createQaReview } = require('./website/src/lib/qa-dal');
    createQaReview({
      ticketId: '$TICKET_ID',
      criteria: [{key:'spec_match',passed:false},{key:'no_regression',passed:true},{key:'responsive',passed:true},{key:'performance',passed:true},{key:'copy',passed:true}],
      notes: 'Spec nicht erfüllt',
      verdict: 'rejected',
      re_entry_phase: 'implement'
    }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
  "
  status=$(psql "$DATABASE_URL" -t -A -c "SELECT status FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$status" = "in_progress" ]
  injection=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM tickets.ticket_injections WHERE ticket_id='$TICKET_ID' AND kind='note'")
  [ "$injection" = "1" ]
}
```

- [ ] **Schritt 2: Offline-Skip verifizieren**

```bash
cd tests && bats unit/qa-dal.bats 2>&1 | head -10
```
Erwartetes Ergebnis ohne DB: `skipped` für beide Tests

- [ ] **Schritt 3: Test-Inventory aktualisieren**

```bash
cd website && bash scripts/task-oracle.sh 'regenerate test inventory' 2>/dev/null || task test:inventory
```

- [ ] **Schritt 4: Commit**

```bash
git add tests/unit/qa-dal.bats website/src/data/test-inventory.json
git commit -m "test(qs): BATS FA-QS-07/08 qa-dal unit tests"
```

---

## Task 10: dev-flow-execute Skill — QS-Hinweis

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`

- [ ] **Schritt 1: Deploy-Abschnitt anpassen**

Im Skill-File den Abschnitt zum Deploy-Schritt suchen (der `update-status --status done` erwähnt). Die Anweisung ersetzen durch:

```
Nach erfolgreichem Merge: Ticket auf qa_review setzen statt done:
  bash ${REPO}/scripts/ticket.sh update-status --id <ticket_id> --status qa_review
Das Ticket wandert damit in die QS-Abnahme-Spalte des Factory Floors (/dev-status).
done_at wird erst durch die manuelle Abnahme des Admins gesetzt.
```

- [ ] **Schritt 2: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "docs(qs): dev-flow-execute — QS-Abnahme Hinweis im Deploy-Schritt"
```

---

## Task 11: Abschluss — CI-Check und PR

- [ ] **Schritt 1: Lokalen CI-Lauf durchführen**

```bash
bash scripts/task-oracle.sh 'run all offline tests' 2>/dev/null || task test:all
```
Erwartetes Ergebnis: alle Tests grün

- [ ] **Schritt 2: E2E smoke verifizieren**

```bash
cd tests/e2e && npx playwright test fa-qa-review.spec.ts --project=website 2>&1 | tail -10
```
Erwartetes Ergebnis: `6 passed`

- [ ] **Schritt 3: Branch pushen und PR erstellen**

```bash
git push -u origin HEAD
gh pr create \
  --title "feat(qs): Qualitätssicherungs-Stufe — 5. Spalte im Factory Floor [T000581]" \
  --body "$(cat <<'EOF'
## Summary
- Neuer Ticket-Status `qa_review` zwischen Deploy und Done
- 5. Spalte im Factory Floor mit Farbe+Badge Chips
- Modal-Overlay mit globaler Checkliste (5 Kriterien), Kommentar, Phase-Selector
- Approve → `done`; Reject → `in_progress` + `factory_injection` mit QS-Feedback
- 6 E2E-Tests (FA-QS-01–06) + 2 BATS Unit-Tests (FA-QS-07–08)

## Test plan
- [ ] `task test:all` grün
- [ ] `npx playwright test fa-qa-review.spec.ts` — 6 passed
- [ ] `/dev-status` aufrufen und QS-Spalte sichtbar prüfen
- [ ] Ticket manuell auf `qa_review` setzen und Abnahme-Flow durchspielen

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --auto
```
