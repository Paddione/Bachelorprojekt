# Client Portal — Design Spec

**Date:** 2026-04-10
**Status:** Approved

## Overview

A role-aware portal that gives authenticated clients a personalised view of their relationship with the practice, and gives admins a full cross-client dashboard. Auth is already handled by Keycloak; this spec adds two new routes built on top of the existing session system.

## Architecture

Two top-level routes, both protected by the existing Keycloak session middleware:

- `/portal` — client view (sees only their own data)
- `/admin` — admin view (sees all clients, all data, release controls)

Both are Astro SSR pages that read `session.sub` (Keycloak user ID) and `session.preferred_username` from the cookie session to determine what to show.

Admin detection: check Keycloak group membership via the userinfo endpoint. Any user in the `admins` group gets redirected to `/admin` on login; all others land on `/portal`.

## Client Portal (`/portal`)

Five tabs, rendered server-side on each request:

| Tab | Data source | Notes |
|-----|-------------|-------|
| Kommende Termine | CalDAV (Nextcloud) — filter by attendee email | Shows date, time, Talk room link if set |
| Rechnungen | Invoice Ninja API — filter by client email | Shows status, amount, payment link |
| Dokumente | Nextcloud WebDAV — list files in `/Clients/<username>/` folder | Download links |
| Zur Unterschrift | Nextcloud WebDAV — list files in `/Clients/<username>/pending-signatures/` | Opens in Collabora; see Document Signing spec |
| Vergangene Termine | Internal DB / Outline API — meetings released by admin | See Meeting History spec |

Navigation: horizontal tab bar at top of `/portal`. Active tab persists in URL query param (`?tab=invoices`) for direct linking.

## Admin Dashboard (`/admin`)

- **Client list** — table of all Keycloak users with last-seen, pending invoice count, upcoming meetings
- **Client detail** — clicking a client shows all five portal tabs for that client (same components, different data filter)
- **Release controls** — per-meeting "Freigeben / Sperren" toggle (see Meeting History spec)
- **Send for signing** — button to move a Nextcloud file into a client's `pending-signatures/` folder (see Document Signing spec)

## Auth & Error Handling

- Unauthenticated requests to `/portal` or `/admin` redirect to `/api/auth/login?returnTo=/portal`
- Non-admin users hitting `/admin` get a 403 page
- If any data source (CalDAV, Invoice Ninja, Nextcloud) fails to respond within 5 s, the failing tab shows an error state rather than crashing the whole page

## Data Flow

```
Browser → /portal (Astro SSR)
  → lib/auth.ts         (validate Keycloak session)
  → lib/caldav.ts       (fetch events filtered by email)
  → lib/invoiceninja.ts (fetch invoices filtered by email)
  → lib/nextcloud.ts    (list WebDAV files for user folder)
  → Render tabs
```

Each data fetch is independent; a failed fetch returns an empty array and logs to console — no tab blocks another.

## New Files

- `src/pages/portal.astro` — client portal shell + tab router
- `src/pages/admin.astro` — admin dashboard shell + client list
- `src/pages/admin/[clientId].astro` — admin detail view for one client
- `src/components/portal/BookingsTab.astro`
- `src/components/portal/InvoicesTab.astro`
- `src/components/portal/FilesTab.astro`
- `src/components/portal/SignaturesTab.astro`
- `src/components/portal/MeetingsTab.astro`
- `src/lib/nextcloud-files.ts` — WebDAV file listing helper (new, separate from caldav.ts)
