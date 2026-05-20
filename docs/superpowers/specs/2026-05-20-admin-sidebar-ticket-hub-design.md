# Admin Sidebar + Ticket Hub — Design Spec

**Date:** 2026-05-20  
**Branch:** feature/admin-sidebar-ticket-widget  
**Status:** approved

---

## Overview

Two related improvements to the admin interface:

1. **Sidebar responsive overhaul** — fix squished 16px icons, add proper spacing, make the sidebar fully responsive across desktop/tablet/mobile.
2. **Ticket Hub in PlatformHub** — move the floating "Ticket erstellen" button into a new first tab of `PlatformHub.svelte`, and add inline ticket management (edit, close, archive, AI classification) in the same panel.

Both changes require mobile-first responsive design as a baseline.

---

## 1. Sidebar Responsive Overhaul

### Files
- `website/src/layouts/AdminLayout.astro`
- `website/src/styles/admin-layout.css` (or inline `<style>` in AdminLayout)

### Viewport States

| Breakpoint | Behaviour |
|---|---|
| Desktop `>1024px` | 260px fixed sidebar — 20px icons + text labels always visible, collapsible groups with chevron, localStorage state persisted |
| Tablet `768–1024px` | 64px icon-only rail — 22px icons, group text hidden, tooltips via `title` attribute + CSS tooltip layer |
| Mobile `<768px` | Hamburger button in top bar → full-width overlay drawer slides in from left, closes on backdrop click or nav item tap |

### Icon Fix
- Bump from 16×16px → 20px (desktop) / 22px (tablet) SVG viewport
- Add `padding: 10px` around each icon container — eliminates the squished appearance
- Sidebar nav item: `display: flex; align-items: center; gap: 12px; padding: 10px 14px`

### Mobile Drawer
- `position: fixed; inset: 0; z-index: 200` overlay with `backdrop-filter: blur(2px)`
- Drawer itself: `width: 280px; height: 100%; background: var(--sidebar-bg); transform: translateX(-100%); transition: transform 200ms ease`
- Active state: `transform: translateX(0)`
- Hamburger button: `position: fixed; top: 16px; left: 16px; z-index: 201` — 44×44px tap target
- All nav groups flat-expanded inside the drawer (no collapse on mobile)
- Body scroll locked while drawer is open (`overflow: hidden` on `<body>`)

### Tablet Rail
- Groups collapse to icon-only: text `visibility: hidden; width: 0; overflow: hidden`
- Tooltip: `[title]` CSS tooltip or a lightweight `<span class="tooltip">` sibling with `position: absolute`
- Group chevrons hidden on tablet

---

## 2. PlatformHub Tickets Tab

### Files
- `website/src/components/admin/PlatformHub.svelte` — add Tickets as first tab
- `website/src/components/admin/TicketsTab.svelte` — new component (create + list + actions)
- `website/src/pages/api/admin/tickets/[id]/classify.ts` — new API endpoint

### Tab Order
Tickets is the **first tab** (default on open). Existing tabs shift right:
`Tickets | Flux | Software | Hardware | Health | Dienste | Logs | DB | DNS/TLS`

Tab bar scrolls horizontally on mobile/tablet (`overflow-x: auto; -webkit-overflow-scrolling: touch`).

### TicketsTab Layout

**Desktop (>768px): two-column**
```
┌──────────────────────┬──────────────────────────────────┐
│  TICKET ERSTELLEN    │  LETZTE TICKETS (20 newest)      │
│                      │                                  │
│  Typ [dropdown]      │  ┌──────────────────────────┐   │
│  Titel [input]       │  │ T-001 · Bug · hoch        │   │
│  Beschreibung        │  │ Login schlägt fehl        │   │
│  [textarea]          │  │ [✏️ Edit] [✓ Close]       │   │
│  Priorität [select]  │  │ [📦 Archiv] [🤖 KI]      │   │
│  Komponente [input]  │  ├──────────────────────────┤   │
│                      │  │ T-002 · Feature · mittel  │   │
│  [Ticket erstellen]  │  │ ...                       │   │
└──────────────────────┴──────────────────────────────────┘
```

**Mobile (≤768px): single column stacked**
- Create form on top (collapsible with toggle button "Neues Ticket ▼")
- Ticket list below as full-width cards
- Action buttons: icon-only with `aria-label`, 44px tap targets

### TicketsTab.svelte — Behaviour

**Create form:**
- Reuses the admin-mode form fields from `TicketQuickCreate.svelte`
- On submit: POST `/api/admin/tickets`, refreshes list on success, shows toast
- The floating `TicketQuickCreate` button is **removed** from `AdminLayout.astro` (its function is fully covered by this tab)

**Ticket list:**
- Fetches `GET /api/admin/tickets?limit=20&sort=created_desc` on tab mount
- Re-fetches after any create/action
- Each ticket row shows: external_id badge, type chip, priority indicator, title, status badge

**Inline actions:**
| Action | Behaviour |
|---|---|
| **Bearbeiten** | Opens existing `TicketQuickEdit.svelte` modal (no changes to that component) |
| **Schließen** | PATCH `/api/admin/tickets/[id]` with `{ status: 'done', resolution: 'fixed' }` — inline, no modal, optimistic UI update |
| **Archivieren** | PATCH `/api/admin/tickets/[id]` with `{ status: 'archived' }` — same pattern |
| **→ KI** | POST `/api/admin/tickets/[id]/classify` — see API section below |

**Loading / error states:**
- Skeleton rows while loading
- Error toast on failed actions with retry button
- Disabled state on action buttons while a request is in-flight for that ticket

### API: `/api/admin/tickets/[id]/classify.ts`

**Method:** POST  
**Auth:** Admin session required (same guard as other `/api/admin/*` routes)

**Logic:**
1. Load ticket from DB by `id`
2. Build a prompt: ticket title + description → ask LLM to return JSON `{ component: string, priority: "low"|"medium"|"high"|"critical", attention_mode: "ai_ready"|"needs_human" }`
3. LLM call: uses the existing LLM client in the codebase (`llm-gateway-chat` or Anthropic SDK depending on `LLM_ENABLED`)
4. PATCH ticket in DB: update `component`, `priority`, `attention_mode`
5. Return `200 { ticket_id, component, priority, attention_mode }`

**Error handling:**
- LLM unavailable (503 from gateway): return `503 { error: "LLM nicht verfügbar" }` — UI shows "KI nicht erreichbar" toast, no partial update
- Ticket not found: `404`
- Invalid LLM response (non-parseable JSON): retry once, then return `500` — ticket unchanged

---

## 3. Cleanup

- Remove the `<TicketQuickCreate>` import and usage from `AdminLayout.astro` (bottom-right floating button)
- The `TicketQuickCreate.svelte` file itself stays — it's still used in portal-facing views

---

## 4. Mobile Checklist (all components)

- [ ] Sidebar: hamburger drawer at `≤768px`
- [ ] PlatformHub tabs: horizontal scroll at `≤768px`
- [ ] TicketsTab: stacked layout at `≤768px`, collapsible create form
- [ ] All action buttons: minimum 44×44px tap target
- [ ] Toast notifications: positioned at bottom-center on mobile (not bottom-right, avoids thumb-zone conflict)

---

## Out of Scope

- Portal-facing ticket creation (unchanged)
- Ticket detail/full-page view (existing `/admin/bugs` page unchanged)
- Push notifications for ticket status changes
- Bulk ticket actions
