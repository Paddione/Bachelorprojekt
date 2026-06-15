---
title: "Projekt-Cockpit — P4 Cutover + Tests (Replace /admin/tickets, E2E, Gate)"
ticket_id: T000752
domains: [website, test, ops]
status: active
pr_number: null
file_locks: [website/src/pages/admin/cockpit.astro, website/src/pages/admin/tickets.astro, website/src/components/admin/Cockpit.svelte, tests/e2e/fa-29-cockpit.spec.ts, tests/e2e/playwright.config.ts, website/src/data/test-inventory.json]
shared_changes: false
batch_id: cockpit-2026-06-15
parent_feature: projekt-cockpit
depends_on_plans: [docs/superpowers/plans/2026-06-15-cockpit-api.md, docs/superpowers/plans/2026-06-15-cockpit-frontend.md]
---

# Projekt-Cockpit — P4 Cutover + Tests

> **Batch:** `cockpit-2026-06-15` · Sub-Plan **4 von 4** · Master: `docs/superpowers/plans/2026-06-15-projekt-cockpit.md`
> **Abhängigkeit:** **P2 (API)** + **P3 (Frontend)**. Branch/rebase auf `main` ERST nachdem P2+P3 gemerged sind. Modifiziert `Cockpit.svelte` (Tabelle-Modus, Task 29) NACH P3 — sequenziell, kein Race. **Task 32 ist der globale finale Gate** für das gesamte Feature.

**Goal:** Replace the flat `/admin/tickets` view with a brand-scoped, admin-gated **Projekt-Cockpit** that rolls up leaf-ticket progress per Feature/Produkt, offers two lenses (Überblick/Werkbank) and two modes (Karten/Tabelle), and supports inline / drawer / drag&drop / bulk editing — without growing the frozen `admin.ts` or `tickets.astro`.

**Architecture:** A new recursive-CTE view `tickets.v_cockpit_rollup` aggregates leaf counts per container; a pure DB module `cockpit-db.ts` queries it and reuses existing mutation helpers; five thin API routes under `api/admin/cockpit/` expose portfolio/feature/reorder/reparent/batch; a Svelte island (`Cockpit.svelte` + sub-components) backed by a pure `cockpitStore.ts` renders the UI; `cockpit.astro` does SSR auth + brand guard; `/admin/tickets` redirects into the cockpit's Tabelle mode. Backend/contract ships first so each stage leaves an independently-green state.

**Tech Stack:** Astro (SSR), Svelte islands, PostgreSQL 16 (recursive CTE views), Vitest (pg-mem with `vi.hoisted`), Playwright (`website` project), go-task quality gates (S1–S4 + freshness).

---

## Conventions used throughout this plan

- **All paths absolute** under the worktree root `/home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit/`. Commands assume `cd /home/patrick/Bachelorprojekt/tmp/wt-projekt-cockpit` first; the `website/` subdir is the pnpm workspace.
- **Brand guard (S3):** every endpoint resolves the brand via the established local const `const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';` and passes `BRAND()` into every query. **No `*.mentolder.de` / `*.korczewski.de` literals anywhere.** This matches `website/src/pages/api/admin/tickets/[id].ts`.
- **Auth guard:** `const session = await getSession(request.headers.get('cookie')); if (!session || !isAdmin(session)) return new Response(null, { status: 403 });` — `isAdmin` lives in `website/src/lib/auth.ts`.
- **S1 budgets (verified against `docs/code-quality/baseline.json` + `wc -l`):**
  - `website/src/lib/tickets/admin.ts` — Ist 677, **Baseline 677 → Budget 0. DO NOT TOUCH.** No cockpit logic here.
  - `website/src/pages/admin/tickets.astro` — Ist 359, **nicht-baselined → wirksame Schwelle = 400 (Astro), Budget 41.** Only a redirect change is allowed.
  - `website/src/lib/tickets-db.ts` — Ist **1094**, **baselined at 1106** (`S1:website/src/lib/tickets-db.ts`) → headroom **12 lines**. The ~55-line rollup view must therefore **NOT** be appended inline (1094 + 55 ≈ 1149 > 1106 → **S1 ratchet FAIL**). Instead the view DDL lives in a new module `tickets/cockpit-schema.ts`; `tickets-db.ts` gains only an import + a one-line `await ensureCockpitViews(pool)` call (→ ≤ 1096 ≤ 1106 ✓). Never hand-edit baseline.json.
  - All **new** `.ts` files: limit 600. New `.svelte`: limit 500. New `.astro`: limit 400. Plan keeps every new file with growth reserve under its limit; split into sub-components if any approaches ~80 %.
- **S2:** `cockpit-db.ts` imports only `pool`/`ensureSchemaOnce` from `website-db.ts` and existing helpers from `admin.ts` (type-only where possible) — **no imports from API routes or UI**. `cockpitStore.ts` imports nothing from DB/API/UI — pure store.
- **pg-mem DML tests** must mock the pool with `vi.hoisted(() => …)` before the test body (pattern: `website/src/pages/api/admin/ki/providers.test.ts`).
- **Migration (S4):** `scripts/migrations/2026-06-15-cockpit-rollup-view.sql` mirrors the bootstrap view verbatim and is referenced both by the bootstrap (`tickets-db.ts`) and operationally applied to **both** brand DBs.

---

## Stage F — Replace `/admin/tickets` + Tabelle mode + design polish

After Stage F, `cockpit.astro` is the landing page (SSR auth + brand guard + preload), `/admin/tickets` redirects into the Tabelle mode, and the cards are polished via the `frontend-design` skill.

### Task 27: `cockpit.astro` — SSR page (auth + brand guard + preload)

**Files:**
- Create: `website/src/pages/admin/cockpit.astro` (target ~80 lines; limit 400)

- [ ] **Step 1: Write the page**

Create `website/src/pages/admin/cockpit.astro` (mirror the island pattern at `website/src/pages/admin/inhalte.astro`; use the real `AdminLayout` import path found there):

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import Cockpit from '../../components/admin/Cockpit.svelte';
import { getSession, isAdmin } from '../../lib/auth';
import { getPortfolio } from '../../lib/tickets/cockpit-db';

const BRAND = (): string => process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session || !isAdmin(session)) return Astro.redirect('/login');

const brand = BRAND();
let portfolioInitial: Awaited<ReturnType<typeof getPortfolio>> | null = null;
try {
  portfolioInitial = await getPortfolio(brand);     // direct DB call — no self-fetch
} catch {
  portfolioInitial = null;                          // island will refetch client-side
}
---

<AdminLayout title="Projekt-Cockpit">
  <Cockpit {portfolioInitial} {brand} client:load />
</AdminLayout>
```

> Executor note: verify the exact `AdminLayout` import path and prop name used by `website/src/pages/admin/inhalte.astro` and match it. Calling `getPortfolio()` directly server-side avoids an HTTP self-fetch (no hardcoded host → S3-safe).

- [ ] **Step 2: Verify it builds**

Run: `cd website && pnpm build 2>&1 | grep -i "cockpit\|error" | head` 
Expected: no errors referencing cockpit.astro. `wc -l src/pages/admin/cockpit.astro` → <400.

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin/cockpit.astro
git commit -m "feat(cockpit): SSR cockpit.astro page (auth + brand guard + portfolio preload)"
```

---

### Task 28: Redirect `/admin/tickets` → `/admin/cockpit?mode=tabelle`

**Files:**
- Modify: `website/src/pages/admin/tickets.astro` (Ist 359 · Budget 41 — redirect only)
- Test: `website/src/pages/admin/tickets.redirect.test.ts` (or extend the existing admin-tickets E2E in Stage G)

- [ ] **Step 1: Add the redirect at the very top of the frontmatter**

In `website/src/pages/admin/tickets.astro`, immediately after the existing auth resolution (before any heavy data loading), insert a redirect. The minimal change (preserves auth, ≤3 net lines):

```astro
---
// Cockpit cutover: /admin/tickets now lives as the Cockpit "Tabelle" mode.
// Redirect so bookmarks/links keep working (spec §4, §13).
return Astro.redirect('/admin/cockpit?mode=tabelle');
---
```

> This makes the rest of the page dead code. If the build complains about unused imports, delete the now-unused frontmatter/body **net-reducing** the file (which only helps S1). Confirm `wc -l website/src/pages/admin/tickets.astro` did not grow past 359.

- [ ] **Step 2: Verify line budget + redirect**

Run: `wc -l website/src/pages/admin/tickets.astro` (≤ 359). Build: `cd website && pnpm build 2>&1 | grep -i error | head` (none).

- [ ] **Step 3: Commit**

```bash
git add website/src/pages/admin/tickets.astro
git commit -m "feat(cockpit): redirect /admin/tickets to cockpit Tabelle mode"
```

---

### Task 29: Wire the existing power-table into the Tabelle mode

**Files:**
- Modify: `website/src/components/admin/Cockpit.svelte` (replace `table-mode-placeholder`)
- Test: append a render assertion to `website/src/components/admin/Cockpit.test.ts`

- [ ] **Step 1: Locate the existing table component**

Run: `grep -rln "saved view\|gespeicherte\|TicketTable\|admin/tickets" website/src/components/admin/ | head`
Identify the Svelte component that `/admin/tickets` rendered for the flat power table (filters/saved views/quick-edit). Note its path + required props.

- [ ] **Step 2: Failing test** (append to Cockpit.test.ts)

```typescript
it('renders table mode placeholder swapped for the table component', async () => {
  const portfolio = { products: [{ id: 'p1', extId: 'p1', title: 'P',
    rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 }, features: [] }] };
  const { getByRole, queryByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
  await fireEvent.click(getByRole('button', { name: /tabelle/i }));
  expect(queryByTestId('table-mode-placeholder')).toBeNull();
});
```

- [ ] **Step 3: Implement** — in `Cockpit.svelte` import the located table component and replace the placeholder branch:

```svelte
    {#if $cockpitStore.mode === 'tabelle'}
      <ExistingTicketTable {brand} />   <!-- props per the located component -->
```

If the table component needs SSR-loaded data, pass it down via a new prop on `Cockpit` populated in `cockpit.astro` (keep the payload lean). If it self-loads from `/api/admin/tickets`, no prop is needed.

- [ ] **Step 4: PASS + Step 5: Commit**

```bash
git add website/src/components/admin/Cockpit.svelte website/src/components/admin/Cockpit.test.ts
git commit -m "feat(cockpit): embed existing power-table as Tabelle mode (no feature loss)"
```

---

### Task 30: Design polish via `frontend-design` skill (cards/lenses)

**Files:**
- Modify (CSS-only): `website/src/components/admin/FeatureCard.svelte`, `PortfolioGrid.svelte`, `Cockpit.svelte`, `EmptyStateCockpit.svelte`

- [ ] **Step 1: Invoke the skill with a CSS-only scope**

Use the `frontend-design` skill with the spec §12 prompt. **Constraint to the skill:** scoped CSS / class-name polish only — **do not change component props, DOM `data-testid`s, dispatched event names, or structure** (those are test-load-bearing). Dark theme, Kore tokens for korczewski, health-colored left border, progress bar/ring, status chips, two-lens segmented toggles, responsive grid, keyboard-accessible focus rings, empty states.

- [ ] **Step 2: Re-run component tests (must stay green)**

Run: `cd website && pnpm test -- "FeatureCard|PortfolioGrid|Cockpit|EmptyState"`
Expected: PASS (design changes must not break the existing assertions). If any `data-testid`/event name changed, revert that part.

- [ ] **Step 3: Check S1 budgets after CSS injection**

Run:
```bash
for f in FeatureCard PortfolioGrid Cockpit EmptyStateCockpit; do wc -l "website/src/components/admin/$f.svelte"; done
```
Expected: each <500. If any exceeds ~80 %, extract a sub-component (e.g., `FeatureCardHeader.svelte`) rather than compress.

- [ ] **Step 4: Build + Step 5: Commit**

Run: `cd website && pnpm build 2>&1 | grep -i error | head` (none).
```bash
git add website/src/components/admin/*.svelte
git commit -m "style(cockpit): design polish for cards + lenses (frontend-design)"
```

---

## Stage G — E2E tests, inventory & final verification

After Stage G, the cockpit has Playwright coverage in the `website` project, the test inventory is regenerated, and all CI-equivalent gates are green.

### Task 31: Playwright E2E spec for the cockpit (`website` project)

**Files:**
- Create: `tests/e2e/fa-29-cockpit.spec.ts` (the `website` project's `testMatch` already includes `**/fa-29-*.spec.ts` via the `fa-*` patterns — confirm in Step 1; if not, add the glob)

- [ ] **Step 1: Confirm project glob coverage**

Run: `grep -n "fa-29\|fa-\*\|fa-28" tests/e2e/playwright.config.ts | head`
If the `website` project's `testMatch` does not already pick up `fa-29-*`, add `'**/fa-29-*.spec.ts',` to the `website` project's `testMatch` array (single-line edit).

- [ ] **Step 2: Write the spec (5 cases)**

Create `tests/e2e/fa-29-cockpit.spec.ts` following the structure of `tests/e2e/factory-qs-abnahme.spec.ts` (auth setup + `page.goto`). Cover: (1) cockpit loads & renders portfolio cards; (2) lens toggle Überblick↔Werkbank; (3) one inline status edit (optimistic); (4) one bulk status edit; (5) one drag-reparent. Use explicit `await expect(locator).toBeVisible()` waits and `page.waitForResponse(/\/api\/admin\/cockpit\//)` — no fixed sleeps:

```typescript
import { test, expect } from '@playwright/test';

// FA-29 — Projekt-Cockpit E2E (website project)
test.describe('FA-29 Projekt-Cockpit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/cockpit');
    await expect(page.getByRole('button', { name: /überblick/i })).toBeVisible();
  });

  test('loads portfolio cards', async ({ page }) => {
    await expect(page.locator('[data-testid="portfolio-grid"]')).toBeVisible();
  });

  test('toggles lens to Werkbank', async ({ page }) => {
    await page.getByRole('button', { name: /werkbank/i }).click();
    await expect(page).toHaveURL(/lens=werkbank/);
  });

  test('inline-edits a ticket status', async ({ page }) => {
    const card = page.locator('[data-testid="feature-card"]').first();
    await card.click();
    await expect(page.locator('[data-testid="feature-workbench"]')).toBeVisible();
    const status = page.locator('[data-testid="status-select"]').first();
    const resp = page.waitForResponse(/\/api\/admin\/tickets\/.+\/transition/);
    await status.selectOption('done');
    await resp;
  });

  test('bulk-edits status', async ({ page }) => {
    await page.locator('[data-testid="feature-card"]').first().click();
    await page.locator('[data-testid="row-checkbox"]').first().check();
    const resp = page.waitForResponse(/\/api\/admin\/cockpit\/batch/);
    await page.locator('[data-testid="bulk-status"]').selectOption('done');
    await resp;
  });

  test('drag-reparents a ticket', async ({ page }) => {
    await page.locator('[data-testid="feature-card"]').first().click();
    const row = page.locator('[data-testid="feature-workbench"] [draggable="true"]').first();
    const target = page.locator('[data-testid="feature-card"]').nth(1);
    const resp = page.waitForResponse(/\/api\/admin\/cockpit\/reparent/);
    await row.dragTo(target);
    await resp;
  });
});
```

> Note: these run against a seeded environment with at least one Produkt → Feature → tickets; if the live brand has none, mark the data-dependent cases `test.skip` guarded on portfolio emptiness rather than letting them flake.

- [ ] **Step 3: List the specs are discoverable**

Run: `cd website && pnpm exec playwright test --list --config=../tests/e2e/playwright.config.ts --project=website 2>/dev/null | grep -ci "FA-29" || true`
Expected: ≥1 (5 cases).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/fa-29-cockpit.spec.ts tests/e2e/playwright.config.ts
git commit -m "test(cockpit): FA-29 Playwright E2E (load, lens, inline, bulk, reparent)"
```

---

### Task 32: Final verification — full CI-equivalent gate + inventory commit

**Files:**
- Modify (regenerated): `website/src/data/test-inventory.json` and any freshness artifacts

- [ ] **Step 1: Regenerate the test inventory (new test files added)**

Run: `task test:inventory`
Then: `git diff --stat website/src/data/test-inventory.json` (expect new cockpit entries).

- [ ] **Step 2: Run the full offline suite**

Run: `task test:all`
Expected: exit 0 (BATS + Vitest incl. `cockpit-db`, `cockpit-api`, `cockpitStore`, all cockpit components + integration + Taskfile dry-run + manifest structure).

- [ ] **Step 3: Regenerate freshness artifacts**

Run: `task freshness:regenerate`
Then: `git status` (review regenerated `docs/generated/**`, `docs/code-quality/repo-index.json`, etc.).

- [ ] **Step 4: Run the CI-equivalent gate (S1–S4 + freshness + baseline assertion)**

Run: `task freshness:check`
Expected: exit 0. Spot-checks:
```bash
wc -l website/src/lib/tickets/admin.ts        # MUST be 677 (frozen baseline)
wc -l website/src/lib/tickets-db.ts           # MUST be ≤ 1106 (baseline)
wc -l website/src/pages/admin/tickets.astro   # ≤ 359
```
If S1 trips on a new file: split it (extract a sub-component/helper), re-run — **never** hand-edit `docs/code-quality/baseline.json`.

- [ ] **Step 5: Commit the regenerated inventory + freshness artifacts**

```bash
git add website/src/data/test-inventory.json docs/code-quality/repo-index.json docs/generated 2>/dev/null
git add -A
git commit -m "chore(cockpit): regenerate test inventory + freshness artifacts"
```

- [ ] **Step 6: Final assertion before PR**

Run: `task test:all && task freshness:check`
Expected: both exit 0 → cockpit is ready for PR.

---

## Self-review notes (coverage vs. spec)

- **§4/§13 cutover** → Tasks 27 (cockpit.astro landing), 28 (redirect), 29 (Tabelle mode preserves power table).
- **§5 rollup model** → Tasks 1 (view), 2 (migration both brands), 4 (portfolio query, leaf-only, "Ohne Produkt" pseudo-group).
- **§6 two lenses + URL/localStorage persistence** → Tasks 13 (store), 17 (toggles).
- **§7 four edit paths** → inline (Task 20), drawer (Task 21), drag reorder/reparent (Tasks 24/25), bulk (Tasks 23/26); endpoints in Tasks 9/10/11.
- **§8 contract + components** → Task 3 (types), Tasks 14–17, 19–21, 23.
- **§9 optimistic + rollback + refetch + fail-closed** → Tasks 20, 21, 24, 25, 26 (snapshot/rollback; refetch via `mutated` → `refetchFeature`).
- **§10 S1–S4** → frozen `admin.ts`/`tickets.astro` honored throughout; pure store/db modules (S2); no domain literals (S3); migration referenced in bootstrap + dated file (S4).
- **§11 tests** → Vitest (Tasks 1,4,5,7–11,13–26,29), Playwright `website` project (Task 31), inventory + final gate (Task 32).
- **§12 design** → Task 30 (CSS-only `frontend-design`).
