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
//
// Env knobs:
//   VISUAL_SWEEP_PUBLIC_ONLY=1 — restrict to the anonymous public tier (zero auth).
//   VISUAL_SWEEP_VIDEO=1       — record one continuous .webm per swept tier
//                                (one page reused per tier). Off by default so the
//                                committed/CI default stays lean. Saved to
//                                tests/results/visual-sweep/<brand>/video-<viewport>-<tier>.webm

import { test, expect, type BrowserContext, type Browser, type Page, type Video } from '@playwright/test';
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
import {
  type AuthTier,
  type Brand,
  type Viewport,
  type RouteEntry,
  type ResultRow,
  RESULTS_ROOT,
  VIEWPORTS,
  VIDEO_ENABLED,
  parseProject,
  safeRoute,
  applicableRoutes,
  assertAuthReady,
  storageStateFor,
  authStatesMap,
  robustGoto,
} from '../lib/visual-sweep-helpers';


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

    // Reuse one context AND one page per tier. The single reused page keeps
    // storageState + guard install cheap AND yields exactly one continuous .webm
    // per tier when VISUAL_SWEEP_VIDEO=1 (Playwright records video per page).
    // healthCache dedupes link-health GETs across pages within the tier so a
    // site-wide nav link (e.g. /ueber-mich) is GET-checked once, not per page.
    interface TierCtx {
      ctx: BrowserContext;
      page: Page;
      videos: Video[];   // one per page (a timeout-triggered page recreation adds another)
      healthCache: Map<string, { ok: boolean; reason?: string }>;
    }
    const contextCache = new Map<AuthTier, TierCtx | 'SKIP'>();
    const VIDEO_DIR = path.join(RESULTS_ROOT, brand, `video-${viewport}`);

    async function contextForTier(tier: AuthTier): Promise<TierCtx | 'SKIP'> {
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
        ...(VIDEO_ENABLED ? { recordVideo: { dir: VIDEO_DIR, size: vp } } : {}),
      });
      await installReadOnlyGuard(ctx);
      await ctx.addInitScript(STABILITY_INIT_SCRIPT);
      const page = await ctx.newPage();
      await page.setViewportSize(vp);
      const videos: Video[] = [];
      if (VIDEO_ENABLED) { const v = page.video(); if (v) videos.push(v); }
      const entry: TierCtx = { ctx, page, videos, healthCache: new Map() };
      contextCache.set(tier, entry);
      return entry;
    }

    // Per-route hard wall-clock cap. A few live routes intermittently never
    // close their HTTP/2 stream cleanly, and under request interception the
    // underlying op timeouts are not always honoured — so we bound the whole
    // route. On timeout we recreate the tier page (the old one may be stuck) so
    // the next route starts clean. ROUTE_BUDGET_MS comfortably exceeds the
    // robustGoto budget (25s + 35s) + stability + screenshot for a healthy route.
    const ROUTE_BUDGET_MS = 90_000;
    async function recreateTierPage(tier: AuthTier, t: TierCtx): Promise<void> {
      await t.page.close().catch(() => {});
      const page = await t.ctx.newPage();
      await page.setViewportSize(vp);
      if (VIDEO_ENABLED) { const v = page.video(); if (v) t.videos.push(v); } // shared array; next spreads it
      const next: TierCtx = { ...t, page };
      contextCache.set(tier, next);
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
      const { ctx } = ctxOrSkip;

      // Resolve the concrete URL for dynamic routes (resolver has its own timeouts).
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

      // The actual per-route capture. Reads the tier's CURRENT page each call
      // (it may have been recreated after a prior timeout). Returns a ResultRow.
      const processRoute = async (): Promise<ResultRow> => {
        const tier = contextCache.get(entry.authTier) as TierCtx;
        const page = tier.page;
        try {
          const { resp, note } = await robustGoto(page, targetUrl);

          // Detect a redirect away from the requested path.
          const landed = page.url().replace(/\/$/, '');
          const expected = (entry.dynamic ? targetUrl : baseURL + entry.route).replace(/\/$/, '');
          // Boundary-aware: only treat as "no redirect" on exact match or a deeper
          // child path (expected + '/...'), so a sibling prefix-superset redirect
          // (e.g. /leistung -> /leistungen) is still correctly flagged.
          const redirected = !entry.dynamic && landed !== expected && !landed.startsWith(expected + '/');

          await applyStability(page);

          // Screenshot paths. shotRel is REPO-ROOT-relative so the gallery builder
          // (join(REPO_ROOT, row.screenshot)) resolves it directly; shotAbs is where
          // the file is actually written (RESULTS_ROOT = <repo>/tests/results/visual-sweep).
          const shotRel = path.join('tests', 'results', 'visual-sweep', brand, viewport, `${safeRoute(entry.route)}.png`);
          const shotAbs = path.join(RESULTS_ROOT, brand, viewport, `${safeRoute(entry.route)}.png`);
          fs.mkdirSync(path.dirname(shotAbs), { recursive: true });

          await page.screenshot({
            path: shotAbs,
            fullPage: true,
            animations: 'disabled',
            timeout: 20_000,
            mask: masksForRoute(page, entry.route),
          });

          // One-time global-nav verification per tier.
          if (!navVerifiedFor.has(entry.authTier)) {
            const nav = await verifyGlobalNav(page, routes);
            // If this route already lost the per-route timeout race, its page was
            // closed + recreated; do NOT commit nav results from the dead page —
            // they would be bogus "page closed" failures stamped onto the whole
            // tier and would suppress the one real nav verification.
            if (!page.isClosed()) {
              navFailuresByTier[entry.authTier] = nav.failures;
              navVerifiedFor.add(entry.authTier);
              console.log(`[visual-sweep] nav(${entry.authTier}): clicked=${nav.clicked} failures=${nav.failures.length}`);
              // verifyGlobalNav navigates the page around; return to the route for the harvest.
              await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {});
            }
          }
          const navFailures = navFailuresByTier[entry.authTier] ?? [];

          // Per-page dead-link harvest (cached across pages within the tier).
          const links = await harvestLinkHealth(page, routes, tier.healthCache);
          const deadLinks = links.filter((l) => !l.ok);

          const code = resp ? resp.status() : 0;
          // The Astro 404 page (route /404) intentionally responds 404 — a 4xx
          // there is expected, not a failure. Its screenshot is still captured.
          const expectedErrPage = entry.route === '/404';
          const status: ResultRow['status'] =
            code >= 400 && !expectedErrPage ? 'error' : redirected ? 'redirect' : 'ok';
          const reason =
            status === 'error' ? `HTTP ${code}`
            : (expectedErrPage && code >= 400 ? `expected HTTP ${code} (error page)` : note);

          return {
            route: entry.route, brand, viewport,
            status,
            ...(redirected ? { redirectedTo: landed } : {}),
            ...(reason ? { reason } : {}),
            screenshot: shotRel,
            navFailures,
            deadLinks,
          };
        } catch (err) {
          return {
            route: entry.route, brand, viewport,
            status: 'error',
            reason: err instanceof Error ? err.message : String(err),
            screenshot: '', navFailures: [], deadLinks: [],
          };
        }
      };

      // Race the capture against a hard per-route budget.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutP = new Promise<{ __timeout: true }>((resolve) => {
        timer = setTimeout(() => resolve({ __timeout: true }), ROUTE_BUDGET_MS);
      });
      const outcome = await Promise.race([processRoute(), timeoutP]);
      if (timer) clearTimeout(timer);

      if ('__timeout' in outcome) {
        results.push({
          route: entry.route, brand, viewport,
          // Distinct from 'error': an intermittent live-prod HTTP/2 stall (the
          // exact condition the budget+recreate machinery exists to survive) is
          // surfaced as 'timeout' and does NOT gate the run red.
          status: 'timeout',
          reason: `route-timeout (>${ROUTE_BUDGET_MS / 1000}s)`,
          screenshot: '', navFailures: [], deadLinks: [],
        });
        console.log(`[visual-sweep] TIMEOUT ${entry.route} (>${ROUTE_BUDGET_MS / 1000}s) — recreating page`);
        const t = contextCache.get(entry.authTier);
        if (t && t !== 'SKIP') await recreateTierPage(entry.authTier, t);
      } else {
        results.push(outcome);
        console.log(`[visual-sweep] ${outcome.status.toUpperCase()} ${entry.route} -> ${outcome.screenshot || '(none)'}${outcome.reason ? ' [' + outcome.reason + ']' : ''}`);
      }
    }

    // Close reused pages (finalizes per-tier videos), then contexts.
    for (const v of contextCache.values()) {
      if (v !== 'SKIP') await v.page.close().catch(() => {});
    }
    for (const v of contextCache.values()) {
      if (v !== 'SKIP') await v.ctx.close().catch(() => {});
    }
    // Save one webm per swept tier under a stable name. If a page was recreated
    // after a route-timeout the tier has multiple videos; keep the LARGEST (the
    // content-rich page — a fresh post-timeout page records almost nothing).
    if (VIDEO_ENABLED) {
      for (const [tier, v] of contextCache.entries()) {
        if (v === 'SKIP' || v.videos.length === 0) continue;
        let best: Video | null = null;
        let bestSize = -1;
        for (const vid of v.videos) {
          try {
            const p = await vid.path();
            const sz = fs.statSync(p).size;
            if (sz > bestSize) { bestSize = sz; best = vid; }
          } catch { /* video not finalized / missing — skip */ }
        }
        if (best) {
          const dest = path.join(RESULTS_ROOT, brand, `tour-${viewport}-${tier}.webm`);
          await best.saveAs(dest).catch((e) => console.log(`[visual-sweep] video save failed (${tier}): ${e}`));
          console.log(`[visual-sweep] video(${tier}) ${(bestSize / 1024 / 1024).toFixed(1)}MB -> ${path.relative(process.cwd(), dest)}`);
        }
      }
    }

    // Write the per-brand/viewport results array.
    const resultsFile = path.join(RESULTS_ROOT, brand, `results-${viewport}.json`);
    fs.mkdirSync(path.dirname(resultsFile), { recursive: true });
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`[visual-sweep] wrote ${results.length} rows → ${path.relative(process.cwd(), resultsFile)}`);

    // Visibility: dynamic routes that skipped purely because no resolver is wired
    // yet (a known, plan-deferred coverage gap — resolver annotation is follow-up).
    const unresolvedDynamic = results.filter(
      (r) => r.status === 'skip' && /not-dynamic-or-no-resolver/.test(r.reason ?? ''),
    );
    if (unresolvedDynamic.length) {
      console.log(
        `[visual-sweep] NOTE: ${unresolvedDynamic.length} dynamic route(s) skipped — no resolver annotation yet: ` +
        unresolvedDynamic.map((r) => r.route).join(', '),
      );
    }
    const timeouts = results.filter((r) => r.status === 'timeout');
    if (timeouts.length) {
      console.log(`[visual-sweep] ${timeouts.length} route-timeout(s) (non-fatal): ${timeouts.map((t) => t.route).join(', ')}`);
    }

    // Hard assertions.
    expect(results.length, 'sweep produced at least one result row').toBeGreaterThan(0);
    // Guard against a wholesale outage masquerading as "everything skipped/timed out".
    expect(
      results.some((r) => r.status === 'ok' || r.status === 'redirect'),
      'at least one route must load successfully (else the target site is down)',
    ).toBe(true);
    // Only genuine HTTP>=400 / thrown navigation failures gate green. Intermittent
    // route-timeouts (status:'timeout') are surfaced above but do NOT fail the run.
    const errors = results.filter((r) => r.status === 'error');
    expect(
      errors,
      `routes errored: ${errors.map((e) => `${e.route} (${e.reason})`).join(', ')}`,
    ).toEqual([]);
  });
});
