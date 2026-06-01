// scripts/build-route-manifest.mjs
// CLI: enumerate website/src/pages + brand service slugs -> website/src/data/route-manifest.json
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildManifest } from './lib/route-manifest.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIR = join(REPO_ROOT, 'website/src/pages');
const OUT = join(REPO_ROOT, 'website/src/data/route-manifest.json');

// Extract service slugs from the TS brand configs.
// Primary: execute the configs via the repo-local tsx (most accurate). Fallback
// (e.g. CI, which installs only root deps — no website node_modules / tsx): scan
// the TS source for literal `slug: '...'`. The brand configs declare `slug:` ONLY
// for top-level services, so the scan yields the same set tsx would; the manifest
// is sorted, so order is irrelevant. This keeps the CI drift guard self-contained
// (no website install required) while staying byte-identical to the tsx output.
function loadBrandSlugsViaTsx() {
  const tsx = join(REPO_ROOT, 'website/node_modules/.bin/tsx');
  if (!existsSync(tsx)) return null;
  const snippet = `
    import { mentolderConfig } from './website/src/config/brands/mentolder.ts';
    import { korczewskiConfig } from './website/src/config/brands/korczewski.ts';
    const pick = (c) => ({ services: c.services.map((s) => ({ slug: s.slug })) });
    process.stdout.write(JSON.stringify({
      mentolder: pick(mentolderConfig),
      korczewski: pick(korczewskiConfig),
    }));
  `;
  try {
    const json = execFileSync(tsx, ['--eval', snippet], { cwd: REPO_ROOT, encoding: 'utf8' });
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function extractSlugsFromSource(relPath) {
  const src = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  const re = /slug\s*:\s*['"]([^'"]+)['"]/g;
  const services = [];
  let m;
  while ((m = re.exec(src)) !== null) services.push({ slug: m[1] });
  return { services };
}

function loadBrandSlugs() {
  const viaTsx = loadBrandSlugsViaTsx();
  if (viaTsx) return viaTsx;
  return {
    mentolder: extractSlugsFromSource('website/src/config/brands/mentolder.ts'),
    korczewski: extractSlugsFromSource('website/src/config/brands/korczewski.ts'),
  };
}

const brands = loadBrandSlugs();
const manifest = buildManifest(PAGES_DIR, brands);
writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(
  `Wrote ${manifest.count} page files -> ${manifest.routes.length} sweep routes to ${OUT}`,
);
