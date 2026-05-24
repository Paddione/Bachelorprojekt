#!/usr/bin/env node
/**
 * sync-skill-docs.mjs
 *
 * Scans .claude/skills/ for SKILL.md files and generates docs/skills/<name>.html
 * for any skill that doesn't already have a hand-crafted page.
 *
 * Also regenerates the SVG mini-map and sidebar list inside
 * docs/skills-overview.html to match the actual docs/skills/ inventory.
 *
 * Usage:
 *   node scripts/sync-skill-docs.mjs          # sync + regenerate overview
 *   node scripts/sync-skill-docs.mjs --check  # exit 1 if anything is missing
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const SKILLS_SRC = join(ROOT, '.claude/skills');
const DOCS_SKILLS = join(ROOT, 'docs/skills');
const OVERVIEW   = join(ROOT, 'docs/skills-overview.html');
const CHECK_ONLY = process.argv.includes('--check');

// ── Category data ────────────────────────────────────────────────────────────

const CAT_META = {
  devflow:  { label: 'DevFlow',  badge: 'badge-brass',  color: '#d4af37', bg: '#1a1300', dim: '#8a7126' },
  infra:    { label: 'Infra',    badge: 'badge-sage',   color: '#86a68d', bg: '#0a1a0f', dim: '#5a7360' },
  db:       { label: 'Database', badge: 'badge-blue',   color: '#82aaff', bg: '#0a0a20', dim: '#4a6bbd' },
  security: { label: 'Security', badge: 'badge-red',    color: '#ff757f', bg: '#1e0a0a', dim: '#b34b52' },
  ops:      { label: 'Ops',      badge: 'badge-purple', color: '#c099ff', bg: '#110d1e', dim: '#7a59b3' },
  support:  { label: 'Support',  badge: 'badge-gray',   color: '#94a3b8', bg: '#140a0a', dim: '#475569' },
  plugin:   { label: 'Plugin',   badge: 'badge-purple', color: '#c099ff', bg: '#110d1e', dim: '#7a59b3' },
};

// Build slug→category map from the overview's main <section data-cat="…"> cards.
// This is the authoritative source; badge classes in individual files are inconsistent.
function buildCategoryMapFromOverview() {
  if (!existsSync(OVERVIEW)) return {};
  const html = readFileSync(OVERVIEW, 'utf8');
  const map = {};
  // Match each <section ... data-cat="CAT"> block and extract data-skill values inside it
  for (const [, cat, block] of html.matchAll(/<section[^>]*\bdata-cat="([^"]+)"[^>]*>([\s\S]*?)<\/section>/g)) {
    for (const [, slug] of block.matchAll(/\bdata-skill="([^"]+)"/g)) {
      map[slug] = cat;
    }
  }
  return map;
}

// ── SKILL.md discovery ────────────────────────────────────────────────────────

function discoverSkills() {
  const skills = [];
  for (const entry of readdirSync(SKILLS_SRC).sort()) {
    const dir = join(SKILLS_SRC, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (entry === 'superpowers') {
      for (const sub of readdirSync(dir).sort()) {
        const subDir = join(dir, sub);
        if (!statSync(subDir).isDirectory()) continue;
        const md = join(subDir, 'SKILL.md');
        if (existsSync(md)) skills.push({ name: sub, mdPath: md });
      }
    } else {
      const md = join(dir, 'SKILL.md');
      if (existsSync(md)) skills.push({ name: entry, mdPath: md });
    }
  }
  return skills;
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { body: content };
  const yaml = m[1];
  const meta = {};
  for (const line of yaml.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { ...meta, body: content.slice(m[0].length).trimStart() };
}

// ── HTML generator for auto-pages ────────────────────────────────────────────

const COPY_SCRIPT = `\n<script>
document.querySelectorAll('pre').forEach(pre => {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'copy';
  btn.onclick = () => {
    navigator.clipboard.writeText(pre.innerText).then(() => {
      btn.textContent = 'copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 2000);
    });
  };
  pre.appendChild(btn);
});
</script>`;

function generateSkillHtml(name, cat, description, body) {
  const { label, badge } = CAT_META[cat] ?? CAT_META.ops;
  // Derive human title from first # heading or capitalise name
  const headingMatch = body.match(/^#\s+(.+)/m);
  const title = headingMatch ? headingMatch[1].trim() : name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Strip SKILL.md boilerplate (mishap tracking block)
  const cleaned = body.replace(/^>\s+\*\*Mishap Tracking:?\*\*[\s\S]*?(?=\n#|\n---|\n\w)/m, '').trimStart();

  const contentHtml = marked.parse(cleaned);

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} — ${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

<nav class="topnav">
  <a href="../skills-overview.html" class="topnav-back">
    <span class="arrow">&#8592;</span> Alle Skills
  </a>
  <span class="topnav-divider">/</span>
  <span class="topnav-title">${name}</span>
  <div class="topnav-right">
    <span class="badge ${badge}">${label}</span>
  </div>
</nav>

<header class="skill-hero">
  <div class="hero-meta">
    <span class="badge ${badge}">${label}</span>
    <span class="badge-slug">${name}</span>
  </div>
  <h1 class="hero-title">${title}</h1>
  <p class="hero-subtitle">${description || ''}</p>
</header>

<main class="content">
${contentHtml}
</main>

<footer>
  <span>Skills Übersicht / <code>.claude/skills/${name}/SKILL.md</code></span>
  <a href="../skills-overview.html">← Zurück zur Übersicht</a>
</footer>
${COPY_SCRIPT}
</body>
</html>`;
}

// ── Overview SVG + mini-list regeneration ────────────────────────────────────

// Build skill inventory from docs/skills/*.html, deriving categories from the overview sections.
function inventoryFromDocs() {
  const catMap = buildCategoryMapFromOverview();
  const skills = [];
  for (const file of readdirSync(DOCS_SKILLS).sort()) {
    if (!file.endsWith('.html')) continue;
    const slug = file.replace('.html', '');
    if (slug === 'docs-to-html') continue; // plugin page, exclude from auto-map
    const cat = catMap[slug] ?? 'ops';
    skills.push({ slug, cat });
  }
  return skills;
}

// SVG layout: auto-positions skills in a 3-column grid by category.
// Returns <svg>...</svg> string.
function generateSvg(skills) {
  const order = ['devflow', 'db', 'security', 'infra', 'ops', 'support'];
  const cols = [
    ['devflow', 'db', 'security', 'support'],
    ['ops'],
    ['infra'],
  ];
  // Assign column + row for each skill
  const colSkills = [[], [], []];
  for (const { slug, cat } of skills) {
    let placed = false;
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].includes(cat)) { colSkills[c].push({ slug, cat }); placed = true; break; }
    }
    if (!placed) colSkills[1].push({ slug, cat }); // fallback to col 2
  }

  const colX   = [34, 109, 176];
  const nodeH  = 20;
  const gapY   = 11;
  const startY = 6;

  const nodesSvg = [];
  const edgesSvg = [];
  const positions = {};

  for (let c = 0; c < 3; c++) {
    let y = startY;
    let prevY = null;
    let prevCat = null;
    for (const { slug, cat } of colSkills[c]) {
      const cx = colX[c];
      const { color, bg, dim } = CAT_META[cat] ?? CAT_META.ops;
      const cy = y + nodeH / 2;
      positions[slug] = { cx, cy, y };

      // Edge from previous in same column (same category chain)
      if (prevY !== null && prevCat === cat) {
        edgesSvg.push(
          `  <line x1="${cx}" y1="${prevY + nodeH}" x2="${cx}" y2="${y}" stroke="${color}" stroke-width="1" marker-end="url(#arr-${cat})"/>`
        );
      }

      // Two-line label for long slugs
      const parts = slug.split('-');
      const mid = Math.ceil(parts.length / 2);
      const line1 = parts.slice(0, mid).join('-');
      const line2 = parts.slice(mid).join('-');
      const textY1 = line2 ? y + 8  : y + 12;
      const textY2 = y + 16;
      const textSize = slug.length > 14 ? '4.8' : '5.5';

      nodesSvg.push(`  <g class="net-node" data-skill="${slug}" data-cat="${cat}">
    <rect x="${cx - 30}" y="${y}" width="61" height="${nodeH}" rx="3" fill="${bg}" stroke="${color}" stroke-width="${cat === 'devflow' ? '1.5' : '1'}"/>
    <text x="${cx}" y="${textY1}" text-anchor="middle" font-size="${textSize}" fill="${color}" font-weight="${cat === 'devflow' ? '700' : '400'}">${line1}</text>
    ${line2 ? `<text x="${cx}" y="${textY2}" text-anchor="middle" font-size="${textSize}" fill="${color}">${line2}</text>` : ''}
  </g>`);

      prevY   = y;
      prevCat = cat;
      y += nodeH + gapY;
    }
  }

  const totalH = Math.max(...colSkills.map((col, i) => col.length * (nodeH + gapY) + startY));
  const viewH  = Math.max(totalH + 10, 100);

  // Arrow markers
  const markers = Object.entries(CAT_META).map(([cat, { color }]) =>
    `    <marker id="arr-${cat}" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5Z" fill="${color}"/></marker>`
  ).join('\n');

  return `<svg viewBox="0 0 210 ${viewH}" xmlns="http://www.w3.org/2000/svg" aria-label="Skill Netzplan">
  <defs>
${markers}
  </defs>
${edgesSvg.join('\n')}
${nodesSvg.join('\n')}
</svg>`;
}

// Mini list HTML
function generateMiniList(skills) {
  const groups = {};
  for (const { slug, cat } of skills) {
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(slug);
  }
  const order = ['devflow', 'infra', 'db', 'security', 'ops', 'support'];
  let html = '';
  for (const cat of order) {
    if (!groups[cat]?.length) continue;
    const { label } = CAT_META[cat];
    html += `      <div class="ov-sb-list-section">\n`;
    html += `        <span class="ov-sbl-head">${label}</span>\n`;
    for (const slug of groups[cat]) {
      html += `        <span class="ov-sbl-item" data-skill="${slug}">${slug}</span>\n`;
    }
    html += `      </div>\n`;
  }
  return html;
}

// Replaces SVG + mini-list blocks in overview HTML in-place
function patchOverview(skills) {
  let html = readFileSync(OVERVIEW, 'utf8');

  // Replace SVG block
  const svgNew = generateSvg(skills);
  html = html.replace(
    /<svg[\s\S]*?<\/svg>/,
    svgNew
  );

  // Replace mini-list block (between <div class="ov-sb-list"> and </div>)
  const miniNew = generateMiniList(skills);
  html = html.replace(
    /(<div class="ov-sb-list">)[\s\S]*?(<\/div>)/,
    `$1\n${miniNew}    $2`
  );

  writeFileSync(OVERVIEW, html, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const claimedSkills = discoverSkills();
  const missing = [];

  for (const { name, mdPath } of claimedSkills) {
    const htmlPath = join(DOCS_SKILLS, `${name}.html`);
    if (existsSync(htmlPath)) continue;
    missing.push(name);
    if (CHECK_ONLY) continue;

    const raw = readFileSync(mdPath, 'utf8');
    const { name: _, description, body } = parseFrontmatter(raw);
    const cat = 'ops'; // default for new; update manually or add frontmatter `category:` field
    const html = generateSkillHtml(name, cat, description ?? '', body ?? '');
    writeFileSync(htmlPath, html, 'utf8');
    console.log(`  → generated docs/skills/${name}.html`);
  }

  if (CHECK_ONLY) {
    if (missing.length) {
      console.error(`✗ ${missing.length} skill(s) missing HTML docs: ${missing.join(', ')}`);
      process.exit(1);
    }
    console.log('✓ All skills have HTML docs');
    process.exit(0);
  }

  // Patch overview SVG + mini list from actual inventory
  const inventory = inventoryFromDocs();
  patchOverview(inventory);
  console.log(`  → skills-overview.html SVG + mini-list updated (${inventory.length} skills)`);

  if (missing.length) {
    console.log(`  → generated ${missing.length} new page(s): ${missing.join(', ')}`);
    console.log('  ℹ  New pages default to "ops" category — set category: in SKILL.md frontmatter to override');
  } else {
    console.log('  ✓ No new skill pages needed');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
