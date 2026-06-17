---
date: 2026-06-17
slug: admin-canvas-dashboard-nav
title: "Plan 3/5: Dashboard Unification & Navigation Restructure"
status: planning
domains: [website]
ticket_id: T000939
plan_ref: docs/superpowers/specs/2026-06-17-admin-canvas-design.md
depends_on: [admin-canvas-components]
effort: M
risk: medium
---

# Plan 3/5: Dashboard Unification & Navigation Restructure

Unify the two parallel dashboard rendering paths (mentolder + korczewski) into one
component-based implementation. Restructure the sidebar navigation from 6 groups
into 3 logical workflow sections.

## Tasks

### T1: Unify admin.astro dashboard

**Remove**: The `isKore` ternary that renders two completely different dashboard layouts (lines 131–236 of `admin.astro`)

**Replace with**: A single rendering path using the component library:
```
AdminPageHeader(title="Übersicht", description=`Stand ${stand} · ${datum}`)
  └── AdminStatCard grid (4 KPIs: activeProjects, openInvoices, openBugCount, freeSlots)
  └── AdminCard(header: "Dienste")
      └── Service link grid (Nextcloud, Keycloak, Vaultwarden, etc.)
  └── AdminCard(header: "Schnellzugriffe")
      └── AdminShortcuts component (existing, unchanged)
```

The `SVG` icon constants in `admin.astro` (lines 57–72) will be replaced with references to `icons` from `admin-icons.ts`.

Brand differentiation is handled via CSS variables (`--admin-primary`, etc.) which already differ between brands. No code branches needed.

**Target files**: `website/src/pages/admin.astro` (~100 lines removed, ~40 lines added)

### T2: Restructure AdminLayout sidebar

In `AdminLayout.astro`, replace the 6 `navGroups` with 3 workflow sections:

```typescript
const navSections: { label?: string; items: NavItem[] }[] = [
  {
    // No label — essential daily tools, always visible
    items: [
      { href: '/admin',          label: 'Dashboard', icon: 'dashboard' },
      { href: '/admin/cockpit',  label: 'Cockpit',   icon: 'tag', matches: ['/admin/cockpit', '/admin/tickets'] },
      { href: '/admin/inbox',    label: 'Postfach',   icon: 'inbox', badge: inboxPending },
      { href: '/admin/termine',  label: 'Kalender',   icon: 'calendar' },
    ],
  },
  {
    label: 'Geschäft',
    items: [
      { href: '/admin/clients',             label: 'Klienten',    icon: 'users' },
      { href: '/admin/members',             label: 'Mitglieder',  icon: 'users' },
      { href: '/admin/projekte',            label: 'Mandate',     icon: 'folder' },
      { href: '/admin/coaching/sessions',   label: 'Sitzungen',   icon: 'clipboard', matches: ['/admin/coaching/sessions', '/admin/fragebogen'] },
      { href: '/admin/rechnungen',          label: 'Fakturierung', icon: 'receipt', matches: ['/admin/rechnungen', '/admin/billing'] },
      { href: '/admin/buchhaltung',         label: 'Kontierung',  icon: 'scale' },
    ],
  },
  {
    label: 'Werkstatt',
    items: [
      { href: '/admin/inhalte',                       label: 'Content Hub',  icon: 'layout', matches: ['/admin/inhalte', '/admin/startseite', '/admin/uebermich', '/admin/angebote', '/admin/faq', '/admin/kontakt', '/admin/referenzen', '/admin/rechtliches', '/admin/dokumente'] },
      { href: '/admin/wissen',                        label: 'Wissensbasis', icon: 'book',  matches: ['/admin/wissen', '/admin/wissensquellen', '/admin/knowledge'] },
      { href: '/admin/assets',                        label: 'Assets',       icon: 'palette' },
      { href: '/admin/asset-generation',              label: '3D Generator', icon: 'palette' },
      { href: '/admin/platform',                      label: 'Plattform Hub',icon: 'monitor', matches: ['/admin/monitoring', '/admin/ops', '/admin/platform'] },
      { href: '/admin/architektur',                   label: 'Architektur',  icon: 'server', matches: ['/admin/architektur'] },
      { href: '/dev-status',                          label: 'Dev Status',   icon: 'activity', matches: ['/dev-status', '/admin/planungsbuero', '/admin/factory-budget', '/admin/factory-observability'] },
      { href: '/admin/ki-konfiguration',              label: 'KI-Konfig.',   icon: 'cpu', matches: ['/admin/ki-konfiguration'] },
      { href: '/admin/prompts',                       label: 'Prompts',      icon: 'book' },
      { href: '/admin/einstellungen/benachrichtigungen', label: 'Einstellungen', icon: 'settings', matches: ['/admin/einstellungen/'] },
      { href: BRETT_URL,                              label: 'Systembrett',  icon: 'brett', external: true },
      ...(isKore ? [{ href: '/admin/arena',           label: 'Arena',        icon: 'arena' }] : []),
      { href: '/admin/live',                          label: 'Live-Stream',  icon: 'broadcast' },
    ],
  },
];
```

Remove `iconClass` group coloring (each section uses a consistent muted color for icons, active state uses brass). This reduces the visual noise of 6 different accent colors in the sidebar.

**Target files**: `website/src/layouts/AdminLayout.astro` (~30 lines changed)

### T3: Update admin-premium.css for new nav

- Remove per-group color classes (`.nav-icon-kern`, `.nav-icon-crm`, `.nav-icon-coaching`, `.nav-icon-redaktion`, `.nav-icon-kapital`, `.nav-icon-kontrolle` and the `[class*="nav-icon-"]` generic rule)
- Replace with single uniform icon styling: muted gray by default, brass (`--admin-primary`) on active/hover
- Add visual dividers between nav sections (thin `--admin-border` line)
- Add `title` attribute to all nav items for collapsed sidebar tooltips (tablet view)
- Keep existing responsive behavior (mobile slide-over, tablet icon rail, desktop full sidebar)

**Target files**: `website/src/styles/admin-premium.css` (~20 lines removed, ~15 lines added)

### T4: Verify

```bash
pnpm --prefix website run dev
# Visual check:
# 1. Dashboard renders correctly for mentolder brand
# 2. Dashboard renders correctly for korczewski brand (set BRAND=korczewski)
# 3. Sidebar shows 3 sections with correct items
# 4. All existing nav links still work
# 5. Collapsed sidebar shows tooltips on hover
# 6. Mobile hamburger menu shows all items
# 7. Active state highlights correctly for all pages
task test:changed
task freshness:regenerate
task freshness:check
```

## Verification

| Gate | Expected |
|------|----------|
| `task test:changed` | PASS |
| `task freshness:regenerate` + `task freshness:check` | PASS |
| Visual: Dashboard (mentolder) | KPI cards, service links, shortcuts render correctly |
| Visual: Dashboard (korczewski) | Same layout, korczewski brand colors via CSS vars |
| Visual: Sidebar sections | 3 sections, correct items, dividers between sections |
| Visual: Active states | Current page highlighted in all sections |
| Visual: Tablet (768–1023px) | Icon-only rail with tooltips |
| Visual: Mobile (< 768px) | Hamburger menu with all items |
| URL: all nav links | Every href resolves to correct admin page |

## Target Files

- `website/src/pages/admin.astro` (MODIFY — major refactor)
- `website/src/layouts/AdminLayout.astro` (MODIFY — nav restructure)
- `website/src/styles/admin-premium.css` (MODIFY — remove group colors, add section dividers)
