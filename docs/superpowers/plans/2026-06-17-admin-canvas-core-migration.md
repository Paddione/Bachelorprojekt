---
date: 2026-06-17
slug: admin-canvas-core-migration
title: "Plan 4/5: Core Admin Page Migration"
status: planning
domains: [website]
ticket_id: T000940
plan_ref: docs/superpowers/specs/2026-06-17-admin-canvas-design.md
depends_on: [admin-canvas-dashboard-nav]
effort: M
risk: medium
---

# Plan 4/5: Core Admin Page Migration

Migrate the 6 highest-traffic admin pages to use the shared component library.
Each page gets a consistent `AdminPageHeader`, data tables use `AdminTable`,
and forms use `AdminFormField`.

## Tasks

### T1: Migrate /admin/clients

**Current**: Tailwind classes (`bg-dark`, `text-light`, `font-serif`, `text-muted`, `border-dark-lighter`) + inline styles + custom tab bar + custom table

**Replace with**:
- `AdminPageHeader` (title: "Klienten", description: `{users.length} Benutzer`, actions slot: buttons)
- `AdminTabs` (tabs: Klienten, Meetings — currently inline styled links)
- `AdminTable` for user list (columns: Name, Email, Kundennummer, Rollen, Status, Aktionen)
- `AdminBadge` for status indicators
- Remove Tailwind classes from the template

**Target files**: `website/src/pages/admin/clients.astro` (~50 lines changed)

### T2: Migrate /admin/projekte

**Current**: Tailwind classes + inline styles + custom table

**Replace with**:
- `AdminPageHeader` (title: "Mandate", actions: filter/new buttons)
- `AdminTable` for project list with sortable columns
- `AdminBadge` for project status (aktiv, abgeschlossen, pausiert)

**Target files**: `website/src/pages/admin/projekte.astro` (~40 lines changed)

### T3: Migrate /admin/rechnungen

**Current**: Tailwind classes + inline styles + custom table

**Replace with**:
- `AdminPageHeader` (title: "Fakturierung")
- `AdminTable` for invoice list (columns: Nummer, Klient, Betrag, Status, Datum, Aktionen)
- `AdminBadge` for invoice status (bezahlt, offen, überfällig)

**Target files**: `website/src/pages/admin/rechnungen.astro` (~30 lines changed)

### T4: Migrate /admin/inbox

**Current**: Simple wrapper around `InboxApp.svelte` — minimal changes needed

**Add**: `AdminPageHeader` at the top (title: "Postfach", description with filter status)

**Target files**: `website/src/pages/admin/inbox.astro` (~10 lines changed)

### T5: Migrate /admin/cockpit

**Current**: Simple wrapper around `Cockpit.svelte` — minimal changes needed

**Add**: `AdminPageHeader` at the top (title: "Cockpit", actions slot with ticket buttons)

**Target files**: `website/src/pages/admin/cockpit.astro` (~10 lines changed)

### T6: Migrate /admin/members

**Current**: Tailwind classes + inline styles + custom table

**Replace with**:
- `AdminPageHeader` (title: "Mitglieder", actions slot)
- `AdminTable` for member list with sortable columns
- `AdminBadge` for membership status

**Target files**: `website/src/pages/admin/members.astro` (~30 lines changed)

### T7: Migrate AdminEinstellungenTabs.astro → AdminTabs

Replace the custom tab implementation in `AdminEinstellungenTabs.astro` with `AdminTabs` component. This affects all 6 settings pages under `/admin/einstellungen/*`.

**Target files**: `website/src/components/AdminEinstellungenTabs.astro` (~20 lines changed)

### T8: Verify

```bash
pnpm --prefix website run dev
# Navigate to each migrated page:
# /admin/clients — table renders, tabs work, sorting works
# /admin/projekte — table renders, badges show correct colors
# /admin/rechnungen — table renders, badges show correct colors
# /admin/inbox — page header shows, InboxApp still works
# /admin/cockpit — page header shows, Cockpit still works
# /admin/members — table renders, badges work
# /admin/einstellungen/benachrichtigungen — tabs work, settings save works
task test:changed
task freshness:regenerate
task freshness:check
```

## Verification

| Gate | Expected |
|------|----------|
| `task test:changed` | PASS |
| `task freshness:regenerate` + `task freshness:check` | PASS |
| `pnpm --prefix website run build` | PASS — no build errors |
| Visual: all 7 migrated pages | Consistent headers, tables, badges, tabs |
| Visual: responsive (mobile, tablet, desktop) | Pages render correctly at all breakpoints |
| Functional: sorting, filtering, tab switching | All interactive features work |
| Regression: neighboring pages | Unchanged pages still render correctly |

## Target Files

- `website/src/pages/admin/clients.astro` (MODIFY)
- `website/src/pages/admin/projekte.astro` (MODIFY)
- `website/src/pages/admin/rechnungen.astro` (MODIFY)
- `website/src/pages/admin/inbox.astro` (MODIFY)
- `website/src/pages/admin/cockpit.astro` (MODIFY)
- `website/src/pages/admin/members.astro` (MODIFY)
- `website/src/components/AdminEinstellungenTabs.astro` (MODIFY)
