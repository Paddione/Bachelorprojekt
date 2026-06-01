// tests/e2e/lib/build-gallery.mjs
// Reads tests/results/visual-sweep/<brand>/results-<viewport>.json + the captured
// PNGs and emits a single self-contained contact-sheet at
// tests/results/visual-sweep/index.html. Grouped brand->section, mentolder vs
// korczewski side-by-side where a route exists in both, desktop+mobile per route,
// each cell labelled with route + status + nav/link-health. Prints the absolute
// index.html path on success. Pure read/render — never touches a cluster or DB.
//
// Run: node lib/build-gallery.mjs   (cwd = tests/e2e)
import {
  readFileSync, writeFileSync, readdirSync, existsSync, statSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// lib -> tests/e2e -> tests -> repo root
const REPO_ROOT = join(__dirname, '..', '..', '..');
const SWEEP_DIR = join(REPO_ROOT, 'tests', 'results', 'visual-sweep');
const OUT_FILE = join(SWEEP_DIR, 'index.html');

const BRANDS = ['mentolder', 'korczewski'];
const VIEWPORTS = ['desktop', 'mobile'];

function safeReadJson(file) {
  try {
    if (!existsSync(file)) return null;
    const txt = readFileSync(file, 'utf8').trim();
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (err) {
    console.error(`[build-gallery] WARN: could not parse ${file}: ${err.message}`);
    return null;
  }
}

function loadResults() {
  const out = {};
  for (const brand of BRANDS) {
    out[brand] = {};
    for (const vp of VIEWPORTS) {
      const file = join(SWEEP_DIR, brand, `results-${vp}.json`);
      const rows = safeReadJson(file);
      out[brand][vp] = Array.isArray(rows) ? rows : [];
    }
  }
  return out;
}

// safeRoute per shared contract: "/"->"index", else trim leading slash,
// "/"->"__", strip "[" "]". Only used as an existence fallback when a row
// is missing its `screenshot` field.
function safeRoute(route) {
  if (route === '/') return 'index';
  let s = route.replace(/\//g, '__');
  s = s.replace(/^__/, '');
  s = s.replace(/[[\]]/g, '');
  return s === '' ? 'index' : s;
}

function screenshotRel(row, brand, vp) {
  // Robust to any screenshot-path convention in the results file: try the stored
  // path both repo-root-relative and sweep-dir-relative, then ALWAYS fall back to
  // recomputing the canonical layout from the route. This prevents a path-prefix
  // mismatch from silently producing an empty (image-less) gallery.
  const candidates = [];
  if (row.screenshot) {
    candidates.push(join(REPO_ROOT, row.screenshot)); // canonical: repo-root-relative
    candidates.push(join(SWEEP_DIR, row.screenshot));  // lenient: sweep-dir-relative
  }
  candidates.push(join(SWEEP_DIR, brand, vp, `${safeRoute(row.route)}.png`)); // recompute
  for (const abs of candidates) {
    // index.html lives in SWEEP_DIR; make the <img src> relative to that.
    if (existsSync(abs)) return relative(SWEEP_DIR, abs).split('\\').join('/');
  }
  return null;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function indexByRoute(brandRows) {
  const byRoute = {};
  for (const vp of VIEWPORTS) {
    for (const row of brandRows[vp] || []) {
      byRoute[row.route] = byRoute[row.route] || {};
      byRoute[row.route][vp] = row;
    }
  }
  return byRoute;
}

// Ordered union of routes across both brands. Routes a brand swept first
// (mentolder) lead, then any korczewski-only routes, each first-seen-wins.
function unionRoutes(indexed) {
  const seen = new Set();
  const ordered = [];
  for (const brand of BRANDS) {
    for (const route of Object.keys(indexed[brand] || {})) {
      if (!seen.has(route)) { seen.add(route); ordered.push(route); }
    }
  }
  return ordered;
}

function statusBadge(row) {
  if (!row) return '<span class="badge badge-missing">—</span>';
  const s = esc(row.status || 'unknown');
  const extra = row.status === 'redirect' && row.redirectedTo
    ? ` → ${esc(row.redirectedTo)}`
    : (row.reason ? ` (${esc(row.reason)})` : '');
  return `<span class="badge badge-${s}">${s}${extra}</span>`;
}

function healthSummary(row) {
  if (!row) return '';
  const navFails = Array.isArray(row.navFailures) ? row.navFailures.length : 0;
  const dead = Array.isArray(row.deadLinks) ? row.deadLinks.length : 0;
  const parts = [];
  parts.push(navFails === 0
    ? '<span class="health ok">nav ok</span>'
    : `<span class="health bad" title="${esc(JSON.stringify(row.navFailures))}">nav ${navFails} fail</span>`);
  parts.push(dead === 0
    ? '<span class="health ok">links ok</span>'
    : `<span class="health bad" title="${esc(JSON.stringify(row.deadLinks))}">${dead} dead</span>`);
  return `<div class="health-row">${parts.join('')}</div>`;
}

function renderViewportCell(row, brand, vp) {
  const rel = row ? screenshotRel(row, brand, vp) : null;
  const img = rel
    ? `<a href="${esc(rel)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(rel)}" alt="${esc(brand)} ${esc(vp)} ${esc(row.route)}"></a>`
    : '<div class="noshot">no screenshot</div>';
  return `
    <figure class="vp vp-${vp}">
      <figcaption>${esc(vp)} ${statusBadge(row)}</figcaption>
      ${img}
      ${healthSummary(row)}
    </figure>`;
}

function renderBrandCell(brandIndex, brand, route) {
  const entry = brandIndex[route];
  if (!entry) {
    return `<td class="brand-cell empty"><div class="not-in-brand">not in ${esc(brand)}</div></td>`;
  }
  return `<td class="brand-cell">
    ${renderViewportCell(entry.desktop, brand, 'desktop')}
    ${renderViewportCell(entry.mobile, brand, 'mobile')}
  </td>`;
}

const STYLE = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#0f1115;color:#e6e8ec;font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
header.top{padding:20px 28px;border-bottom:1px solid #232733;position:sticky;top:0;background:#0f1115;z-index:5}
header.top h1{margin:0 0 4px;font-size:20px}
.summary{color:#9aa3b2;font-size:13px}
main{padding:24px 28px}
table.sweep{width:100%;border-collapse:collapse;margin-bottom:40px}
table.sweep th{position:sticky;top:78px;background:#161a22;text-align:left;padding:10px 12px;border-bottom:2px solid #2a3140;font-size:13px}
table.sweep td{vertical-align:top;border-bottom:1px solid #1c2029;padding:10px 12px;width:42%}
td.route-cell{width:16%;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#cdd3dd;word-break:break-all}
.brand-cell{display:flex;flex-direction:row;gap:12px;flex-wrap:wrap}
.brand-cell.empty{display:table-cell}
figure.vp{margin:0;flex:1 1 280px;min-width:240px;background:#12151c;border:1px solid #232733;border-radius:8px;padding:8px}
figure.vp figcaption{font-size:11px;color:#9aa3b2;margin-bottom:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
figure.vp img{width:100%;height:auto;display:block;border-radius:4px;border:1px solid #1c2029}
figure.vp-mobile{flex:0 0 160px;min-width:140px}
.noshot,.not-in-brand{color:#6b7280;font-size:12px;padding:24px 8px;text-align:center;border:1px dashed #2a3140;border-radius:6px}
.badge{font-size:10px;font-weight:600;padding:1px 6px;border-radius:10px;text-transform:uppercase;letter-spacing:.4px}
.badge-ok{background:#16361f;color:#5fd07a}
.badge-redirect{background:#3a2f12;color:#e0b94a}
.badge-skip{background:#23262e;color:#9aa3b2}
.badge-timeout{background:#3a2412;color:#e08a4a}
.badge-error{background:#3a1517;color:#ef6b73}
.badge-missing,.badge-unknown{background:#23262e;color:#6b7280}
.health-row{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
.health{font-size:10px;padding:1px 5px;border-radius:6px}
.health.ok{background:#16361f;color:#5fd07a}
.health.bad{background:#3a1517;color:#ef6b73;cursor:help}
a{color:inherit}
`;

function brandSection(indexed, route) {
  return `<tr>
    <td class="route-cell">${esc(route)}</td>
    ${renderBrandCell(indexed.mentolder, 'mentolder', route)}
    ${renderBrandCell(indexed.korczewski, 'korczewski', route)}
  </tr>`;
}

function summaryLine(results) {
  const counts = {};
  let total = 0;
  for (const brand of BRANDS) {
    for (const vp of VIEWPORTS) {
      for (const row of results[brand][vp]) {
        total += 1;
        counts[row.status] = (counts[row.status] || 0) + 1;
      }
    }
  }
  const parts = Object.entries(counts).map(([k, v]) => `${esc(k)}: ${v}`);
  return `${total} captures — ${parts.join(' · ') || 'none'}`;
}

function renderHtml(results) {
  const indexed = {};
  for (const brand of BRANDS) indexed[brand] = indexByRoute(results[brand]);
  const routes = unionRoutes(indexed);

  const rows = routes.length
    ? routes.map((r) => brandSection(indexed, r)).join('\n')
    : '<tr><td colspan="3" style="padding:40px;text-align:center;color:#6b7280">No sweep results found. Run task test:e2e:visual-sweep first.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Visual Sweep — Contact Sheet</title>
<style>${STYLE}</style>
</head><body>
<header class="top">
  <h1>Visual Sweep — Contact Sheet</h1>
  <div class="summary">${esc(summaryLine(results))} · generated ${esc(new Date().toISOString())}</div>
</header>
<main>
  <table class="sweep">
    <thead><tr><th>route</th><th>mentolder</th><th>korczewski</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</main>
</body></html>`;
}

function main() {
  const results = loadResults();
  const html = renderHtml(results);
  writeFileSync(OUT_FILE, html, 'utf8');
  // Absolute path is the contract: the Taskfile + humans open this directly.
  console.log(OUT_FILE);
}

main();
