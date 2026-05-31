// scripts/docs-gen/templates.mjs
// Editorial page shell, provenance badges, per-section index pages, and the
// Plan-1 card-grid landing. Plan 2 OVERRIDES renderLanding to embed the graph.
//
// Output contract: every document links ./style.css (theme.mjs#editorialCss)
// and ./app.js (theme.mjs#clientJs), and is self-contained for static serving
// (joseluisq/static-web-server, read-only rootfs). Never SSR, never write fs.

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

/** The shared <head> + opening body, including the search overlay shell. */
function documentHead(titleText) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(titleText)} — Workspace MVP</title>
<link rel="stylesheet" href="./style.css">
</head>
<body>
<div id="search-overlay">
  <div id="search-box">
    <input id="search-input" type="text" placeholder="Suchen… (Esc schließt)" autocomplete="off">
    <div id="search-results"></div>
  </div>
</div>`;
}

/** The shared closing markup (client JS). */
function documentTail() {
  return `<script src="./app.js"></script>
</body>
</html>`;
}

/** Breadcrumb trail: landing → section index → current page. */
function breadcrumbs(page) {
  const section = SECTION_BY_TYPE.get(page.type);
  const crumbs = [`<a href="./index.html">Übersicht</a>`];
  if (section) {
    crumbs.push(
      `<a href="./${section.indexSlug}.html">${esc(section.label)}</a>`,
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
  const header = `<header class="page-header">
  <div class="page-header-body">
    ${breadcrumbs(page)}
    <h1>${esc(page.title)}</h1>
    <p class="page-desc">${esc(page.description)}</p>
    <div class="page-meta">
      ${provenanceBadge(page.provenance)}
      ${domainTag(page.domain)}
    </div>
  </div>
</header>`;

  return `${documentHead(page.title)}
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
${documentTail()}`;
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

  return `${documentHead(title)}
<div id="app">
  <main id="main">
${header}
<section class="section-grid">
${cards}
</section>
  </main>
</div>
${documentTail()}`;
}

/**
 * Plan-1 landing: an editorial card-grid hub grouped by type, with counts.
 * Plan 2 OVERRIDES this export to embed the relationship graph.
 * @param {{ pages: Page[], registry: object }} args
 * @returns {string}
 */
export function renderLanding({ pages, registry: _registry }) {
  const counts = new Map(SECTION_META.map((s) => [s.type, 0]));
  for (const p of pages) {
    if (counts.has(p.type)) counts.set(p.type, counts.get(p.type) + 1);
  }

  const groups = SECTION_META.map((s) => {
    const n = counts.get(s.type) ?? 0;
    return `<a class="section-card" href="./${s.indexSlug}.html">
  <span class="section-card-head">
    <span class="section-card-title">${esc(s.label)} <span class="count-badge">${n}</span></span>
  </span>
  <span class="section-card-desc">${n} ${esc(s.label)} dokumentiert</span>
  <span class="arrow">Öffnen →</span>
</a>`;
  }).join('\n');

  const total = pages.length;
  const header = `<header class="page-header landing-hero">
  <div class="page-header-body">
    <p class="kicker">Workspace MVP</p>
    <h1>Dokumentation</h1>
    <p class="page-desc">${total} Seiten über Skills, Agents und Docs — durchsuchbar mit Strg/Cmd + K.</p>
  </div>
</header>`;

  return `${documentHead('Dokumentation')}
<div id="app">
  <main id="main">
${header}
<section class="section-grid landing-tracks">
${groups}
</section>
  </main>
</div>
${documentTail()}`;
}
