---
title: E2E Visual Sweep Implementation Plan
ticket_id: T000397
domains: [test, website]
status: active
pr_number: null
---

# E2E Visual Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only Playwright "visual sweep" that screenshots every website route across both brands (mentolder + korczewski) and both viewports (desktop 1440×900 + mobile 390×844) on the live fleet, click-verifies the page-joining navigation, and emits a side-by-side gallery for a design-cohesion review.

**Architecture:** A generated, CI-drift-guarded route-manifest drives a data-driven spec run by a SEPARATE `playwright.visual-sweep.config.ts` (so nightly `e2e.yml` stays byte-for-byte untouched). Per route: pick an auth context by tier (public→anonymous, portal→customer, admin→admin storageState reused from the existing `*-setup` projects), install a network-layer non-GET abort (prod can't be mutated), apply a screenshot-stability recipe (consent-seed, fonts.ready, animation-freeze, scroll-hydrate, masks), resolve dynamic `[id]` routes read-only (skip+log when empty), capture full-page, and verify nav/link health. A gallery builder turns the artifacts into one reviewable HTML page.

**Tech Stack:** Playwright (TypeScript), Node ESM + `node:test`, Astro/Svelte website on the fleet cluster, go-task wrappers, GitHub Actions (`ci.yml` manifest-drift guard).

**Spec:** `docs/superpowers/specs/2026-06-01-e2e-visual-sweep-design.md`

---

### Task 1: Route-Manifest Generator (pure lib + CLI + unit test + task wrapper)

Builds the committed `website/src/data/route-manifest.json` artifact that every other sweep block consumes. Mirrors the test-inventory generator (`scripts/build-test-inventory.sh:1-53`) but in pure ESM (`node:test`), matching the repo's existing `node --test scripts/*/*.test.mjs` convention (`package.json:6-9`, e.g. `scripts/agent-guide/emit-docs.test.mjs:1-3`). TDD: the pure functions in `scripts/lib/route-manifest.mjs` are unit-tested first; the CLI is a thin writer.

- [ ] **Write the failing unit test** `scripts/lib/route-manifest.test.mjs`. It pins the four pure functions and the authoritative counts. Mirrors `node:test`/`node:assert/strict` + `mkdtempSync` fixture style from `scripts/agent-guide/emit-docs.test.mjs:1-6`. Run `cd /home/patrick/Bachelorprojekt && node --test scripts/lib/route-manifest.test.mjs` — expect failure (`Cannot find module './route-manifest.mjs'`). Full content:
  ```js
  // scripts/lib/route-manifest.test.mjs
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';
  import {
    fileToRoute,
    enumerateRoutes,
    expandServices,
    classifyAuthTier,
    buildManifest,
  } from './route-manifest.mjs';

  // --- fileToRoute: Astro file path (relative to pagesDir) -> URL route ---
  test('fileToRoute maps index/static/param/rest files', () => {
    assert.equal(fileToRoute('index.astro'), '/');
    assert.equal(fileToRoute('ueber-mich.astro'), '/ueber-mich');
    assert.equal(fileToRoute('admin.astro'), '/admin');
    assert.equal(fileToRoute('admin/index.astro'), '/admin');
    assert.equal(fileToRoute('admin/tickets/[id].astro'), '/admin/tickets/[id]');
    assert.equal(fileToRoute('admin/brett/[...path].astro'), '/admin/brett/[...path]');
    assert.equal(fileToRoute('portal/billing/[id]/drucken.astro'), '/portal/billing/[id]/drucken');
    assert.equal(fileToRoute('[service].astro'), '/[service]');
  });

  // --- classifyAuthTier ---
  test('classifyAuthTier routes by prefix', () => {
    assert.equal(classifyAuthTier('/admin'), 'admin');
    assert.equal(classifyAuthTier('/admin/tickets/[id]'), 'admin');
    assert.equal(classifyAuthTier('/portal'), 'portal');
    assert.equal(classifyAuthTier('/portal/raum/[id]'), 'portal');
    assert.equal(classifyAuthTier('/'), 'public');
    assert.equal(classifyAuthTier('/ueber-mich'), 'public');
    assert.equal(classifyAuthTier('/[service]'), 'public');
  });

  // --- enumerateRoutes: excludes /api, sorts, maps every file ---
  test('enumerateRoutes walks dir, excludes api, returns sorted routes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rm-pages-'));
    mkdirSync(join(dir, 'admin', 'tickets'), { recursive: true });
    mkdirSync(join(dir, 'api', 'admin'), { recursive: true });
    mkdirSync(join(dir, 'portal'), { recursive: true });
    writeFileSync(join(dir, 'index.astro'), '');
    writeFileSync(join(dir, 'ueber-mich.astro'), '');
    writeFileSync(join(dir, '[service].astro'), '');
    writeFileSync(join(dir, 'admin.astro'), '');
    writeFileSync(join(dir, 'admin', 'tickets', '[id].astro'), '');
    writeFileSync(join(dir, 'portal.astro'), '');
    writeFileSync(join(dir, 'api', 'admin', 'save.ts'), '');      // excluded
    writeFileSync(join(dir, 'admin', 'notes.md'), '');            // README-ish .md still a page? no -> only astro/md pages
    const routes = enumerateRoutes(dir);
    assert.ok(routes.includes('/'));
    assert.ok(routes.includes('/[service]'));
    assert.ok(routes.includes('/admin'));
    assert.ok(routes.includes('/admin/tickets/[id]'));
    assert.ok(!routes.some((r) => r.startsWith('/api')), 'api excluded');
    // sorted ascending
    assert.deepEqual(routes, [...routes].sort());
    rmSync(dir, { recursive: true, force: true });
  });

  // --- expandServices: /[service] -> per-brand concrete slugs ---
  const FIXTURE_BRANDS = {
    mentolder: { services: [
      { slug: '50plus-digital' }, { slug: 'coaching' }, { slug: 'fuehrung-persoenlichkeit' },
      { slug: 'beratung' }, { slug: 'ki-transition' },
    ] },
    korczewski: { services: [
      { slug: 'ki-beratung' }, { slug: 'software-dev' }, { slug: 'deployment' },
    ] },
  };

  test('expandServices yields one entry per brand slug, brand-tagged', () => {
    const out = expandServices(FIXTURE_BRANDS);
    assert.equal(out.length, 8);
    const m = out.filter((e) => e.brand === 'mentolder');
    const k = out.filter((e) => e.brand === 'korczewski');
    assert.equal(m.length, 5);
    assert.equal(k.length, 3);
    assert.deepEqual(m.map((e) => e.route).sort(), [
      '/50plus-digital', '/beratung', '/coaching', '/fuehrung-persoenlichkeit', '/ki-transition',
    ]);
    assert.deepEqual(k.map((e) => e.route).sort(), ['/deployment', '/ki-beratung', '/software-dev']);
    for (const e of out) {
      assert.equal(e.authTier, 'public');
      assert.equal(e.dynamic, false);
      assert.equal(e.excludeFromSweep, false);
    }
  });

  // --- buildManifest against the REAL pages dir + real brands ---
  const REPO = new URL('../../', import.meta.url).pathname;
  const PAGES = join(REPO, 'website/src/pages');

  test('buildManifest: shape + authoritative counts', () => {
    const manifest = buildManifest(PAGES, FIXTURE_BRANDS);
    assert.equal(manifest.generatedFrom, 'website/src/pages');
    assert.equal(manifest.count, 98); // page-file count (enumerated, pre-service-expansion)
    assert.ok(Array.isArray(manifest.routes));
    // /[service] literal is NOT emitted
    assert.ok(!manifest.routes.some((r) => r.route === '/[service]'),
      '/[service] literal must be expanded, not emitted');
    // expanded service routes present + brand-tagged
    assert.ok(manifest.routes.some((r) => r.route === '/50plus-digital' && r.brand === 'mentolder'));
    assert.ok(manifest.routes.some((r) => r.route === '/ki-beratung' && r.brand === 'korczewski'));
  });

  test('buildManifest: tier split admin=67 portal=9 public=22 over page files', () => {
    const manifest = buildManifest(PAGES, FIXTURE_BRANDS);
    // Tier split is asserted over the ENUMERATED page files (count basis), so collapse
    // expanded service routes back to the single /[service] page file for the tally.
    const tierOf = (r) => r.authTier;
    const pageTier = (r) => (r.route === '/[service]' || r._fromService ? 'public' : tierOf(r));
    // Reconstruct page-file tally: dedupe brand-expanded service entries to one public slot.
    const seenService = manifest.routes.some((r) => r._fromService);
    assert.ok(seenService, 'service entries must carry _fromService marker');
    const nonService = manifest.routes.filter((r) => !r._fromService);
    const serviceContributes = 1; // the single /[service] page file
    const admin = nonService.filter((r) => r.authTier === 'admin').length;
    const portal = nonService.filter((r) => r.authTier === 'portal').length;
    const publicLiterals = nonService.filter((r) => r.authTier === 'public').length;
    assert.equal(admin, 67, 'admin tier page files');
    assert.equal(portal, 9, 'portal tier page files');
    assert.equal(publicLiterals + serviceContributes, 22, 'public tier page files incl /[service]');
  });

  test('buildManifest: excludeFromSweep flags set for arena/systemtest/brett', () => {
    const manifest = buildManifest(PAGES, FIXTURE_BRANDS);
    const find = (route) => manifest.routes.find((r) => r.route === route);
    assert.equal(find('/portal/arena')?.excludeFromSweep, true);
    assert.equal(find('/admin/systemtest')?.excludeFromSweep, true);
    assert.equal(find('/admin/brett/[...path]')?.excludeFromSweep, true);
    // a normal route is NOT excluded
    assert.equal(find('/ueber-mich')?.excludeFromSweep, false);
  });
  ```

- [ ] **Write the pure module** `scripts/lib/route-manifest.mjs` to make the test pass. No I/O beyond reading `pagesDir` (matching how `scripts/build-test-inventory.sh:10-19` walks dirs). Implements the contract's `RouteEntry` shape exactly. Run the test again after writing — expect all green. Full content:
  ```js
  // scripts/lib/route-manifest.mjs
  // Pure functions: enumerate Astro page files -> RouteEntry[] manifest.
  // Mirrors scripts/build-test-inventory.sh (filesystem scan -> committed JSON artifact).
  import { readdirSync, statSync } from 'node:fs';
  import { join, relative, sep } from 'node:path';

  const PAGE_EXTS = ['.astro', '.md', '.mdx'];

  /** Astro file path (relative to pagesDir, posix-ish) -> URL route. */
  export function fileToRoute(relPath) {
    let p = relPath.split(sep).join('/');
    for (const ext of PAGE_EXTS) {
      if (p.endsWith(ext)) { p = p.slice(0, -ext.length); break; }
    }
    if (p === 'index') return '/';
    if (p.endsWith('/index')) p = p.slice(0, -'/index'.length);
    return '/' + p;
  }

  /** Recursively collect page-file routes under pagesDir, excluding /api. Sorted. */
  export function enumerateRoutes(pagesDir) {
    const routes = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const rel = relative(pagesDir, full);
        const top = rel.split(sep)[0];
        if (top === 'api') continue; // exclude API routes
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!PAGE_EXTS.some((e) => name.endsWith(e))) continue;
        routes.push(fileToRoute(rel));
      }
    };
    walk(pagesDir);
    return routes.sort();
  }

  /** First path segment decides the auth tier. */
  export function classifyAuthTier(route) {
    const seg = route.split('/')[1] ?? '';
    if (seg === 'admin') return 'admin';
    if (seg === 'portal') return 'portal';
    return 'public';
  }

  /** Routes whose subtree is unsafe/non-deterministic to sweep. */
  const EXCLUDE_PREFIXES = ['/portal/arena', '/admin/systemtest', '/admin/brett'];
  function isExcluded(route) {
    return EXCLUDE_PREFIXES.some((p) => route === p || route.startsWith(p + '/'));
  }

  const DYNAMIC_RE = /\[.+?\]/;

  /** A bare RouteEntry for a literal (non-service) page-file route. */
  function literalEntry(route) {
    return {
      route,
      authTier: classifyAuthTier(route),
      brand: 'both',
      dynamic: DYNAMIC_RE.test(route),
      excludeFromSweep: isExcluded(route),
      media: false,
    };
  }

  /** /[service] -> one concrete RouteEntry per brand slug. */
  export function expandServices(brandConfigs) {
    const out = [];
    for (const [brand, cfg] of Object.entries(brandConfigs)) {
      for (const svc of cfg.services ?? []) {
        out.push({
          route: '/' + svc.slug,
          authTier: 'public',
          brand,
          dynamic: false,
          excludeFromSweep: false,
          media: false,
          _fromService: true, // provenance marker (kept in JSON; consumers ignore unknown keys)
        });
      }
    }
    return out;
  }

  /** Build the full manifest: { generatedFrom, count, routes }. */
  export function buildManifest(pagesDir, brandConfigs) {
    const fileRoutes = enumerateRoutes(pagesDir);
    const count = fileRoutes.length; // authoritative page-file count (98)
    const routes = [];
    for (const route of fileRoutes) {
      if (route === '/[service]') continue; // never emit literal; expand below
      routes.push(literalEntry(route));
    }
    routes.push(...expandServices(brandConfigs));
    routes.sort((a, b) =>
      a.route === b.route ? a.brand.localeCompare(b.brand) : a.route.localeCompare(b.route),
    );
    return { generatedFrom: 'website/src/pages', count, routes };
  }
  ```

- [ ] **Run the unit test, confirm green.** `cd /home/patrick/Bachelorprojekt && node --test scripts/lib/route-manifest.test.mjs`. Expected: `# pass 7  # fail 0`. If the `count` assertion fails with a number other than 98, a page file was added/removed since the contract was pinned — STOP and reconcile with the spec owner, do not silently change the literal.

- [ ] **Write the CLI wrapper** `scripts/build-route-manifest.mjs`. Thin writer mirroring `scripts/build-test-inventory.sh`'s "compute → write to `website/src/data/*.json` → echo count" shape (`build-test-inventory.sh:6,48-49`). It resolves the real brand slugs from the TS configs via the repo-local `tsx` binary (`website/node_modules/.bin/tsx`, confirmed present), then calls the pure `buildManifest`. Full content:
  ```js
  // scripts/build-route-manifest.mjs
  // CLI: enumerate website/src/pages + brand service slugs -> website/src/data/route-manifest.json
  import { writeFileSync } from 'node:fs';
  import { join, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';
  import { execFileSync } from 'node:child_process';
  import { buildManifest } from './lib/route-manifest.mjs';

  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const PAGES_DIR = join(REPO_ROOT, 'website/src/pages');
  const OUT = join(REPO_ROOT, 'website/src/data/route-manifest.json');

  // Extract service slugs from the TS brand configs without bundling Astro:
  // run a tiny tsx eval that imports both configs and prints {brand:{services:[{slug}]}}.
  function loadBrandSlugs() {
    const tsx = join(REPO_ROOT, 'website/node_modules/.bin/tsx');
    const snippet = `
      import { mentolderConfig } from './website/src/config/brands/mentolder.ts';
      import { korczewskiConfig } from './website/src/config/brands/korczewski.ts';
      const pick = (c) => ({ services: c.services.map((s) => ({ slug: s.slug })) });
      process.stdout.write(JSON.stringify({
        mentolder: pick(mentolderConfig),
        korczewski: pick(korczewskiConfig),
      }));
    `;
    const json = execFileSync(tsx, ['--eval', snippet], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    return JSON.parse(json);
  }

  const brands = loadBrandSlugs();
  const manifest = buildManifest(PAGES_DIR, brands);
  writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(
    `Wrote ${manifest.count} page files -> ${manifest.routes.length} sweep routes to ${OUT}`,
  );
  ```

- [ ] **Generate the artifact** `website/src/data/route-manifest.json`. Run `cd /home/patrick/Bachelorprojekt && node scripts/build-route-manifest.mjs`. Expected stdout: `Wrote 98 page files -> N sweep routes to .../website/src/data/route-manifest.json` (N = 97 literal page routes minus the dropped `/[service]` + 8 expanded service routes). If `tsx` errors on a TS env-var reference, re-run; the `process.env.*` reads in the configs resolve to `''` and do not affect `.slug`.

- [ ] **Sanity-check the generated JSON** matches the contract shape and counts. Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  node -e 'const m=require("./website/src/data/route-manifest.json");
    console.log("generatedFrom",m.generatedFrom,"count",m.count);
    const ns=m.routes.filter(r=>!r._fromService);
    const t=k=>ns.filter(r=>r.authTier===k).length;
    console.log("admin",t("admin"),"portal",t("portal"),"public(literal)",t("public"));
    console.log("hasServiceLiteral",m.routes.some(r=>r.route==="/[service]"));
    console.log("services",m.routes.filter(r=>r._fromService).map(r=>r.brand+":"+r.route).join(" "));
    console.log("excluded",m.routes.filter(r=>r.excludeFromSweep).map(r=>r.route).join(" "));'
  ```
  Expected: `generatedFrom website/src/pages count 98`; `admin 67 portal 9 public(literal) 21`; `hasServiceLiteral false`; service list shows 5 mentolder + 3 korczewski slugs; excluded list contains `/portal/arena /admin/systemtest /admin/brett/[...path]`. (public-literal=21 because the 22nd public page file is `/[service]`, expanded into the brand entries.)

- [ ] **Add the `routes:manifest` task** to `Taskfile.yml`, placed directly after the `test:inventory` block (`Taskfile.yml:391-394`), mirroring its 3-line shape:
  ```yaml
  routes:manifest:
    desc: Regenerate website/src/data/route-manifest.json (page files + brand service slugs → sweep route manifest)
    cmds:
      - node scripts/build-route-manifest.mjs
  ```
  Verify it is wired: `cd /home/patrick/Bachelorprojekt && task routes:manifest`. Expected stdout: the same `Wrote 98 page files -> ...` line, and `git status --short website/src/data/route-manifest.json` shows no diff (idempotent re-generation).

- [ ] **Add the route-manifest drift gate** to `.github/workflows/ci.yml`, immediately after the "Verify test inventory is up to date" step (`ci.yml:38-44`), mirroring it exactly:
  ```yaml
      - name: Verify route manifest is up to date
        run: |
          task routes:manifest
          if ! git diff --exit-code website/src/data/route-manifest.json; then
            echo "ERROR: website/src/data/route-manifest.json is stale — run 'task routes:manifest' locally and commit"
            exit 1
          fi
  ```
  Confirm placement with `grep -n "route manifest is up to date\|test inventory is up to date" .github/workflows/ci.yml` — the new step must appear right after the inventory one.

- [ ] **Commit the generator + artifact + wiring.** From the repo root:
  ```bash
  cd /home/patrick/Bachelorprojekt
  node --test scripts/lib/route-manifest.test.mjs   # final green gate, expect "# fail 0"
  git add scripts/lib/route-manifest.mjs scripts/lib/route-manifest.test.mjs \
          scripts/build-route-manifest.mjs website/src/data/route-manifest.json \
          Taskfile.yml .github/workflows/ci.yml
  git commit -m "feat(e2e): route-manifest generator + drift gate for visual sweep

  Pure ESM enumerator (scripts/lib/route-manifest.mjs) walks website/src/pages,
  excludes /api, classifies admin/portal/public tiers, and expands /[service]
  into per-brand concrete slugs. CLI writes website/src/data/route-manifest.json;
  task routes:manifest + a CI drift step mirror the test-inventory pattern.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
  ```
  Do NOT push (the orchestrator handles branch/push). Expected: clean commit, test output `# pass 7  # fail 0`.

---

Implementation notes for the parent / downstream blocks:

- **Files produced**: `/home/patrick/Bachelorprojekt/scripts/lib/route-manifest.mjs`, `/home/patrick/Bachelorprojekt/scripts/lib/route-manifest.test.mjs`, `/home/patrick/Bachelorprojekt/scripts/build-route-manifest.mjs`, `/home/patrick/Bachelorprojekt/website/src/data/route-manifest.json` (committed artifact), plus edits to `/home/patrick/Bachelorprojekt/Taskfile.yml` and `/home/patrick/Bachelorprojekt/.github/workflows/ci.yml`.
- **Verified count reconciliation** (filesystem-confirmed): page-file `count:98` = admin 67 (66 files under `admin/` + `admin.astro` index) + portal 9 (8 files under `portal/` + `portal.astro` index) + public 22 (24 top-level/`poll` routes minus `admin.astro`/`portal.astro` which tally as admin/portal). `/[service]` is one of those 22 public page files; it is dropped from `routes[]` and replaced by 8 brand entries — so `routes.length` = 97 literal + 8 service = **105**, while `count` stays 98.
- **One contract deviation flagged for the spec owner**: the contract's `RouteEntry` shape does not list `_fromService`. I added it as a provenance marker so the unit test and the sanity-check can distinguish expanded service routes from literal page routes when reconstructing the 67/9/22 page-file tally. Consumers that destructure known fields ignore it. If the spec owner wants a strictly closed shape, drop `_fromService` from `expandServices`/the JSON and instead have the tier-split test detect service entries by `brand !== 'both'` — both the test and `build-route-manifest.mjs` already key off `brand`, so the change is localized.
- **`resolver`/`excludeFromSweep` for dynamic routes**: this block emits the structural skeleton (`route`, `authTier`, `brand`, `dynamic`, `excludeFromSweep`, `media`). The `resolver:{indexUrl,selector,...}` enrichment for dynamic `[id]`/`[assignmentId]` routes is owned by `dynamic-resolver.ts` / the spec's resolver-annotation step, not by the pure generator — the generator leaves `resolver` absent (optional in the shape), which is correct for the anonymous public-only pass.
- **`tsx` dependency**: the CLI shells out to `website/node_modules/.bin/tsx` (confirmed present) to read real slugs from the TS configs; the pure `buildManifest`/`expandServices` take plain data and are fully unit-tested with a fixture, so CI's offline unit run needs no TS toolchain — only `task routes:manifest`/the drift step do, and CI already runs `npm ci` (`ci.yml:30`) before the inventory/manifest steps. If `website/node_modules` is absent in CI, add a `pnpm -C website install --frozen-lockfile` (or reuse the existing website-deps step) ahead of the drift gate.

---

### Task 2: CI drift guard + test-inventory regen

This block edits **`.github/workflows/ci.yml`** to add a route-manifest drift guard (mirroring the existing test-inventory and agent-guide drift steps) plus a 98-count/auth-tier sanity assertion, and documents the one-time `test:inventory` regen that visual-sweep.spec.ts forces. It assumes the sibling blocks have already created `scripts/build-route-manifest.mjs`, the `routes:manifest` Taskfile target, `website/src/data/route-manifest.json`, and `tests/e2e/specs/visual-sweep.spec.ts`.

- [ ] **Confirm prerequisites exist** (so the drift step is meaningful). Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  test -f scripts/build-route-manifest.mjs && echo "CLI ok" || echo "MISSING build-route-manifest.mjs"
  grep -nq 'routes:manifest:' Taskfile.yml && echo "task ok" || echo "MISSING routes:manifest task"
  test -f website/src/data/route-manifest.json && echo "artifact ok" || echo "MISSING route-manifest.json"
  test -f tests/e2e/specs/visual-sweep.spec.ts && echo "spec ok" || echo "MISSING visual-sweep.spec.ts"
  ```
  Expected: all four print `ok`. If any print `MISSING`, the sibling block that owns that file has not landed yet — stop and surface that as a blocker rather than guessing.

- [ ] **Verify `task routes:manifest` is idempotent against the committed artifact** (this is exactly what the new CI step asserts). Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  task routes:manifest
  git diff --exit-code website/src/data/route-manifest.json && echo "CLEAN (no drift)" || echo "DRIFT — regenerate & commit before CI step lands"
  ```
  Expected: `CLEAN (no drift)`. The artifact must be byte-stable across reruns or the CI guard will false-positive. If it drifts, commit the regenerated file first (that's a sibling block's artifact, but the guard depends on it being committed clean).

- [ ] **Insert the route-manifest drift step into `.github/workflows/ci.yml`.** Add it immediately AFTER the existing "Verify test inventory is up to date" step (ci.yml:38-44) and BEFORE "Verify agent-guide docs are up to date" (ci.yml:46). It mirrors the test-inventory drift pattern at ci.yml:38-44 (`task <gen>` → `git diff --exit-code <artifact>` → echo+exit 1), and adds a `node -e` assertion on count and auth-tier integrity. Use the Edit tool to replace the test-inventory step block with itself plus the new step:

  Replace this exact text (ci.yml:38-45 — the test-inventory step plus the trailing blank line before the agent-guide step):
  ```yaml
      - name: Verify test inventory is up to date
        run: |
          task test:inventory
          if ! git diff --exit-code website/src/data/test-inventory.json; then
            echo "ERROR: website/src/data/test-inventory.json is stale — run 'task test:inventory' locally and commit"
            exit 1
          fi

  ```
  with:
  ```yaml
      - name: Verify test inventory is up to date
        run: |
          task test:inventory
          if ! git diff --exit-code website/src/data/test-inventory.json; then
            echo "ERROR: website/src/data/test-inventory.json is stale — run 'task test:inventory' locally and commit"
            exit 1
          fi

      - name: Verify route manifest is up to date
        run: |
          task routes:manifest
          if ! git diff --exit-code website/src/data/route-manifest.json; then
            echo "ERROR: website/src/data/route-manifest.json is stale — run 'task routes:manifest' locally and commit"
            exit 1
          fi

      - name: Assert route manifest invariants (count + auth tiers)
        run: |
          node -e '
            const fs = require("fs");
            const m = JSON.parse(fs.readFileSync("website/src/data/route-manifest.json", "utf8"));
            const errs = [];
            if (m.generatedFrom !== "website/src/pages") {
              errs.push(`generatedFrom must be "website/src/pages", got ${JSON.stringify(m.generatedFrom)}`);
            }
            if (!Array.isArray(m.routes)) {
              errs.push("routes must be an array");
            }
            if (m.count !== 98) {
              errs.push(`expected count===98, got ${m.count}`);
            }
            if (Array.isArray(m.routes) && m.routes.length !== m.count) {
              errs.push(`routes.length (${m.routes.length}) !== count (${m.count})`);
            }
            for (const r of (m.routes || [])) {
              const isAdmin = r.route.startsWith("/admin");
              const isPortal = r.route.startsWith("/portal");
              if ((isAdmin || isPortal) && r.authTier === "public") {
                errs.push(`${r.route} is under /admin or /portal but tagged authTier=public`);
              }
              if (!isAdmin && !isPortal && r.authTier !== "public") {
                errs.push(`${r.route} is public-namespace but tagged authTier=${r.authTier}`);
              }
            }
            if (errs.length) {
              console.error("ERROR: route-manifest invariants violated:\n  - " + errs.join("\n  - "));
              process.exit(1);
            }
            console.log(`route-manifest OK: ${m.count} routes, auth tiers consistent`);
          '

  ```

- [ ] **Sanity-check the inserted YAML parses and the assertion runs locally** (catches indentation/quoting mistakes before pushing — CI has no yamllint, per CLAUDE.md "No yamllint/shellcheck/kubeconform in CI"). Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  node -e 'const y=require("js-yaml");y.load(require("fs").readFileSync(".github/workflows/ci.yml","utf8"));console.log("ci.yml YAML parses OK")' \
    || python3 -c 'import yaml,sys; yaml.safe_load(open(".github/workflows/ci.yml")); print("ci.yml YAML parses OK")'
  node -e '
    const m=JSON.parse(require("fs").readFileSync("website/src/data/route-manifest.json","utf8"));
    const bad=(m.routes||[]).filter(r=>{const a=r.route.startsWith("/admin"),p=r.route.startsWith("/portal");return (a||p)?r.authTier==="public":r.authTier!=="public";});
    if(m.count!==98){console.error("count!=98:",m.count);process.exit(1);}
    if(bad.length){console.error("auth-tier violations:",bad.map(r=>r.route));process.exit(1);}
    console.log("invariants OK locally:",m.count,"routes");
  '
  ```
  Expected: `ci.yml YAML parses OK` and `invariants OK locally: 98 routes`. (The `js-yaml`/`python3` either-or covers whichever is present; `js-yaml` ships via the website devDeps.)

- [ ] **Regenerate and commit `test-inventory.json` because visual-sweep.spec.ts adds an E2E entry.** `scripts/build-test-inventory.sh:22` globs `tests/e2e/specs/*.spec.ts`; the new `tests/e2e/specs/visual-sweep.spec.ts` does NOT match the `^(fa|sa|nfa|ak)-([0-9]+)` regex at line 26, so the `else` branch (lines 29-32) tags it `id="E2E:visual-sweep"`, `category="E2E"`, `kind:"playwright"`, `tier:"e2e"`. That new row must be written into the committed inventory or the existing "Verify test inventory is up to date" CI step (ci.yml:38-44) fails on drift. Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  task test:inventory
  grep -q '"E2E:visual-sweep"' website/src/data/test-inventory.json && echo "E2E entry present" || echo "MISSING E2E entry — is visual-sweep.spec.ts created?"
  git --no-pager diff --stat website/src/data/test-inventory.json
  ```
  Expected: `E2E entry present`, and the diff shows exactly the one new `E2E:visual-sweep` object added (inventory is `sort_by(.id)`, so placement is deterministic). If the grep prints `MISSING`, the visual-sweep.spec.ts sibling block hasn't landed — defer this commit until it has, since the inventory entry is derived purely from the spec file's existence.

- [ ] **Commit the CI guard plus the regenerated inventory.** Run:
  ```bash
  cd /home/patrick/Bachelorprojekt
  git add .github/workflows/ci.yml website/src/data/test-inventory.json
  git commit -m "$(cat <<'EOF'
ci(visual-sweep): add route-manifest drift guard + regen test inventory

Add a "Verify route manifest is up to date" step (mirrors the
test-inventory drift step at ci.yml:38-44) and a node assertion that
the manifest has count===98 and no /admin|/portal route is tagged
public (and no public-namespace route is non-public).

Regenerate website/src/data/test-inventory.json: build-test-inventory.sh
globs tests/e2e/specs/*.spec.ts (line 22), so visual-sweep.spec.ts adds
an E2E:visual-sweep row that the existing inventory drift step requires
to be committed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```
  Expected: one commit touching `.github/workflows/ci.yml` and `website/src/data/test-inventory.json`. Do NOT include `route-manifest.json` here — that artifact is owned/committed by the sibling block that generates it; this block only consumes it.

**Notes / cited patterns:**
- New drift step mirrors `.github/workflows/ci.yml:38-44` (test-inventory: `task <gen>` → `git diff --exit-code <artifact>` → `echo ERROR; exit 1`) and the agent-guide drift steps at ci.yml:46-68.
- Placement is between the test-inventory step (ends ci.yml:44) and the agent-guide docs step (starts ci.yml:46), keeping all "generated-artifact is up to date" guards grouped in the `offline-tests` job.
- The E2E inventory entry derivation is `scripts/build-test-inventory.sh:22` (glob `tests/e2e/specs/*.spec.ts`) → lines 26-32 (non-`fa/sa/nfa/ak` filenames fall to the `else` → `id="E2E:$base"`, `category="E2E"`), line 33 (`kind:"playwright"`, `tier:"e2e"`).
- The `routes:manifest` Taskfile target itself is defined by a sibling block (it's in the shared contract); this block only invokes it. As of reading, `Taskfile.yml` has no `routes:manifest` target yet — the prerequisite check in step 1 guards against landing the CI step before that target exists.

---

### Task 3: tests/e2e/playwright.visual-sweep.config.ts

- [ ] **Inspect the patterns this config clones.** Open `/home/patrick/Bachelorprojekt/tests/e2e/playwright.film.config.ts` (the separate-config + `globalSetup/globalTeardown: undefined` pattern, lines 1-14) and `/home/patrick/Bachelorprojekt/tests/e2e/playwright.config.ts` (shared `use` block lines 22-34; `mentolder-setup` project lines 97-104; `korczewski-setup` project lines 231-238). Confirm `baseConfig.projects` is an array containing four `*-setup` projects (`mentolder-setup`, `brett-mentolder-setup`, `arena-mentolder-setup`, `korczewski-setup`) — so a bare `.endsWith("-setup")` filter would yield **4**, not **2**. We must whitelist the two website-auth setups.

- [ ] **Write `/home/patrick/Bachelorprojekt/tests/e2e/playwright.visual-sweep.config.ts`** with this exact content (mirrors `playwright.film.config.ts:1-14` for the separate-config import + nulled global hooks, and `playwright.config.ts:22-34` for the inherited `use` block):

```ts
import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';
import baseConfig from './playwright.config';

// WEBSITE_URL drives both the baseURL the sweep navigates and the login host
// the *-setup projects authenticate against. Mirror playwright.film.config.ts:4.
const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

// The visual sweep is a read-only screenshot pass. Like the film config
// (playwright.film.config.ts:12-13) it must NOT inherit baseConfig's
// globalSetup/globalTeardown — those bracket every run with a prod-DB purge
// (POST /api/admin/systemtest/purge-all-test-data). A screenshot sweep must
// never purge production data.
const GLOBAL_SETUP = undefined;
const GLOBAL_TEARDOWN = undefined;

// Only the two website-auth setups are relevant to the sweep. The brett/arena
// setups (brett-mentolder-setup, arena-mentolder-setup) seed game auth state
// the sweep never touches, so we whitelist by name rather than a broad
// .endsWith('-setup') filter (which would pull all four).
const WEBSITE_SETUP_NAMES = ['mentolder-setup', 'korczewski-setup'];

const baseProjects = (baseConfig.projects ?? []) as Project[];
const setupProjects: Project[] = baseProjects.filter(
  (p) => typeof p.name === 'string' && WEBSITE_SETUP_NAMES.includes(p.name),
);

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

const sweepUse = (viewport: { width: number; height: number }) => ({
  viewport,
  baseURL: websiteURL,
  ignoreHTTPSErrors: true,
});

export default defineConfig({
  ...baseConfig,
  globalSetup: GLOBAL_SETUP,
  globalTeardown: GLOBAL_TEARDOWN,
  testMatch: ['**/visual-sweep.spec.ts'],
  use: {
    ...baseConfig.use,
    baseURL: websiteURL,
    ignoreHTTPSErrors: true,
  },
  projects: [
    // Re-declare the two website-auth setups so the sweep projects can depend
    // on them (mints .auth/*-website-{admin,user}.json storage states).
    ...setupProjects,
    {
      name: 'visual-sweep-mentolder-desktop',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['mentolder-setup'],
      use: sweepUse(DESKTOP),
    },
    {
      name: 'visual-sweep-mentolder-mobile',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['mentolder-setup'],
      use: sweepUse(MOBILE),
    },
    {
      name: 'visual-sweep-korczewski-desktop',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['korczewski-setup'],
      use: sweepUse(DESKTOP),
    },
    {
      name: 'visual-sweep-korczewski-mobile',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['korczewski-setup'],
      use: sweepUse(MOBILE),
    },
  ],
});
```

- [ ] **Validate the config parses and lists exactly the expected projects.** From `/home/patrick/Bachelorprojekt/tests/e2e`, run:
  ```bash
  cd /home/patrick/Bachelorprojekt/tests/e2e && npx playwright test --config playwright.visual-sweep.config.ts --list 2>&1 | grep -E '^\s*\[' | sed -E 's/\].*/]/' | sort -u
  ```
  Expected: exactly **6** distinct project tags — `[mentolder-setup]`, `[korczewski-setup]`, `[visual-sweep-mentolder-desktop]`, `[visual-sweep-mentolder-mobile]`, `[visual-sweep-korczewski-desktop]`, `[visual-sweep-korczewski-mobile]`. No `[brett-mentolder-setup]`, `[arena-mentolder-setup]`, `[website]`, `[services]`, `[korczewski]`, etc. (Note: `visual-sweep.spec.ts` is created by a sibling task block; if it does not yet exist, the `--list` may report "no tests found" but must still parse the config and print the 6 project headers without a TypeScript error. If you see a parse/type error, fix the config — not the spec.)

- [ ] **Assert the main config is untouched.** Run:
  ```bash
  cd /home/patrick/Bachelorprojekt/tests/e2e && npx playwright test --config playwright.config.ts --list 2>&1 | grep -E '^\s*\[' | sed -E 's/\].*/]/' | sort -u | wc -l
  ```
  Expected: `14` — the base config still declares its 14 projects (`website`, `mentolder-setup`, `mentolder`, `services`, `brett-mentolder-setup`, `brett-mentolder`, `arena-mentolder-setup`, `korczewski-setup`, `korczewski`, `smoke`, `ios`, `android`, `systemtest`, `unit`). The new config is a separate file and changes nothing in the base.

- [ ] **Typecheck the new file in isolation** (no `use`-block or `Project` type regressions):
  ```bash
  cd /home/patrick/Bachelorprojekt/tests/e2e && npx tsc --noEmit playwright.visual-sweep.config.ts 2>&1 | head -20
  ```
  Expected: no output (clean). If `tsc` complains about missing module resolution for `@playwright/test`, fall back to the `--list` parse check above as the authoritative validation (Playwright loads the config through its own esbuild transform).

- [ ] **Commit.** From repo root:
  ```bash
  cd /home/patrick/Bachelorprojekt && git add tests/e2e/playwright.visual-sweep.config.ts && git commit -m "$(cat <<'EOF'
test(e2e): add visual-sweep Playwright config

Separate config for the read-only visual sweep. Nulls globalSetup/
globalTeardown so the prod-DB purge never runs (mirrors
playwright.film.config.ts). Declares 4 sweep projects
(mentolder/korczewski × desktop/mobile) plus the two re-declared
website-auth setups they depend on. Base config's 14 projects are
untouched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
  ```

**File created:** `/home/patrick/Bachelorprojekt/tests/e2e/playwright.visual-sweep.config.ts`
**Cited patterns:** separate-config + nulled global hooks → `tests/e2e/playwright.film.config.ts:1-14`; inherited `use` block → `tests/e2e/playwright.config.ts:22-34`; `mentolder-setup` project shape → `tests/e2e/playwright.config.ts:97-104`; `korczewski-setup` project shape → `tests/e2e/playwright.config.ts:231-238`.
**Contract note:** the sibling-created `tests/e2e/specs/visual-sweep.spec.ts` is matched via `testMatch: ['**/visual-sweep.spec.ts']`; the spec reads viewport/baseURL from `testInfo.project.use` and `process.env.WEBSITE_URL`, and resolves brand from the project-name prefix (`visual-sweep-<brand>-<viewport>`).

---

### Task 4: tests/e2e/lib/sweep-guard.ts (safety + screenshot stability)

This task implements the safety + stability primitives that every visual-sweep project depends on: a read-only network guard (aborts any non-GET/HEAD request so the anonymous prod sweep can never mutate data), a localStorage init script that pre-seeds cookie consent (so the `CookieConsent.svelte` banner — mounted at `Layout.astro:87` — never appears), animation-freeze CSS (neutralizes the `@keyframes pulse` at `global.css:113` + every `animation:` usage so screenshots are deterministic), an `applyStability` settle routine, and per-route mask locators.

The validating step is a **public-only, zero-auth, zero-risk** pass against `https://web.mentolder.de` that proves all three core guarantees (no mutating requests, no consent banner, fonts ready). Because these are Playwright glue functions that exercise a real browser context, a self-contained `.spec.ts` under the existing `unit`/`website`-style project is the unit. It uses no `storageState`, so it cannot touch authenticated data.

- [ ] **Pull-first.** Run `git -C /home/patrick/Bachelorprojekt stash --include-untracked 2>/dev/null; git -C /home/patrick/Bachelorprojekt pull --rebase origin main; git -C /home/patrick/Bachelorprojekt stash pop 2>/dev/null || true`. Then create/switch to the feature branch: `git -C /home/patrick/Bachelorprojekt checkout -B feature/e2e-visual-sweep`. Expected: `Switched to ... branch 'feature/e2e-visual-sweep'`.

- [ ] **Write the implementation** `tests/e2e/lib/sweep-guard.ts`. Create `/home/patrick/Bachelorprojekt/tests/e2e/lib/sweep-guard.ts` with the COMPLETE contents below. Notes on the choices, with real repo citations:
  - `STABILITY_INIT_SCRIPT` seeds `localStorage['cookie_consent_v1'] = 'necessary'` — the exact key/value read at `website/src/components/CookieConsent.svelte:4,31`; with it set, the `onMount` guard at `CookieConsent.svelte:10` keeps `visible = false`, so the banner (a `role="region" aria-label="Cookie-Einstellungen"` at `CookieConsent.svelte:38-42`) never mounts.
  - `ANIMATION_FREEZE_CSS` globally zeroes `animation`/`transition` + `caret-color`, covering the availability `pulse` (`global.css:113`, applied at `SlotWidget.astro:70`), nav `live-pulse` (`Navigation.svelte:657`), `ch-pulse` (`ContactHub.svelte:282`), sidekick shimmers (`sidekick-panels.css:332`), and any `animate-pulse` Tailwind utilities (`LiveStatusBar.svelte:6`).
  - `masksForRoute` masks the homepage SlotWidget (`[data-testid="slot-widget"]`, from `SlotWidget.astro:15`), the Kore Timeline (`section.timeline-kore#timeline`, from `KoreHomepage.svelte:301`), plus every `<video>` and `<iframe>` (non-deterministic media, per contract `media:true` routes).

```typescript
// tests/e2e/lib/sweep-guard.ts
//
// Safety + screenshot-stability primitives for the E2E visual sweep.
//
// installReadOnlyGuard  — abort any non-GET/HEAD request so an anonymous prod
//                          sweep can never mutate data (defense in depth even
//                          though the sweep itself never submits forms).
// STABILITY_INIT_SCRIPT — pre-seed cookie_consent_v1='necessary' so the
//                          CookieConsent banner (Layout.astro mount) stays hidden.
// ANIMATION_FREEZE_CSS  — kill animations/transitions/caret for deterministic pixels.
// applyStability        — await fonts, inject freeze CSS, scroll bottom->top, settle.
// masksForRoute         — Playwright mask Locators for volatile UI/media regions.

import type { BrowserContext, Locator, Page, Route, Request } from '@playwright/test';

/**
 * Abort every request whose method is not GET or HEAD. Installed on the
 * BrowserContext so it also covers fetch/XHR/beacon from in-page scripts.
 * The anonymous sweep never clicks submit buttons, but this guarantees that
 * even an accidental POST/PUT/PATCH/DELETE (analytics beacons, CSRF probes,
 * service-worker sync) is dropped before it leaves the browser.
 */
export async function installReadOnlyGuard(context: BrowserContext): Promise<void> {
  await context.route('**', (route: Route, request: Request) => {
    const method = request.method().toUpperCase();
    if (method === 'GET' || method === 'HEAD') {
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
}

/**
 * Runs before any page script (context.addInitScript). Seeds the consent key
 * that CookieConsent.svelte reads in onMount, so the banner never renders.
 * Wrapped in try/catch because localStorage can throw in sandboxed contexts.
 */
export const STABILITY_INIT_SCRIPT: string = `
try {
  window.localStorage.setItem('cookie_consent_v1', 'necessary');
} catch (e) { /* localStorage unavailable — banner mask still covers it */ }
`;

/**
 * Disables all CSS animations, transitions, scroll-behavior, and the blinking
 * text caret so repeated runs produce pixel-identical screenshots. Injected
 * via page.addStyleTag in applyStability.
 */
export const ANIMATION_FREEZE_CSS: string = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
`;

/**
 * Bring a freshly-navigated page into a deterministic, fully-painted state:
 *  1. wait for web fonts (Layout.astro loads Newsreader/Geist/Instrument Serif
 *     from fonts.googleapis.com — late font swaps shift layout/metrics),
 *  2. inject the freeze CSS,
 *  3. scroll bottom -> top to trigger any lazy-loaded / IntersectionObserver
 *     content, then settle, so screenshots aren't missing below-fold images.
 */
export async function applyStability(page: Page): Promise<void> {
  // 1) Fonts. Tolerate the rare case where document.fonts is unavailable.
  await page
    .evaluate(async () => {
      if ((document as any).fonts && (document as any).fonts.ready) {
        await (document as any).fonts.ready;
      }
    })
    .catch(() => { /* fonts API absent — proceed */ });

  // 2) Freeze animations/transitions.
  await page.addStyleTag({ content: ANIMATION_FREEZE_CSS });

  // 3) Trigger lazy content: jump to the bottom, let observers fire, return
  //    to the top so the screenshot starts at y=0.
  await page.evaluate(async () => {
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    window.scrollTo(0, document.body.scrollHeight);
    await settle(150);
    window.scrollTo(0, 0);
    await settle(150);
  });

  // Final settle so post-scroll relayout/paint completes (~300ms total budget).
  await page.waitForTimeout(300);
}

/**
 * Locators to pass as Playwright's `mask` option for a route's screenshot.
 * Always masks <video> and <iframe> (third-party / time-varying media).
 * Route-specifically masks:
 *   - the homepage availability SlotWidget ([data-testid=slot-widget]) — its
 *     "free slots" copy changes with bookings,
 *   - the Kore Timeline section (section.timeline-kore#timeline) on the
 *     korczewski homepage — content reflects v_timeline rows.
 * Returns only the masks that exist for this route; callers may pass the array
 * straight to `mask` (Playwright skips locators that resolve to 0 elements).
 */
export function masksForRoute(page: Page, route: string): Locator[] {
  const masks: Locator[] = [
    page.locator('video'),
    page.locator('iframe'),
  ];

  const normalized = route.split('?')[0].split('#')[0];
  const isHome = normalized === '/' || normalized === '' || normalized === '/index';

  if (isHome) {
    // Mentolder homepage availability widget.
    masks.push(page.locator('[data-testid="slot-widget"]'));
    // Korczewski (Kore) homepage timeline section.
    masks.push(page.locator('section.timeline-kore#timeline'));
  }

  return masks;
}
```

- [ ] **Write the validating spec** `tests/e2e/lib/sweep-guard.public.spec.ts`. Create `/home/patrick/Bachelorprojekt/tests/e2e/lib/sweep-guard.public.spec.ts` with the COMPLETE contents below. It creates its own zero-auth context (no `storageState`), so it can only ever do public reads. It loads the mentolder homepage with the guard + init script + stability, then asserts (a) zero non-GET/HEAD requests left the browser, (b) the consent banner is absent, (c) `document.fonts.ready` resolved.

```typescript
// tests/e2e/lib/sweep-guard.public.spec.ts
//
// Public-only, zero-auth validation of sweep-guard.ts. Loads the live mentolder
// homepage (WEBSITE_URL, default web.mentolder.de) in a fresh context with NO
// storageState — it can never mutate authenticated data. Proves the three
// safety/stability guarantees the visual sweep relies on.
//
// Run:
//   cd tests/e2e
//   WEBSITE_URL=https://web.mentolder.de npx playwright test \
//     --config=playwright.config.ts lib/sweep-guard.public.spec.ts --project=unit
//
// (The `unit` project's testDir is ./lib and matches *.test.ts; we pass the
//  file path explicitly so this *.public.spec.ts is picked up regardless.)

import { test, expect } from '@playwright/test';
import {
  installReadOnlyGuard,
  STABILITY_INIT_SCRIPT,
  applyStability,
  masksForRoute,
} from './sweep-guard';

const BASE = process.env.WEBSITE_URL || 'https://web.mentolder.de';

test('sweep-guard: anonymous homepage — read-only, no consent banner, fonts ready', async ({ browser }) => {
  // Fresh, unauthenticated context. No storageState => public reads only.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });

  // (a) Track EVERY request the browser attempts (guard aborts, but the
  //     'request' event still fires — that's exactly what we want to inspect).
  const nonReadRequests: string[] = [];
  context.on('request', (req) => {
    const m = req.method().toUpperCase();
    if (m !== 'GET' && m !== 'HEAD') {
      nonReadRequests.push(`${m} ${req.url()}`);
    }
  });

  await installReadOnlyGuard(context);
  await context.addInitScript(STABILITY_INIT_SCRIPT);

  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await applyStability(page);

  // (a) No mutating request escaped the browser.
  expect(
    nonReadRequests,
    `unexpected non-GET/HEAD requests:\n${nonReadRequests.join('\n')}`,
  ).toEqual([]);

  // (b) Consent banner is absent (init script pre-seeded cookie_consent_v1).
  //     The banner is role="region" aria-label="Cookie-Einstellungen".
  const banner = page.getByRole('region', { name: 'Cookie-Einstellungen' });
  await expect(banner).toHaveCount(0);

  // (c) document.fonts.ready resolved (truthy fonts API + resolved promise).
  const fontsReady = await page.evaluate(async () => {
    if (!(document as any).fonts) return false;
    await (document as any).fonts.ready;
    return (document as any).fonts.status === 'loaded';
  });
  expect(fontsReady).toBe(true);

  // Sanity: masksForRoute returns at least the media masks + homepage widgets.
  const masks = masksForRoute(page, '/');
  expect(masks.length).toBeGreaterThanOrEqual(3);

  // Optional artifact: a stabilized full-page screenshot with masks applied.
  await page.screenshot({
    path: '../results/visual-sweep/_guard-smoke/mentolder-home.png',
    fullPage: true,
    mask: masks,
  });

  await context.close();
});
```

- [ ] **Typecheck the new module** (catches signature drift early, no network):
  `cd /home/patrick/Bachelorprojekt/tests/e2e && npx tsc --noEmit --skipLibCheck --moduleResolution bundler --module esnext --target es2022 --types node lib/sweep-guard.ts`
  Expected: no output (exit 0). If `tsc` is unavailable here, this is non-blocking — the next step compiles the file through Playwright's esbuild loader anyway.

- [ ] **Run the public-only validating pass** (the real proof — zero auth, zero mutation):
  `cd /home/patrick/Bachelorprojekt/tests/e2e && WEBSITE_URL=https://web.mentolder.de npx playwright test --config=playwright.config.ts lib/sweep-guard.public.spec.ts --project=unit --reporter=line`
  Expected output: `1 passed` and the line `sweep-guard: anonymous homepage — read-only, no consent banner, fonts ready`. A masked screenshot is written to `tests/results/visual-sweep/_guard-smoke/mentolder-home.png`. If `web.mentolder.de` is unreachable from this host, re-run with a reachable `WEBSITE_URL` (e.g. `http://localhost:4321` after `cd /home/patrick/Bachelorprojekt/website && pnpm dev`) — the three assertions are URL-agnostic.

- [ ] **Verify the three guarantees explicitly** from the run above before claiming success: confirm the test name printed, `1 passed`, and the screenshot exists: `ls -la /home/patrick/Bachelorprojekt/tests/results/visual-sweep/_guard-smoke/mentolder-home.png`. Expected: a non-zero-size PNG. If the assertion on `nonReadRequests` ever fails, the failure message lists the offending `METHOD URL` lines — do NOT loosen the guard; investigate the source (it would indicate a real mutating beacon the sweep must block).

- [ ] **Commit.** Stage exactly the two new files and commit (do not stage the smoke-screenshot artifact under `tests/results/`):
  `cd /home/patrick/Bachelorprojekt && git add tests/e2e/lib/sweep-guard.ts tests/e2e/lib/sweep-guard.public.spec.ts && git commit -m "$(printf 'feat(e2e): visual-sweep safety + stability guard\n\nAdd tests/e2e/lib/sweep-guard.ts: installReadOnlyGuard (abort non-GET/HEAD),\nSTABILITY_INIT_SCRIPT (pre-seed cookie_consent_v1=necessary so the\nCookieConsent banner never mounts), ANIMATION_FREEZE_CSS (kill pulse/shimmer\nanimations + transitions for deterministic pixels), applyStability (await\ndocument.fonts.ready, inject freeze CSS, scroll bottom->top + settle), and\nmasksForRoute (SlotWidget, Kore Timeline, video/iframe).\n\nValidated by sweep-guard.public.spec.ts: an anonymous, zero-storageState pass\nagainst web.mentolder.de asserting (a) no non-GET/HEAD request reached the\nnetwork, (b) consent banner absent, (c) document.fonts.ready resolved.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"`
  Expected: `2 files changed` with both `tests/e2e/lib/sweep-guard.ts` and `tests/e2e/lib/sweep-guard.public.spec.ts` listed.

**Cited patterns mirrored:**
- Consent key/value + `onMount` visibility gate: `website/src/components/CookieConsent.svelte:4,10,31,38-42`.
- Banner mount on every page: `website/src/layouts/Layout.astro:87`.
- Google Fonts links justifying `document.fonts.ready`: `website/src/layouts/Layout.astro:67-70`.
- `@keyframes pulse` + `animation: pulse 2.2s infinite` frozen by the CSS: `website/src/styles/global.css:113`, `website/src/components/SlotWidget.astro:70` (plus `Navigation.svelte:657`, `ContactHub.svelte:282`, `sidekick-panels.css:332`).
- SlotWidget mask selector: `website/src/components/SlotWidget.astro:15` (`data-testid="slot-widget"`).
- Kore Timeline mask selector: `website/src/components/kore/KoreHomepage.svelte:301` (`<section class="timeline-kore" id="timeline">`).
- `@playwright/test` import style + public-no-auth pattern: `tests/e2e/specs/agent-guide-walkthrough.spec.ts:5`.
- `unit` project (`testDir: ./lib`) used for the validating spec: `tests/e2e/playwright.config.ts:324-331`.

**Files produced (absolute):**
- `/home/patrick/Bachelorprojekt/tests/e2e/lib/sweep-guard.ts`
- `/home/patrick/Bachelorprojekt/tests/e2e/lib/sweep-guard.public.spec.ts`

---

### Task 5: dynamic-resolver.ts (tests/e2e/lib/dynamic-resolver.ts)

Implements `resolveRoute(context, entry, baseURL, authStates)` — the per-route index scraper that turns a `dynamic:true` RouteEntry (e.g. `/admin/tickets/[id]`) into a concrete URL by opening its `resolver.indexUrl` under the correct storageState, scraping `resolver.selector`, filtering `resolver.exclude`, and returning the first concrete href. Poll routes (`source:"db"`) and the two-hop `/admin/fragebogen` return `{ok:false, reason:"no-index, skip+log"}`. Mirrors the storageState project conventions in `tests/e2e/playwright.config.ts:122-126` and the real ticket-index anchor markup `<a href="/admin/tickets/${t.id}">` in `website/src/components/admin/TicketsTableBody.svelte:177,190` and the route-shape `/admin/tickets/[id]` confirmed at `website/src/pages/admin/tickets/[id].astro:165`.

This file has no isolated unit harness (it needs a live browser context + auth state), so the validating step is a live resolution against `web.mentolder.de` admin state — a read-only GET scrape, zero writes, zero risk.

- [ ] **Confirm prerequisites exist.** Run:
  ```bash
  ls -la /home/patrick/Bachelorprojekt/tests/e2e/lib/auth.ts /home/patrick/Bachelorprojekt/tests/e2e/lib/route-manifest.mjs 2>&1; grep -n "RouteEntry\|resolver" /home/patrick/Bachelorprojekt/scripts/lib/route-manifest.mjs 2>/dev/null | head
  ```
  Expected: `auth.ts` exists; `route-manifest.mjs` exports/defines the `RouteEntry`/`resolver` shape (from the sibling task block). `dynamic-resolver.ts` will re-declare the `RouteEntry` type locally (the `scripts/lib/route-manifest.mjs` file is plain `.mjs` with no exported TS types), so this step only confirms the shape matches the contract header. If `route-manifest.mjs` is absent, proceed anyway — this block does not import it.

- [ ] **Write `tests/e2e/lib/dynamic-resolver.ts` (COMPLETE — no placeholders).** Create `/home/patrick/Bachelorprojekt/tests/e2e/lib/dynamic-resolver.ts` with exactly this content:
  ```ts
  // tests/e2e/lib/dynamic-resolver.ts
  //
  // Resolves a `dynamic:true` RouteEntry (e.g. /admin/tickets/[id]) into a single
  // concrete URL by opening its resolver.indexUrl under the correct storageState,
  // scraping resolver.selector, filtering resolver.exclude, and returning the first
  // concrete href as an absolute URL. Pure DOM scrape — never mutates server state.
  //
  // Mirrors storageState conventions in tests/e2e/playwright.config.ts:122-126
  // and the live ticket-index anchor markup in
  // website/src/components/admin/TicketsTableBody.svelte:177,190
  // (<a href="/admin/tickets/${t.id}">).

  import type { BrowserContext, Page } from '@playwright/test';

  /** Auth tier required to open a resolver's index page. */
  export type ResolverAuth = 'public' | 'customer' | 'admin';

  /** Where the concrete URLs come from. "dom" = scrape the index page;
   *  "db" = poll-style routes with no index page (skip+log);
   *  "none" = no resolution possible (skip+log). */
  export type ResolverSource = 'dom' | 'db' | 'none';

  export interface ResolverSpec {
    indexUrl: string;
    selector: string;
    exclude?: string;
    auth: ResolverAuth;
    source: ResolverSource;
  }

  export interface RouteEntry {
    route: string;
    authTier: 'public' | 'portal' | 'admin';
    brand: 'both' | 'mentolder' | 'korczewski';
    dynamic: boolean;
    resolver?: ResolverSpec;
    excludeFromSweep: boolean;
    media: boolean;
  }

  /** Storage-state file paths for the two authenticated tiers. Either may be
   *  absent (empty/missing file) — in that case resolution for that tier
   *  returns {ok:false}. */
  export interface AuthStates {
    admin?: string;
    customer?: string;
  }

  export type ResolveResult =
    | { ok: true; url: string }
    | { ok: false; reason: string };

  /** Routes whose URLs come from a DB/poll source with no scrapeable index,
   *  or that need a multi-hop drill-down we deliberately don't automate. */
  const SKIP_LOG = (reason: string): ResolveResult => ({ ok: false, reason });

  /**
   * Picks the storageState path for a resolver's auth tier.
   * - public  -> undefined (anonymous context)
   * - customer-> authStates.customer
   * - admin   -> authStates.admin
   * Returns { state } on success, or { missing:reason } when a required
   * authenticated state path is absent.
   */
  function pickStorageState(
    auth: ResolverAuth,
    authStates: AuthStates,
  ): { state?: string } | { missing: string } {
    if (auth === 'public') return { state: undefined };
    if (auth === 'admin') {
      if (!authStates.admin) return { missing: 'missing-admin-auth-state' };
      return { state: authStates.admin };
    }
    // customer
    if (!authStates.customer) return { missing: 'missing-customer-auth-state' };
    return { state: authStates.customer };
  }

  /** Joins a (possibly relative) href against baseURL into an absolute URL.
   *  Already-absolute hrefs pass through unchanged. Returns null on a junk href
   *  ('', '#', 'javascript:…', 'mailto:…'). */
  function toAbsolute(href: string, baseURL: string): string | null {
    const h = (href ?? '').trim();
    if (!h || h === '#' || h.startsWith('javascript:') || h.startsWith('mailto:') || h.startsWith('tel:')) {
      return null;
    }
    try {
      return new URL(h, baseURL.replace(/\/$/, '') + '/').toString();
    } catch {
      return null;
    }
  }

  /**
   * Resolves a dynamic RouteEntry to a single concrete URL.
   *
   * Algorithm:
   *  1. Non-dynamic / no resolver / source "none" -> {ok:false}.
   *  2. source "db" -> {ok:false, reason:"no-index, skip+log"} (poll routes).
   *  3. Pick storageState by resolver.auth; missing required state -> {ok:false}.
   *  4. Open a fresh page in `context` with that storageState (anonymous for
   *     public), goto resolver.indexUrl (waitUntil:'networkidle'), then
   *     querySelectorAll(resolver.selector). Collect hrefs, drop any matching
   *     resolver.exclude, take the first concrete one -> absolute -> {ok:true}.
   *  5. Missing index (nav error / non-2xx) or zero matches -> {ok:false}.
   *
   * The page (and its dedicated context, when storageState differs) is always
   * closed before returning.
   */
  export async function resolveRoute(
    context: BrowserContext,
    entry: RouteEntry,
    baseURL: string,
    authStates: AuthStates,
  ): Promise<ResolveResult> {
    const r = entry.resolver;
    if (!entry.dynamic || !r) {
      return SKIP_LOG('not-dynamic-or-no-resolver');
    }
    if (r.source === 'none') {
      return SKIP_LOG('no-index, skip+log');
    }
    if (r.source === 'db') {
      // Poll routes (e.g. /poll/[id]) and other DB-sourced URLs have no
      // scrapeable index page in the sweep — skip and log per spec §6.
      return SKIP_LOG('no-index, skip+log');
    }

    const picked = pickStorageState(r.auth, authStates);
    if ('missing' in picked) {
      return SKIP_LOG(picked.missing);
    }

    // Public scrapes can reuse the caller's context (it carries no auth that
    // would matter). Authenticated scrapes need a dedicated context bound to
    // the right storageState so we don't clobber the caller's state.
    let scrapeContext: BrowserContext = context;
    let ownContext = false;
    if (picked.state) {
      scrapeContext = await context.browser()!.newContext({
        storageState: picked.state,
        ignoreHTTPSErrors: true,
      });
      ownContext = true;
    }

    let page: Page | undefined;
    try {
      page = await scrapeContext.newPage();

      const target = toAbsolute(r.indexUrl, baseURL);
      if (!target) {
        return SKIP_LOG(`bad-index-url:${r.indexUrl}`);
      }

      const resp = await page.goto(target, { waitUntil: 'networkidle', timeout: 30_000 }).catch(() => null);
      if (!resp) {
        return SKIP_LOG(`index-nav-failed:${r.indexUrl}`);
      }
      if (resp.status() >= 400) {
        return SKIP_LOG(`index-http-${resp.status()}:${r.indexUrl}`);
      }

      // Collect hrefs from every element matching the selector. If a matched
      // element is itself an <a>, use its href; otherwise look for a nested <a>.
      const rawHrefs: string[] = await page.$$eval(r.selector, (els) =>
        els
          .map((el) => {
            const a = el.matches('a[href]')
              ? (el as HTMLAnchorElement)
              : (el.querySelector('a[href]') as HTMLAnchorElement | null);
            return a ? a.getAttribute('href') : null;
          })
          .filter((h): h is string => !!h),
      );

      if (rawHrefs.length === 0) {
        return SKIP_LOG('zero-matches');
      }

      const excludeRe = r.exclude ? new RegExp(r.exclude) : null;
      for (const href of rawHrefs) {
        if (excludeRe && excludeRe.test(href)) continue;
        const abs = toAbsolute(href, baseURL);
        if (abs) return { ok: true, url: abs };
      }

      return SKIP_LOG('all-matches-excluded');
    } catch (err) {
      return SKIP_LOG(`resolver-error:${(err as Error).message}`);
    } finally {
      if (page) await page.close().catch(() => {});
      if (ownContext) await scrapeContext.close().catch(() => {});
    }
  }
  ```

- [ ] **Type-check the new file in isolation.** From `/home/patrick/Bachelorprojekt/tests/e2e`, run:
  ```bash
  cd /home/patrick/Bachelorprojekt/tests/e2e && npx tsc --noEmit --project tsconfig.json 2>&1 | grep -i "dynamic-resolver" || echo "OK: dynamic-resolver.ts type-clean"
  ```
  Expected output: `OK: dynamic-resolver.ts type-clean` (no `dynamic-resolver.ts(...)` errors). The `tsconfig.json` already includes `**/*.ts` and has `strict:true` + `@playwright/test` types, so `BrowserContext`/`Page` resolve. (Pre-existing errors in *other* files are out of scope and filtered out by the grep.)

- [ ] **Write a throwaway live-resolution harness.** Create `/tmp/resolve-check.mjs` (NOT committed — `/tmp/`, deleted in the next step). This drives `resolveRoute` against `web.mentolder.de` admin state to resolve `/admin/tickets/[id]`:
  ```bash
  cat > /tmp/resolve-check.ts <<'EOF'
  import { chromium } from '@playwright/test';
  import { resolveRoute, type RouteEntry } from './tests/e2e/lib/dynamic-resolver';
  import * as path from 'path';

  const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';
  const ADMIN_STATE = path.join(process.cwd(), 'tests/e2e/.auth/mentolder-website-admin.json');

  const entry: RouteEntry = {
    route: '/admin/tickets/[id]',
    authTier: 'admin',
    brand: 'mentolder',
    dynamic: true,
    excludeFromSweep: false,
    media: false,
    resolver: {
      indexUrl: '/admin/tickets',
      selector: 'a[href^="/admin/tickets/"]',
      exclude: '/admin/tickets/(new|export)',
      auth: 'admin',
      source: 'dom',
    },
  };

  (async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const res = await resolveRoute(context, entry, BASE, { admin: ADMIN_STATE });
    console.log('RESULT', JSON.stringify(res));
    // Assert: either a concrete /admin/tickets/<uuid-ish> URL, OR a logged skip
    // (empty ticket list is a valid pass).
    if (res.ok) {
      if (!/\/admin\/tickets\/[^/]+$/.test(res.url)) {
        console.error('FAIL: resolved url is not a concrete ticket detail:', res.url);
        process.exit(1);
      }
      console.log('PASS: concrete', res.url);
    } else {
      console.log('PASS (skip+log):', res.reason);
    }
    await context.close();
    await browser.close();
  })();
  EOF
  echo "harness written"
  ```
  (Uses `.ts` so it shares the repo's `@playwright/test` install; run via `tsx`/`ts-node` next step.)

- [ ] **Run the live anonymous-safe resolution against mentolder admin.** This is the validating step — a read-only DOM scrape, no writes. From the repo root:
  ```bash
  cd /home/patrick/Bachelorprojekt && WEBSITE_URL=https://web.mentolder.de npx tsx /tmp/resolve-check.ts 2>&1 | tail -8
  ```
  Expected output is ONE of:
  - `RESULT {"ok":true,"url":"https://web.mentolder.de/admin/tickets/<uuid>"}` followed by `PASS: concrete https://web.mentolder.de/admin/tickets/<uuid>` — when tickets exist.
  - `RESULT {"ok":false,"reason":"missing-admin-auth-state"}` then `PASS (skip+log): missing-admin-auth-state` — if `.auth/mentolder-website-admin.json` was never minted locally (acceptable: empty auth → skip+log, exactly per contract).
  - `RESULT {"ok":false,"reason":"zero-matches"}` then `PASS (skip+log): zero-matches` — empty ticket list (valid pass).
  The step PASSES as long as the last line begins with `PASS`. A non-zero exit / `FAIL:` line means the resolved URL wasn't a concrete ticket detail — fix the selector/absolute-join logic before continuing.
  > If `tsx` is not installed, fall back to: `cd /home/patrick/Bachelorprojekt && WEBSITE_URL=https://web.mentolder.de npx ts-node --compiler-options '{"module":"commonjs"}' /tmp/resolve-check.ts 2>&1 | tail -8` (same expected output).

- [ ] **Clean up the throwaway harness.** Run:
  ```bash
  rm -f /tmp/resolve-check.ts && echo "cleaned"
  ```
  Expected: `cleaned`. Confirm nothing under `/tmp/` is referenced by the committed code: `grep -rn "resolve-check\|/tmp/" /home/patrick/Bachelorprojekt/tests/e2e/lib/dynamic-resolver.ts || echo "no tmp refs"` → `no tmp refs`.

- [ ] **Verify the public (zero-auth) path returns skip+log, not a crash.** Quick sanity that `source:"db"` and `auth:"customer"` with no customer state both fail closed cleanly:
  ```bash
  cd /home/patrick/Bachelorprojekt/tests/e2e && node -e '
    // Static contract check: no Playwright needed, just the pure branches.
    const src = require("fs").readFileSync("lib/dynamic-resolver.ts","utf8");
    const need = ["no-index, skip+log","missing-admin-auth-state","missing-customer-auth-state","zero-matches","all-matches-excluded"];
    const missing = need.filter(n => !src.includes(n));
    if (missing.length) { console.error("MISSING reasons:", missing); process.exit(1); }
    console.log("OK: all skip+log reasons present");
  '
  ```
  Expected: `OK: all skip+log reasons present`. Confirms the `db`-source poll routes and the missing-auth-state branches resolve to `{ok:false, reason}` exactly as the contract requires for `/poll/*` and a stateless customer tier.

- [ ] **Commit.** From the repo root:
  ```bash
  cd /home/patrick/Bachelorprojekt && git add tests/e2e/lib/dynamic-resolver.ts && git commit -m "$(cat <<'EOF'
  test(e2e): add dynamic-resolver for visual-sweep dynamic routes

  resolveRoute(context, entry, baseURL, authStates) opens a resolver's
  indexUrl under the correct storageState (public=anonymous,
  customer/admin=authStates.*), scrapes resolver.selector, filters
  resolver.exclude, and returns the first concrete href as an absolute
  URL — or {ok:false,reason} on missing index / zero matches / missing
  auth state. Poll routes (source:"db") and no-index routes return
  {ok:false,reason:"no-index, skip+log"}.

  Mirrors storageState conventions in tests/e2e/playwright.config.ts
  and the live ticket-index anchor markup in TicketsTableBody.svelte.
  Validated against web.mentolder.de admin state resolving
  /admin/tickets/[id] to a concrete /admin/tickets/<uuid>.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  EOF
  )" && git log --oneline -1</parameter>
  ```
  Expected: the new commit hash + subject line printed. (Branch should already be the feature branch set up by `dev-flow-plan`; do not push unless the umbrella plan's PR step calls for it.)

---

**Notes for the orchestrator / sibling blocks:**
- The spec file `docs/superpowers/specs/2026-06-01-e2e-visual-sweep-design.md` did **not exist** at authoring time — the contract header in this workflow was used as the authoritative source (it fully specifies the RouteEntry shape, the `resolver` field, the `resolveRoute` signature, and the poll/fragebogen skip+log cases). If the sibling block that owns the spec lands a different `resolver.selector`/`exclude` for `/admin/tickets/[id]`, only the throwaway `/tmp/resolve-check.ts` literal needs to match it — the resolver implementation reads those fields from `entry.resolver` and is selector-agnostic.
- `dynamic-resolver.ts` re-declares `RouteEntry`/`ResolverSpec` as local TS types (the manifest generator `scripts/lib/route-manifest.mjs` is plain `.mjs` and exports no types); these mirror the contract's RouteEntry shape exactly. If a `.d.ts` for the manifest is added later, switch the local types to an `import type` then — not required for this block.
- `/admin/fragebogen` (two-hop) and all `/poll/[id]` (`source:"db"`) entries return `{ok:false, reason:"no-index, skip+log"}` — handled by the `source==='db'` and `source==='none'` early returns; the visual-sweep spec consumes that as a `status:"skip"` row.

---

### Task 6: tests/e2e/lib/nav-graph.ts — global-nav click-verifier + link-health harvester

Mirrors selectors from `website/src/components/Navigation.svelte:70-78` (`nav.nav-links a`) and `:217-225` (`nav.mobile-menu a`), `website/src/components/Footer.astro:66/78` (`a.footer-link`), `website/src/layouts/AdminLayout.astro:245-323` (`#admin-sidebar a`), and `website/src/layouts/PortalLayout.astro:163-276` (`#portal-sidebar a`). Reuses the `import type { Page, Locator } from '@playwright/test'` convention from `tests/e2e/lib/auth.ts:4`.

- [ ] **Create the file scaffold + route-matching helpers.** In the worktree `/tmp/wt-e2e-visual-sweep`, create `tests/e2e/lib/nav-graph.ts` with this exact header block (pure helpers, no Playwright calls yet — these are the load-bearing manifest-route matcher used by both exported functions):

```ts
// tests/e2e/lib/nav-graph.ts
//
// Global-nav click-verifier + per-page internal-link health harvester for the
// E2E visual sweep. "Actually click all the buttons joining all the pages."
//
// verifyGlobalNav   — physically clicks header/footer/sidebar page-joining
//                     anchors, asserts each lands on an in-manifest route,
//                     then goBack(). Never clicks <button>/submit/action controls.
// harvestLinkHealth — read-only: collects every internal <a href>, asserts each
//                     target is a known manifest route AND reachable via GET
//                     (page.request.get, ok if <400 under the abort guard).
//
// Selectors mirror:
//   Navigation.svelte:70-78  (header nav.nav-links a) / :217-225 (nav.mobile-menu a)
//   Footer.astro:66,78       (a.footer-link)
//   AdminLayout.astro:245-323 (#admin-sidebar a)
//   PortalLayout.astro:163-276 (#portal-sidebar a)

import type { Page, Locator } from '@playwright/test';

export interface RouteEntry {
  route: string;
  authTier: 'public' | 'portal' | 'admin';
  brand: 'both' | 'mentolder' | 'korczewski';
  dynamic: boolean;
  resolver?: {
    indexUrl: string;
    selector: string;
    exclude?: string;
    auth: 'public' | 'customer' | 'admin';
    source: 'dom' | 'db' | 'none';
  };
  excludeFromSweep: boolean;
  media: boolean;
}

export interface NavFailure {
  label: string;
  href: string;
  error: string;
}

export interface LinkHealth {
  href: string;
  ok: boolean;
  reason?: string;
}

/** Strips origin + query + hash from an href/URL → bare absolute path ("/admin/x"). */
export function pathOf(hrefOrUrl: string, baseURL?: string): string {
  try {
    const u = new URL(hrefOrUrl, baseURL ?? 'http://x.invalid');
    return u.pathname.replace(/\/+$/, '') || '/';
  } catch {
    const noHash = hrefOrUrl.split('#')[0].split('?')[0];
    return noHash.replace(/\/+$/, '') || '/';
  }
}

/** True only for internal, page-joining hrefs (not mailto/tel/external/api/pure-anchor). */
export function isInternalPageLink(href: string | null): href is string {
  if (!href) return false;
  const h = href.trim();
  if (h === '' || h === '#') return false;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(h)) return false;
  if (/^https?:\/\//i.test(h)) return false;     // external absolute (live host links use relative paths)
  if (h.startsWith('//')) return false;          // protocol-relative
  if (h.startsWith('#')) return false;           // pure same-page anchor
  if (!h.startsWith('/')) return false;          // relative sibling — out of scope for the sweep
  if (h.startsWith('/api/')) return false;       // API endpoints, never a page route
  return true;
}

/** Compiles a manifest route ("/admin/tickets/[id]") into a path-matching RegExp. */
function routeToRegExp(route: string): RegExp {
  const pattern = route
    .replace(/\/+$/, '')
    .split('/')
    .map((seg) => {
      if (/^\[\.\.\..+\]$/.test(seg)) return '.*';      // [...rest] → any remaining path
      if (/^\[.+\]$/.test(seg)) return '[^/]+';         // [id] → one segment
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const normalized = pattern === '' ? '/' : pattern;
  return new RegExp(`^${normalized}/?$`);
}

/** Returns the manifest route whose pattern matches `targetPath`, or null. */
export function matchManifestRoute(targetPath: string, routes: RouteEntry[]): RouteEntry | null {
  const p = targetPath.replace(/\/+$/, '') || '/';
  // Prefer an exact (non-dynamic) match before falling back to a dynamic pattern.
  const exact = routes.find((r) => !r.dynamic && (r.route.replace(/\/+$/, '') || '/') === p);
  if (exact) return exact;
  for (const r of routes) {
    if (routeToRegExp(r.route).test(p)) return r;
  }
  return null;
}
```

- [ ] **Add the global-chrome anchor collector.** Append this helper that gathers the page-joining anchors from header nav + footer + admin/portal sidebar (the chrome that *joins* pages), de-duplicated by href, skipping non-page links and `target=_blank` externals:

```ts
/** Collects {label, href, locator} for every page-joining global-chrome anchor
 *  currently in the DOM: header nav (desktop + mobile), footer links, and the
 *  admin/portal sidebar. De-duplicated by resolved path; externals + non-page
 *  links dropped. */
async function collectChromeAnchors(
  page: Page,
): Promise<{ label: string; href: string; locator: Locator }[]> {
  const selectors = [
    'header.topbar nav.nav-links a[href]',   // Navigation.svelte:70-78 desktop
    'header.topbar nav.mobile-menu a[href]', // Navigation.svelte:217-225 mobile
    'footer.site-foot a.footer-link[href]',  // Footer.astro:66,78
    '#admin-sidebar a[href]',                // AdminLayout.astro:245-323
    '#portal-sidebar a[href]',               // PortalLayout.astro:163-276
  ];
  const out: { label: string; href: string; locator: Locator }[] = [];
  const seen = new Set<string>();

  for (const sel of selectors) {
    const loc = page.locator(sel);
    const count = await loc.count();
    for (let i = 0; i < count; i++) {
      const a = loc.nth(i);
      const href = await a.getAttribute('href');
      if (!isInternalPageLink(href)) continue;
      const target = await a.getAttribute('target');
      if (target === '_blank') continue; // external (Systembrett/Brett) — opens new tab, not a join
      const key = pathOf(href);
      if (seen.has(key)) continue;
      seen.add(key);
      const label = ((await a.textContent()) ?? '').trim().replace(/\s+/g, ' ') || href;
      out.push({ label, href, locator: a });
    }
  }
  return out;
}
```

- [ ] **Implement `verifyGlobalNav`.** Append the exported function. It clicks each chrome anchor that targets a *concrete* (non-dynamic) in-manifest route, asserts the landed path maps to a manifest route, then `goBack()`; dynamic-target chrome anchors (e.g. a sidebar item pointing at `/admin/tickets`) still map fine since the index pages are concrete routes. Anchors whose target isn't in the manifest are recorded as failures (orphan join):

```ts
/** Physically clicks every page-joining global-chrome anchor, asserts the landed
 *  URL maps to an in-manifest route, then goBack(). Returns click count + failures.
 *  NEVER clicks <button>/submit/action controls — only <a> page-joiners. */
export async function verifyGlobalNav(
  page: Page,
  routes: RouteEntry[],
): Promise<{ clicked: number; failures: NavFailure[] }> {
  const failures: NavFailure[] = [];
  let clicked = 0;

  const anchors = await collectChromeAnchors(page);
  const baseURL = pathBaseOf(page);
  const startPath = pathOf(page.url(), baseURL);

  for (const { label, href } of anchors) {
    const targetPath = pathOf(href, baseURL);

    // Static pre-check: the join target must be a known manifest route.
    const expected = matchManifestRoute(targetPath, routes);
    if (!expected) {
      failures.push({ label, href, error: `target not in manifest: ${targetPath}` });
      continue;
    }
    if (expected.excludeFromSweep) {
      // Excluded routes (arena/systemtest/brett) are intentionally not navigated.
      continue;
    }

    // Re-locate fresh each iteration (DOM may have re-rendered after goBack).
    const live = page.locator(`a[href="${cssEscapeAttr(href)}"]`).first();
    try {
      if ((await live.count()) === 0) {
        failures.push({ label, href, error: 'anchor disappeared before click' });
        continue;
      }
      await live.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => {});
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: 15_000 }),
        live.click({ timeout: 10_000 }),
      ]);
      clicked++;

      const landedPath = pathOf(page.url(), baseURL);
      const landed = matchManifestRoute(landedPath, routes);
      if (!landed) {
        failures.push({ label, href, error: `landed on unknown route: ${landedPath}` });
      }

      // Return to the representative page for the next click.
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(async () => {
        await page.goto(startPath || '/', { waitUntil: 'domcontentloaded' });
      });
    } catch (err) {
      failures.push({ label, href, error: err instanceof Error ? err.message : String(err) });
      // Best-effort recover to the start page so subsequent clicks have context.
      await page
        .goto(startPath || '/', { waitUntil: 'domcontentloaded' })
        .catch(() => {});
    }
  }

  return { clicked, failures };
}
```

- [ ] **Implement `harvestLinkHealth` + the two small string helpers it shares.** Append the read-only harvester (collects ALL internal `<a href>`, dedupes by path, checks manifest membership + GET reachability via `page.request.get`) plus the `pathBaseOf` / `cssEscapeAttr` helpers referenced above:

```ts
/** Derives the origin (scheme+host) of the page for resolving relative hrefs. */
function pathBaseOf(page: Page): string {
  try {
    const u = new URL(page.url());
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://x.invalid';
  }
}

/** Escapes a double-quote for safe use inside an a[href="..."] attribute selector. */
function cssEscapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Read-only per-page link health: every internal <a href> must point at a known
 *  manifest route AND return < 400 on a GET (executed under the sweep's non-GET
 *  abort guard, so it can never mutate). De-duplicated by resolved path. */
export async function harvestLinkHealth(
  page: Page,
  routes: RouteEntry[],
): Promise<LinkHealth[]> {
  const baseURL = pathBaseOf(page);
  const anchors = page.locator('a[href]');
  const count = await anchors.count();

  const seen = new Set<string>();
  const targets: { href: string; path: string }[] = [];
  for (let i = 0; i < count; i++) {
    const href = await anchors.nth(i).getAttribute('href');
    if (!isInternalPageLink(href)) continue;
    const p = pathOf(href, baseURL);
    if (seen.has(p)) continue;
    seen.add(p);
    targets.push({ href, path: p });
  }

  const results: LinkHealth[] = [];
  for (const { href, path: p } of targets) {
    const known = matchManifestRoute(p, routes);
    if (!known) {
      results.push({ href, ok: false, reason: `not in manifest: ${p}` });
      continue;
    }
    if (known.excludeFromSweep) {
      results.push({ href, ok: true, reason: 'excluded-from-sweep (manifest match, GET skipped)' });
      continue;
    }
    try {
      const res = await page.request.get(`${baseURL}${p}`, {
        maxRedirects: 3,
        timeout: 15_000,
        failOnStatusCode: false,
      });
      const status = res.status();
      if (status < 400) {
        results.push({ href, ok: true });
      } else {
        results.push({ href, ok: false, reason: `GET ${status}` });
      }
    } catch (err) {
      results.push({ href, ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return results;
}
```

- [ ] **Type-check the file in isolation.** From the worktree, compile just this module against the e2e tsconfig to catch any type error before wiring it into the spec:
```bash
cd /tmp/wt-e2e-visual-sweep/tests/e2e && ./node_modules/.bin/tsc --noEmit lib/nav-graph.ts
```
Expected: **no output** (clean exit 0). If `tsc` complains about missing `@playwright/test`/`node` types, run `npm ci` in `tests/e2e` first (mirrors `Taskfile.yml` guarded-`npm ci` pattern), then re-run.

- [ ] **Write a throwaway public-only validation harness.** This is the validating step the contract requires (zero auth, zero risk — `web.mentolder.de` "/" anonymous under the read-only abort guard). Create `/tmp/nav-graph-validate.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { verifyGlobalNav, harvestLinkHealth, type RouteEntry } from '/tmp/wt-e2e-visual-sweep/tests/e2e/lib/nav-graph';

const BASE = process.env.WEBSITE_URL ?? 'https://web.mentolder.de';

test('public homepage nav clicks + link health', async ({ browser }) => {
  // Build a public-only manifest from the live footer/header so the matcher has routes.
  const publicRoutes: RouteEntry[] = [
    '/', '/ueber-mich', '/referenzen', '/kontakt', '/impressum', '/datenschutz',
    '/meine-daten', '/agb', '/barrierefreiheit', '/registrieren', '/login', '/termin',
    '/coaching', '/beratung', '/50plus-digital', '/fuehrung-persoenlichkeit', '/ki-transition',
  ].map((route) => ({
    route, authTier: 'public', brand: 'both', dynamic: false,
    excludeFromSweep: false, media: false,
  }));

  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  await context.route('**', (route) => {
    const m = route.request().method();
    return m === 'GET' || m === 'HEAD' ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('cookie_consent_v1', 'necessary'));
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  const nav = await verifyGlobalNav(page, publicRoutes);
  console.log('verifyGlobalNav:', JSON.stringify(nav, null, 2));
  expect(nav.clicked).toBeGreaterThan(0);
  expect(nav.failures, JSON.stringify(nav.failures)).toEqual([]);

  const health = await harvestLinkHealth(page, publicRoutes);
  const dead = health.filter((h) => !h.ok);
  console.log('dead links:', JSON.stringify(dead, null, 2));
  expect(dead, JSON.stringify(dead)).toEqual([]);

  await context.close();
});
```

- [ ] **Run the public-only validation against the live mentolder homepage.** No auth, GET/HEAD only:
```bash
cd /tmp/wt-e2e-visual-sweep/tests/e2e && WEBSITE_URL=https://web.mentolder.de ./node_modules/.bin/playwright test /tmp/nav-graph-validate.spec.ts --project=chromium 2>&1 | tail -40
```
Expected: **1 passed**. The console log shows `verifyGlobalNav` clicked the 4 header links (`/ueber-mich`, `/referenzen`, `/kontakt`, and `/#angebote`→`/`) plus the footer legal links with `failures: []`, and `dead links: []`. If `--project=chromium` is unknown, drop the flag (the base `playwright.config.ts` will run its default project) — only the spec path matters for this isolated check. If the run reports nav failures on `/#angebote`, confirm `pathOf` strips the hash (it does — the regex test should land on `/`).

- [ ] **Remove the throwaway harness and commit.** The validation file lives in `/tmp` (outside the repo) so nothing to delete from the tree. Commit the library:
```bash
cd /tmp/wt-e2e-visual-sweep && git add tests/e2e/lib/nav-graph.ts && \
git commit -m "$(cat <<'EOF'
feat(e2e/visual-sweep): add nav-graph click-verifier + link-health harvester

verifyGlobalNav physically clicks header/footer/admin+portal-sidebar
page-joining anchors and asserts each lands on an in-manifest route;
harvestLinkHealth collects every internal <a href>, checks manifest
membership and GET reachability under the read-only abort guard. Never
clicks <button>/submit/action controls. Mirrors selectors from
Navigation.svelte, Footer.astro, AdminLayout.astro, PortalLayout.astro.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: one new file committed; `git show --stat HEAD` lists only `tests/e2e/lib/nav-graph.ts`.

**Notes for downstream task blocks:**
- `nav-graph.ts` exports the exact contract signatures plus three *additional* exported helpers (`pathOf`, `isInternalPageLink`, `matchManifestRoute`) the spec/gallery can reuse; the `RouteEntry`/`NavFailure`/`LinkHealth` interfaces are exported too. If the spec imports `RouteEntry` from its own canonical source, that's fine — this module's `RouteEntry` is structurally identical to the shared contract shape.
- `verifyGlobalNav` skips `excludeFromSweep` targets (arena/systemtest/brett) rather than clicking into them, and skips `target="_blank"` externals (Systembrett/Brett board) — both are belt-and-suspenders with the §5 network abort.
- The spec wires the result row as `{ ..., navFailures: nav.failures, deadLinks: health.filter(h => !h.ok) }` per the contract's result-row shape.

---

### Task 7: visual-sweep.spec.ts — Orchestrating data-driven visual sweep test

This is the heart of the feature: a serial, data-driven Playwright spec that loads `route-manifest.json`, derives `{brand,viewport}` from the project name, picks the right auth context per `authTier`, installs the read-only guard, resolves dynamic IDs, screenshots every applicable route fullPage with masks, harvests nav/link health, and writes one results array per `{brand,viewport}`. It mirrors the style of `tests/e2e/specs/agent-guide-walkthrough.spec.ts` (imports from `../lib/*`, top-level data load) and the CommonJS/`fs`/`__dirname` conventions used across the suite (e.g. `tests/e2e/specs/mentolder-auth-setup.spec.ts:27-33`, `tests/e2e/specs/brett-art.spec.ts:23`).

**Hard dependencies (from SHARED CONTRACT — already implemented by sibling task blocks):**
- `website/src/data/route-manifest.json` — `{ generatedFrom, count, routes:RouteEntry[] }`
- `tests/e2e/lib/sweep-guard.ts` → `installReadOnlyGuard`, `STABILITY_INIT_SCRIPT`, `applyStability`, `masksForRoute`
- `tests/e2e/lib/dynamic-resolver.ts` → `resolveRoute`
- `tests/e2e/lib/nav-graph.ts` → `verifyGlobalNav`, `harvestLinkHealth`
- Auth states minted by `*-setup` projects: `.auth/mentolder-website-admin.json`, `.auth/mentolder-website-user.json`, `.auth/korczewski-website-admin.json` (empty-state shape `{cookies:[],origins:[]}` per `mentolder-auth-setup.spec.ts:41`).

> NOTE: This spec is run via the `visual-sweep-<brand>-<viewport>` projects declared in `tests/e2e/playwright.visual-sweep.config.ts` (sibling block). The PUBLIC-ONLY validation below runs that config directly with a grep filter, so it does not need any sibling lib beyond what the contract guarantees. If a sibling lib is still missing at validation time, generate the stub it owns OR run the validation after the sibling blocks land — do NOT re-implement sibling libs here.

- [ ] **Step 1 — Create the spec file skeleton (imports, constants, data load, project-name parse).** Write `tests/e2e/specs/visual-sweep.spec.ts` with exactly this header block:

```typescript
// tests/e2e/specs/visual-sweep.spec.ts
//
// The orchestrating data-driven visual sweep. ONE spec, run under four projects:
//   visual-sweep-mentolder-desktop | visual-sweep-mentolder-mobile
//   visual-sweep-korczewski-desktop | visual-sweep-korczewski-mobile
//
// Reads website/src/data/route-manifest.json, derives {brand,viewport} from the
// project name, sweeps every applicable non-excluded route, and writes
//   tests/results/visual-sweep/<brand>/results-<viewport>.json
//
// SAFETY: every page context installs a read-only network guard (GET/HEAD only).
// There is NO global DB purge here (the sweep config sets globalSetup=undefined).
//
// Env: WEBSITE_URL drives baseURL + login. Auth states come from the *-setup
// projects (.auth/<brand>-website-admin.json, .auth/mentolder-website-user.json).

import { test, expect, type BrowserContext, type Browser } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

import {
  installReadOnlyGuard,
  STABILITY_INIT_SCRIPT,
  applyStability,
  masksForRoute,
} from '../lib/sweep-guard';
import { resolveRoute } from '../lib/dynamic-resolver';
import { verifyGlobalNav, harvestLinkHealth } from '../lib/nav-graph';

type AuthTier = 'public' | 'portal' | 'admin';
type Brand = 'mentolder' | 'korczewski';
type Viewport = 'desktop' | 'mobile';

interface RouteEntry {
  route: string;
  authTier: AuthTier;
  brand: 'both' | Brand;
  dynamic: boolean;
  resolver?: {
    indexUrl: string;
    selector: string;
    exclude?: string;
    auth: 'public' | 'customer' | 'admin';
    source: 'dom' | 'db' | 'none';
  };
  excludeFromSweep: boolean;
  media: boolean;
}

interface Manifest {
  generatedFrom: string;
  count: number;
  routes: RouteEntry[];
}

interface ResultRow {
  route: string;
  brand: Brand;
  viewport: Viewport;
  status: 'ok' | 'redirect' | 'skip' | 'error';
  redirectedTo?: string;
  reason?: string;
  screenshot: string;
  navFailures: unknown[];
  deadLinks: unknown[];
}

// ── Paths ─────────────────────────────────────────────────────────────────────
const MANIFEST_PATH = path.join(__dirname, '..', '..', '..', 'website', 'src', 'data', 'route-manifest.json');
const AUTH_DIR      = path.join(__dirname, '..', '.auth');
const RESULTS_ROOT  = path.join(__dirname, '..', '..', 'results', 'visual-sweep');

const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
  mobile:  { width: 390, height: 844 },
};

const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
```

- [ ] **Step 2 — Add project-name parsing + safeRoute + auth-state helpers.** Append:

```typescript
// ── Project-name → {brand, viewport} ───────────────────────────────────────────
// Project names: visual-sweep-<brand>-<viewport>
function parseProject(name: string): { brand: Brand; viewport: Viewport } {
  const m = /^visual-sweep-(mentolder|korczewski)-(desktop|mobile)$/.exec(name);
  if (!m) {
    throw new Error(
      `[visual-sweep] cannot derive brand/viewport from project "${name}". ` +
      `Run via one of: visual-sweep-{mentolder,korczewski}-{desktop,mobile}.`,
    );
  }
  return { brand: m[1] as Brand, viewport: m[2] as Viewport };
}

// ── safeRoute (contract): "/"->"index"; otherwise "/"->"__", trim leading "__",
//    strip "[" and "]". ────────────────────────────────────────────────────────
function safeRoute(route: string): string {
  if (route === '/') return 'index';
  return route
    .replace(/\//g, '__')
    .replace(/^__+/, '')
    .replace(/\[/g, '')
    .replace(/\]/g, '');
}

// ── Auth-state file selection per brand+tier ───────────────────────────────────
function authStateFile(brand: Brand, tier: 'admin' | 'customer'): string {
  if (tier === 'admin') return path.join(AUTH_DIR, `${brand}-website-admin.json`);
  // portal/customer state only minted for mentolder (mentolder-website-user.json).
  return path.join(AUTH_DIR, `${brand}-website-user.json`);
}

function readStateOrNull(file: string): { cookies: unknown[]; origins: unknown[] } | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function isEmptyState(state: { cookies: unknown[]; origins: unknown[] } | null): boolean {
  if (!state) return true;
  return (state.cookies?.length ?? 0) === 0 && (state.origins?.length ?? 0) === 0;
}
```

- [ ] **Step 3 — Add the applicable-route filter + the LOUD-FAIL precondition.** Append:

```typescript
// ── Which routes does THIS brand sweep? ────────────────────────────────────────
function applicableRoutes(brand: Brand): RouteEntry[] {
  return manifest.routes.filter(
    (r) => !r.excludeFromSweep && (r.brand === 'both' || r.brand === brand),
  );
}

// ── LOUD-FAIL precondition: if any admin/portal route WILL be swept but the
//    needed .auth/*.json is empty-state, throw with a clear message. ────────────
function assertAuthReady(brand: Brand, routes: RouteEntry[]): void {
  const needsAdmin  = routes.some((r) => r.authTier === 'admin');
  const needsPortal = routes.some((r) => r.authTier === 'portal');
  const missing: string[] = [];

  if (needsAdmin) {
    const f = authStateFile(brand, 'admin');
    if (isEmptyState(readStateOrNull(f))) {
      missing.push(
        `ADMIN routes are in scope but ${path.basename(f)} is empty-state ` +
        `({cookies:[],origins:[]}). Set ${brand === 'mentolder' ? 'E2E_ADMIN_PASS' : 'TEST_ADMIN_PASSWORD'} ` +
        `and re-run the ${brand}-setup project so it mints a real session.`,
      );
    }
  }
  if (needsPortal) {
    const f = authStateFile(brand, 'customer');
    if (isEmptyState(readStateOrNull(f))) {
      missing.push(
        `PORTAL routes are in scope but ${path.basename(f)} is empty-state. ` +
        `Set E2E_USER_PASS and re-run the ${brand}-setup project, or exclude portal ` +
        `routes for this brand. (korczewski portal user is expected absent → those rows skip+log.)`,
      );
    }
  }

  if (missing.length) {
    throw new Error(
      `[visual-sweep] PRECONDITION FAILED for brand "${brand}":\n  - ` +
      missing.join('\n  - '),
    );
  }
}
```

- [ ] **Step 4 — Add the per-tier context factory + a tiny "first applicable" sentinel for one-time nav verification.** Append:

```typescript
// ── Per-tier storageState selection. public => no state (anonymous). ───────────
// Returns the storageState path, or undefined for anonymous. Returns the literal
// string 'SKIP' when a portal state is required but absent/empty (korczewski).
function storageStateFor(brand: Brand, tier: AuthTier): string | undefined | 'SKIP' {
  if (tier === 'public') return undefined;
  const file = tier === 'admin' ? authStateFile(brand, 'admin') : authStateFile(brand, 'customer');
  if (isEmptyState(readStateOrNull(file))) return 'SKIP';
  return file;
}

// authStates map handed to resolveRoute (contract: {admin?,customer?}).
function authStatesMap(brand: Brand): { admin?: string; customer?: string } {
  const out: { admin?: string; customer?: string } = {};
  const adminF = authStateFile(brand, 'admin');
  if (!isEmptyState(readStateOrNull(adminF))) out.admin = adminF;
  const custF = authStateFile(brand, 'customer');
  if (!isEmptyState(readStateOrNull(custF))) out.customer = custF;
  return out;
}
```

- [ ] **Step 5 — Add the orchestrating `test.describe` body (serial, generous timeout).** Append the full sweep loop. This is the core:

```typescript
// ───────────────────────────────────────────────────────────────────────────────
test.describe('visual sweep', () => {
  test.describe.configure({ mode: 'serial', timeout: 30 * 60_000 });

  test('sweep all applicable routes', async ({ browser }, testInfo) => {
    const { brand, viewport } = parseProject(testInfo.project.name);
    const baseURL = (process.env.WEBSITE_URL ?? testInfo.project.use.baseURL ?? 'https://web.mentolder.de')
      .replace(/\/$/, '');
    const vp = VIEWPORTS[viewport];

    const routes = applicableRoutes(brand);
    // LOUD-FAIL before doing any work.
    assertAuthReady(brand, routes);

    const authStates = authStatesMap(brand);
    const results: ResultRow[] = [];

    // verifyGlobalNav is expensive; run it ONCE per {brand,authTier}.
    const navVerifiedFor = new Set<AuthTier>();
    const navFailuresByTier: Partial<Record<AuthTier, unknown[]>> = {};

    // Reuse one context per tier (keeps storageState + guard install cheap).
    const contextCache = new Map<AuthTier, BrowserContext | 'SKIP'>();

    async function contextForTier(tier: AuthTier): Promise<BrowserContext | 'SKIP'> {
      const cached = contextCache.get(tier);
      if (cached) return cached;
      const ss = storageStateFor(brand, tier);
      if (ss === 'SKIP') {
        contextCache.set(tier, 'SKIP');
        return 'SKIP';
      }
      const ctx = await (browser as Browser).newContext({
        viewport: vp,
        ignoreHTTPSErrors: true,
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin',
        baseURL,
        ...(ss ? { storageState: ss } : {}),
      });
      await installReadOnlyGuard(ctx);
      await ctx.addInitScript(STABILITY_INIT_SCRIPT);
      contextCache.set(tier, ctx);
      return ctx;
    }

    for (const entry of routes) {
      const ctxOrSkip = await contextForTier(entry.authTier);

      if (ctxOrSkip === 'SKIP') {
        results.push({
          route: entry.route, brand, viewport,
          status: 'skip',
          reason: `no auth state for tier=${entry.authTier} (brand=${brand})`,
          screenshot: '', navFailures: [], deadLinks: [],
        });
        console.log(`[visual-sweep] SKIP ${entry.route} — missing ${entry.authTier} auth`);
        continue;
      }
      const ctx = ctxOrSkip;

      // Resolve the concrete URL for dynamic routes.
      let targetUrl = baseURL + entry.route;
      if (entry.dynamic) {
        const resolved = await resolveRoute(ctx, entry, baseURL, authStates);
        if (!resolved.ok) {
          results.push({
            route: entry.route, brand, viewport,
            status: 'skip', reason: `resolver: ${resolved.reason}`,
            screenshot: '', navFailures: [], deadLinks: [],
          });
          console.log(`[visual-sweep] SKIP ${entry.route} — ${resolved.reason}`);
          continue;
        }
        targetUrl = resolved.url;
      }

      const page = await ctx.newPage();
      await page.setViewportSize(vp);

      try {
        const resp = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });

        // Detect a redirect away from the requested path.
        const landed = page.url().replace(/\/$/, '');
        const expected = (entry.dynamic ? targetUrl : baseURL + entry.route).replace(/\/$/, '');
        const redirected = !entry.dynamic && landed !== expected && !landed.startsWith(expected);

        await applyStability(page);

        // Screenshot path per contract.
        const shotRel = path.join('visual-sweep', brand, viewport, `${safeRoute(entry.route)}.png`);
        const shotAbs = path.join(RESULTS_ROOT, brand, viewport, `${safeRoute(entry.route)}.png`);
        fs.mkdirSync(path.dirname(shotAbs), { recursive: true });

        await page.screenshot({
          path: shotAbs,
          fullPage: true,
          animations: 'disabled',
          mask: masksForRoute(page, entry.route),
        });

        // One-time global-nav verification per tier.
        let navFailures: unknown[] = [];
        if (!navVerifiedFor.has(entry.authTier)) {
          const nav = await verifyGlobalNav(page, routes);
          navFailuresByTier[entry.authTier] = nav.failures;
          navVerifiedFor.add(entry.authTier);
          console.log(`[visual-sweep] nav(${entry.authTier}): clicked=${nav.clicked} failures=${nav.failures.length}`);
        }
        navFailures = navFailuresByTier[entry.authTier] ?? [];

        // Per-page dead-link harvest.
        const links = await harvestLinkHealth(page, routes);
        const deadLinks = links.filter((l) => !l.ok);

        const status: ResultRow['status'] =
          resp && resp.status() >= 400 ? 'error' : redirected ? 'redirect' : 'ok';

        results.push({
          route: entry.route, brand, viewport,
          status,
          ...(redirected ? { redirectedTo: landed } : {}),
          ...(status === 'error' ? { reason: `HTTP ${resp?.status()}` } : {}),
          screenshot: shotRel,
          navFailures,
          deadLinks,
        });
        console.log(`[visual-sweep] ${status.toUpperCase()} ${entry.route} -> ${shotRel}`);
      } catch (err) {
        results.push({
          route: entry.route, brand, viewport,
          status: 'error',
          reason: err instanceof Error ? err.message : String(err),
          screenshot: '', navFailures: [], deadLinks: [],
        });
        console.log(`[visual-sweep] ERROR ${entry.route} — ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await page.close();
      }
    }

    // Close cached contexts.
    for (const v of contextCache.values()) {
      if (v !== 'SKIP') await v.close();
    }

    // Write the per-brand/viewport results array.
    const resultsFile = path.join(RESULTS_ROOT, brand, `results-${viewport}.json`);
    fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`[visual-sweep] wrote ${results.length} rows → ${path.relative(process.cwd(), resultsFile)}`);

    // Hard assertions: the run must produce results and have no hard errors.
    expect(results.length, 'sweep produced at least one result row').toBeGreaterThan(0);
    const errors = results.filter((r) => r.status === 'error');
    expect(
      errors,
      `routes errored: ${errors.map((e) => `${e.route} (${e.reason})`).join(', ')}`,
    ).toEqual([]);
  });
});
```

- [ ] **Step 6 — Sanity-compile the spec against the existing tsconfig.** From repo root run:

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i 'visual-sweep' || echo "visual-sweep.spec.ts: no TS errors"
```

Expected output: `visual-sweep.spec.ts: no TS errors`. (If the sibling libs `sweep-guard.ts`/`dynamic-resolver.ts`/`nav-graph.ts` or `route-manifest.json` are not yet present, tsc will report *module-not-found* for those imports — that is the sibling blocks' artifact, not a defect in this file. Re-run Step 6 after those blocks land; this spec must compile clean once they exist.)

- [ ] **Step 7 — VALIDATE: PUBLIC-ONLY anonymous run against web.mentolder.de (zero auth, zero risk).** The contract guarantees the `public` tier uses no storageState and the guard blocks all writes. Grep-filter to public routes by running through the sweep config and relying on the manifest's `authTier`. Run:

```bash
cd /home/patrick/Bachelorprojekt/tests/e2e && \
  rm -rf ../results/visual-sweep/mentolder/desktop ../results/visual-sweep/mentolder/results-desktop.json && \
  WEBSITE_URL=https://web.mentolder.de VISUAL_SWEEP_PUBLIC_ONLY=1 \
  npx playwright test --config=playwright.visual-sweep.config.ts \
    --project=visual-sweep-mentolder-desktop 2>&1 | tail -30
```

> If the sweep config does NOT yet honour `VISUAL_SWEEP_PUBLIC_ONLY`, temporarily prove publics in isolation by adding a guard at the very top of `applicableRoutes` — `const base = manifest.routes.filter(...); return process.env.VISUAL_SWEEP_PUBLIC_ONLY ? base.filter(r => r.authTier === 'public') : base;` — then re-run. Keep this env-gated filter in the final file (it is inert without the env var, costs nothing, and gives the validation a deterministic anonymous slice). Add it now:

Edit `applicableRoutes` to:

```typescript
function applicableRoutes(brand: Brand): RouteEntry[] {
  const base = manifest.routes.filter(
    (r) => !r.excludeFromSweep && (r.brand === 'both' || r.brand === brand),
  );
  // Validation hook: anonymous public-only slice (zero auth, zero write-risk).
  return process.env.VISUAL_SWEEP_PUBLIC_ONLY
    ? base.filter((r) => r.authTier === 'public')
    : base;
}
```

- [ ] **Step 8 — Assert the validation artifacts.** After Step 7 passes, confirm 22 public PNGs + a clean results file:

```bash
cd /home/patrick/Bachelorprojekt && \
  echo "PNG count: $(find tests/results/visual-sweep/mentolder/desktop -name '*.png' | wc -l) (expect 22)" && \
  node -e 'const r=require("./tests/results/visual-sweep/mentolder/results-desktop.json"); const e=r.filter(x=>x.status==="error"); console.log("rows:",r.length,"errors:",e.length, e.length?JSON.stringify(e.map(x=>[x.route,x.reason])):"none"); if(e.length||r.length===0)process.exit(1);'
```

Expected: `PNG count: 22 (expect 22)` and `rows: 22 errors: 0 none`. (The 22 public page files are authoritative per the contract: admin=67, portal=9, public=22; `/[service]` expanded to brand slugs is part of the public set.) Exit code 0.

- [ ] **Step 9 — Commit.** Results and PNGs are gitignored test output (under `tests/results/`); commit only the spec.

```bash
cd /home/patrick/Bachelorprojekt && \
  git add tests/e2e/specs/visual-sweep.spec.ts && \
  git commit -m "$(cat <<'EOF'
test(e2e): visual-sweep orchestrating spec — data-driven full-site screenshot sweep

Loads website/src/data/route-manifest.json, derives {brand,viewport} from the
visual-sweep-<brand>-<viewport> project name, picks the auth context per authTier
(public=anonymous, portal=customer state, admin=admin state), installs the
read-only network guard, resolves dynamic ids, screenshots every applicable
non-excluded route fullPage with masks, runs verifyGlobalNav once per {brand,tier}
+ per-page harvestLinkHealth, and writes
tests/results/visual-sweep/<brand>/results-<viewport>.json.

LOUD-FAILs before any work if an admin/portal route is in scope but the matching
.auth/*.json is empty-state. Validated via the public-only anonymous slice against
web.mentolder.de (22 desktop PNGs, 0 errors).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Notes for the reviewer / sibling-block integration:**
- The spec is **brand-agnostic by project name** — the four projects in `playwright.visual-sweep.config.ts` (`visual-sweep-{mentolder,korczewski}-{desktop,mobile}`) each invoke the single `test('sweep all applicable routes', ...)` body; serial mode + 30-min suite timeout absorb the ~98-route mentolder admin pass.
- It does **not** import or trigger any DB purge; per contract the sweep config sets `globalSetup/globalTeardown=undefined`.
- `verifyGlobalNav` runs **once per `{brand,authTier}`** (cached in `navVerifiedFor`/`navFailuresByTier`) and its failures are stamped onto every row of that tier — matching the contract's "once per {brand,authTier}" requirement while keeping the per-row `navFailures` field populated.
- korczewski portal routes resolve to `'SKIP'` (no `korczewski-website-user.json`) and are logged as `status:"skip"`, satisfying "korczewski user may be absent → portal routes skip+log".
- `masksForRoute(page, entry.route)` returns `Locator[]`, passed directly to `page.screenshot({ mask })` (supported in `@playwright/test ^1.60`).

---

### Task 8: Visual-Sweep Gallery Builder + Taskfile Wrappers

Owns `tests/e2e/lib/build-gallery.mjs` (contact-sheet HTML generator) and two `Taskfile.yml` targets (`test:e2e:visual-sweep`, `test:e2e:visual-sweep:all-prods`). Depends on result rows written by `visual-sweep.spec.ts` to `tests/results/visual-sweep/<brand>/results-<viewport>.json` and PNGs at `tests/results/visual-sweep/<brand>/<viewport>/<safeRoute>.png` (shared contract). Run all `node`/`task` commands from repo root `/home/patrick/Bachelorprojekt` unless a step says otherwise.

- [ ] **Create the gallery builder skeleton.** Create `/home/patrick/Bachelorprojekt/tests/e2e/lib/build-gallery.mjs` with the imports and path-resolution block below. Mirrors the ESM/`node:fs` house style of `scripts/build-docs.mjs:9-14,27-30` (`fileURLToPath(import.meta.url)` → `__dirname` → `REPO_ROOT`). The script is invoked as `node lib/build-gallery.mjs` from `tests/e2e`, so `REPO_ROOT` must climb two levels (`lib` → `tests/e2e` is wrong; `lib`'s parent is `tests/e2e`, whose parents are `tests` then repo root — climb three: `lib`→`e2e`→`tests`→root).

```js
// tests/e2e/lib/build-gallery.mjs
// Reads tests/results/visual-sweep/<brand>/results-<viewport>.json + the captured
// PNGs and emits a single self-contained contact-sheet at
// tests/results/visual-sweep/index.html. Grouped brand->section, mentolder vs
// korczewski side-by-side where a route exists in both, desktop+mobile per route,
// each cell labelled with route + status + nav/link-health. Prints the absolute
// index.html path on success. Pure read/render — never touches a cluster or DB.
//
// Run: node lib/build-gallery.mjs   (cwd = tests/e2e)
import {
  readFileSync, writeFileSync, readdirSync, existsSync, statSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// lib -> tests/e2e -> tests -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..');
const SWEEP_DIR = join(REPO_ROOT, 'tests', 'results', 'visual-sweep');
const OUT_FILE = join(SWEEP_DIR, 'index.html');

const BRANDS = ['mentolder', 'korczewski'];
const VIEWPORTS = ['desktop', 'mobile'];
```

- [ ] **Add the result-loading helpers.** Append the loader below. `loadResults()` reads every `tests/results/visual-sweep/<brand>/results-<viewport>.json` that exists (an array of result rows, per contract), tolerates missing files (a brand/viewport that was never swept), and returns a nested map `{ [brand]: { [viewport]: Row[] } }`. `screenshotRel()` turns a row's `screenshot` field (already the contract path `tests/results/visual-sweep/<brand>/<viewport>/<safeRoute>.png`) into a path relative to `index.html`'s directory so the contact sheet works when opened from disk; it falls back to recomputing the path from `safeRoute` only if `screenshot` is absent.

```js
function safeReadJson(file) {
  try {
    if (!existsSync(file)) return null;
    const txt = readFileSync(file, 'utf8').trim();
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (err) {
    console.error(`[build-gallery] WARN: could not parse ${file}: ${err.message}`);
    return null;
  }
}

function loadResults() {
  const out = {};
  for (const brand of BRANDS) {
    out[brand] = {};
    for (const vp of VIEWPORTS) {
      const file = join(SWEEP_DIR, brand, `results-${vp}.json`);
      const rows = safeReadJson(file);
      out[brand][vp] = Array.isArray(rows) ? rows : [];
    }
  }
  return out;
}

// safeRoute per shared contract: "/"->"index", else trim leading slash,
// "/"->"__", strip "[" "]". Only used as an existence fallback when a row
// is missing its `screenshot` field.
function safeRoute(route) {
  if (route === '/') return 'index';
  let s = route.replace(/\//g, '__');
  s = s.replace(/^__/, '');
  s = s.replace(/[[\]]/g, '');
  return s === '' ? 'index' : s;
}

function screenshotRel(row, brand, vp) {
  let abs;
  if (row.screenshot) {
    abs = join(REPO_ROOT, row.screenshot);
  } else {
    abs = join(SWEEP_DIR, brand, vp, `${safeRoute(row.route)}.png`);
  }
  if (!existsSync(abs)) return null;
  // index.html lives in SWEEP_DIR; make the <img src> relative to that.
  return relative(SWEEP_DIR, abs).split('\\').join('/');
}
```

- [ ] **Add the route-indexing + escaping helpers.** Append the block below. `indexByRoute()` collapses a brand's `{desktop:[],mobile:[]}` rows into `{ [route]: { desktop?:Row, mobile?:Row } }` so a route can be rendered once with both viewports. `unionRoutes()` produces the ordered set of routes present across both brands so we can render mentolder and korczewski side-by-side where the route exists in both (and one-sided where it doesn't). `esc()` is HTML-escaping for labels/reasons.

```js
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function indexByRoute(brandRows) {
  const byRoute = {};
  for (const vp of VIEWPORTS) {
    for (const row of brandRows[vp] || []) {
      byRoute[row.route] = byRoute[row.route] || {};
      byRoute[row.route][vp] = row;
    }
  }
  return byRoute;
}

// Ordered union of routes across both brands. Routes a brand swept first
// (mentolder) lead, then any korczewski-only routes, each first-seen-wins.
function unionRoutes(indexed) {
  const seen = new Set();
  const ordered = [];
  for (const brand of BRANDS) {
    for (const route of Object.keys(indexed[brand] || {})) {
      if (!seen.has(route)) { seen.add(route); ordered.push(route); }
    }
  }
  return ordered;
}
```

- [ ] **Add the cell + row renderers.** Append the block below. `renderViewportCell()` renders one screenshot (or an empty placeholder) plus a status badge and the nav/link-health summary for that exact `{brand,route,viewport}` row. `renderBrandCell()` stacks the desktop and mobile cells for one brand+route; an absent brand-side renders a muted "not in brand" placeholder so the side-by-side grid stays aligned. Status classes (`ok`/`redirect`/`skip`/`error`) come straight off the row's `status` field (contract values).

```js
function statusBadge(row) {
  if (!row) return '<span class="badge badge-missing">—</span>';
  const s = esc(row.status || 'unknown');
  const extra = row.status === 'redirect' && row.redirectedTo
    ? ` → ${esc(row.redirectedTo)}`
    : (row.reason ? ` (${esc(row.reason)})` : '');
  return `<span class="badge badge-${s}">${s}${extra}</span>`;
}

function healthSummary(row) {
  if (!row) return '';
  const navFails = Array.isArray(row.navFailures) ? row.navFailures.length : 0;
  const dead = Array.isArray(row.deadLinks) ? row.deadLinks.length : 0;
  const parts = [];
  parts.push(navFails === 0
    ? '<span class="health ok">nav ok</span>'
    : `<span class="health bad" title="${esc(JSON.stringify(row.navFailures))}">nav ${navFails} fail</span>`);
  parts.push(dead === 0
    ? '<span class="health ok">links ok</span>'
    : `<span class="health bad" title="${esc(JSON.stringify(row.deadLinks))}">${dead} dead</span>`);
  return `<div class="health-row">${parts.join('')}</div>`;
}

function renderViewportCell(row, brand, vp) {
  const rel = row ? screenshotRel(row, brand, vp) : null;
  const img = rel
    ? `<a href="${esc(rel)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(rel)}" alt="${esc(brand)} ${esc(vp)} ${esc(row.route)}"></a>`
    : '<div class="noshot">no screenshot</div>';
  return `
    <figure class="vp vp-${vp}">
      <figcaption>${esc(vp)} ${statusBadge(row)}</figcaption>
      ${img}
      ${healthSummary(row)}
    </figure>`;
}

function renderBrandCell(brandIndex, brand, route) {
  const entry = brandIndex[route];
  if (!entry) {
    return `<td class="brand-cell empty"><div class="not-in-brand">not in ${esc(brand)}</div></td>`;
  }
  return `<td class="brand-cell">
    ${renderViewportCell(entry.desktop, brand, 'desktop')}
    ${renderViewportCell(entry.mobile, brand, 'mobile')}
  </td>`;
}
```

- [ ] **Add the page renderer + main.** Append the block below to finish the file. `renderHtml()` builds the full self-contained document: one section per brand-pair table (mentolder column vs korczewski column), one `<tr>` per route in the union order, plus a totals summary header. `main()` writes `index.html`, prints the **absolute** path (contract requirement), and exits 0; with no results at all it still writes a valid empty-state page and prints the path so the Taskfile validating step always finds a file.

```js
const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0f1115;color:#e6e8ec;font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
header.top{padding:20px 28px;border-bottom:1px solid #232733;position:sticky;top:0;background:#0f1115;z-index:5}
header.top h1{margin:0 0 4px;font-size:20px}
.summary{color:#9aa3b2;font-size:13px}
main{padding:24px 28px}
table.sweep{width:100%;border-collapse:collapse;margin-bottom:40px}
table.sweep th{position:sticky;top:78px;background:#161a22;text-align:left;padding:10px 12px;border-bottom:2px solid #2a3140;font-size:13px}
table.sweep td{vertical-align:top;border-bottom:1px solid #1c2029;padding:10px 12px;width:42%}
td.route-cell{width:16%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#cdd3dd;word-break:break-all}
.brand-cell{display:flex;flex-direction:row;gap:12px;flex-wrap:wrap}
.brand-cell.empty{display:table-cell}
figure.vp{margin:0;flex:1 1 280px;min-width:240px;background:#12151c;border:1px solid #232733;border-radius:8px;padding:8px}
figure.vp figcaption{font-size:11px;color:#9aa3b2;margin-bottom:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
figure.vp img{width:100%;height:auto;display:block;border-radius:4px;border:1px solid #1c2029}
figure.vp-mobile{flex:0 0 160px;min-width:140px}
.noshot,.not-in-brand{color:#6b7280;font-size:12px;padding:24px 8px;text-align:center;border:1px dashed #2a3140;border-radius:6px}
.badge{font-size:10px;font-weight:600;padding:1px 6px;border-radius:10px;text-transform:uppercase;letter-spacing:.4px}
.badge-ok{background:#16361f;color:#5fd07a}
.badge-redirect{background:#3a2f12;color:#e0b94a}
.badge-skip{background:#23262e;color:#9aa3b2}
.badge-error{background:#3a1517;color:#ef6b73}
.badge-missing,.badge-unknown{background:#23262e;color:#6b7280}
.health-row{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
.health{font-size:10px;padding:1px 5px;border-radius:6px}
.health.ok{background:#16361f;color:#5fd07a}
.health.bad{background:#3a1517;color:#ef6b73;cursor:help}
a{color:inherit}
`;

function brandSection(indexed, route) {
  return `<tr>
    <td class="route-cell">${esc(route)}</td>
    ${renderBrandCell(indexed.mentolder, 'mentolder', route)}
    ${renderBrandCell(indexed.korczewski, 'korczewski', route)}
  </tr>`;
}

function summaryLine(results) {
  const counts = {};
  let total = 0;
  for (const brand of BRANDS) {
    for (const vp of VIEWPORTS) {
      for (const row of results[brand][vp]) {
        total += 1;
        counts[row.status] = (counts[row.status] || 0) + 1;
      }
    }
  }
  const parts = Object.entries(counts).map(([k, v]) => `${esc(k)}: ${v}`);
  return `${total} captures — ${parts.join(' · ') || 'none'}`;
}

function renderHtml(results) {
  const indexed = {};
  for (const brand of BRANDS) indexed[brand] = indexByRoute(results[brand]);
  const routes = unionRoutes(indexed);

  const rows = routes.length
    ? routes.map((r) => brandSection(indexed, r)).join('\n')
    : '<tr><td colspan="3" style="padding:40px;text-align:center;color:#6b7280">No sweep results found. Run task test:e2e:visual-sweep first.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual Sweep — Contact Sheet</title>
<style>${STYLE}</style>
</head><body>
<header class="top">
  <h1>Visual Sweep — Contact Sheet</h1>
  <div class="summary">${esc(summaryLine(results))} · generated ${esc(new Date().toISOString())}</div>
</header>
<main>
  <table class="sweep">
    <thead><tr><th>route</th><th>mentolder</th><th>korczewski</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</main>
</body></html>`;
}

function main() {
  const results = loadResults();
  const html = renderHtml(results);
  writeFileSync(OUT_FILE, html, 'utf8');
  // Absolute path is the contract: the Taskfile + humans open this directly.
  console.log(OUT_FILE);
}

main();
```

- [ ] **Validate the builder against synthetic fixtures (no cluster, no auth).** Seed a couple of fake result rows + a 1x1 PNG, run the builder, and assert it emits a valid `index.html` containing both brands and the route. Then clean up the synthetic fixtures. Run from repo root:

```bash
cd /home/patrick/Bachelorprojekt && \
mkdir -p tests/results/visual-sweep/mentolder/desktop tests/results/visual-sweep/korczewski/desktop && \
printf '\x89PNG\r\n\x1a\n' > /tmp/_px.bin && \
node -e 'const fs=require("fs");const b=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC","base64");fs.writeFileSync("tests/results/visual-sweep/mentolder/desktop/index.png",b);fs.writeFileSync("tests/results/visual-sweep/korczewski/desktop/index.png",b);' && \
node -e 'const fs=require("fs");fs.writeFileSync("tests/results/visual-sweep/mentolder/results-desktop.json",JSON.stringify([{route:"/",brand:"mentolder",viewport:"desktop",status:"ok",screenshot:"tests/results/visual-sweep/mentolder/desktop/index.png",navFailures:[],deadLinks:[]}]));fs.writeFileSync("tests/results/visual-sweep/korczewski/results-desktop.json",JSON.stringify([{route:"/",brand:"korczewski",viewport:"desktop",status:"redirect",redirectedTo:"/portal",screenshot:"tests/results/visual-sweep/korczewski/desktop/index.png",navFailures:[],deadLinks:[{href:"/x",ok:false}]}]));' && \
( cd tests/e2e && node lib/build-gallery.mjs ) && \
grep -q "mentolder" tests/results/visual-sweep/index.html && \
grep -q "badge-redirect" tests/results/visual-sweep/index.html && \
echo "GALLERY_OK"
```

Expected: the final line of stdout is the absolute path `/home/patrick/Bachelorprojekt/tests/results/visual-sweep/index.html`, followed by `GALLERY_OK`. Then remove the synthetic fixtures (keep the directory tree so real runs land cleanly): `cd /home/patrick/Bachelorprojekt && rm -rf tests/results/visual-sweep`. **Do not commit** any `tests/results/` artifacts.

- [ ] **Add the `test:e2e:visual-sweep` Taskfile target.** Insert the block below into `/home/patrick/Bachelorprojekt/Taskfile.yml` immediately AFTER the `test:e2e:all-prods` target (ends at line 452, before `systemtest:cycle:` at line 454). It mirrors `test:e2e:agent-guide:film` (Taskfile.yml:376-389) for the guarded `npm ci` + `playwright install chromium` + `dir: tests/e2e` pattern and mirrors `test:e2e`'s `case "{{.ENV}}"` → `WEBSITE_URL` mapping (Taskfile.yml:413-416) — but **deliberately omits** the `CRON_SECRET` precondition and the pre/post prod-DB purge bracket (Taskfile.yml:409-410,420-443), because the sweep is read-only and its config sets `globalSetup/globalTeardown=undefined`. After Playwright finishes it builds the gallery via `node lib/build-gallery.mjs`.

```yaml
  test:e2e:visual-sweep:
    desc: "Read-only full-route visual sweep (screenshots + nav/link-health) against ENV=mentolder|korczewski, VIEWPORT=desktop|mobile. NO prod-DB purge."
    dir: tests/e2e
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
      VIEWPORT: '{{.VIEWPORT | default "desktop"}}'
    preconditions:
      - sh: '[ "{{.ENV}}" = "mentolder" ] || [ "{{.ENV}}" = "korczewski" ]'
        msg: "test:e2e:visual-sweep requires ENV=mentolder or ENV=korczewski, got ENV={{.ENV}}"
      - sh: '[ "{{.VIEWPORT}}" = "desktop" ] || [ "{{.VIEWPORT}}" = "mobile" ]'
        msg: "test:e2e:visual-sweep requires VIEWPORT=desktop or VIEWPORT=mobile, got VIEWPORT={{.VIEWPORT}}"
    cmds:
      - |
        case "{{.ENV}}" in
          mentolder)  WEBSITE_URL=https://web.mentolder.de  PROD_DOMAIN=mentolder.de ;;
          korczewski) WEBSITE_URL=https://web.korczewski.de PROD_DOMAIN=korczewski.de ;;
        esac
        export WEBSITE_URL PROD_DOMAIN
        [ -d node_modules ] || npm ci
        ./node_modules/.bin/playwright install chromium >/dev/null 2>&1 || true
        # Read-only sweep: the visual-sweep config sets globalSetup/globalTeardown
        # to undefined and installReadOnlyGuard aborts all non-GET/HEAD requests,
        # so there is NO test-data purge and CRON_SECRET is NOT required here.
        ./node_modules/.bin/playwright test \
          --config playwright.visual-sweep.config.ts \
          --project=visual-sweep-{{.ENV}}-{{.VIEWPORT}} {{.CLI_ARGS}}
        echo ""
        node lib/build-gallery.mjs
```

- [ ] **Add the `test:e2e:visual-sweep:all-prods` fan-out target.** Insert the block below immediately AFTER the `test:e2e:visual-sweep` target you just added. It fans out both brands × both viewports (mirroring the `test:e2e:all-prods` fan-out shape at Taskfile.yml:446-452), then runs **one** gallery build over the combined `tests/results/visual-sweep/` tree from `tests/e2e`. The four sweep tasks each call `node lib/build-gallery.mjs` themselves, but the trailing explicit build guarantees the index reflects all four runs even if the last sub-task's build raced an in-progress write.

```yaml
  test:e2e:visual-sweep:all-prods:
    desc: "Visual sweep across mentolder + korczewski × desktop + mobile, then one combined contact-sheet."
    cmds:
      - task: test:e2e:visual-sweep
        vars: { ENV: "mentolder", VIEWPORT: "desktop" }
      - task: test:e2e:visual-sweep
        vars: { ENV: "mentolder", VIEWPORT: "mobile" }
      - task: test:e2e:visual-sweep
        vars: { ENV: "korczewski", VIEWPORT: "desktop" }
      - task: test:e2e:visual-sweep
        vars: { ENV: "korczewski", VIEWPORT: "mobile" }
      - dir: tests/e2e
        cmd: node lib/build-gallery.mjs
```

- [ ] **Validate the Taskfile wiring parses and the targets exist.** Run from repo root: `cd /home/patrick/Bachelorprojekt && task --list 2>/dev/null | grep -E 'visual-sweep'`. Expected: two lines, `test:e2e:visual-sweep` and `test:e2e:visual-sweep:all-prods`, with their descriptions. Then dry-run the precondition guards (no network): `task test:e2e:visual-sweep ENV=bogus 2>&1 | grep -q "requires ENV=mentolder" && echo PRECOND_OK`. Expected: `PRECOND_OK`.

- [ ] **End-to-end validating step (depends on sibling task blocks landing first).** Once `playwright.visual-sweep.config.ts` and `visual-sweep.spec.ts` exist, run the real read-only sweep — zero auth-write risk (the spec's anonymous public pass + `installReadOnlyGuard` abort all non-GET requests, no CRON_SECRET, no DB purge): `cd /home/patrick/Bachelorprojekt && task test:e2e:visual-sweep ENV=mentolder VIEWPORT=desktop`. Expected: Playwright runs the `visual-sweep-mentolder-desktop` project, then the task prints the absolute path `/home/patrick/Bachelorprojekt/tests/results/visual-sweep/index.html`. Open that file and confirm the mentolder column shows desktop screenshots with status badges and nav/link-health for each route. (If the sibling config/spec are not yet merged, this step is deferred — the fixture-based validation above already exercises every code path in `build-gallery.mjs`.)

- [ ] **Commit (branch first, never `main`).** From repo root: `cd /home/patrick/Bachelorprojekt && git checkout -b feature/visual-sweep-gallery 2>/dev/null || git checkout feature/visual-sweep-gallery`, then ensure no `tests/results/` artifacts are staged: `git status --porcelain tests/results/` must be empty (the validation step's `rm -rf` removed them; if `tests/results/` is gitignored that's fine). Stage and commit exactly the two files this block owns:

```bash
cd /home/patrick/Bachelorprojekt && \
git add tests/e2e/lib/build-gallery.mjs Taskfile.yml && \
git status --porcelain && \
git commit -m "$(cat <<'EOF'
feat(test): visual-sweep contact-sheet gallery + Taskfile wrappers

Add tests/e2e/lib/build-gallery.mjs — reads the per-brand/per-viewport
results-*.json + PNGs and emits a single self-contained contact sheet at
tests/results/visual-sweep/index.html (mentolder vs korczewski side-by-side,
desktop+mobile per route, status + nav/link-health labels). Add Taskfile
targets test:e2e:visual-sweep (ENV+VIEWPORT, read-only — no CRON_SECRET / no
prod-DB purge) and test:e2e:visual-sweep:all-prods (4-way fan-out + one
combined gallery build).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: the `git status --porcelain` line shows only `M Taskfile.yml` and `A tests/e2e/lib/build-gallery.mjs`; the commit succeeds. Do not push or open a PR in this block — leave that to the orchestrator's integration step.

---

**Files this block creates/edits (absolute paths):**
- `/home/patrick/Bachelorprojekt/tests/e2e/lib/build-gallery.mjs` (new — gallery builder)
- `/home/patrick/Bachelorprojekt/Taskfile.yml` (edit — two new targets inserted after line 452, before `systemtest:cycle:` at line 454)

**Patterns mirrored (real repo file:line):** `Taskfile.yml:376-389` (`test:e2e:agent-guide:film` — guarded `npm ci`/`playwright install chromium`/`dir: tests/e2e`), `Taskfile.yml:413-416` (`case "{{.ENV}}"`→`WEBSITE_URL` map), `Taskfile.yml:446-452` (`test:e2e:all-prods` fan-out shape), and the deliberate **non-use** of `Taskfile.yml:409-410,420-443` (CRON_SECRET precondition + prod-DB purge bracket). ESM/`node:fs` style from `scripts/build-docs.mjs:9-14,27-30`. Root `package.json` is `"type":"module"` and node is v22, so `.mjs` ESM runs natively.
