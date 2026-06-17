---
date: 2026-06-17
slug: admin-canvas
title: "Canvas Admin UI — Cohesive Redesign"
status: draft
domains: [website]
ticket_id: T000937
plan_ref: null
---

# Canvas Admin UI — Design Spec

## Problem

The admin interface has **69 pages** with **no shared UI primitives**. Every page
invents its own buttons, tables, modals, forms, tabs, and cards inline — resulting
in visual inconsistency, duplicated effort, and a fragmented feel. Design tokens
are split across 4 CSS files with overlapping definitions. The dashboard has two
completely separate rendering paths (mentolder vs korczewski). SVG icons are
duplicated. The sidebar groups (6 groups, 22 items) overlap conceptually.

## Design Vision

A single, coherent dark-themed application where every page speaks the same design
language. Like a "canvas" — the sidebar provides navigation context, and every
page follows the same visual grammar via a shared component library.

### Design Language

- **Ink-based dark theme**: navy-black backgrounds (`#0b111c` surface scale), subtle
  depth via `rgba(255,255,255,0.04–0.12)` surface/hairline layers
- **Brass/gold primary accent** (`oklch(0.80 0.09 75)`): primary actions, active states,
  focus rings — consistent across all pages
- **Semantic color coding**: sage (success/ok), coral/red (danger/error), indigo
  (info/platform), applied via component variants, not per-page
- **Typography hierarchy**: Newsreader serif for page titles, Geist sans for body
  and UI, Geist Mono for data/code/metrics
- **8px baseline spacing**: `--space-1: 4px` through `--space-8: 64px`, used
  consistently in padding, gaps, margins
- **Hairline borders only**: no heavy shadows, no glass morphism — `rgba(255,255,255,0.07)`
  and `rgba(255,255,255,0.12)` for all dividers and card borders
- **No film grain in admin**: performance overhead on data-heavy pages; confine to
  public-facing pages only

### Navigation Architecture

Current: 6 groups, 22 items, overlapping concepts ("Kern" and "Kontrollzentrum" both
contain platform/ops items).

Proposed: 3 sections organized by workflow, each with a clear visual separator:

```
SECTION: Übersicht (always expanded, no label — essential daily tools)
  Dashboard   /admin            — KPIs, service links
  Cockpit     /admin/cockpit    — ticket board, bugs, factory
  Inbox       /admin/inbox      — with unread badge
  Kalender    /admin/termine    — appointments

SECTION: Geschäft (client-facing business operations)
  Klienten    /admin/clients    — customer list + detail
  Mitglieder  /admin/members    — member management
  Mandate     /admin/projekte   — project tracking
  ── divider
  Sitzungen   /admin/coaching/sessions
  Fragebögen  /admin/fragebogen
  ── divider
  Fakturierung /admin/rechnungen
  Kontierung   /admin/buchhaltung

SECTION: Werkstatt (tools, content, configuration)
  Content Hub  /admin/inhalte
  Wissensbasis /admin/wissen
  Assets       /admin/assets
  3D Generator /admin/asset-generation
  ── divider
  Plattform Hub /admin/platform
  Architektur   /admin/architektur
  Dev Status    /dev-status
  ── divider
  KI-Konfiguration /admin/ki-konfiguration
  Prompt-Bibliothek /admin/prompts
  Einstellungen     /admin/einstellungen/benachrichtigungen
  ── divider
  Systembrett   → external (brett)
  Arena         /admin/arena      (korczewski only)
  Live-Stream   /admin/live
```

### Component Library

Nine shared Svelte primitives covering all admin patterns:

| Component | Purpose | Key Props |
|-----------|---------|-----------|
| `AdminCard` | Content container | `variant` (default, flat, interactive), `header`, `footer` slots |
| `AdminPageHeader` | Page title area | `title`, `description`, `breadcrumbs`, `actions` slot |
| `AdminStatCard` | KPI/metric display | `value`, `label`, `trend`, `color` (brass, sage, indigo, danger) |
| `AdminTable` | Data tables | `columns`, `rows`, `sortable`, `emptyState` slot, loading state |
| `AdminTabs` | Tab navigation | `tabs`, `active`, animated indicator, keyboard nav |
| `AdminModal` | Overlay dialog | `open`, `title`, `size` (sm/md/lg), body/footer slots |
| `AdminFormField` | Form row | `label`, `error`, `hint`, variant (text, select, toggle, textarea) |
| `AdminBadge` | Status indicator | `variant` (success, warning, error, info, neutral) |
| `AdminEmptyState` | Empty placeholder | `icon`, `title`, `description`, `action` slot |

### Dashboard Unification

Replace the two separate rendering paths (mentolder: custom cards + admin-card classes,
korczewski: ka-* classes) with a single dashboard that uses AdminStatCard for KPIs
and AdminCard sections for service links. Brand differentiation via brand-specific
CSS variables (already supported by `:root` + brand class), not separate render paths.

### Design Token Consolidation

Move all admin design tokens into `admin-foundation.css` that extends `global.css`:

```css
/* admin-foundation.css — loaded after global.css in AdminLayout */

:root {
  /* --- Spacing scale --- */
  --space-1: 4px;   --space-2: 8px;   --space-3: 12px;
  --space-4: 16px;  --space-5: 20px;  --space-6: 24px;
  --space-7: 32px;  --space-8: 64px;

  /* --- Component tokens --- */
  --admin-card-radius: 12px;
  --admin-card-padding: 20px;
  --admin-input-height: 40px;
  --admin-input-radius: 8px;
  --admin-table-row-height: 44px;
  --admin-modal-backdrop: rgba(0, 0, 0, 0.6);

  /* --- Font sizes --- */
  --admin-text-xs: 11px;  --admin-text-sm: 13px;
  --admin-text-md: 14px;  --admin-text-lg: 16px;

  /* --- Z-index --- */
  --z-sidebar: 50;  --z-modal: 100;  --z-dropdown: 80;
}
```

### Consistency Rules (enforced by components)

1. Every admin page uses `AdminPageHeader` at the top
2. Data listings use `AdminTable` (never custom inline tables)
3. Modals use `AdminModal` (never inline dialogs)
4. Forms use `AdminFormField` for labeled inputs
5. Status indicators use `AdminBadge`
6. Empty states use `AdminEmptyState`
7. Containers use `AdminCard` with consistent padding

## Acceptance Criteria

- [ ] All 69 admin pages render without visual regression
- [ ] Dashboard renders identically for both mentolder and korczewski (brand colors differ)
- [ ] No film grain visible on admin pages
- [ ] No duplicated SVG icons (single source in admin-icons.ts)
- [ ] Sidebar groups reduced from 6 to 3 logical sections
- [ ] `task test:changed` passes for all plans
- [ ] `task freshness:regenerate` + `task freshness:check` pass
- [ ] No hardcoded hostnames or brand-specific literals in component code
- [ ] CI gate passes (`task workspace:validate`)

## Non-Goals

- Adding new features to admin pages (this is a visual/structural refactor)
- Changing backend APIs or data fetching
- Replacing the korczewski brand styles (kore-app.css) for non-admin pages
- Creating a design system documentation site
