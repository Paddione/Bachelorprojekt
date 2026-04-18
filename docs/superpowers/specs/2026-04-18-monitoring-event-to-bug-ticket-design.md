# Design: Create Bug Ticket from Monitoring Event

## Overview

Add a "create bug ticket" action to each row in the Recent Events table on the monitoring dashboard. Clicking opens a modal pre-filled from the event data. The admin can review/edit before submitting. A new admin-only API endpoint inserts the ticket directly via the existing `insertBugTicket` DB function.

## Affected Files

| File | Change |
|---|---|
| `src/components/admin/MonitoringDashboard.svelte` | Add button per event row + modal |
| `src/pages/api/admin/bugs/create.ts` | New endpoint (new file) |

---

## Component Changes: MonitoringDashboard.svelte

### Event Row Button

- Each row in the Recent Events table gets an always-visible bug icon button on the right column.
- Clicking sets `selectedEvent` to that event object and opens the modal.
- No other row styling changes.

### Modal

Triggered by `selectedEvent !== null`. A centered overlay with:

- **Title:** "Bug Ticket erstellen"
- **Read-only summary:** `[type] · [reason] · [object]` — identifies which event is being filed
- **Description textarea:** pre-filled with `"[reason] on [object]: [message]"`, editable, ~4 rows
- **Category dropdown:** options `fehler` | `verbesserung` | `erweiterungswunsch`, defaults to `fehler`
- **Buttons:** "Erstellen" (submit) + "Abbrechen" (closes modal, clears `selectedEvent`)
- **On success:** displays the returned `ticketId` (e.g. `BR-20260418-0001`) with a link to `/admin/bugs`, then auto-closes after 3 seconds
- **On error:** shows an inline error message, keeps modal open

### State

```typescript
let selectedEvent: Event | null = null;
let modalDescription = '';
let modalCategory = 'fehler';
let modalLoading = false;
let modalError: string | null = null;
let modalSuccessId: string | null = null;
```

---

## New API Endpoint: `/api/admin/bugs/create`

**File:** `src/pages/api/admin/bugs/create.ts`

**Method:** POST
**Body:** JSON `{ description: string, category: string }`
**Auth:** `getSession` + `isAdmin` — returns 401 if not admin

**Server-side fills:**
- `reporterEmail` — from admin session (`session.email`)
- `url` — `"/admin/monitoring"`
- `brand` — `process.env.BRAND || 'mentolder'`

**Response (success):** `{ ticketId: string }` with HTTP 200
**Response (error):** `{ error: string }` with appropriate HTTP status

**Implementation:** validates input, then calls `insertBugTicket(...)` directly — no FormData, no screenshot handling.

---

## Data Flow

1. Admin clicks bug icon on an event row in Recent Events
2. `selectedEvent` is set; modal opens with pre-filled description and `category = 'fehler'`
3. Admin optionally edits description or changes category
4. Admin clicks "Erstellen"
5. `POST /api/admin/bugs/create` with `{ description, category }`
6. Server validates session, fills remaining fields, calls `insertBugTicket`
7. Returns `{ ticketId }`
8. Modal shows success message with ticket ID + link to `/admin/bugs`, auto-closes after 3 s

---

## Out of Scope

- Screenshots (not relevant for system events)
- Pre-filling `userAgent` / `viewport` (admin context, not meaningful)
- Editing `reporterEmail` in the modal (always the admin's session email)
