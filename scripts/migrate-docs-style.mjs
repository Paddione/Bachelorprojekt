// scripts/migrate-docs-style.mjs
// One-time migration: convert all docs subpages from old sidebar style to new topnav/skill-hero style.
// Usage: node scripts/migrate-docs-style.mjs [--dry-run]
//
// Transforms each HTML in k3d/docs-content-built/ (except index.html + skills/) by:
//   1. Swapping CSS link from ./style.css to ./skills/style.css
//   2. Replacing <div id="app"> sidebar layout with <nav class="topnav">
//   3. Converting <div class="page-hero"> to <header class="skill-hero">
//   4. Removing the duplicate <h1> that follows page-hero blocks
//   5. Removing the search overlay and keeping app.js for copy/zoom/domain features

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../k3d/docs-content-built');
const DRY_RUN = process.argv.includes('--dry-run');

// Slug → badge colour mapping (derived from index.html categories)
const BADGE_MAP = {
  'quickstart-enduser': 'badge-brass', 'quickstart-admin': 'badge-brass', 'quickstart-dev': 'badge-brass',
  'keycloak': 'badge-sage', 'nextcloud': 'badge-sage', 'collabora': 'badge-sage',
  'vaultwarden': 'badge-sage', 'website': 'badge-sage', 'livestream': 'badge-sage',
  'claude-code': 'badge-sage', 'whiteboard': 'badge-sage', 'systemisches-brett': 'badge-sage',
  'systembrett': 'badge-sage', 'mailpit': 'badge-sage', 'arena': 'badge-sage',
  'talk-hpb': 'badge-sage', 'shared-db': 'badge-sage',
  'operations': 'badge-purple', 'environments': 'badge-purple', 'backup': 'badge-purple',
  'monitoring': 'badge-purple', 'scripts': 'badge-purple',
  'security': 'badge-red', 'dsgvo': 'badge-red', 'verarbeitungsverzeichnis': 'badge-red',
  'security-report': 'badge-red',
  'architecture': 'badge-blue', 'contributing': 'badge-blue', 'tests': 'badge-blue',
  'troubleshooting': 'badge-blue', 'database': 'badge-blue', 'db-schema': 'badge-blue',
  'datamodel-workflow': 'badge-blue', 'decisions': 'badge-blue', 'migration': 'badge-blue',
  'mcp-actions': 'badge-blue', 'einvoice': 'badge-blue', 'requirements': 'badge-blue',
  'services': 'badge-blue', 'argocd': 'badge-blue',
};

const DEFAULT_BADGE = 'badge-gray';

function getBadge(slug) {
  return BADGE_MAP[slug] || DEFAULT_BADGE;
}

// Skip files that don't need migration
const SKIP = new Set(['index.html', 'skills-overview.html', 'app.js', 'style.css', 'search.json']);

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function migrateFile(filename) {
  const slug = filename.replace(/\.html$/, '');
  const filepath = join(OUT_DIR, filename);
  const src = readFileSync(filepath, 'utf8');

  // Already migrated if it uses the new CSS
  if (src.includes('href="./skills/style.css"')) {
    console.log(`  skip (already migrated): ${filename}`);
    return false;
  }

  const $ = cheerio.load(src);

  // Extract title
  const titleRaw = $('title').text().replace(/ — Workspace MVP$/, '').trim();

  // Extract raw main content (strip cheerio's <html><head><body> wrappers)
  const mainEl = $('main#main');
  if (!mainEl.length) {
    console.log(`  skip (no main#main): ${filename}`);
    return false;
  }

  // Load the inner HTML of main separately to get clean content
  const $content = cheerio.load(mainEl.html() || '', { xmlMode: false });

  // --- Hero extraction ---
  let heroHtml = '';
  const heroDiv = $content('.page-hero').first();

  if (heroDiv.length) {
    const icon = $content('.page-hero-icon').first().text().trim();
    const eyebrow = $content('.page-hero-eyebrow').first().text().trim();
    const heroTitle = $content('.page-hero-title').first().text().trim();
    const desc = $content('.page-hero-desc').first().text().trim();
    const tags = $content('.page-hero-tag').map((_, el) => $content(el).text().trim()).get();

    const badgeClass = getBadge(slug);
    const tagsHtml = tags.map(t => `    <span class="badge ${badgeClass}">${escHtml(t)}</span>`).join('\n');

    heroHtml = `<header class="skill-hero">
  <div class="hero-meta">
${tagsHtml ? tagsHtml + '\n' : ''}    <span class="badge-slug">${escHtml(slug)}</span>
  </div>
  <h1 class="hero-title">${icon ? escHtml(icon) + ' ' : ''}${escHtml(heroTitle || titleRaw)}</h1>
${desc ? `  <p class="hero-subtitle">${escHtml(desc)}</p>` : ''}
${eyebrow ? `  <div class="trigger-chip"><span class="label">${escHtml(eyebrow)}</span></div>` : ''}
</header>`;

    // Remove page-hero div and the duplicate h1 that follows
    $content('.page-hero').first().remove();
    const firstH1 = $content('h1').first();
    if (firstH1.length && firstH1.text().trim() === (heroTitle || titleRaw)) {
      firstH1.remove();
    }
  } else {
    // No page-hero: use first h1 as hero title
    const h1 = $content('h1').first();
    const heroTitle = h1.length ? h1.text().trim() : titleRaw;
    const badgeClass = getBadge(slug);

    heroHtml = `<header class="skill-hero">
  <div class="hero-meta">
    <span class="badge ${badgeClass}">${escHtml(slug.replace(/-/g, ' '))}</span>
    <span class="badge-slug">${escHtml(slug)}</span>
  </div>
  <h1 class="hero-title">${escHtml(heroTitle)}</h1>
</header>`;

    // Remove the h1 from content (it's now in the hero)
    if (h1.length) h1.first().remove();
  }

  // Get cleaned content HTML
  // cheerio.load() wraps in <html><head><body> — extract just body innerHTML
  const contentHtml = $content('body').html() || '';

  // --- Build new page ---
  const newHtml = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escHtml(titleRaw)} — Workspace MVP</title>
<link rel="stylesheet" href="./skills/style.css">
</head>
<body>

<nav class="topnav">
  <a href="./index.html" class="topnav-back">
    <span class="arrow">&#8592;</span> Übersicht
  </a>
  <span class="topnav-divider">/</span>
  <span class="topnav-title">${escHtml(slug)}</span>
</nav>

${heroHtml}

<main class="content">
${contentHtml}
</main>

<script src="./app.js"></script>
</body>
</html>`;

  if (DRY_RUN) {
    console.log(`  [dry-run] would write: ${filename}`);
    return true;
  }

  writeFileSync(filepath, newHtml, 'utf8');
  console.log(`  ✓ migrated: ${filename}`);
  return true;
}

// Main
const files = readdirSync(OUT_DIR)
  .filter(f => f.endsWith('.html') && !SKIP.has(f) && !f.startsWith('skills/'));

console.log(`Migrating ${files.length} HTML files to new style${DRY_RUN ? ' (dry-run)' : ''}...\n`);

let changed = 0;
for (const f of files) {
  const did = migrateFile(f);
  if (did) changed++;
}

console.log(`\nDone: ${changed}/${files.length} files ${DRY_RUN ? 'would be updated' : 'updated'}.`);
