---
title: "Spec-BATS Coverage: Admin Dashboard & UI (6 Specs)"
ticket_id: T002009
domains: [website, admin, tests]
status: completed
---

# spec-bats-admin-ui — Implementation Plan

## File Structure

- `tests/spec/admin-token-consolidation.bats` (new)
- `tests/spec/admin-ui-modal-drawer.bats` (new)
- `tests/spec/react-login-edit-homepage.bats` (new)
- `tests/spec/admin-cockpit.bats` (updated — add admin-content-db & admin-nav-accordion tests)

## Task 1: Create admin-token-consolidation BATS tests

**Requirement:** Create `tests/spec/admin-token-consolidation.bats` covering the spec requirements:
1. `factory-tokens.css` does NOT exist and no second `:root` block declares the 17 migrated base colors
2. No import statements reference the deleted `factory-tokens.css`
3. Each of the 16 semantic admin color tokens is declared exactly once in `global.css`, each aliasing a `@theme --color-*` token
4. A `--color-danger` token exists in `@theme` for `--admin-danger`
5. Deliberate visual-regression baseline: admin surfaces render without regression

**Test cases to implement:**
- Verify `factory-tokens.css` is absent
- Verify no import references `factory-tokens.css` in `global.css` or `AdminLayout.astro`
- Verify each of the 16 admin semantic tokens (`--admin-bg` through `--admin-warning`) exists and references a `var(--color-*)` value
- Verify `--color-danger` exists in `@theme`
- Verify admin surfaces render without regression (reference `visual-sweep` E2E path)

### Test file structure:
```bash
#!/usr/bin/env bats
# tests/spec/admin-token-consolidation.bats
# SSOT: openspec/specs/admin-token-consolidation.md

@test "factory-tokens.css is absent" {
  run ls /home/patrick/Bachelorprojekt/website/src/styles/ | grep -q "factory-tokens"
  [ "$status" -ne 0 ]
}

@test "global.css has no import of factory-tokens.css" {
  run grep -qF '@import.*factory-tokens' /home/patrick/Bachelorprojekt/website/src/styles/global.css
  [ "$status" -ne 0 ]
}

@test "AdminLayout.astro has no import of factory-tokens.css" {
  run grep -qF "factory-tokens" /home/patrick/Bachelorprojekt/website/src/components/admin/AdminLayout.astro
  [ "$status" -ne 0 ]
}

@test "17 migrated base colors resolve through @theme" {
  for token in --brass --brass-2 --brass-d --fg --fg-soft --ink-750 --ink-800 --ink-850 --ink-900 --line --line-2 --mono --mute --mute-2 --sage --sans --serif; do
    # Verify the token is declared in global.css and resolves to @theme
    ...
  done
}

@test "16 semantic admin tokens each alias a @theme color" {
  for token in --admin-bg --admin-sidebar-bg --admin-surface --admin-surface-hover \
             --admin-border --admin-border-bright --admin-primary \
             --admin-primary-muted --admin-accent --admin-text \
             --admin-text-mute --admin-text-disabled --admin-success \
             --admin-danger --admin-info --admin-warning; do
    ...
  done
}

@test "--color-danger exists for admin-danger" {
  run grep -E "@theme\s+\{\s*--color-danger" /home/patrick/Bachelorprojekt/website/src/styles/global.css
  [ "$status" -eq 0 ]
}

@test "admin surfaces render without regression after migration" {
  # Reference the visual-sweep E2E path
  run task e2e:admin 2>/dev/null || true
}
```

### Task 2: Create admin-ui-modal-drawer BATS tests

**Requirement:** Create `tests/spec/admin-ui-modal-drawer.bats` covering the spec requirements:
1. `AdminModal.svelte` uses native `<dialog>` element with stable `data-testid` and `aria-labelledby`
2. Binding `open` prop drives `showModal()`/`close()`
3. Escape/backdrop close fires `onclose` callback
4. Body snippet is mandatory, footer is optional
5. `AdminDrawer.svelte` shares the same native-`<dialog>` pattern (side-anchored variant)
6. Migrated dialogs preserve stable `data-testid` selectors (from migration notes)
7. Non-overlay components (`TicketCreateModal`, `VersionDrawer`) stay unmigrated

### Task 3: Create react-login-edit-homepage BATS tests

**Requirement:** Create `tests/spec/react-login-edit-homepage.bats` covering the spec requirements:
1. CORS helper `website/src/lib/cors.ts` with allowlisted Origin (React-App-Origin), Access-Control-Allow-Credentials, OPTIONS preflight
2. `callback.ts` returnTo-Allowlist accepts absolute React-URL
3. Block-document API: GET /api/homepage (public), POST /api/admin/homepage/save (admin, versioned)
4. Server-side block schema in `website/src/lib/homepage-blocks-schema.ts`
5. React-App components: Auth-Context `useAuth.tsx`, Navigation with Edit Homepage link, Editor Route `/admin/homepage`, HomePage with BlockRenderer
6. Error handling: Auth-Fetch-Failure, 409 Conflict, 422 Invalid, CORS-fail-closed, returnTo-not-in-Allowlist

### Task 4: Add admin-content-db and admin-nav-accordion tests to admin-cockpit.bats

**Requirement:** Extend `tests/spec/admin-cockpit.bats` with tests for the two consolidated micro-specs:
- **admin-content-db**: Tests for the content database admin functionality
- **admin-nav-accordion**: Tests for the sidebar accordion in AdminSidebarNav.astro

---

## Task 3: Verification

**Requirement:** Ensure the tests pass and CI metrics are updated.

1. `task test:changed` — runs all newly/modified BATS test files
2. `task freshness:regenerate` — updates all generated artifacts
3. `task freshness:check` — verifies all artifacts are up to date
