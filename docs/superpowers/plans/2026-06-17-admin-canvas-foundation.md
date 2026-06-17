---
date: 2026-06-17
slug: admin-canvas-foundation
title: "Plan 1/5: Admin Design Token Foundation"
status: planning
domains: [website]
ticket_id: T000937
plan_ref: docs/superpowers/specs/2026-06-17-admin-canvas-design.md
depends_on: []
effort: S
risk: low
---

# Plan 1/5: Admin Design Token Foundation

Consolidate scattered CSS custom properties into a single admin theme foundation
that all subsequent component and page work builds upon.

## Tasks

### T1: Create admin-foundation.css

Create `website/src/styles/admin-foundation.css` with all admin design tokens:

1. **Spacing scale**: `--space-1` through `--space-8` (4px → 64px, 8px baseline)
2. **Typography scale**: `--admin-text-xs` (11px) through `--admin-text-lg` (16px)
3. **Component tokens**: card radius, input height/radius, table row height, modal backdrop
4. **Z-index scale**: `--z-sidebar: 50`, `--z-dropdown: 80`, `--z-modal: 100`, `--z-toast: 120`
5. **Existing admin tokens** (migrate from `admin-premium.css`): `--admin-bg`, `--admin-sidebar-bg`, `--admin-surface`, `--admin-border`, `--admin-primary`, etc.
6. **New status colors**: `--admin-success: oklch(0.80 0.06 160)` (sage), `--admin-danger: #d77a6e`, `--admin-info: #818cf8`, `--admin-warning: oklch(0.80 0.09 75)` (brass)
7. **Animation tokens**: `--admin-transition-fast: 0.15s ease`, `--admin-transition-normal: 0.25s ease`

**Target files**: `website/src/styles/admin-foundation.css` (new, ~120 lines)

### T2: Update AdminLayout to load admin-foundation.css

In `AdminLayout.astro`:
- Replace `import '../styles/admin-premium.css'` with `import '../styles/admin-foundation.css'`
- Remove `import '../styles/sidekick-panels.css'` (it's already imported by `../styles/admin-foundation.css` or keep it separate — decision: keep as separate import, sidekick CSS is a different concern)
- Actually: keep all three imports for now, but ensure `admin-foundation.css` loads after `global.css` and before `admin-premium.css` (which will be thinned out in T3)

**Target files**: `website/src/layouts/AdminLayout.astro` (1 line changed)

### T3: Thin out admin-premium.css

Remove token definitions from `admin-premium.css` (lines 1–18, the `:root` block) since they're now in `admin-foundation.css`. Keep the structural rules (sidebar, nav-item, mobile, tablet). Remove film grain from admin pages by scoping `body::before` to exclude admin:

In `admin-foundation.css`, add:
```css
body:has(#admin-sidebar)::before {
  display: none;  /* no film grain on admin pages */
}
```

**Target files**: `website/src/styles/admin-premium.css` (remove ~18 lines, add scoping rule)

### T4: Audit and deduplicate SVG icons

1. Remove the inline SVG icon definitions from `admin.astro` (lines 57–72, the `SVG` constant) — these are duplicated versions of icons already in `admin-icons.ts`
2. Replace usage in `admin.astro` with references to `icons` from `admin-icons.ts` (already imported via AdminLayout)
3. Add any missing icons to `admin-icons.ts` if needed (check: `brett`, `arena`, `lock`, `key`, `network`, `dashboard`, `mail` icons)

**Target files**: `website/src/pages/admin.astro` (~20 lines removed), `website/src/layouts/admin-icons.ts` (0–5 new icons)

### T5: Verify

```bash
pnpm --prefix website run dev
# Visual check: admin pages load, no broken styles, no film grain
# Check: all sidebar icons render correctly
# Check: dashboard icons render correctly
task test:changed
```

## Verification

| Gate | Expected |
|------|----------|
| `task test:changed` | PASS (CSS-only changes, no test modifications expected) |
| `task freshness:regenerate` + `task freshness:check` | PASS |
| Visual: admin pages render | No regressions |
| Visual: film grain absent from admin | Admin pages have solid background |
| Visual: sidebar icons | All 22 nav items show correct icons |
| Visual: fonts load | Serif, sans, mono all render |

## Target Files

- `website/src/styles/admin-foundation.css` (NEW)
- `website/src/styles/admin-premium.css` (MODIFY)
- `website/src/layouts/AdminLayout.astro` (MODIFY)
- `website/src/pages/admin.astro` (MODIFY)
- `website/src/layouts/admin-icons.ts` (MODIFY)
