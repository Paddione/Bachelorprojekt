# Admin UI: Sidekick Upgrade + Platform Control Center Cleanup

**Date:** 2026-05-20  
**Branch:** feature/admin-sidekick-tickets-ui  
**Status:** approved

## Overview

Two related changes to the admin interface:

1. **Platform Control Center cleanup** — remove the Tickets tab (duplicate of `/admin/tickets`) and set GitOps as the default view
2. **Multi-Sidekick upgrade** — visual overhaul + two new admin-only views (Tickets, Inbox) accessible via the right-side drawer

The Sidekick (`PortalSidekick.svelte`) uses an existing `helpContext` prop to gate admin-only views, so portal users are unaffected.

---

## Part 1: Platform Control Center (`PlatformHub.svelte`)

### Changes

- Remove `{ id: 'tickets', label: 'Tickets' }` from the `tabs` array
- Remove `import TicketsTab from './TicketsTab.svelte'`
- Remove the `{#if activeTab === 'tickets'}<TicketsTab />{/if}` branch
- Change `let activeTab = 'tickets'` → `let activeTab = 'flux'`

### What stays

- Footer link `/admin/bugs` ("Fehlermeldungen") — this is navigation, not a ticket view; it stays
- `TicketsTab.svelte` itself — unchanged, still used on `/admin/tickets`
- All other tabs (GitOps, Software, Hardware, Integrität, Dienste, Logs, Datenbank, Netzwerk)

### Result

Platform Hub opens on GitOps/Flux by default. Tickets live exclusively at `/admin/tickets` ("Anfragen" in the left nav).

---

## Part 2: Sidekick Visual Upgrade

### FAB Button (`PortalSidekick.svelte`)

- Replace `🛎` emoji with inline SVG bell icon matching the admin icon style (16px viewBox, `stroke="currentColor"`, `stroke-width="1.5"`)
- Add `border: 1.5px solid rgba(232,200,112,0.3)` for depth
- Hover: add gold glow `box-shadow: 0 6px 24px rgba(232,200,112,0.25)` instead of pure scale

### Drawer Header (`SidekickHeader.svelte`)

- Title font: `font-family: var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; font-size: 11px` — matches sidebar group labels
- Bottom border: `border-bottom: 1px solid rgba(232,200,112,0.15)` (gold-tinted, subtle)
- Background: `#0f1623` (admin sidebar bg) for visual continuity

### Home Cards (`SidekickHome.svelte`)

- `background: #0f1623` → `var(--admin-surface, #131f33)`
- Border hover: `border-color: rgba(232,200,112,0.4)` (matches admin card hover pattern)
- Replace emoji icons with inline SVGs consistent with admin nav icons:
  - 📋 → clipboard SVG
  - 🐞 → bug SVG
  - `?` help circle → kept as styled div (already correct)
- `card-desc` color: `#5566aa` → `var(--admin-text-mute)`
- Two new admin-only cards added (see Parts 3 and 4)

---

## Part 3: Ticket View in Sidekick

### New file: `website/src/components/assistant/TicketSidekickView.svelte`

**Layout (top to bottom):**

1. **Quick-Create accordion** (open by default)
   - Fields: Typ (select: Bug/Feature/Aufgabe/Projekt), Priorität (select: Hoch/Mittel/Niedrig), Titel (text, required), Beschreibung (textarea, 2 rows), Komponente (text, optional)
   - Submit: `POST /api/admin/tickets` — on success shows toast, reloads list, resets form
   - Collapse button to hide the form

2. **Open tickets list** (header: "Offene Anfragen" + live count badge)
   - `GET /api/admin/tickets?limit=7&status=open`
   - Each row: external_id (mono), type·priority pill, title, status dropdown
   - Status change: `PATCH /api/admin/tickets/:id` with `{ status }`
   - Skeleton loaders during fetch; inline error message on failure
   - Max 7 items — no pagination in sidekick

3. **Footer link:** "Alle Anfragen →" → `/admin/tickets`

### SidekickHome integration

- New card in admin context: `{ icon: tagSvg, label: 'Anfragen', desc: 'Tickets erstellen & bearbeiten', view: 'tickets' }`
- Badge: count of open tickets (fetched at sidekick open, same endpoint)
- Only shown when `helpContext === 'admin'`

### View state

```typescript
// PortalSidekick.svelte
type View = 'home' | 'support' | 'questionnaire' | 'help' | 'tickets' | 'inbox';
```

`titleMap` entry: `tickets: 'Anfragen'`

---

## Part 4: Inbox View in Sidekick

### New file: `website/src/components/assistant/InboxSidekickView.svelte`

**Layout (top to bottom):**

1. **Type-filter pills** — horizontal scrollable: Alle, Chat, Kontakt, + other types from messaging-db
   - Active pill: gold background, dark text
   - Inactive: ghost style

2. **Items list** (max 5, newest first)
   - Each item: colored type dot, sender name/type label, timestamp (relative), message preview (1 line truncated)
   - Two inline action buttons: `[✓ Erledigt]` → status `actioned`, `[Archivieren]` → status `archived`
   - On action: item fades out, count decreases, `window.dispatchEvent(new CustomEvent('admin-inbox-changed'))` fires
   - This reuses the existing `admin-inbox-changed` event listener in `AdminLayout.astro` to update the sidebar badge automatically — no extra polling

3. **Footer link:** "Alle Nachrichten →" → `/admin/inbox`

### API endpoints

- List: `GET /api/admin/inbox/items?limit=5&status=pending` — if this endpoint doesn't exist, use existing `/api/admin/messages` with equivalent params
- Action: `PATCH /api/admin/inbox/items/:id` with `{ status: 'actioned' | 'archived' }`

### SidekickHome integration

- New card in admin context: `{ icon: inboxSvg, label: 'Postfach', desc: 'Nachrichten & Anfragen', view: 'inbox' }`
- Badge: `inboxPending` (already computed in `AdminLayout.astro`, passed via prop or re-fetched at open)
- Only shown when `helpContext === 'admin'`

---

## Component Map

| File | Action | Notes |
|---|---|---|
| `admin/PlatformHub.svelte` | Edit | Remove Tickets tab, default → `flux` |
| `PortalSidekick.svelte` | Edit | View union + 2 imports + visual upgrade |
| `assistant/SidekickHome.svelte` | Edit | Admin cards + SVG icons + visual upgrade |
| `assistant/SidekickHeader.svelte` | Edit | Visual upgrade (mono font, gold border) |
| `assistant/TicketSidekickView.svelte` | **New** | Ticket hybrid view |
| `assistant/InboxSidekickView.svelte` | **New** | Inbox action panel |
| `admin/TicketsTab.svelte` | Unchanged | Still used on `/admin/tickets` |
| `TicketWidgetBar.astro` | Unchanged | Remains dormant in admin layout |
| `layouts/AdminLayout.astro` | Unchanged | No prop changes needed |

---

## Out of Scope

- Pagination within sidekick views (full list lives at `/admin/tickets` and `/admin/inbox`)
- Portal-context ticket/inbox views (these are admin-only capabilities)
- Changes to the left sidebar navigation
- Removing `TicketWidgetBar` from `AdminLayout.astro`
