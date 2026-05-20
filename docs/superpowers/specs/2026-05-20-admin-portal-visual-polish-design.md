# Admin + Portal Visual Polish

**Date:** 2026-05-20  
**Branch:** feature/admin-portal-visual-polish  
**Status:** approved

## Problem

The Platform Control Center uses expressive color (green/red/yellow status indicators, colored cluster dots, emoji) while the admin sidebar, admin dashboard (mentolder branch), and user portal sidebar use flat monochromatic icons. Portal sidebar icons are also undersized (15×15 px, stroke-width 1.2) compared to the admin sidebar (20×20 px, stroke-width 1.5). The result is a visible quality gap between the PCC and the rest of the authenticated surfaces.

## Goals

1. Every nav icon on admin sidebar and portal sidebar gets a subtle tinted background container with a per-section accent color.
2. Portal sidebar icons grow from 15 px to 20 px with stroke-weight corrected to 1.5.
3. The mentolder admin dashboard is rewritten to use `admin-premium.css` tokens — KPI cards get colored left-border state accents, ServiceLinks tiles get the tint container system.
4. Visual language stays consistent with the existing mentolder dark brass theme — no new fonts, no new token names outside `admin-premium.css`.

## Color Palette

| Surface | Group / Section | Color | Hex / Token |
|---|---|---|---|
| Admin sidebar | Kern (Calendar, Inbox, Stream) | Brass | `oklch(0.80 0.09 75)` = `var(--admin-primary)` |
| Admin sidebar | CRM (Clients, Projects) | Teal | `#2dd4bf` |
| Admin sidebar | Coaching (Sessions, Brett) | Violet | `#a78bfa` |
| Admin sidebar | Redaktion (Content, Assets) | Sky | `#38bdf8` |
| Admin sidebar | Kapital (Invoices, Accounting) | Emerald | `#34d399` |
| Admin sidebar | Kontrollzentrum (Platform, Settings) | Indigo | `#818cf8` = `var(--admin-accent)` |
| Admin sidebar | Dashboard (top link) | Brass | `var(--admin-primary)` |
| Portal sidebar | overview | Brass | `var(--brass)` |
| Portal sidebar | dateien | Sky | `#38bdf8` |
| Portal sidebar | fragebögen | Violet | `#a78bfa` |
| Portal sidebar | vertraege | Emerald | `#34d399` |
| Portal sidebar | kalender | Brass | `var(--brass)` |
| Portal sidebar | rechnungen | Emerald | `#34d399` |
| Portal sidebar | buchung | Teal | `#2dd4bf` |

## Section 1 — Icon Tint Container System

### Visual specification

Each `<span class="nav-icon">` becomes a tinted pill:

```
border-radius: 8px
padding: 5px
background: rgba(<accent>, 0.12)   ← at rest
color: rgba(<accent>, 0.70)        ← icon stroke at rest

:hover / .is-active:
background: rgba(<accent>, 0.18)
color: <accent>                    ← full brightness
```

The existing `scale(1.1)` hover transform on `.nav-icon` is preserved.

### Admin sidebar implementation

Add CSS classes to `admin-premium.css`:

```css
.nav-icon-kern      { --ni-color: oklch(0.80 0.09 75); }
.nav-icon-crm       { --ni-color: #2dd4bf; }
.nav-icon-coaching  { --ni-color: #a78bfa; }
.nav-icon-redaktion { --ni-color: #38bdf8; }
.nav-icon-kapital   { --ni-color: #34d399; }
.nav-icon-kontrolle { --ni-color: #818cf8; }

[class*="nav-icon-"] {
  border-radius: 8px;
  padding: 5px;
  background: color-mix(in srgb, var(--ni-color) 12%, transparent);
  color: color-mix(in srgb, var(--ni-color) 70%, transparent);
}

.sidebar-nav-item:hover [class*="nav-icon-"],
.sidebar-nav-item.is-active [class*="nav-icon-"] {
  background: color-mix(in srgb, var(--ni-color) 18%, transparent);
  color: var(--ni-color);
}
```

Each `<span class="nav-icon">` in `AdminLayout.astro` gets its group's modifier class. The Dashboard link above the groups gets `nav-icon-kern`.

### Portal sidebar implementation

Portal stays self-contained (no new CSS file). Each `.nav-icon` span gets inline `style` with the tint values from the palette table above. The icon SVG within inherits `currentColor`.

## Section 2 — Portal Icon Size Fix

Three changes in `PortalLayout.astro`:

1. **Container size**: `width:15px; height:15px` → `width:20px; height:20px` on every `.nav-icon` span.
2. **Stroke weight**: All 8 portal SVG definitions change `stroke-width="1.2"` → `stroke-width="1.5"`.
3. **Row breathing room**: Nav item `padding:7px 9px` → `padding:8px 10px`; `gap:9px` → `gap:10px`.

Active/hover state colors (`--brass-d`, `--brass`) are unchanged.

## Section 3 — Admin Dashboard Premium Redesign (mentolder branch)

The mentolder branch of `admin.astro` (the `else` block starting at line 178) is rewritten to use `admin-premium.css` tokens. The Kore branch is untouched.

### Header

```html
<div style="margin-bottom:2.5rem;">
  <p style="font-family:var(--font-mono); font-size:0.7rem; color:var(--admin-text-disabled); 
            text-transform:uppercase; letter-spacing:0.15em; margin-bottom:4px;">
    Verwaltung & Werkzeuge
  </p>
  <h1 style="font-family:var(--font-serif); font-size:2rem; font-weight:700; 
             color:var(--admin-text); letter-spacing:-0.02em;">Admin</h1>
</div>
```

### KPI Cards

Replace the Tailwind `border-yellow-800` / `border-red-800` grid with `admin-card` divs + 3 px left-border accents:

```
is-ok   → border-left: 3px solid #34d399
is-warn → border-left: 3px solid oklch(0.80 0.09 75)
is-fail → border-left: 3px solid #f87171
default → border-left: 3px solid var(--admin-border)
```

KPI value: `font-size:1.5rem; font-weight:700; color:var(--admin-text)`  
KPI label: `font-size:0.7rem; color:var(--admin-text-mute)`  
KPI suffix: `font-size:0.75rem; color:var(--admin-text-disabled)`

### ServiceLinks Grid

The `<ServiceLinks>` component is replaced inline with an `admin-card`-wrapped grid. Each service tile:
- Base: `admin-card` class + `display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer`
- Icon: tint container using the palette below
- Label: `font-size:11px; color:var(--admin-text-mute)`
- `text-decoration:none` (link reset)

Service-to-color mapping:

| Service | Color |
|---|---|
| Inbox | Brass `var(--admin-primary)` |
| Nextcloud Files | Sky `#38bdf8` |
| Nextcloud Calendar | Brass |
| Nextcloud Contacts | Teal `#2dd4bf` |
| Nextcloud Talk | Violet `#a78bfa` |
| Brett | Violet `#a78bfa` |
| Arena | Indigo `#818cf8` |
| Abrechnung | Emerald `#34d399` |
| Passwörter | Emerald `#34d399` |
| Keycloak | Indigo `#818cf8` |
| Docs | Sky `#38bdf8` |
| Monitoring | Brass |
| Mailpit | Teal `#2dd4bf` |

## Files Changed

| File | Change |
|---|---|
| `website/src/styles/admin-premium.css` | Add `.nav-icon-*` tint classes |
| `website/src/layouts/AdminLayout.astro` | Add group modifier classes to `<span class="nav-icon">` |
| `website/src/layouts/PortalLayout.astro` | Fix icon sizes, stroke-width, padding; add inline tint styles |
| `website/src/pages/admin.astro` | Rewrite mentolder dashboard section with premium tokens |

## Out of Scope

- Kore / korczewski brand (unchanged)
- Platform Control Center tabs (FluxCD, Software, Hardware, etc.)
- Any backend changes
- Mobile layout changes beyond what inherits from the above
