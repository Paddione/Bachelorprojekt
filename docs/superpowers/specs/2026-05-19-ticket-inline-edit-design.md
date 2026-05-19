# Ticket Inline Quick-Edit + AI/Human Workflow — Design Spec

**Ticket:** T000029  
**Branch:** feature/ticket-inline-edit  
**Date:** 2026-05-19

---

## Goal

Add two inline interactions to the `/admin/tickets` table overview — without opening the full edit modal:

1. **Status/Archive quick-change** — a `<select>` directly in the table row
2. **AI/Human 3-pill toggle** — flip `attentionMode` inline
3. **AI Question + Human Answer widget** — when a ticket is `needs_human` with an `ai_question`, an expandable answer row appears below the ticket, allowing the human to read the AI's question, type an answer, and convert back to `ai_ready` in one click

---

## Data Model

### DB Migration

Two new nullable text columns on `tickets.tickets`:

```sql
ALTER TABLE tickets.tickets
  ADD COLUMN ai_question  TEXT,
  ADD COLUMN human_answer TEXT;
```

- `ai_question` — set by the AI agent when it transitions a ticket to `needs_human`. Contains the explicit question the AI could not answer autonomously.
- `human_answer` — set by the human when they click "Antworten → AI-ready". Persists permanently as an audit trail (is not cleared when the ticket cycles back to `needs_human` later).

### `ListedTicket` Interface Update

Add to `website/src/lib/tickets/admin.ts`:

```ts
export interface ListedTicket {
  // … existing fields …
  aiQuestion:   string | null;   // NEW
  humanAnswer:  string | null;   // NEW
}
```

Update `LIST_SELECT` SQL to include:
```sql
t.ai_question  AS "aiQuestion",
t.human_answer AS "humanAnswer",
```

### `patchTicket()` Update

`patchTicket()` in `admin.ts` already accepts arbitrary keys via `push()`. Add:

```ts
if (p.aiQuestion   !== undefined) push('ai_question',  p.aiQuestion ?? null);
if (p.humanAnswer  !== undefined) push('human_answer', p.humanAnswer ?? null);
```

---

## Frontend

### Replacing the Astro Table-Row Loop

`website/src/pages/admin/tickets.astro` currently renders table rows via a `{tickets.map(t => (...))}` template. Replace this with a single Svelte island:

```astro
<TicketsTableBody
  client:load
  {tickets}
  {admins}
  {components}
/>
```

The `TicketsTableBody.svelte` component receives the full `ListedTicket[]` array (already SSR-resolved) and handles all inline mutations client-side.

### `TicketsTableBody.svelte` — Component Design

**Props:**
```ts
let { tickets, admins = [], components = [] } = $props<{
  tickets: ListedTicket[];
  admins: { id: string; name: string }[];
  components: string[];
}>();
```

**Per-row local state** (stored in a `Map<string, RowState>`):
```ts
type RowState = {
  status:        TicketStatus;
  attentionMode: 'auto' | 'ai_ready' | 'needs_human';
  aiQuestion:    string | null;
  humanAnswer:   string | null;
  saving:        boolean;
  answer:        string;   // textarea draft
  answerSaving:  boolean;
  answerSaved:   boolean;
};
```

**Rendered per row:**

| Column | Interactive element |
|--------|-------------------|
| Status | `<select class="status-select">` — fires `PATCH /transition` on `change` |
| AI/Human | 3-button pill (🤖 / ⚙️ / 👤) — fires `PATCH` on click |
| (below row) | Answer widget — visible when `attentionMode === 'needs_human' && aiQuestion` |

**Answer widget layout (expands inline under the row, spans full table width):**
```
┌─ 🤖 KI-Frage ──────────────────────────────────────┐
│  [read-only red-tinted block: ai_question text]     │
└────────────────────────────────────────────────────┘
[Textarea — bind:value=rowState.answer]
                      [✓ Antworten → 🤖 AI-ready]
```

**Actions:**

`patchStatus(id, newStatus)`:
```
POST /api/admin/tickets/:id/transition  { status: newStatus }
```
Updates local state on success; reverts on error.

`patchAttentionMode(id, mode)`:
```
PATCH /api/admin/tickets/:id  { attentionMode: mode }
```
Updates local state on success.

`submitAnswer(id, answer)`:
```
PATCH /api/admin/tickets/:id  { humanAnswer: answer, attentionMode: 'ai_ready' }
```
On success: sets local `attentionMode = 'ai_ready'`, `humanAnswer = answer`, `answerSaved = true`, collapses answer widget after 1.5s flash.

---

## API Changes

### `PATCH /api/admin/tickets/[id]`

Accept two additional body fields:

```ts
body.aiQuestion   → patchTicket({ aiQuestion })
body.humanAnswer  → patchTicket({ humanAnswer })
```

No other API changes. The `/transition` endpoint is unchanged.

---

## What Does NOT Change

- `TicketQuickEdit.svelte` (the full-edit modal) stays for editing description, component, assignee, due date, notes — the `✏️ Edit` button in the action column still opens it
- Filter bar, saved-view chips, create dialog — untouched
- Portal context of `TicketQuickEdit` — untouched

---

## Behaviour Details

**Status dropdown:**
- Options: Triage, Backlog, In Arbeit, In Review, Blockiert, Fertig, Archiviert
- On change: inline spinner on the select, fires `/transition`, updates badge on success
- On error: revert to previous value, show a small toast/inline error

**AI/Human pill:**
- Three segments: `🤖 ai_ready` / `⚙️ auto` / `👤 needs_human`
- Active segment highlighted (green / indigo / red)
- On click: fires PATCH, optimistic update, reverts on error
- Switching away from `needs_human` collapses the answer widget

**Answer widget visibility rule:**  
`attentionMode === 'needs_human' && aiQuestion !== null`  
If `needs_human` but no `ai_question` set, the pill still works but no widget appears (AI set the mode without a question — valid edge case).

**humanAnswer persistence:**  
The field is never cleared automatically. If the ticket cycles back to `needs_human` with a new `ai_question`, the old `human_answer` is visible below the new question box as context ("Letzte Antwort: …").

---

## Files Touched

| File | Change |
|------|--------|
| `db/migrations/YYYYMMDD_add_ai_question_human_answer.sql` | New migration |
| `website/src/lib/tickets/admin.ts` | `ListedTicket` + SQL + `patchTicket()` |
| `website/src/pages/admin/tickets.astro` | Replace table-body loop with `<TicketsTableBody>` island |
| `website/src/pages/api/admin/tickets/[id].ts` | Accept `aiQuestion`, `humanAnswer` in PATCH |
| `website/src/components/admin/TicketsTableBody.svelte` | **New** — full inline table with status select + pill + answer widget |
