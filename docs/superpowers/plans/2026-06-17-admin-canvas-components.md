---
date: 2026-06-17
slug: admin-canvas-components
title: "Plan 2/5: Admin Component Library"
status: planning
domains: [website]
ticket_id: T000938
plan_ref: docs/superpowers/specs/2026-06-17-admin-canvas-design.md
depends_on: [admin-canvas-foundation]
effort: M
risk: medium
---

# Plan 2/5: Admin Component Library

Create 9 shared Svelte components that all admin pages will use. Each component is
self-contained, props-driven, uses the design tokens from Plan 1, and includes
accessibility attributes.

## Tasks

### T1: Create AdminCard.svelte

```svelte
<!-- src/components/admin/ui/AdminCard.svelte -->
```
- Props: `variant` ('default' | 'flat' | 'interactive'), `padding` (boolean, default true)
- Slots: `default` (body), `header`, `footer`
- Renders a `<div>` with `--admin-surface` background, `--admin-border` border, 12px radius
- `interactive` variant adds hover border-brightening + subtle scale(1.002)
- `flat` variant removes background and border (transparent card)

### T2: Create AdminPageHeader.svelte

```svelte
<!-- src/components/admin/ui/AdminPageHeader.svelte -->
```
- Props: `title` (string), `description` (string, optional), `breadcrumbs` (array of `{label, href}`, optional)
- Slot: `actions` (right-aligned action buttons)
- Renders: breadcrumb row (optional, muted mono text) → h1 title (serif, 2xl) → description (muted text) → actions row
- Consistent max-width padding (same as content area)

### T3: Create AdminStatCard.svelte

```svelte
<!-- src/components/admin/ui/AdminStatCard.svelte -->
```
- Props: `value` (string/number), `label` (string), `trend` ('up' | 'down' | 'neutral' | null), `color` ('brass' | 'sage' | 'indigo' | 'danger' | 'neutral'), `href` (string, optional), `suffix` (string, optional)
- Renders a clickable (if href) or static card with large value, label below, colored left border accent, optional trend arrow
- Colors map to CSS custom properties defined in admin-foundation.css

### T4: Create AdminBadge.svelte

```svelte
<!-- src/components/admin/ui/AdminBadge.svelte -->
```
- Props: `variant` ('success' | 'warning' | 'error' | 'info' | 'neutral'), `size` ('sm' | 'md'), `dot` (boolean)
- Renders an inline `<span>` with colored background, matching text, rounded pill
- Colors: success=sage, warning=brass, error=danger-red, info=indigo, neutral=muted
- `dot` variant: small colored circle + text (for status indicators)

### T5: Create AdminEmptyState.svelte

```svelte
<!-- src/components/admin/ui/AdminEmptyState.svelte -->
```
- Props: `icon` (string — key into admin-icons), `title` (string), `description` (string)
- Slot: `action` (optional CTA button)
- Renders centered column: large muted icon → title (serif, lg) → description (muted, sm) → action slot

### T6: Create AdminTable.svelte

```svelte
<!-- src/components/admin/ui/AdminTable.svelte -->
```
- Props: `columns` (array of `{key, label, sortable?, width?}`), `rows` (array of objects), `loading` (boolean), `emptyTitle`, `emptyDescription`
- Slot: `cell-{key}` (named slots for custom cell rendering)
- Features: sortable column headers (click to toggle asc/desc), loading skeleton, empty state integration (uses AdminEmptyState internally), row hover highlight
- Styling: dark theme table with `--admin-border` dividers, 44px row height, sticky header

### T7: Create AdminTabs.svelte

```svelte
<!-- src/components/admin/ui/AdminTabs.svelte -->
```
- Props: `tabs` (array of `{id, label, href?}`), `active` (string — active tab id)
- Features: horizontal tab bar, animated sliding active indicator, keyboard navigation (arrow keys), optional href links vs client-side switching
- Styling: bottom-border container, active tab gets brass color + 2px bottom border, inactive tabs are muted

### T8: Create AdminModal.svelte

```svelte
<!-- src/components/admin/ui/AdminModal.svelte -->
```
- Props: `open` (boolean), `title` (string), `size` ('sm' | 'md' | 'lg')
- Slots: `default` (body), `footer` (action buttons)
- Features: backdrop click to close, Escape key to close, focus trap, body scroll lock when open, transition animation (fade + scale)
- Styling: centered overlay, `--admin-surface` card, `--admin-border` border, 16px radius

### T9: Create AdminFormField.svelte

```svelte
<!-- src/components/admin/ui/AdminFormField.svelte -->
```
- Props: `label` (string), `error` (string), `hint` (string), `required` (boolean), `htmlFor` (string)
- Slot: `default` (the input element)
- Renders: label row (with required asterisk) → slot → error message (red, if present) or hint (muted, if no error)
- Consistent spacing, consistent label styling (muted uppercase mono, 11px)

### T10: Create barrel export

```ts
// src/components/admin/ui/index.ts
export { default as AdminCard } from './AdminCard.svelte';
export { default as AdminPageHeader } from './AdminPageHeader.svelte';
export { default as AdminStatCard } from './AdminStatCard.svelte';
export { default as AdminBadge } from './AdminBadge.svelte';
export { default as AdminEmptyState } from './AdminEmptyState.svelte';
export { default as AdminTable } from './AdminTable.svelte';
export { default as AdminTabs } from './AdminTabs.svelte';
export { default as AdminModal } from './AdminModal.svelte';
export { default as AdminFormField } from './AdminFormField.svelte';
```

### T11: Verify

```bash
pnpm --prefix website run typecheck
pnpm --prefix website run build
# Check: no build errors from new components
task test:changed
task freshness:regenerate
task freshness:check
```

## Verification

| Gate | Expected |
|------|----------|
| `npm --prefix website run typecheck` (or `pnpm run check` if available) | PASS — no TypeScript/Svelte errors |
| `pnpm --prefix website run build` | PASS — no build errors |
| `task test:changed` | PASS |
| `task freshness:regenerate` + `task freshness:check` | PASS |
| Component file size | Each < 200 lines |
| Accessibility | Each component has appropriate aria-* attributes |

## Target Files

- `website/src/components/admin/ui/AdminCard.svelte` (NEW)
- `website/src/components/admin/ui/AdminPageHeader.svelte` (NEW)
- `website/src/components/admin/ui/AdminStatCard.svelte` (NEW)
- `website/src/components/admin/ui/AdminBadge.svelte` (NEW)
- `website/src/components/admin/ui/AdminEmptyState.svelte` (NEW)
- `website/src/components/admin/ui/AdminTable.svelte` (NEW)
- `website/src/components/admin/ui/AdminTabs.svelte` (NEW)
- `website/src/components/admin/ui/AdminModal.svelte` (NEW)
- `website/src/components/admin/ui/AdminFormField.svelte` (NEW)
- `website/src/components/admin/ui/index.ts` (NEW)
