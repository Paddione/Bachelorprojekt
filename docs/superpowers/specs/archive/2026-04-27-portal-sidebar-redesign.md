# Portal Sidebar Redesign

**Date:** 2026-04-27
**Scope:** `website/src/layouts/PortalLayout.astro` + portal dashboard page

---

## Problem

The portal sidebar had 13 items across 5 labelled groups. Several items were redundant (Alle Dienste, Onboarding, Projekte) or could be absorbed elsewhere (Besprechungen → Kalender). The 2-column tile grid layout also felt heavy and dated compared to the admin sidebar.

---

## Decisions Made

| Question | Decision |
|---|---|
| Which sidebar? | Portal only (PortalLayout.astro) |
| Layout structure | Slim flat list — no group labels |
| Icon style | Thin outline, stroke 1.2, existing SVG style |
| Besprechungen | Removed — meeting links live in Kalender entries |
| Projekte | Removed |
| Onboarding | Removed |
| Alle Dienste | Removed — replaced by service row on Dashboard |
| Buchung | New item — lets users book services/appointments |
| Verträge | Renamed from Unterschriften (clearer label) |

---

## New Sidebar Structure

```
[user avatar + name + role]
─────────────────────────
Dashboard                   ← renamed from Übersicht
─────────────────────────
Dateien
Fragebögen                  [badge: pendingQuestionnaires]
Verträge                    [badge: pendingSignatures]     ← renamed from Unterschriften
Kalender                    ← absorbs meeting links
Rechnungen
Buchung                     ← new
─────────────────────────
Konto
Abmelden                    [danger style]
```

**Item count:** 8 nav items + 2 footer items (was 13 items across 5 groups).

---

## Dashboard Page

The Dashboard (`/portal/dashboard`) replaces the old Übersicht grid. It has three sections:

### 1. Pending alerts (conditional)
Shown only when `pendingSignatures > 0` or `pendingQuestionnaires > 0`. Each alert is a single-line banner with a direct "Ansehen →" link to the relevant section. Styled with brass border + background tint.

### 2. Service tiles (always shown)
3-column grid with one tile per nav item:

| Tile | Subtitle / badge |
|---|---|
| Dateien | "Dokumente & Freigaben" |
| Verträge | badge if pending |
| Fragebögen | badge if pending |
| Kalender | "Termine & Meeting-Links" |
| Rechnungen | date of last invoice |
| Buchung | "Termin anfragen" |

Each tile links to its corresponding portal page. Same icon as the sidebar item.

### 3. External services row (always shown)
Small secondary tiles linking to external services in new tabs:
- Nextcloud (`files.{domain}`)
- Collabora (`office.{domain}`)
- Vaultwarden (`vault.{domain}`)

Domain values come from `config` (brand config, already available in the layout).

---

## Icon Style

All icons remain inline SVG strings in the `icons` Record in `PortalLayout.astro`. No external library.

- `viewBox="0 0 16 16"`
- `stroke="currentColor"`, `stroke-width="1.2"` (reduced from 1.5)
- `stroke-linecap="round"`, `stroke-linejoin="round"`
- `fill="none"` (except dot glyphs like the questionnaire icon)

New icon needed: `buchung` — a clock/circle-with-arrow-or-checkmark motif. Suggested SVG:
```svg
<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="8" cy="8" r="5.5"/>
  <path d="M8 5.5v2.5l1.5 1.5"/>
</svg>
```

---

## Portal Architecture Note

The portal is a **single page** at `website/src/pages/portal.astro`. Section routing is done via `?section=<id>` query param. Each section renders a separate component from `website/src/components/portal/`.

## Files to Change

### `website/src/layouts/PortalLayout.astro`
- Rewrite `navGroups` → flat `NavItem[]` array (no groups, no labels)
- Add `buchung` icon to the `icons` Record
- Rename `unterschriften` → `vertraege` in icon key and nav label
- Remove items: `besprechungen`, `nachrichten`, `termine`, `projekte`, `onboarding`, `dienste`
- Rename nav label: `Übersicht` → `Dashboard`, `Unterschriften` → `Verträge`
- Reduce sidebar tile layout to a plain list (remove the existing 2-column grid CSS if present)

### `website/src/pages/portal.astro`
- Add `section === 'buchung'` branch rendering new `BuchungSection`
- Add `section === 'vertraege'` branch (alias for existing `SignaturesTab` content); keep `unterschriften` as a redirect alias so any bookmarked URLs still work
- Remove `section === 'termine'`, `section === 'projekte'`, `section === 'onboarding'`, `section === 'dienste'` branches (or keep them as silent no-ops for backward compat — they just won't appear in the sidebar)
- Rename `section === 'overview'` → `section === 'dashboard'`; keep `overview` as alias

### `website/src/components/portal/OverviewSection.astro` (rename → `DashboardSection.astro`)
- Replace current layout with: pending alerts + 6 service tiles + external services row
- Props needed: `pendingSignatures`, `pendingQuestionnaires`, `ncBase`, `vaultUrl`, `keycloakBase`, and URLs for Collabora (`officeUrl`) — add `COLLABORA_EXTERNAL_URL` env var read in portal.astro

### `website/src/components/portal/BuchungSection.astro` (new file)
- New section for service booking
- Can link out to CalDAV booking URL or embed an iframe; exact implementation TBD with user

---

## Props Interface

No change to the `PortalLayout` Props interface — `pendingSignatures` and `pendingQuestionnaires` are already passed in. The dashboard page reads these same values.

The `section` prop continues to drive the active state. Value for the new item: `'buchung'`.

---

## What Is Not Changing

- Admin sidebar (`AdminLayout.astro`) — out of scope
- Navigation.svelte (public header) — out of scope
- Visual design tokens (colors, fonts, radius) — unchanged
- Mobile hamburger menu behavior — unchanged
- Hover and active state CSS (`.portal-nav-item`) — unchanged, just fewer items

---

## Success Criteria

- Portal sidebar shows exactly 8 nav items + 2 footer items, no group labels
- Dashboard surfaces pending badges as visible alerts above the fold
- Buchung page exists and is reachable
- Meeting links accessible via Kalender (no standalone Besprechungen route needed)
- No regression in other portal pages (section active state still works)
