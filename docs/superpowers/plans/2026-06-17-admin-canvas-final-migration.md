---
date: 2026-06-17
slug: admin-canvas-final-migration
title: "Plan 5/5: Final Page Migration & Polish"
status: planning
domains: [website]
ticket_id: T000941
plan_ref: docs/superpowers/specs/2026-06-17-admin-canvas-design.md
depends_on: [admin-canvas-core-migration]
effort: L
risk: low
---

# Plan 5/5: Final Page Migration & Polish

Migrate all remaining ~55 admin pages to use the component library. This is a
mechanical migration — every page gets an `AdminPageHeader`, data pages use
`AdminTable`, forms use `AdminFormField` and `AdminCard`. Remove dead code,
dead redirects, and consolidate remaining CSS.

## Tasks

### T1: Batch-migrate settings pages

All 6 settings pages under `/admin/einstellungen/*`:
- `benachrichtigungen.astro` — wrap form in `AdminCard`, use `AdminFormField`
- `email.astro` — same pattern
- `rechnungen.astro` — same pattern
- `branding.astro` — same pattern
- `backup.astro` — same pattern
- `ordner-templates.astro` — same pattern

Pattern for each: `<AdminCard>` wraps the form, `<AdminFormField>` replaces ad-hoc labeled inputs, `<AdminPageHeader>` at top.

**Target files**: 6 astro files (MODIFY, ~10 lines each)

### T2: Batch-migrate coaching pages

- `coaching/sessions/index.astro` → AdminPageHeader + AdminTable
- `coaching/sessions/[id].astro` → AdminPageHeader + AdminCard
- `coaching/sessions/new.astro` → AdminPageHeader + AdminCard + AdminFormField
- `coaching/projekte/index.astro` → AdminPageHeader + AdminTable
- `coaching/projekte/[id].astro` → AdminPageHeader + AdminCard
- `coaching/settings.astro` → AdminPageHeader + AdminCard

**Target files**: 6 astro files (MODIFY, ~10 lines each)

### T3: Batch-migrate content/editor pages

- `inhalte.astro` — add AdminPageHeader (InhalteEditor handles the rest)
- `startseite.astro`, `uebermich.astro`, `angebote.astro`, `faq.astro`, `kontakt.astro`, `referenzen.astro`, `rechtliches.astro`, `dokumente.astro`, `50plus-digital.astro`, `beratung.astro`, `fuehrung-persoenlichkeit.astro`, `ki-transition.astro` — each: AdminPageHeader
- `newsletter.astro`, `meetings.astro`, `meetings/[id].astro` — AdminPageHeader + AdminCard
- `kalender.astro` → AdminPageHeader

**Target files**: ~17 astro files (MODIFY, ~5–10 lines each)

### T4: Batch-migrate platform/ops pages

- `platform.astro` — add AdminPageHeader (PlatformHub handles content)
- `app-catalog.astro` — AdminPageHeader (AppCatalog handles content)
- `architektur.astro` — AdminPageHeader (graph handles content)
- `ops.astro` — AdminPageHeader (OpsTabs handle content)
- `bugs.astro` → AdminPageHeader + AdminTable
- `tickets.astro` + `tickets/[id].astro` → AdminPageHeader

**Target files**: ~7 astro files (MODIFY, ~5–10 lines each)

### T5: Batch-migrate knowledge/asset pages

- `wissen.astro` — add AdminPageHeader (WissenHub handles content)
- `wissensquellen.astro` — AdminPageHeader
- `knowledge/*` (3 pages) — AdminPageHeader
- `assets.astro` — AdminPageHeader
- `asset-generation.astro` — AdminPageHeader
- `prompts.astro` → AdminPageHeader + AdminCard
- `ki-konfiguration.astro` → AdminPageHeader + AdminCard + AdminFormField

**Target files**: ~9 astro files (MODIFY, ~5–10 lines each)

### T6: Batch-migrate remaining pages

- `followups.astro`, `fragebogen/[assignmentId].astro`, `software-history.astro`
- `systemtest/board.astro`, `zeiterfassung.astro`, `nachrichten.astro`
- `raeume.astro`, `steuer.astro`, `billing/elster.astro`, `billing/[id]/drucken.astro`
- `live/index.astro`, `live/sessions/[id].astro`, `stream.astro`
- `brett/index.astro`, `brett/[...path].astro`
- `[clientId].astro`, `members/[userId].astro`, `projekte/[id].astro`
- `planungsbuero.astro`, `factory-budget.astro`, `factory-observability.astro`

Each: Add `AdminPageHeader` with appropriate title and description. Existing functionality preserved.

**Target files**: ~20 astro files (MODIFY, ~5–10 lines each)

### T7: Remove dead code

1. **Remove `monitoring.astro` redirect**: The page at `/admin/monitoring` currently just does `return Astro.redirect('/admin/platform')`. Either:
   - Keep as redirect (simplest, no broken links), OR
   - Remove the file entirely and ensure all references (sidebar links, config) point to `/admin/platform` directly

   Decision: Keep as redirect (avoids breaking external bookmarks, search engine links)

2. **Remove `app-catalog.astro` if unused**: Check if `/admin/app-catalog` is a dead page or actively used. If dead, remove or redirect.

3. **Remove duplicated SVG icon definitions** from `admin.astro` (already done in Plan 1 if not deferred)

4. **Audit unused admin pages**: Check if any of these pages are dead:
   - `/admin/steuer` — tax monitoring (probably unused)
   - `/admin/software-history` — changelog (maybe unused)
   - Any others that are proof-of-concept pages

   For each confirmed dead page: redirect to dashboard or remove.

**Target files**: ~3 files (MODIFY or DELETE)

### T8: CSS cleanup

1. **Remove unused CSS from admin-premium.css**: After all 9 components are built and pages migrated, check if any CSS rules in `admin-premium.css` are now dead (replaced by component styles). Remove dead rules.

2. **Consolidate any remaining inline styles**: Some pages may still have inline `style` attributes for layout — migrate these to CSS classes in `admin-premium.css` where possible.

3. **Remove film grain from admin pages**: Add `body:has(#admin-sidebar)::before { display: none; }` to `admin-foundation.css` if not already done.

**Target files**: `website/src/styles/admin-premium.css` (MODIFY), `website/src/styles/admin-foundation.css` (MODIFY)

### T9: Final verification

```bash
pnpm --prefix website run dev
# Spot-check 10 random admin pages — each should have:
# 1. Consistent AdminPageHeader at top
# 2. Consistent spacing (AdminCard padding)
# 3. Consistent empty states (AdminEmptyState)
# 4. No broken styles
# 5. All interactive elements work (forms, tables, tabs, modals)

pnpm --prefix website run build  # must succeed

task test:changed
task freshness:regenerate
task freshness:check

# Check S1 ratchet: verify no new files over size limits
# Check S2: no import cycles (madge)
# Check S3: no hardcoded domain/host values
# Check S4: no orphan files referenced by stale manifest entries
```

## Verification

| Gate | Expected |
|------|----------|
| `pnpm --prefix website run build` | PASS — all 69 admin pages build successfully |
| `task test:changed` | PASS |
| `task freshness:regenerate` + `task freshness:check` | PASS |
| `task test:code-quality` | PASS — S1–S4 checks |
| Visual: random spot-check (10 pages) | Consistent headers, tables, forms, spacing |
| Visual: both brands | mentolder and korczewski admin pages render correctly |
| Visual: responsive | Mobile, tablet, desktop — all breakpoints work |
| Functional: forms | All settings forms save correctly |
| Functional: navigation | All 69 admin pages accessible from sidebar |

## Target Files

~55 admin page files (MODIFY — add AdminPageHeader)
~3 files (DELETE or MODIFY — dead code)
`website/src/styles/admin-premium.css` (MODIFY)
`website/src/styles/admin-foundation.css` (MODIFY)
