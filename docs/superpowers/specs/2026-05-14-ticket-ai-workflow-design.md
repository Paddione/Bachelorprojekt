# Ticket System — AI Workflow Optimization & Admin UX

**Date:** 2026-05-14  
**Branch:** feature/ticket-ai-workflow  
**Scope:** `website/src/` (UI + API) + DB migration (tickets schema)

---

## Goals

1. Make the ticket system AI-workflow-aware so Claude Code can identify which tickets are ready for autonomous processing via dev-flow-plan/dev-flow-execute.
2. Speed up human admin triage with an adaptive Quick-Edit popup that minimizes context-switching.
3. Keep ticket identifiers as-is (`T######`) — no migration needed.

---

## Decision Log

| Question | Decision |
|---|---|
| Who sets AI-ready flag? | Both: auto-detection (rules-based) + manual admin override |
| Quick-edit purpose? | Adaptive: AI-prep mode (triage status) + general edit mode (other statuses) |
| Identifier format? | Keep `T######` — no type-prefix, no migration |
| Architectural approach? | Enum `attention_mode` with three states + computed `effective_attention_mode` |

---

## 1. Data Model

### New column on `tickets.tickets`

```sql
ALTER TABLE tickets.tickets
  ADD COLUMN attention_mode TEXT NOT NULL DEFAULT 'auto'
  CHECK (attention_mode IN ('auto', 'ai_ready', 'needs_human'));
```

### Computed effective attention mode

A DB function `tickets.fn_effective_attention_mode(t tickets.tickets)` returns the concrete state when `attention_mode = 'auto'`:

**→ `ai_ready` when all of:**
- `description IS NOT NULL AND length(description) >= 20`
- `component IS NOT NULL`
- `status IN ('triage', 'backlog', 'in_progress')`
- `reporter_email IS NULL` (not an external/customer ticket)

**→ `needs_human` when any of:**
- description missing or < 20 chars
- component not set
- `status IN ('blocked', 'in_review')`
- `reporter_email IS NOT NULL` (external ticket, needs human touch)

When `attention_mode != 'auto'`, the manual override is the effective value.

### Index

```sql
CREATE INDEX tickets_attention_mode_idx ON tickets.tickets (attention_mode)
  WHERE status NOT IN ('done', 'archived');
```

---

## 2. API Changes

### `GET /api/admin/tickets` (list)

`ListedTicket` gains two new fields:

```ts
attention_mode: 'auto' | 'ai_ready' | 'needs_human'
effective_attention_mode: 'ai_ready' | 'needs_human'  // always concrete
```

The `listAdminTickets` query computes `effective_attention_mode` inline via a CASE expression (no separate function call needed for list performance).

### `PATCH /api/admin/tickets/[id]`

Accept `attention_mode` in request body alongside existing updatable fields. No new endpoint needed.

### New query param for list

`?attention=ai_ready|needs_human|auto` — filters by `effective_attention_mode`.

---

## 3. Quick-Edit Popup

A Svelte modal component `TicketQuickEdit.svelte` triggered by an `✏️ Edit` button on each row in the ticket list table.

### Triage mode (triggered when `status === 'triage'`)

Fields shown:
- **Title** (read-only display)
- **Description** (textarea, required) — highlighted with "required for AI" hint
- **Component** (select, required) — highlighted with "required for AI" hint
- **Priority** (select)
- **Attention mode** (3-button toggle: 🤖 AI-ready / ⚙️ Auto / 👤 Mensch)
- **Due date** (date input, default = today, adjustable)

Primary action: **"Speichern & → Backlog"** — saves all fields + transitions status to `backlog`.

Live feedback: when description ≥ 20 chars AND component is set, show green indicator: "✓ Wird AI-ready beim Speichern" (only if attention_mode = 'auto').

### General edit mode (all other statuses)

Fields shown:
- **Title** (read-only display)
- **Status** (select, all valid transitions)
- **Assignee** (select, admin users)
- **Priority** (select)
- **Due date** (date input, default = today if not set, otherwise current value)
- **Attention mode** (3-button toggle)

Primary action: **"Speichern"**.

### Shared behavior

- Modal closes on Escape or backdrop click (with unsaved-changes guard)
- On save: optimistic UI update in list, then PATCH request; revert on error
- Attention mode toggle: always visible in both modes

---

## 4. Ticket List UI

### Attention badge

Each row gains an attention badge between the title and the action button:

| Effective mode | Badge |
|---|---|
| `ai_ready` | `🤖 AI-ready` (green, subtle) |
| `needs_human` | `👤 Mensch` (red, subtle) |
| `auto` → computed | shown as computed result with ⚙️ icon |

### Quick-Edit button

`✏️ Edit` button at the end of each row — opens `TicketQuickEdit.svelte`.

### Filter pill

New `<select>` in the filter bar: `Alle | 🤖 AI-ready | 👤 Mensch nötig | ⚙️ Auto` — maps to `?attention=` query param.

### Saved Views

Two new entries added to `SAVED_VIEWS` in `tickets.astro`:

```ts
{ label: '🤖 AI-Queue',      href: '/admin/tickets?attention=ai_ready&status=open' },
{ label: '👤 Braucht Mensch', href: '/admin/tickets?attention=needs_human&status=open' },
```

---

## 5. Claude Workflow Integration

No changes to Claude Code's dev-flow skills required. The intended workflow:

1. Admin visits `/admin/tickets?attention=ai_ready` to see the AI queue.
2. Admin tells Claude Code: "Bearbeite T000305" → `dev-flow-plan` starts, ticket ID becomes `ticket_id` in plan frontmatter (already supported).
3. After plan commit, `dev-flow-execute` can optionally PATCH `attention_mode → auto` to remove the manual override (ticket re-enters auto-computed state).
4. After PR merge, ticket status → `done`; attention_mode becomes irrelevant.

---

## 6. Files to Create / Modify

| File | Change |
|---|---|
| `website/src/components/admin/TicketQuickEdit.svelte` | **New** — adaptive modal component |
| `website/src/pages/admin/tickets.astro` | Add ✏️ button, attention badge, filter pill, 2 saved views |
| `website/src/lib/tickets/admin.ts` | Add `attention_mode` + `effective_attention_mode` to `ListedTicket`, add `attention` filter to `listAdminTickets` |
| `website/src/pages/api/admin/tickets/[id].ts` | Accept `attention_mode` in PATCH body |
| `website/src/pages/api/admin/tickets/index.ts` | Accept `?attention=` filter param |
| DB migration | `ALTER TABLE tickets.tickets ADD COLUMN attention_mode …` + index + fn_effective_attention_mode |

---

## 7. Out of Scope

- No change to `T######` identifier format
- No push notifications or email when attention_mode changes
- No Claude Code automation to auto-pick tickets from the queue (human-initiated only)
- No audit log for attention_mode changes beyond existing `ticket_activity` trigger
