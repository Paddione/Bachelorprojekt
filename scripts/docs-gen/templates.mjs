// scripts/docs-gen/templates.mjs
// Editorial page shell, provenance badges, per-section index pages, and the
// Plan-1 card-grid landing. Plan 2 OVERRIDES renderLanding to embed the graph.
//
// Output contract: every document links ./style.css (theme.mjs#editorialCss)
// and ./app.js (theme.mjs#clientJs), and is self-contained for static serving
// (joseluisq/static-web-server, read-only rootfs). Never SSR, never write fs.

import { buildGraph } from './graph-data.mjs';
import { layoutGraph } from './graph-layout.mjs';
import { renderGraphSvg } from './graph-svg.mjs';

/**
 * @typedef {Object} Page
 * @property {string} slug
 * @property {'skill'|'agent'|'doc'} type
 * @property {string} provenance      'repo' | '<plugin>@<version>'
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {string|null} domain
 * @property {string} bodyMarkdown
 * @property {string} sourcePath
 * @property {string} outRelPath
 */

/**
 * @typedef {Object} RelatedLink
 * @property {string} url
 * @property {string} title
 */

// Per-type section metadata: the section-index page each type belongs to.
// Order here is the canonical landing/breadcrumb order.
const SECTION_META = [
  { type: 'skill', indexSlug: 'skills', label: 'Skills' },
  { type: 'agent', indexSlug: 'agents', label: 'Agents' },
  { type: 'doc', indexSlug: 'docs', label: 'Docs' },
];

const SECTION_BY_TYPE = new Map(SECTION_META.map((s) => [s.type, s]));

/** HTML-escape text destined for element bodies and attribute values. */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Provenance badge markup.
 * 'repo'              -> a "repo" badge.
 * '<plugin>@<ver>'    -> a "plugin · <plugin> <version>" badge.
 * @param {string} provenance
 * @returns {string}
 */
export function provenanceBadge(provenance) {
  if (provenance === 'repo') {
    return '<span class="provenance-badge repo">repo</span>';
  }
  const at = String(provenance ?? '').lastIndexOf('@');
  const plugin = at > 0 ? provenance.slice(0, at) : String(provenance ?? '');
  const version = at > 0 ? provenance.slice(at + 1) : '';
  const versionPart = version ? ` <span class="pv-ver">${esc(version)}</span>` : '';
  return (
    '<span class="provenance-badge plugin">plugin · ' +
    `<span class="pv-name">${esc(plugin)}</span>${versionPart}</span>`
  );
}

/** Domain pill (omitted when domain is null/empty). */
function domainTag(domain) {
  if (!domain) return '';
  return `<span class="domain-tag">${esc(domain)}</span>`;
}

/**
 * Asset path prefix for a page.
 * Pages in a subdirectory (skills/, agents/) must navigate up one level to
 * reach root-level assets (style.css, app.js, index.html).
 * @param {string} outRelPath  e.g. 'agents/foo.html' or 'foo.html'
 * @returns {'./'|'../'}
 */
function assetPrefix(outRelPath) {
  return outRelPath.includes('/') ? '../' : './';
}

/** The shared <head> + opening body, including the search overlay shell. */
function documentHead(titleText, prefix) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(titleText)} — Workspace MVP</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${prefix}style.css">
</head>
<body>
<header class="site-header">
  <a class="site-header-brand" href="${prefix}index.html">
    <span class="site-mark" aria-hidden="true">◆</span>
    <span class="site-wordmark">Dokumentation</span>
  </a>
</header>
<div id="search-overlay">
  <div id="search-box">
    <input id="search-input" type="text" placeholder="Suchen… (Esc schließt)" autocomplete="off">
    <div id="search-results"></div>
  </div>
</div>`;
}

/** The shared closing markup (client JS). */
function documentTail(prefix) {
  return `<footer class="site-footer">
  <span>Workspace MVP — generierte Dokumentation</span>
</footer>
<script src="${prefix}app.js"></script>
</body>
</html>`;
}

/** Breadcrumb trail: landing → section index → current page. */
function breadcrumbs(page, prefix) {
  const section = SECTION_BY_TYPE.get(page.type);
  const crumbs = [`<a href="${prefix}index.html">Übersicht</a>`];
  if (section) {
    crumbs.push(
      `<a href="${prefix}${section.indexSlug}.html">${esc(section.label)}</a>`,
    );
  }
  crumbs.push(`<span class="crumb-current">${esc(page.title)}</span>`);
  return `<nav class="breadcrumbs">${crumbs.join(' <span class="sep">/</span> ')}</nav>`;
}

/** Related-links footer; empty string when there are no related links. */
function relatedFooter(related) {
  if (!Array.isArray(related) || related.length === 0) return '';
  const items = related
    .map(
      (r) =>
        `<li><a href="${esc(r.url)}">${esc(r.title)}</a></li>`,
    )
    .join('\n');
  return `<footer class="related-footer">
  <div class="related-title">Verwandt</div>
  <ul class="related-list">
${items}
  </ul>
</footer>`;
}

/**
 * Full editorial document for a single page.
 * contentHtml already contains the TOC + heading ids (from render-markdown).
 * The FULL description is rendered (escaped only) — never truncated here.
 * `toc` is a pre-rendered HTML STRING (render-markdown already injects the TOC
 * into contentHtml); it is interpolated as-is and never treated as an array.
 * @param {{ page: Page, contentHtml: string, toc?: string, related?: RelatedLink[] }} args
 * @returns {string}
 */
export function renderPage({ page, contentHtml, toc, related }) {
  const prefix = assetPrefix(page.outRelPath);
  const header = `<header class="page-header">
  <div class="page-header-body">
    ${breadcrumbs(page, prefix)}
    <h1>${esc(page.title)}</h1>
    <p class="page-desc">${esc(page.description)}</p>
    <div class="page-meta">
      ${provenanceBadge(page.provenance)}
      ${domainTag(page.domain)}
    </div>
  </div>
</header>`;

  return `${documentHead(page.title, prefix)}
<div id="app">
  <main id="main">
${header}
${toc ?? ''}
<article class="doc-body">
${contentHtml}
</article>
${relatedFooter(related)}
  </main>
</div>
${documentTail(prefix)}`;
}

/** A single card linking a page (its provenance badge + description). */
function pageCard(page) {
  return `<a class="section-card" href="./${esc(page.outRelPath)}">
  <span class="section-card-head">
    <span class="section-card-title">${esc(page.title)}</span>
    ${provenanceBadge(page.provenance)}${domainTag(page.domain)}
  </span>
  <span class="section-card-desc">${esc(page.description)}</span>
</a>`;
}

/**
 * A per-section index page (card grid of pages of one type).
 * @param {{ type: 'skill'|'agent'|'doc', title: string, pages: Page[] }} args
 * @returns {string}
 */
export function renderSectionIndex({ type, title, pages }) {
  const cards = pages.map(pageCard).join('\n');
  const header = `<header class="page-header">
  <div class="page-header-body">
    <nav class="breadcrumbs"><a href="./index.html">Übersicht</a> <span class="sep">/</span> <span class="crumb-current">${esc(title)}</span></nav>
    <h1>${esc(title)}</h1>
    <p class="page-desc">${pages.length} ${esc(type)} pages</p>
  </div>
</header>`;

  return `${documentHead(title, './')}
<div id="app">
  <main id="main">
${header}
<section class="section-grid">
${cards}
</section>
  </main>
</div>
${documentTail('./')}`;
}

/**
 * Render the landing page: an editorial hero with the interactive domain-clustered
 * relationship graph as the centrepiece, plus a <noscript>-friendly fallback that
 * lists the sections (skills/agents/docs) with counts so the page is usable without JS.
 *
 * Signature change (Plan 2, IC-4): supersedes the Plan-1 `renderLanding({ pages, registry })`
 * card-grid landing. `edges` and `routingRows` are required to build the graph.
 *
 * @param {object} args
 * @param {Page[]} args.pages
 * @param {object} args.registry
 * @param {Array<{from:string,to:string,kind?:string}>} args.edges
 * @param {Array<{signals:string[],agent:string}>} args.routingRows
 * @returns {string} full HTML5 document
 */
export function renderLanding({ pages, registry: _registry, edges = [], routingRows = [] }) {
  const graph = buildGraph(pages, edges, routingRows);
  const layout = layoutGraph(graph, { width: 1200, height: 760 });
  const svg = renderGraphSvg(layout);

  const sections = [
    { type: 'skill', title: 'Skills', indexPath: './skills.html' },
    { type: 'agent', title: 'Agents', indexPath: './agents.html' },
    { type: 'doc', title: 'Docs', indexPath: './docs.html' },
  ];

  const fallback = sections.map((section) => {
    const items = pages.filter((p) => p.type === section.type);
    const links = items
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((p) => `        <li><a href="./${esc(p.outRelPath)}">${esc(p.title)}</a></li>`)
      .join('\n');
    return `    <section class="fallback-section">
      <h2><a href="${section.indexPath}">${section.title} (${items.length})</a></h2>
      <ul>
${links}
      </ul>
    </section>`;
  }).join('\n');

  const header = `<header class="page-header landing-hero">
  <div class="page-header-body">
    <p class="kicker">Workspace MVP</p>
    <h1>Dokumentation</h1>
    <p class="page-desc">Eine interaktive, nach Domänen geclusterte Karte aller Skills, Agents und Docs. Knoten überfahren hebt die Nachbarn hervor, Klick öffnet die Seite, Scrollen zoomt, Ziehen verschiebt. Klick auf den Hintergrund setzt zurück.</p>
  </div>
</header>`;

  return `${documentHead('Dokumentation', './')}
<div id="app">
  <main id="main">
${header}
<section class="graph-hero" aria-label="Relationship graph">
  <div class="graph-container" id="docs-graph">
${svg}
  </div>
</section>
<noscript>
  <p class="noscript-note">Der interaktive Graph benötigt JavaScript. Stattdessen nach Bereich browsen:</p>
${fallback}
</noscript>
  </main>
</div>
${documentTail('./')}`;
}
