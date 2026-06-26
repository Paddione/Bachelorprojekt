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
const EXCLUDE_PREFIXES = ['/admin/systemtest', '/admin/brett'];
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
