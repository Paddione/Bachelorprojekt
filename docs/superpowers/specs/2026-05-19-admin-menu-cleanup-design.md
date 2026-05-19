# Admin & Portal Menu Cleanup — Design Spec

**Date:** 2026-05-19  
**Branch:** feature/admin-menu-cleanup  
**Scope:** `AdminLayout.astro`, `PortalLayout.astro`, six target pages

---

## Problem

The admin sidebar had 33 nav items across 6 groups with several concrete issues:
- "Projekte" appeared under both Klienten and Coaching (same label, different URLs)
- Three calendar/scheduling items: Termine, Meetings, Kalender — no clear distinction from the nav
- Duplicate icons: `clock` ×2, `scale` ×2, `clipboard` ×4, `broadcast` ×2
- Einstellungen used the bell (notification) icon instead of the gear (settings) icon
- Developer artifacts (Software-History, Systemtest) sat alongside daily-use items
- `/admin/newsletter` existed but was not linked — redundant since it's accessible inside Website-Inhalte
- Portal had two dead/off-topic items: Buchung (Stripe removed) was accidentally excluded; Arena listed for clients who have no use for it

---

## Design Decisions

### Admin Sidebar — Final navGroups

**Dashboard** (top-level, unchanged)

| Group | Items |
|---|---|
| Tagesgeschäft | Termine, Tickets, Inbox, Live, Nachrichten, Räume |
| Klienten | Klienten, Projekte, Followups |
| Coaching | Sessions, Brett |
| Wissen & Inhalte | Website-Inhalte, Drafts, Quellen, Vorlagen |
| Geld | Rechnungen, Buchhaltung |
| Plattform | Monitoring, Cluster-Steuerung, Einstellungen |

**Footer** (unchanged): Zur Website, Abmelden

**Removed from nav (12 items):** Meetings, Kalender, Coaching→Projekte, KI-Einstellungen, Zeiterfassung, Steuer, Software-History, Systemtest, Arena, Newsletter (was missing, stays missing — already in Website-Inhalte)

**Icon fix:** Einstellungen changes from `bell` → `settings` icon.

### Portal Sidebar — Final navItems

Dashboard, Dateien, *(separator)*, Fragebögen, Verträge, Kalender, Rechnungen, Buchung

**Removed:** Arena  
**Restored:** Buchung (was accidentally excluded; booking flow exists independent of Stripe)

---

## Consolidation — Removed Pages Stay Accessible

Every removed nav item has real functionality. Rather than migrating code, each target page gets a tab or link-section that routes to the existing page. The removed pages themselves are **not deleted**.

| Removed page | Target page | How |
|---|---|---|
| `/admin/meetings` | `/admin/clients` | New "Meetings" tab in the Klienten page tab-bar |
| `/admin/kalender` | `/admin/termine` | New "Kalender" tab next to the existing view |
| `/admin/coaching/projekte` | `/admin/coaching/sessions` | New "Projekte" tab in the Sessions tab-bar |
| `/admin/coaching/settings` | `/admin/einstellungen/*` | New "Coaching & KI" tab in `AdminEinstellungenTabs.astro` |
| `/admin/zeiterfassung` | `/admin/rechnungen` | New "Zeiterfassung" tab in the Rechnungen page |
| `/admin/steuer` | `/admin/buchhaltung` | New "Steuer" tab in the Buchhaltung page |
| `/admin/software-history` | `/admin/monitoring` | Link-card at bottom of Monitoring page |
| `/admin/systemtest/board` | `/admin/monitoring` | Link-card at bottom of Monitoring page |
| `/admin/arena` | *(dropped from nav)* | Still reachable at `/admin/arena` directly |

**Tab implementation pattern:** For pages that already have a tab-bar (Einstellungen), add a new tab entry. For pages that have no tabs yet (Termine, Klienten, Sessions, Rechnungen, Buchhaltung), add a minimal tab-bar at the top with "Overview" (current content) + the new tab as a navigation link. Clicking the new tab navigates to the existing removed page — no content is inlined.

---

## Files Changed

### `website/src/layouts/AdminLayout.astro`
- Remove 9 items from `navGroups` (Meetings, Kalender, Coaching→Projekte, KI-Einstellungen, Zeiterfassung, Steuer, Software-History, Systemtest, Arena)
- Change Einstellungen icon from `bell` → `settings`

### `website/src/layouts/PortalLayout.astro`
- Remove Arena from `navItems`
- Restore Buchung to `navItems`

### `website/src/components/AdminEinstellungenTabs.astro`
- Add "Coaching & KI" tab linking to `/admin/coaching/settings`

### `website/src/pages/admin/termine.astro`
- Add tab-bar: "Termine" (current) | "Kalender" → `/admin/kalender`

### `website/src/pages/admin/clients.astro`
- Add tab-bar: "Klienten" (current) | "Meetings" → `/admin/meetings`

### `website/src/pages/admin/coaching/sessions/index.astro`
- Add tab-bar: "Sessions" (current) | "Projekte" → `/admin/coaching/projekte`

### `website/src/pages/admin/rechnungen.astro`
- Add tab-bar: "Rechnungen" (current) | "Zeiterfassung" → `/admin/zeiterfassung`

### `website/src/pages/admin/buchhaltung.astro`
- Add tab-bar: "Buchhaltung" (current) | "Steuer" → `/admin/steuer`

### `website/src/pages/admin/monitoring.astro`
- Add two link-cards at bottom: "Software-History" → `/admin/software-history`, "Systemtest" → `/admin/systemtest/board`

---

## Non-Goals

- No content migration — removed pages keep their own URL and content unchanged
- No changes to any page's internal logic or data loading
- No changes to `matches` arrays in nav items — active-state highlighting is unaffected for remaining items
- No changes to the `/admin/arena` page itself
