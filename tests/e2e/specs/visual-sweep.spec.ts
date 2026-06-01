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

const VIDEO_ENABLED = !!process.env.VISUAL_SWEEP_VIDEO;

const manifest: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

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

// ── Which routes does THIS brand sweep? ────────────────────────────────────────
function applicableRoutes(brand: Brand): RouteEntry[] {
  const base = manifest.routes.filter(
    (r) => !r.excludeFromSweep && (r.brand === 'both' || r.brand === brand),
  );
  // Validation hook: anonymous public-only slice (zero auth, zero write-risk).
  return process.env.VISUAL_SWEEP_PUBLIC_ONLY
    ? base.filter((r) => r.authTier === 'public')
    : base;
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

// ── Resilient navigation. ───────────────────────────────────────────────────────
// A few live routes (observed: /ueber-mich on BOTH brands) return 200 with a body
// but never cleanly close the HTTP/2 stream, so 'domcontentloaded'/'load' never
// fire and a normal goto times out — even though the page renders fine. We try
// 'domcontentloaded' first (fast path), and on a *timeout* fall back to
// 'networkidle' (which resolves on the post-reset idle). Returns the response plus
// a note when the fallback was used, so the row can flag the slow lifecycle. A
// genuinely broken page (5xx, truly hung) still surfaces: networkidle either
// returns a >=400 status (→ status:error) or times out again (→ thrown → error).
async function robustGoto(
  page: Page,
  url: string,
): Promise<{ resp: Awaited<ReturnType<Page['goto']>>; note?: string }> {
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
    return { resp };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/Timeout/i.test(msg)) throw err;
    // The 'domcontentloaded'/'load' lifecycle never fired. Observed on /ueber-mich:
    // the server delivers the document body but never cleanly closes the HTTP/2
    // stream, so BOTH the lifecycle events AND 'networkidle' hang past their own
    // timeouts under request interception. 'commit' resolves as soon as the
    // response headers arrive — a positive event that cannot wait forever for a
    // load/idle signal that never comes — so we still capture the rendered page.
    // applyStability() then settles fonts + scroll before the screenshot.
    const resp = await page.goto(url, { waitUntil: 'commit', timeout: 18_000 });
    return {
      resp,
      note: 'slow-lifecycle: domcontentloaded never fired (server HTTP/2 stream not closed cleanly); captured via commit + settle',
    };
  }
}

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
            timeout: 20_000,
            mask: masksForRoute(page, entry.route),
          });

          // One-time global-nav verification per tier.
          if (!navVerifiedFor.has(entry.authTier)) {
            const nav = await verifyGlobalNav(page, routes);
            navFailuresByTier[entry.authTier] = nav.failures;
            navVerifiedFor.add(entry.authTier);
            console.log(`[visual-sweep] nav(${entry.authTier}): clicked=${nav.clicked} failures=${nav.failures.length}`);
            // verifyGlobalNav navigates the page around; return to the route for the harvest.
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {});
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
          status: 'error',
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

    // Hard assertions: the run must produce results and have no hard errors.
    expect(results.length, 'sweep produced at least one result row').toBeGreaterThan(0);
    const errors = results.filter((r) => r.status === 'error');
    expect(
      errors,
      `routes errored: ${errors.map((e) => `${e.route} (${e.reason})`).join(', ')}`,
    ).toEqual([]);
  });
});
