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
import { installReadOnlyGuard } from './sweep-guard';

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
    // This dedicated context carries a real admin/customer session, so it must
    // honor the same read-only network guarantee as the sweep's per-tier contexts:
    // install the non-GET/HEAD abort guard BEFORE the first navigation. (Defense in
    // depth — the resolver only GETs + scrapes, but an authenticated index page
    // could fire an on-mount beacon/POST.)
    await installReadOnlyGuard(scrapeContext);
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
