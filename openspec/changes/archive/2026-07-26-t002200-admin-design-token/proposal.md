# Proposal: t002200-admin-design-token

## Why

The admin design token consolidation from `factory-tokens.css` to `global.css` was started
but not completed. A false-green test (wrong file path) hid the fact that:
- 16 semantic admin tokens still live in `factory-tokens.css` instead of `global.css`
- `layouts/AdminLayout.astro` still imports `factory-tokens.css`
- `website/src/lib/__tests__/admin-token-alias.test.ts` references the file

## Changes

### 1. Fix false-green test
- `tests/spec/website-admin.bats`: fix `ADMIN_LAYOUT` path to
  `website/src/layouts/AdminLayout.astro` (was pointing to a non-existent file)

### 2. Visual baseline first
- Generate Playwright screenshots of all admin surfaces before moving CSS

### 3. Migrate 16 semantic admin tokens
- Move `--admin-bg`, `--admin-danger`, etc. from `factory-tokens.css` to `global.css`
  `@theme` block
- Check `admin-premium.css` for conflicts

### 4. Remove stale import and file
- Remove `import '../styles/factory-tokens.css'` from `layouts/AdminLayout.astro`
- Delete `website/src/styles/factory-tokens.css`
- Update `website/src/lib/__tests__/admin-token-alias.test.ts`

### 5. Verify all 4 admin-token-consolidation tests pass
- No assertion changes — tests must pass with the migrated state

## Trade-offs
- Visual regression risk for admin surfaces. Mitigated by screenshot baseline.

## Risks
- Removing `factory-tokens.css` may affect other imports. Comprehensive grep required.
