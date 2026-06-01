---
title: E2E Visual Sweep — "is the whole App designed as one?"
slug: e2e-visual-sweep
date: 2026-06-01
status: draft
---

# E2E Visual Sweep — design spec

## 1. Goal

Produce a **reusable, read-only Playwright suite** that walks **every** website route across **both brands** (mentolder + korczewski) on the **live fleet**, takes a **full-page screenshot of every subpage** (desktop **and** mobile), **click-verifies the page-joining navigation**, and emits a **side-by-side gallery** so the reviewer can judge whether the whole App is designed as one cohesive system.

This directly serves the request: "make sure our e2e tests are *complete*, and actually click all the buttons joining all the pages. Take a photo on every subpage even if just separated by `/` in the URL."

## 2. Decisions (locked)

| # | Decision | Value |
|---|----------|-------|
| D1 | Route scope | **All 98 routes** — public (22) + portal (9) + admin (67) + dynamic |
| D2 | Brands | **Both** mentolder + korczewski (different design systems → cohesion review wants both) |
| D3 | Traversal | **Hybrid** — manifest-driven coverage (screenshot every route) **+** click-verify the nav/footer/sidebar that *joins* pages |
| D4 | Target | **Live fleet** (`web.mentolder.de` / `web.korczewski.de`), **navigation-only**, network-layer non-GET abort |
| D5 | Viewports | **Desktop 1440×900 AND mobile 390×844, always** |
| D6 | Run mode | **On-demand only** — never added to nightly `e2e.yml` |

## 3. Scope

**In:** all 98 page-file routes × 2 brands × 2 viewports, with `/[service]` expanded to each brand's concrete slugs; full-page screenshots; nav/footer/sidebar click-verification; per-page internal-link health; an HTML gallery; a route-manifest generator + CI drift guard.

**Out:** action/form submission, pixel-diff baselines / `toHaveScreenshot` regression gating, CI gating of the screenshots themselves, the brainstorm-board app, `/api/*` endpoints, the dualperson tunnel restore (separate infra item, blocked on `pve` power).

## 4. Architecture (small, single-purpose units)

```
website/src/pages/**  ──gen──▶  route-manifest.json ──┐
                                                        ├─▶  visual-sweep spec ──▶ screenshots/ ──▶ gallery index.html
            .auth/*.json (from *-setup deps) ──────────┘        │
                                                                ├─ safety guard (abort non-GET)
                                                                ├─ stability recipe (consent/fonts/anim/masks)
                                                                ├─ dynamic-id resolver (index→selector, skip+log)
                                                                └─ nav click-verifier (+ link-health)
```

### 4.1 Route-manifest generator — `scripts/build-route-manifest.mjs`
Walk `website/src/pages/**/*.astro` (also `.svelte/.md/.mdx` for future-proofing), **exclude any path containing `/api/`**, map file→URL with Astro rules (`/index`→`/`; keep `[param]` / `[...rest]` literally). Emit `website/src/data/route-manifest.json`:

```jsonc
{
  "route": "/admin/tickets/[id]",
  "authTier": "admin",            // startsWith('/admin')→admin, '/portal'→portal, else public
  "brand": "both",                // 'both' | 'mentolder' | 'korczewski'
  "dynamic": true,
  "resolver": { "indexUrl": "/admin/tickets", "selector": "a[href^=\"/admin/tickets/\"]", "auth": "admin", "source": "dom" },
  "excludeFromSweep": false,      // /portal/arena, /admin/systemtest, /admin/brett/[...path]
  "media": false                  // video/iframe page → mask + flag in gallery
}
```

- `/[service]` is **not** emitted literally — expand to one concrete route per slug from **each brand's static `config.services`** (`src/config/brands/<brand>.ts`): mentolder `[50plus-digital, coaching, fuehrung-persoenlichkeit, beratung, ki-transition]`, korczewski `[ki-beratung, software-dev, deployment]` (disjoint → each tagged single-brand). Static config is the deterministic source (no DB at generation time); live `getEffectiveServices()` slugs may differ — noted as a known limitation (§9).
- All other 97 routes default `brand: "both"`. No admin/portal route is brand-specific.

### 4.2 Sweep Playwright config — `tests/e2e/playwright.visual-sweep.config.ts`
Clone of the proven `playwright.film.config.ts` pattern (a **separate** config so nightly's bare `npx playwright test` never loads it → `e2e.yml` unchanged). Spread `baseConfig`, set `globalSetup`/`globalTeardown: undefined` (**no prod-DB purge** — the Taskfile `test:e2e` purge bracket via `CRON_SECRET` must NOT run for a read-only sweep). Projects:

- `mentolder-setup`, `korczewski-setup` — **re-declared/imported from base** (`baseConfig.projects.filter(p => p.name.endsWith('-setup'))`) so the sweep config can `dependencies` on them (resolves the "setup-only-in-main-config" tension).
- `visual-sweep-mentolder-desktop` / `-mobile` (`dependencies: ['mentolder-setup']`, viewport 1440×900 / 390×844)
- `visual-sweep-korczewski-desktop` / `-mobile` (`dependencies: ['korczewski-setup']`)

All four sweep projects share `testMatch: ['**/visual-sweep.spec.ts']` (matched by **no** glob in the main config → invisible to the 14 existing projects). `use`: `baseURL = process.env.WEBSITE_URL`, `ignoreHTTPSErrors: true`, inherit `locale: 'de-DE'`, `timezoneId: 'Europe/Berlin'`, `colorScheme: 'dark'`, `reducedMotion: 'reduce'`.

### 4.3 Sweep spec — `tests/e2e/specs/visual-sweep.spec.ts`
Data-driven over `route-manifest.json`, filtered by the active project's brand. Per route:

1. **Pick auth context by `authTier`** (see §5): `public`→anonymous, `portal`→customer storageState, `admin`→admin storageState. The spec opens contexts itself via `browser.newContext({ storageState })` (mirrors the existing korczewski per-test pattern), so project-level storageState is unnecessary; the `*-setup` dependency only needs to have *produced* the `.auth` files.
2. **Resolve dynamic `[id]`** (see §6) → concrete URL, or **skip + log** `{route, brand, reason}`.
3. **`page.goto(url, { waitUntil: 'networkidle' })`** (MPA → navigate by URL, never by clicking nav).
4. Apply the **stability recipe** (§7).
5. **`page.screenshot({ fullPage: true, animations: 'disabled', mask: [...] })`** → `tests/results/visual-sweep/<brand>/<viewport>/<section>/<route>.png`.
6. **Nav click-verify + link-health** (§4.4).
7. Record a per-route result row (status, redirect?, skipped?, dead links) for the gallery.

### 4.4 Nav click-verifier — `tests/e2e/lib/nav-graph.ts`
Satisfies "actually click all the buttons joining all the pages" without an intractable full crawl:
- **Physically click** every **global-chrome** page-joiner — header nav links, footer links, and (on authed pages) the admin/portal **sidebar** — on a representative page per `{brand, authTier}`, asserting each lands on the expected in-manifest route, then `goBack`. These are *the* buttons that join the app; clicking them is cheap (the chrome repeats) and high-signal.
- **On every page**, harvest all internal `<a href>` (page-joining links/CTAs), assert each target is a **known manifest route** and **reachable** (a GET request returns < 400 under the abort guard) — a per-page **link-health** report (dead/wrong/orphan links flagged in the gallery). This is verification, not navigation, so it stays read-only and fast.
- **Never** click `<button>`/submit/save/delete/action controls (belt-and-suspenders with the §5 network abort).

### 4.5 Gallery builder — `tests/e2e/lib/build-gallery.mjs`
After the run, read `tests/results/visual-sweep/**` + the result rows → `tests/results/visual-sweep/index.html`: a contact sheet grouped **brand → section**, **mentolder vs korczewski side-by-side** where a route exists in both, **desktop + mobile** thumbnails per route, each labelled with route, redirect/skip status, and nav link-health pass/fail. This is the reviewer's "designed as one?" surface. Print the absolute `index.html` path at the end of the run.

## 5. Safety & auth model (live fleet)

**Network-layer guard (primary):** before the first navigation, install per-context
```js
await context.route('**', (route) => {
  const m = route.request().method();
  return (m === 'GET' || m === 'HEAD') ? route.continue() : route.abort();
});
```
Verified safe: Astro SSR/MPA, **zero render-path or mount-path client non-GET**, Keycloak login is 100% GET browser-side (token POST is server-side, not interceptable). No telemetry/beacons. → prod mutation is **physically impossible** at the network layer, and pages still render.

**Excluded routes** (POST-on-mount or recording side-effects, set `excludeFromSweep`): `/portal/arena` (POSTs `/api/arena/token` on mount — non-mutating but errors under abort), `/admin/systemtest/*` (in-browser evidence recorder POSTs), `/admin/brett/[...path]` (asset proxy, not a record route — optionally smoke `/admin/brett/healthz`).

**Auth tiers** (path-prefix, verified against per-page `getSession()`/`isAdmin()` guards — there is **no Astro middleware**):
- `public` (22 routes incl. `login`, `registrieren`, `meine-daten`) → **anonymous context** (deterministic header; `PortalSidekick` stays hidden).
- `portal` (9) → **customer** storageState; if a brand lacks a minted customer state → **skip + log**.
- `admin` (67) → **admin** storageState (mentolder `E2E_ADMIN_USER`/`E2E_ADMIN_PASS`; korczewski `TEST_ADMIN_USER`/`TEST_ADMIN_PASSWORD` from Secret `playwright-test-credentials`, ns `workspace-korczewski`, ctx `fleet`).

**Loud-fail precondition:** if an admin/portal pass is requested but the relevant `.auth/*.json` is the empty-state fallback (`{cookies:[],origins:[]}` — written when creds are absent), **abort the run with a clear error** rather than silently screenshotting login-redirects as if they were the pages. Session lifetime is a non-risk (8h self-sliding web session; storageState re-minted each run, gitignored).

## 6. Dynamic-route resolver (read-only, all 19)

Resolver opens each route's index/list page (with the correct auth) and scrapes the first instance link; **skip + log** (never fail) where there's no index or zero rows. Both brands share identical page code → same map, run once per brand base URL.

| Route | Index page | Selector / source | Auth | Skip rule |
|-------|-----------|-------------------|------|-----------|
| `/[service]` | — | each brand's `config.services` slugs (DB `getEffectiveServices` optional) | public | n/a |
| `/poll/[id]` | *none* | read-only DB `SELECT id FROM polls LIMIT 1`, else skip | public | **skip+log** (no index) |
| `/poll/[id]/results` | *none* | reuse poll id | public | **skip+log** |
| `/portal/raum/[id]` | `/portal?section=nachrichten` | `a[href^="/portal/raum/"]` | customer | skip if empty |
| `/portal/besprechung/[id]` | `/portal?section=besprechungen` | `a[href^="/portal/besprechung/"]` | customer | skip if empty |
| `/portal/fragebogen/[assignmentId]` | `/portal?section=frageb%C3%B6gen` | `[data-testid="fragebogen-section"] a[href^="/portal/fragebogen/"]` | customer | skip if empty |
| `/portal/sign/[assignmentId]` | `/portal?section=vertraege` | `a[data-testid="docuseal-pending-link"]` | customer | skip if empty |
| `/portal/billing/[id]/drucken` | `/portal?section=rechnungen` | `li[data-testid="invoice-item"] a[href^="/portal/billing/"][href$="/drucken"]` | customer | skip if empty |
| `/admin/[clientId]` | `/admin/clients` | `a[data-testid="admin-client-item"]` | admin | skip if empty |
| `/admin/coaching/sessions/[id]` | `/admin/coaching/sessions` | `a[href^="/admin/coaching/sessions/"]` **excl** `/new` | admin | skip if empty |
| `/admin/coaching/projekte/[id]` | `/admin/coaching/projekte` | `a[href^="/admin/coaching/projekte/"]` | admin | skip if empty |
| `/admin/meetings/[id]` | `/admin/meetings` | resolve via `a[href^="/admin/live/sessions/"]` (301 alias) | admin | skip if empty |
| `/admin/live/sessions/[id]` | `/admin/meetings` | `a[href^="/admin/live/sessions/"]` | admin | skip if empty |
| `/admin/projekte/[id]` | `/admin/projekte` | `a[href^="/admin/projekte/"]` | admin | skip if empty |
| `/admin/tickets/[id]` | `/admin/tickets` | `a[href^="/admin/tickets/"]` | admin | usually non-empty |
| `/admin/billing/[id]/drucken` | `/admin/rechnungen` | `a[href^="/admin/billing/"][href$="/drucken"]` **excl** `/admin/billing/dunning/` | admin | skip if empty |
| `/admin/knowledge/snippets/[id]/publish` | `/admin/knowledge/templates` | `a[href^="/admin/knowledge/snippets/"][href$="/publish"]` | admin | skip if empty |
| `/admin/fragebogen/[assignmentId]` | *none flat* | two-hop: resolve a `clientId` → open `/admin/<clientId>` → `a[href^="/admin/fragebogen/"]`, else DB / skip | admin | **skip+log** |
| `/admin/brett/[...path]` | — | proxy, **exclude** (optional `/admin/brett/healthz` smoke) | admin | excluded |

## 7. Screenshot stability recipe

**Context:** `locale: 'de-DE'`, `timezoneId: 'Europe/Berlin'`, `colorScheme: 'dark'`, `reducedMotion: 'reduce'`, `deviceScaleFactor: 2` (constant across brands). Viewports desktop 1440×900 / mobile 390×844 (mobile hamburger engages below the 860px nav breakpoint).

**`addInitScript` (before first paint):** `localStorage.setItem('cookie_consent_v1','necessary')` — kills the global consent overlay (`CookieConsent.svelte`).

**Per page:** (1) `goto(url,{waitUntil:'networkidle'})`; (2) `await page.evaluate(()=>document.fonts.ready)` — defeats Google-Fonts FOUT (critical for korczewski's extra Kore font set); (3) inject animation-freeze stylesheet `*,*::before,*::after{animation:none!important;animation-duration:0s!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`; (4) for `fullPage`, scroll to bottom then top + ~300ms settle so `client:visible` islands (ServiceRow/WhyMe/FAQ) hydrate; (5) capture.

**Masks** (`mask: [locator]`): homepage `SlotWidget` (`[data-testid="slot-widget"]` — daily CalDAV date); korczewski Kore homepage `Timeline` (live `v_timeline` feed); media regions on `/portal/stream`, `/admin/live` (`<video>`), `/portal/sign/[id]` + admin editor iframes. **Media pages are still photographed** (masked) and **flagged** in the gallery — nothing silently dropped.

## 8. Integration (nightly untouched)

1. **Config:** new `tests/e2e/playwright.visual-sweep.config.ts` (separate file; `e2e.yml` needs **zero** edits — its bare `npx playwright test` only loads `playwright.config.ts`'s 14 projects).
2. **Task:** `task test:e2e:visual-sweep` (model on `test:e2e:agent-guide:film`, Taskfile.yml ~376): `dir tests/e2e`; vars `ENV`(default mentolder)+viewport; case `ENV`→`WEBSITE_URL` (mentolder `https://web.mentolder.de`, korczewski `https://web.korczewski.de`); guarded `npm ci` + `playwright install chromium`; run `./node_modules/.bin/playwright test --config playwright.visual-sweep.config.ts --project=visual-sweep-{{.ENV}}-{{.VIEWPORT}}`; then `node lib/build-gallery.mjs`. Plus `test:e2e:visual-sweep:all-prods` fan-out (model on `test:e2e:all-prods` ~446) → both brands, both viewports, one merged gallery. **Never** routed through the `test:e2e` purge bracket.
3. **Manifest drift guard** (mirror `test:inventory`): `task routes:manifest` → runs `build-route-manifest.mjs`; a **ci.yml** step (clone of "Verify test inventory is up to date", ci.yml:38-44) re-runs it and `git diff --exit-code website/src/data/route-manifest.json`. Asserts: file-route count == **98**; no `/admin`|`/portal` route tagged public (and vice-versa); per-brand service-slug count matches each brand config's non-hidden list. → completeness can't silently rot. Belongs in **ci.yml**, not e2e.yml.
4. **Inventory side-effect:** creating `visual-sweep.spec.ts` makes `build-test-inventory.sh` regenerate `test-inventory.json` (id `E2E:visual-sweep`); run `task test:inventory` and commit the updated JSON in the **same** change or ci.yml's inventory drift check goes red.

## 9. Known limitations / open questions (decide at execution)

- **Live service slugs:** manifest uses static config; `getEffectiveServices()` DB overrides may add/hide slugs on prod → manifest reflects build-time set (deterministic). Accept, or have the sweep additionally discover live footer slugs at runtime (optional).
- **Korczewski data parity & customer state:** korczewski admin/portal indexes may be empty on prod, and a korczewski **customer** storageState may not be minted → those routes **skip+log** (surfaced in gallery, not a failure). Verify a korczewski `test-admin` exists + `playwright-test-credentials` is populated.
- **Redirect stubs:** 19 admin alias + 6 30x-only pages resolve via 30x to a 200 target — captured (screenshot the landed target), redirect noted in gallery, **not** a failure.
- **CalDAV/SlotWidget present-or-absent** changes homepage layout run-to-run; mask when present, accept the with/without variance (note in gallery).
- **Poll routes** have no UI index → skip+log unless a read-only DB id source is wired.

## 10. Testing the sweep itself

- BATS/unit test for `build-route-manifest.mjs`: asserts the 98-route count, tier classification, and brand split against a fixture.
- A `--dry-run`/`--public-only` mode that runs the public anonymous pass first (zero auth, zero risk) to validate the harness before the authed pass.
- Manual acceptance: open `tests/results/visual-sweep/index.html`, confirm every non-skipped route has desktop+mobile thumbnails for both brands and the skip/redirect/link-health columns read sensibly.

## 11. Out of scope

Pixel-diff regression baselines, action/form testing, CI gating of screenshots, mobile device-emulation beyond viewport, the brainstorm-board app, the dualperson tunnel restore (infra, blocked on `pve` 10.0.0.7 power).
