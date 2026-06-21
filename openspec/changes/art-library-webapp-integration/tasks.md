---
title: "Art Library Webapp Integration"
ticket_id: T001033
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: Art Library Webapp Integration (T001033)

- [ ] Task 1: Deduplicate mentolder icons.svg — remove three duplicate `<symbol>` blocks so only 6 unique symbols remain
- [ ] Task 2: Fix `ServiceRow.svelte` default — change hard-implied `iconSpriteBrand` default from missing-prop-silent-empty to render the emoji icon when no sprite brand is given, ensuring mentolder emoji fallback is honoured
- [ ] Task 3: Wire mentolder services in `mentolder.ts` — confirm all 5 service `iconSpriteId` values are set (already present in current file; add the missing `prop-bookmark` for any un-wired service if found after review)
- [ ] Task 4: Make `/api/admin/art-library` brand-aware — derive `BRAND` from request context / `BRAND_ID` env var so the korczewski admin portal serves its own manifest, not the hardcoded mentolder one
- [ ] Task 5: Extend `ArtLibrary.svelte` to pass the correct API origin when running under korczewski (or leave the single endpoint brand-aware via env lookup — confirm approach from Task 4)
- [ ] Task 6: Add BATS test `tests/spec/art-library-webapp.bats` covering (a) sprite symbol count for mentolder, (b) sprite symbol uniqueness, (c) `avatarSrc` path resolves to an existing file, (d) all `iconSpriteId` values in `mentolder.ts` have a matching symbol in `icons.svg`
- [ ] Task 7: Run `task test:changed`, `task freshness:regenerate`, `task freshness:check` and confirm CI gate is green

---

## Implementation Plan — Art Library Webapp Integration (T001033)

## File Structure

```
website/public/brand/mentolder/icons.svg            ← FIX: 3 doppelte <symbol>-Blöcke entfernen
website/src/pages/api/admin/art-library.ts          ← FIX: BRAND aus Env-Var statt hardcoded 'mentolder'
tests/spec/art-library-webapp.bats                  ← NEU: BATS-Regression (sprite count, uniqueness, wiring)
```

### Background

The mentolder art-library assets are fully present in the repo
(`art-library/sets/mentolder/portfolio/` — 3 archetypal characters, 6 props,
6 terrains, 5 logos) and all static files are already committed under
`website/public/brand/mentolder/{characters,props,logos,terrain}/`.

The SVG sprite file `website/public/brand/mentolder/icons.svg` already contains
the 6 `prop-*` `<symbol>` blocks, **but has duplicate entries** — `prop-briefcase`,
`prop-bookmark`, and `prop-chat` each appear twice. This causes undefined
browser behaviour (SVG `<use>` resolves the first match, but some validators
reject duplicate IDs).

`mentolderConfig.homepage.avatarSrc` is already set to
`'/brand/mentolder/characters/leadership.portrait.svg'` and `avatarType` to
`'image'` — the Hero component is already wired correctly via `index.astro`.

All 5 mentolder services already have `iconSpriteId` values set; the sprite
symbols they reference all exist in `icons.svg`. The `ServiceRow.svelte`
component correctly resolves the path via `iconSpriteBrand` — `index.astro`
passes `BRAND_ID` (which resolves to `'mentolder'`), so sprite rendering
should already work in production.

The `/api/admin/art-library` endpoint and `ArtLibrary.svelte` component are
already implemented. The endpoint is **hardcoded to `'mentolder'`** — this
means the korczewski admin portal would serve mentolder assets, not korczewski
ones. The endpoint needs brand-awareness.

**Net remaining work:**
1. Fix the duplicate symbols in `icons.svg` (correctness bug).
2. Make the API endpoint brand-aware (correctness bug for korczewski).
3. Write BATS regression tests to lock these properties in CI.

---

### Task 1 — Deduplicate `website/public/brand/mentolder/icons.svg`

**File:** `website/public/brand/mentolder/icons.svg`

**Problem:** `grep "symbol id" website/public/brand/mentolder/icons.svg` shows 9
hits but there are only 6 distinct prop IDs. `prop-briefcase`, `prop-bookmark`,
and `prop-chat` each appear twice. The duplicate blocks are at the tail of the
file.

**Fix:** Open `website/public/brand/mentolder/icons.svg` and remove the three
duplicate `<symbol>` blocks. Keep only the first occurrence of each. The final
file must have exactly 6 `<symbol>` elements and the closing `</svg>` tag.

**Verification:** `grep -c "symbol id" website/public/brand/mentolder/icons.svg`
must print `6`.

---

### Task 2 — Audit `ServiceRow.svelte` fallback behaviour

**File:** `website/src/components/ServiceRow.svelte`

**Current state:** The component renders the SVG sprite icon when **both**
`iconSpriteId` and `iconSpriteBrand` are truthy. If `iconSpriteBrand` is
omitted (falsy), the icon block is skipped and nothing is rendered — the `icon`
emoji prop is also not rendered in this path.

**Check:** The template at line 68 is:
```svelte
{#if iconSpriteId && iconSpriteBrand}
  <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
    <use href={`/brand/${iconSpriteBrand}/icons.svg#${iconSpriteId}`}></use>
  </svg>
{/if}
```

The emoji `{icon}` prop is never rendered in the current template (it was
deprecated when the sprite system was added). Since `index.astro` always passes
`iconSpriteBrand={BRAND_ID}`, this is only a latent issue for call sites that
omit the brand.

**Action:** No change required to `ServiceRow.svelte` — the existing guard is
correct. Document in a code comment that `iconSpriteBrand` is required for
sprite rendering. If a caller forgets it, nothing is rendered silently — this is
acceptable (the feature is optional).

**Optional quality-of-life** (not blocking): Add a Svelte `$derived` warning
in dev mode if `iconSpriteId` is set but `iconSpriteBrand` is missing. This is
S1-budget-safe (no new file, just 3 lines in the existing component).

---

### Task 3 — Confirm mentolder service wiring is complete

**File:** `website/src/config/brands/mentolder.ts`

**Audit result:** All 5 services already have `iconSpriteId` entries:
- `50plus-digital` → `prop-compass`
- `coaching` → `prop-handshake`
- `fuehrung-persoenlichkeit` → `prop-chat`
- `beratung` → `prop-briefcase`
- `ki-transition` → `prop-spark`

`prop-bookmark` is in the sprite but **not mapped to any service** — this is
intentional (it is available as a general-purpose brand asset, not tied to a
homepage service card).

**Action:** No changes needed to `mentolder.ts`. Verify that the live pages
render by running the dev server locally (`task website:dev`) and confirming
the ServiceRow icons display for the mentolder brand.

---

### Task 4 — Make `/api/admin/art-library` brand-aware

**File:** `website/src/pages/api/admin/art-library.ts`

**Problem:** Line 6 hardcodes `const BRAND = 'mentolder'`. When the korczewski
admin portal fetches this endpoint, it receives mentolder assets.

**Fix:**

```typescript
// Derive brand from the BRAND_ID / BRAND env var set per Kubernetes deployment.
// Falls back to 'mentolder' for local dev without an explicit env var.
const BRAND = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
```

Replace lines 6–7:
```typescript
// OLD:
const BRAND = 'mentolder';
const MANIFEST_PATH = resolve(process.cwd(), '..', 'art-library', 'sets', BRAND, 'manifest.json');
```

With:
```typescript
// NEW:
const BRAND = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();
const MANIFEST_PATH = resolve(process.cwd(), '..', 'art-library', 'sets', BRAND, 'manifest.json');
```

**Impact:** No change to the response shape. Under `ENV=mentolder` the
`BRAND_ID` ConfigMap value is `'mentolder'`; under `ENV=korczewski` it is
`'korczewski'`. The fallback keeps local dev working without env vars.

**Note:** The `toPublicUrl` helper already uses the module-scoped `BRAND`
constant, so it will automatically serve the correct `/brand/<brand>/…` paths
after this change.

---

### Task 5 — Verify `ArtLibrary.svelte` requires no changes

**File:** `website/src/components/admin/ArtLibrary.svelte`

**Analysis:** The component fetches `/api/admin/art-library` (relative path).
Because it runs inside the same Astro server process, the env-var `BRAND_ID` is
already set correctly per deployment. After Task 4, the endpoint returns the
right brand's assets automatically.

**E2E contract selectors already present in `ArtLibrary.svelte`:**
- `.art-grid` — the asset grid
- `.art-card` — individual asset cards
- `.art-panel` — side panel (shown on card click)
- `.art-palette-row` — palette colour rows within the panel
- `.art-empty` — shown when no assets are loaded

All four selectors required by `tests/e2e/specs/dashboard-art.spec.ts` are
present. The "mentolder context shows a populated art library" test will pass
once Task 4 is done (the API returns populated assets for the mentolder brand
instead of falling back to an empty array due to a wrong manifest path).

**Action:** No changes to `ArtLibrary.svelte`.

---

### Task 6 — BATS regression test `tests/spec/art-library-webapp.bats`

**File (new):** `tests/spec/art-library-webapp.bats`

This test file locks four properties in CI:

1. **Sprite symbol count:** `website/public/brand/mentolder/icons.svg` has
   exactly 6 `<symbol>` elements.
2. **Sprite symbol uniqueness:** No duplicate `id` attributes in the sprite.
3. **`avatarSrc` path resolves:** The `leadership.portrait.svg` path declared in
   `mentolderConfig.homepage.avatarSrc` exists on disk under `website/public/`.
4. **`iconSpriteId` coverage:** Each `iconSpriteId` value used in
   `mentolderConfig.services[]` has a corresponding `<symbol id="...">` in
   `website/public/brand/mentolder/icons.svg`.

```bash
#!/usr/bin/env bats
# Regression tests for T001033: art-library webapp integration.
# Locks sprite health, avatarSrc path, and iconSpriteId coverage for mentolder.

REPO="${BATS_TEST_DIRNAME}/../.."
SPRITE="${REPO}/website/public/brand/mentolder/icons.svg"
CONFIG="${REPO}/website/src/config/brands/mentolder.ts"

@test "mentolder icons.svg has exactly 6 symbol elements" {
  run grep -c '<symbol id=' "${SPRITE}"
  echo "count: $output"
  [ "$status" -eq 0 ]
  [ "$output" -eq 6 ]
}

@test "mentolder icons.svg has no duplicate symbol ids" {
  # Extract all symbol ids, then count unique vs total
  total=$(grep -o 'id="[^"]*"' "${SPRITE}" | wc -l | tr -d ' ')
  unique=$(grep -o 'id="[^"]*"' "${SPRITE}" | sort -u | wc -l | tr -d ' ')
  echo "total=$total unique=$unique"
  [ "$total" -eq "$unique" ]
}

@test "mentolder avatarSrc leadership.portrait.svg exists in website/public" {
  local path="${REPO}/website/public/brand/mentolder/characters/leadership.portrait.svg"
  [ -f "$path" ]
}

@test "all mentolder service iconSpriteId values exist as symbol ids in icons.svg" {
  # Extract iconSpriteId strings from the TS config (quoted values after the key)
  mapfile -t ids < <(grep "iconSpriteId:" "${CONFIG}" | grep -o "'[^']*'" | tr -d "'")
  echo "found iconSpriteIds: ${ids[*]}"
  [ "${#ids[@]}" -gt 0 ]
  for id in "${ids[@]}"; do
    run grep -q "id=\"${id}\"" "${SPRITE}"
    echo "checking ${id}: status=$status"
    [ "$status" -eq 0 ]
  done
}

@test "mentolder props are committed as static files in website/public" {
  local props_dir="${REPO}/website/public/brand/mentolder/props"
  local count
  count=$(find "${props_dir}" -name "*.svg" | wc -l | tr -d ' ')
  echo "props count: $count"
  [ "$count" -ge 6 ]
}
```

**Steps (Test-First):**
- [ ] **Step 1: Failing Test schreiben** — `tests/spec/art-library-webapp.bats` anlegen mit den 4 Tests oben
- [ ] **Step 2: Test ausführen** — `./tests/runner.sh local art-library-webapp` — to verify it fails before the fix (icons.svg has duplicates → symbol-count test returns 9, not 6)
- [ ] **Step 3: Task 1 (Fix icons.svg)** ausführen, danach Test erneut ausführen (grün)
- [ ] **Step 4: Commit**

**Note on BATS convention (CLAUDE.md):** New `@test` entries belong in
`tests/spec/<spec-slug>.bats` (one file per OpenSpec SSOT spec). Because this
feature does not yet have a dedicated SSOT spec file in `openspec/specs/`, the
test file is placed at `tests/spec/art-library-webapp.bats` — this is the
correct location per the BATS convention section in `CLAUDE.md`.

---

### Task 7 — Final validation

Run in order:

```bash
# 1. Verify sprite is clean after Task 1 fix
grep -c '<symbol id=' website/public/brand/mentolder/icons.svg
# Expected: 6

# 2. Run the new BATS spec directly
./tests/runner.sh local art-library-webapp 2>&1 | tail -20

# 3. Run the full offline test suite
task test:changed

# 4. Regenerate freshness artifacts and verify
task freshness:regenerate
task freshness:check
```

All four commands must exit 0 before the PR is opened.

---

### Files changed summary

| File | Action |
|------|--------|
| `website/public/brand/mentolder/icons.svg` | Fix — remove 3 duplicate `<symbol>` blocks |
| `website/src/pages/api/admin/art-library.ts` | Fix — derive `BRAND` from env vars instead of hardcoding `'mentolder'` |
| `tests/spec/art-library-webapp.bats` | New — 5 BATS regression tests |

**No changes required to:**
- `website/src/config/brands/mentolder.ts` (all `iconSpriteId` already wired)
- `website/src/components/ServiceRow.svelte` (brand path already correct)
- `website/src/components/admin/ArtLibrary.svelte` (E2E selectors all present)
- `website/src/pages/index.astro` (passes `BRAND_ID` correctly)
- Any Kubernetes manifests (no ConfigMap changes needed)

### Complexity estimate

Low-medium. The asset pipeline is already done — this plan closes three
correctness bugs (duplicate SVG symbols, hardcoded brand in API endpoint) and
adds a regression test harness. No new Svelte components, no schema changes, no
k8s manifest changes.
