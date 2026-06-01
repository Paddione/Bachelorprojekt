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
