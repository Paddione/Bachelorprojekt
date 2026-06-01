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
  assert.equal(manifest.count, 99); // page-file count (enumerated, pre-service-expansion)
  assert.ok(Array.isArray(manifest.routes));
  // /[service] literal is NOT emitted
  assert.ok(!manifest.routes.some((r) => r.route === '/[service]'),
    '/[service] literal must be expanded, not emitted');
  // expanded service routes present + brand-tagged
  assert.ok(manifest.routes.some((r) => r.route === '/50plus-digital' && r.brand === 'mentolder'));
  assert.ok(manifest.routes.some((r) => r.route === '/ki-beratung' && r.brand === 'korczewski'));
});

test('buildManifest: tier split admin=68 portal=9 public=22 over page files', () => {
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
  assert.equal(admin, 68, 'admin tier page files');
  assert.equal(portal, 9, 'portal tier page files');
  assert.equal(publicLiterals + serviceContributes, 22, 'public tier page files incl /[service]');
});

test('buildManifest: excludeFromSweep flags set for arena/systemtest/brett', () => {
  const manifest = buildManifest(PAGES, FIXTURE_BRANDS);
  const find = (route) => manifest.routes.find((r) => r.route === route);
  assert.equal(find('/portal/arena')?.excludeFromSweep, true);
  // NB: the systemtest subtree is a directory (admin/systemtest/board.astro) — the
  // real page route is /admin/systemtest/board, excluded via the /admin/systemtest
  // prefix. (Plan pinned a stale /admin/systemtest literal; reconciled to reality.)
  assert.equal(find('/admin/systemtest/board')?.excludeFromSweep, true);
  assert.equal(find('/admin/brett/[...path]')?.excludeFromSweep, true);
  // a normal route is NOT excluded
  assert.equal(find('/ueber-mich')?.excludeFromSweep, false);
});
