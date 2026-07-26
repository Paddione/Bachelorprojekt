---
title: "t002200-admin-design-token — Implementation Plan"
ticket_id: T002200
domains: [website, admin]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t002200-admin-design-token — Implementation Plan

## File Structure

```
tests/spec/website-admin.bats                           (changed — fix ADMIN_LAYOUT path)
website/src/layouts/AdminLayout.astro                    (changed — remove factory-tokens.css import)
website/src/styles/factory-tokens.css                     (deleted — after migration)
website/src/styles/global.css                             (changed — add 16 semantic admin tokens to @theme)
website/src/lib/__tests__/admin-token-alias.test.ts       (changed — remove factory-tokens reference)
```

## Partial Plans

### PP1: Fix false-green test
- Fix `ADMIN_LAYOUT` path in `tests/spec/website-admin.bats`

### PP2: Migrate tokens to global.css
- Move 16 semantic tokens into `global.css` `@theme` block
- Remove `import` from `AdminLayout.astro`
- Delete `factory-tokens.css`
- Update `admin-token-alias.test.ts`

### PP3: Visual regression check
- Generate Playwright screenshots before/after migration
- Verify no visual changes to admin surfaces
