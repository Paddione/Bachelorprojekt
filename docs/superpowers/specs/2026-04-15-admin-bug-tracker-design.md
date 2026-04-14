# Admin Bug Tracker — Design Spec
Date: 2026-04-15

## Overview

An admin-only, server-rendered page at `/admin/bugs` that lists all bug reports from the `bug_tickets` DB table, supports filtering by status/category/search, and allows resolving tickets with a written resolution note or archiving them.

## Architecture

Fully server-rendered Astro page (Option A). No client-side framework. State lives in URL params. Actions are plain HTML form POSTs that redirect back. A native `<dialog>` element handles the resolve note UI with zero JS framework overhead.

## Files to Create / Modify

| File | Change |
|------|--------|
| `website/src/lib/meetings-db.ts` | Add `listBugTickets(filters)` and `initBugTicketsTable()` |
| `website/src/pages/admin/bugs.astro` | New page — list + filters + action forms |
| `website/src/pages/api/admin/bugs/resolve.ts` | New POST endpoint — resolve ticket with note |
| `website/src/pages/api/admin/bugs/archive.ts` | New POST endpoint — archive ticket |
| `website/src/pages/admin.astro` | Add "Bug Reports" link in header nav |

## Data Layer

### `listBugTickets(filters)`

```ts
listBugTickets(filters: {
  status?: 'open' | 'resolved' | 'archived';  // omit = all
  category?: string;
  brand?: string;
  q?: string;          // partial match on ticket_id or reporter_email
  limit?: number;      // default 200
}): Promise<BugTicketRow[]>
```

Executes:
```sql
SELECT ticket_id, category, reporter_email, description, url, brand,
       status, created_at, resolved_at, resolution_note
FROM bug_tickets
WHERE ($brand IS NULL OR brand = $brand)
  AND ($status IS NULL OR status = $status)
  AND ($category IS NULL OR category = $category)
  AND ($q IS NULL OR ticket_id ILIKE $q OR reporter_email ILIKE $q)
ORDER BY created_at DESC
LIMIT $limit
```

### `initBugTicketsTable()`

```sql
CREATE TABLE IF NOT EXISTS bug_tickets (
  ticket_id       TEXT PRIMARY KEY,
  category        TEXT NOT NULL,
  reporter_email  TEXT NOT NULL,
  description     TEXT NOT NULL,
  url             TEXT,
  brand           TEXT NOT NULL DEFAULT 'mentolder',
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
)
```

Called once at the top of `listBugTickets` (idempotent, cheap after first run).

## API Endpoints

### `POST /api/admin/bugs/resolve`

- Auth: session + `isAdmin` → 403 if not admin
- Body (form): `ticketId`, `resolutionNote`
- Validation: both required; `resolutionNote` max 1000 chars
- On success: calls `resolveBugTicket(ticketId, resolutionNote)`, redirects to `/admin/bugs?${preserved filters}`
- On error: redirects to `/admin/bugs?error=<message>&${preserved filters}`

### `POST /api/admin/bugs/archive`

- Auth: session + `isAdmin` → 403 if not admin
- Body (form): `ticketId`
- On success: calls `archiveBugTicket(ticketId)`, redirects back
- On error: redirects back with `?error=<message>`

Both action forms include hidden `<input>` fields for `status`, `category`, and `q` so the current filter state is round-tripped through the POST and preserved in the redirect URL.

## Page: `/admin/bugs.astro`

### URL params

| Param | Values | Default |
|-------|--------|---------|
| `status` | `open`, `resolved`, `archived` | (all) |
| `category` | `fehler`, `verbesserung`, `erweiterungswunsch` | (all) |
| `q` | free text | — |
| `error` | error message string | — |

### Layout

```
← Zurück zur Übersicht

Bug Reports                    [N offen badge]

[Alle] [Offen] [Erledigt] [Archiviert]   [Kategorie ▾]   [🔍 search input]

Table:
  Ticket-ID | Kategorie | Reporter | Datum | Status | Aktionen

Open row:    [Erledigt ▸ opens dialog] [Archivieren ▸ form POST]
Resolved row: green badge, resolution note inline (collapsed)
Archived row: dimmed, no action buttons
```

### Resolve dialog

Native `<dialog>` element, opened by JS `dialog.showModal()` on button click:
- Hidden `<input name="ticketId">` populated on open
- `<textarea name="resolutionNote" required maxlength="1000">`
- Submit → POST `/api/admin/bugs/resolve`
- Cancel button closes dialog

### Error banner

If `?error=` param is present, show a dismissible red banner at top of page. Dismissed by clicking ✕ (one line of vanilla JS).

### Empty state

When no tickets match filters: "Keine Einträge für diese Filterauswahl." inside the table body.

### DB error on page load

Catch `listBugTickets` failure, render error banner, still show filter UI (table body = empty).

## Navigation

`/admin.astro` header: add a "Bug Reports" link next to the existing "Mattermost verwalten" button. Badge showing open ticket count (fetched separately, non-fatal if it fails).

## Out of scope

- Bulk actions (resolve/archive multiple at once)
- Pagination (200-row limit is sufficient for now)
- Email notification to reporter on resolve
- Real-time polling
