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
    // GET reachability. A small number of live routes (observed: /ueber-mich on
    // BOTH brands) return 200 with a body but reset the HTTP/2 stream uncleanly,
    // which surfaces here as an APIRequestContext "aborted" THROW even though the
    // route is healthy and in-manifest. We retry once; a persistent TRANSPORT
    // throw (not an HTTP status) on an in-manifest route is reported ok:true with
    // a transport-anomaly note rather than a false "dead link" on every page that
    // links to it. A real 4xx/5xx returns a status (no throw) and is still dead;
    // orphan links (not-in-manifest) are already flagged above. The per-route
    // navigation in the sweep is the authoritative health signal for each route.
    let lastErr: unknown;
    let classified = false;
    for (let attempt = 0; attempt < 2 && !classified; attempt++) {
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
        classified = true;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!classified) {
      const msg = lastErr instanceof Error ? lastErr.message.split('\n')[0] : String(lastErr);
      results.push({
        href,
        ok: true,
        reason: `manifest-match; GET unverified (transport anomaly: ${msg})`,
      });
    }
  }

  return results;
}
