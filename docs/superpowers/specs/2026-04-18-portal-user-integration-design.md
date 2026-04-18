# Portal User Integration — Design Spec

**Date:** 2026-04-18  
**Branch:** feature/portal-user-integration  
**Status:** Approved

---

## Problem

The current `/portal` is a flat tab bar with five tabs. Several tabs have broken or missing features (Meetings shows only IDs, Files has no download links, Whiteboard link points to the wrong URL). Multiple existing features are completely invisible to users: chat rooms exist at `/portal/raum/[id]` but are not reachable from the portal, the onboarding checklist component exists but is not surfaced, and `/meine-daten` is an orphaned page with no navigation path from the portal.

---

## Goal

Replace the tab-based portal with a **sidebar + main content** layout that surfaces every relevant service, fixes broken integrations, and gives users a coherent view of their work with the coach.

---

## Layout

**Sidebar (sticky, left)** with grouped navigation items. **Main content (scrollable, right)** renders the active section. Active section controlled via `?section=` query param with `overview` as default.

### Sidebar groups

| Group | Nav items |
|---|---|
| *(top, ungrouped)* | Übersicht |
| Kommunikation | Nachrichten, Besprechungen |
| Dokumente | Dateien, Unterschriften |
| Abrechnung | Termine, Rechnungen |
| Zusammenarbeit | Projekte, Onboarding |
| Dienste | Alle Dienste |
| *(bottom, ungrouped)* | Konto, Abmelden |

**Nachrichten** and **Unterschriften** show live badge counts (unread messages / pending signatures) fetched on page load.

---

## Sections

### Übersicht
Four stat cards in a row:
- **Nächster Termin** — date of next upcoming booking from CalDAV (gold accent)
- **Offene Rechnung** — count of open Stripe invoices (amber accent)
- **Neue Nachrichten** — total unread message count across all chat rooms (blue accent)
- **Onboarding** — completion percentage from onboarding checklist (green accent)

Below the stats: external service shortcut cards (see Dienste). Below that: a "Nächste Termine" preview list showing the next 2–3 upcoming bookings.

### Nachrichten
Renders the user's chat rooms as an inbox-style list. Each card shows:
- Room avatar (initial letter)
- Room name (bold if unread)
- Last message snippet — sender name + truncated text
- Timestamp of last message
- Unread count badge (blue pill, hidden when 0)

Clicking a card navigates to the existing `/portal/raum/[id]` page. No new chat UI; only the list view is new.

**New API endpoint required:** `GET /api/portal/nachrichten` — returns rooms the user is a member of, each with `lastMessage: { senderName, text, sentAt }` and `unreadCount`. Queries the existing messaging DB tables.

### Besprechungen
Replaces the current `MeetingsTab` which shows only a numeric ID. Each list item shows:
- Meeting title (from `meetings.title` column — check if it exists, else fall back to "Besprechung vom {date}")
- Date of the meeting
- Status badge
- If `released_at` is set: a "Transkript ansehen" button that expands the transcript inline or links to a detail page

No structural changes to the meetings table required.

### Dateien
Replaces `FilesTab`. Each file row gains two action buttons:
- **Herunterladen** — direct download via a proxied API route or signed Nextcloud URL
- **In Nextcloud öffnen** — links to the Nextcloud file viewer for the file

Otherwise layout is unchanged.

### Unterschriften
Unchanged from `SignaturesTab`. Already works correctly.

### Termine
Replaces `BookingsTab`. Adds a prominent **"Neuen Termin buchen →"** CTA button at the top right, linking to `/termin`. Upcoming and past bookings layout is otherwise unchanged.

### Rechnungen
Wraps `InvoicesTab` in a new `RechnungenSection.astro` that does **not** pass the `serviceOptions` / `prefillEmail` props that trigger `CreateInvoiceModal`. The modal is an admin action and must not appear in the user portal. The invoice list itself is unchanged.

### Projekte
New section. Shows only projects assigned to the logged-in user (by email or Keycloak user ID).

Each project card shows:
- Project name and description
- Progress bar (done tasks / total tasks)
- Task list — two visual styles:
  - **Admin tasks** (not assigned to user): read-only checkmark, greyed out
  - **User tasks** (assigned to user): interactive checkbox; clicking calls `POST /api/portal/projekttasks/[id]/done` to toggle `done` state

**New API endpoints required:**
- `GET /api/portal/projekte` — returns projects where `client_id` matches the session user's `sub` (Keycloak user ID), with their tasks
- `POST /api/portal/projekttasks/[id]/done` — toggles the `done` field on a task row; only succeeds if the task's `assigned_to` equals `session.sub` (server-side guard, returns 403 otherwise)

User identity throughout is the Keycloak `sub` claim (UUID), not email. The existing admin project tables already have the data; these are read/update paths into the same tables with user-scoped access control.

### Onboarding
Embeds the existing `OnboardingTab` component unchanged. The reset button (admin action) is hidden in the portal context.

### Dienste
Replaces the `ServiceLinks` emoji bar with proper named service cards. Each card has an icon, a name, and a one-line description. Cards open in a new tab.

**Services to include:**
- Dateien (Nextcloud) — `${NEXTCLOUD_EXTERNAL_URL}/apps/files/`
- Kalender — `${NEXTCLOUD_EXTERNAL_URL}/apps/calendar/`
- Kontakte — `${NEXTCLOUD_EXTERNAL_URL}/apps/contacts/`
- Talk (Video) — `${NEXTCLOUD_EXTERNAL_URL}/apps/spreed/`
- Whiteboard — `${NEXTCLOUD_EXTERNAL_URL}/apps/whiteboard/` (**fix:** current link wrongly points to `/apps/files/`)
- Wiki — `${WIKI_EXTERNAL_URL}`
- Passwörter (Vaultwarden) — `${VAULT_EXTERNAL_URL}`

Cards are only rendered when their env var is non-empty.

### Konto
Two links:
- **Konto verwalten** — links to the Keycloak account console (`${KEYCLOAK_FRONTEND_URL}/realms/workspace/account/`)
- **Meine Daten (DSGVO)** — links to `/meine-daten`

Both were previously unreachable from the portal; this wires them in.

---

## Files to Create / Modify

### Modified
| File | Change |
|---|---|
| `website/src/pages/portal.astro` | Full rewrite — sidebar layout, `?section=` routing, stat data fetching for Übersicht |

### New components
| File | Purpose |
|---|---|
| `website/src/components/portal/PortalSidebar.svelte` | Reactive sidebar — receives badge counts as props, highlights active section, handles mobile collapse |
| `website/src/components/portal/OverviewSection.astro` | Stat cards + service shortcuts + upcoming appointments |
| `website/src/components/portal/NachrichtenSection.astro` | Room inbox list |
| `website/src/components/portal/BesprechungenSection.astro` | Replaces `MeetingsTab.astro` |
| `website/src/components/portal/DateienSection.astro` | Replaces `FilesTab.astro`, adds action buttons |
| `website/src/components/portal/TermineSection.astro` | Replaces `BookingsTab.astro`, adds booking CTA |
| `website/src/components/portal/ProjekteSection.astro` | New — user projects with interactive tasks |
| `website/src/components/portal/DiensteSection.astro` | New — named service cards with descriptions |
| `website/src/components/portal/KontoSection.astro` | New — Keycloak account + Meine Daten links |

### New API routes
| File | Purpose |
|---|---|
| `website/src/pages/api/portal/nachrichten.ts` | GET — rooms + last message + unread count for session user |
| `website/src/pages/api/portal/projekte.ts` | GET — projects assigned to session user with tasks |
| `website/src/pages/api/portal/projekttasks/[id]/done.ts` | POST — toggle task done; session user must own the task |

### New components (cont.)
| File | Purpose |
|---|---|
| `website/src/components/portal/RechnungenSection.astro` | Wraps `InvoicesTab` without admin modal props |

### Unchanged (reused as-is)
- `website/src/components/portal/InvoicesTab.astro`
- `website/src/components/portal/SignaturesTab.astro`
- `website/src/components/portal/OnboardingTab.astro`
- `website/src/pages/portal/raum/[id].astro`
- `website/src/pages/portal/document.astro`

---

## Access Control

All portal routes already require a valid session (`getSession()` guard). New API routes follow the same pattern. The `projekttasks/[id]/done` endpoint enforces that `task.assigned_to === session.sub` before writing — users cannot toggle tasks that belong to the admin.

The `CreateInvoiceModal` in `InvoicesTab` must not be rendered in the user-facing portal context (it is an admin action). The section component either strips it or the tab is replaced by `InvoicesTab` without that prop.

---

## Data Requirements

| Need | Source | Notes |
|---|---|---|
| Chat rooms + last message | `messaging-db` | `listRoomsForCustomer` exists; need last message query |
| Unread message count | `messaging-db` | Needs new query — count messages after user's last read timestamp |
| User's projects | `website-db` `projects` table | Filter by `client_id` matching session user |
| Project tasks | `website-db` `project_tasks` table | Join on project; include `assigned_to` field |
| Bookings | CalDAV | Already works |
| Files | Nextcloud WebDAV | Already works; need to add download URL construction |
| Invoices | Stripe | Already works |
| Onboarding items | `website-db` | Already works |
| Meetings | `website-db` | Already works; need `title` field check |

---

## Out of Scope

- Real-time message updates in the room list (no WebSocket push to sidebar — unread count is fetched on page load only)
- Users creating or deleting projects
- Users uploading files
- Mobile-specific layout (sidebar collapses to a hamburger on small screens via the Svelte component, but no separate mobile design)
