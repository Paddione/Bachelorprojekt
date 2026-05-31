// scripts/docs-gen/render-markdown.mjs
//
// Per-page markdown → HTML renderer for the docs generator.
//
// Pipeline (renderMarkdown):
//   marked.parse(markdown)
//     → rewriteCrossLinks   (resolve [[name]] and relative .md links via registry)
//     → renderDiagrams      (mermaid via mmdc, dot via graphviz; graceful fallback)
//     → addHeadingIds       (German-umlaut-safe slug ids on h2)
//     → injectCopyButtons   (wrap pre/code, add a Copy button; skip diagram fallbacks)
//     → inject TOC after the first h1 when there are >= 2 h2 headings
//
// Returns { html, headings, unresolved, diagramFallbacks }.
//
// Binary paths (mmdc / dot) are injectable via the options arg for testability:
//   renderMarkdown(md, { registry, page, mmdc, dot })
//   renderDiagrams(html, { mmdc, dot })
// Defaults: mmdc → node_modules/.bin/mmdc (lifted from build-docs.js), dot → 'dot' (PATH lookup).

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { marked } from 'marked';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default mmdc path — same location build-docs.js used. */
const DEFAULT_MMDC = join(__dirname, '../../node_modules/.bin/mmdc');
/** Default dot is resolved off PATH (Graphviz is optional / not installed in CI). */
const DEFAULT_DOT = 'dot';

/**
 * @typedef {object} RenderResult
 * @property {string} html
 * @property {string[]} headings           h2 text, in document order
 * @property {Array<{ref: string}>} unresolved  unresolved [[name]] / .md refs
 * @property {number} diagramFallbacks     count of diagrams that fell back to code blocks
 */

// ─── slugifyHeading (verbatim behavior from build-docs.js) ──────────────────────
// lowercases, maps the German umlauts and eszett, turns spaces into hyphens,
// strips chars outside a-z0-9 and hyphen.
function slugifyHeading(text) {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── renderDiagrams ─────────────────────────────────────────────────────────────
// Replaces fenced mermaid and dot/graphviz code blocks with inline SVG.
// On a missing/failing renderer binary, falls back to a styled code block
// (pre.diagram-fallback — shared by mermaid AND dot) and increments the counter.
//
// @param {string} html  HTML emitted by marked (contains <pre><code class="language-*">)
// @param {{mmdc?:string, dot?:string}} [opts]
// @returns {{ html: string, fallbacks: number }}
export function renderDiagrams(html, opts = {}) {
  const mmdc = opts.mmdc ?? DEFAULT_MMDC;
  const dot = opts.dot ?? DEFAULT_DOT;
  const $ = cheerio.load(html, { xmlMode: false });
  let fallbacks = 0;

  // Mermaid — lifted execFileSync temp-file approach from build-docs.js.
  $('pre code.language-mermaid').each((_, el) => {
    const src = $(el).text();
    let svg = null;
    if (existsSync(mmdc)) {
      const tmpDir = mkdtempSync(join(tmpdir(), 'mmdc-'));
      const inFile = join(tmpDir, 'diagram.mmd');
      const outFile = join(tmpDir, 'diagram.svg');
      try {
        writeFileSync(inFile, src);
        execFileSync(mmdc, ['-i', inFile, '-o', outFile, '-b', 'transparent', '--quiet'], {
          stdio: ['ignore', 'ignore', 'pipe'],
          timeout: 30000,
        });
        if (existsSync(outFile)) svg = readFileSync(outFile, 'utf8');
      } catch (_err) { /* renderer failed — fall back below */ } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    if (svg) {
      $(el).parent().replaceWith(
        `<div class="diagram-svg-wrapper">${svg}<span class="diagram-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`
      );
    } else {
      fallbacks += 1;
      $(el).parent().replaceWith(`<pre class="diagram-fallback"><code>${escapeHtml(src)}</code></pre>`);
    }
  });

  // Graphviz / dot — same temp-file + execFileSync shape, invoking `dot -Tsvg`.
  // `dot` is resolved off PATH; execFileSync throws ENOENT when it is absent,
  // which routes us into the styled-fallback branch (same as a missing mmdc).
  $('pre code.language-dot, pre code.language-graphviz').each((_, el) => {
    const src = $(el).text();
    let svg = null;
    const tmpDir = mkdtempSync(join(tmpdir(), 'dot-'));
    const inFile = join(tmpDir, 'diagram.dot');
    const outFile = join(tmpDir, 'diagram.svg');
    try {
      writeFileSync(inFile, src);
      execFileSync(dot, ['-Tsvg', inFile, '-o', outFile], {
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: 30000,
      });
      if (existsSync(outFile)) svg = readFileSync(outFile, 'utf8');
    } catch (_err) { /* dot missing or failed — fall back below */ } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
    if (svg) {
      // Strip the XML/doctype prologue dot emits so the SVG nests cleanly.
      const inlineSvg = svg.replace(/^[\s\S]*?(?=<svg)/, '');
      $(el).parent().replaceWith(
        `<div class="diagram-svg-wrapper">${inlineSvg}<span class="diagram-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`
      );
    } else {
      fallbacks += 1;
      $(el).parent().replaceWith(`<pre class="diagram-fallback"><code>${escapeHtml(src)}</code></pre>`);
    }
  });

  return { html: $.html(), fallbacks };
}

// ─── addHeadingIds ──────────────────────────────────────────────────────────────
// Assigns a German-umlaut-safe slug id to every h2 that lacks one.
// @param {string} html
// @returns {string}
export function addHeadingIds(html) {
  const $ = cheerio.load(html, { xmlMode: false });
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (!$(el).attr('id')) $(el).attr('id', slugifyHeading(text));
  });
  return $.html();
}

// ─── buildToc ───────────────────────────────────────────────────────────────────
// Builds the "Auf dieser Seite" TOC box from an array of h2 texts.
// Returns '' for fewer than two headings (matches old build-docs.js behavior).
// @param {string[]} headings
// @returns {string}
export function buildToc(headings) {
  if (headings.length < 2) return '';
  const items = headings.map((h, i) => {
    const id = slugifyHeading(h);
    return `<li class="toc-item"><a href="#${id}"><span class="toc-num">${i + 1}.</span> ${escapeHtml(h)}</a></li>`;
  }).join('\n');
  return `<div class="toc-box auto-toc">
  <div class="toc-title">Auf dieser Seite</div>
  <ul class="toc-list">${items}</ul>
</div>`;
}

// ─── injectCopyButtons ──────────────────────────────────────────────────────────
// Wraps each real pre/code in a .code-wrapper and appends a Copy button.
// Skips diagram fallbacks (pre.diagram-fallback).
// @param {string} html
// @returns {string}
export function injectCopyButtons(html) {
  const $ = cheerio.load(html, { xmlMode: false });
  $('pre code').each((_, el) => {
    const $pre = $(el).parent();
    if ($pre.hasClass('diagram-fallback')) return;
    $pre.wrap('<div class="code-wrapper"></div>');
    $pre.after('<button class="copy-btn" aria-label="Copy code">Copy</button>');
  });
  return $.html();
}

// ─── rewriteCrossLinks ──────────────────────────────────────────────────────────
// Conservative cross-linking against the registry:
//   (a) explicit [[name]] wiki-links  → resolve via registry.resolve(name)
//   (b) relative markdown links ending in .md → resolve the basename slug
// Resolved links become <a href="./<outRelPath>">label</a>; unresolved refs
// render as plain text and are collected into `unresolved`.
//
// @param {string} html
// @param {{registry: {resolve:(n:string)=>any, outPathFor:(p:any)=>string}, page: {slug:string}}} ctx
// @returns {{ html: string, unresolved: Array<{ref:string}> }}
export function rewriteCrossLinks(html, { registry, page }) {
  const unresolved = [];

  // (a) [[name]] wiki-links — operate on the raw HTML string. marked leaves the
  // literal "[[name]]" untouched (it's not markdown link syntax), so the brackets
  // survive into the parsed HTML.
  let out = html.replace(/\[\[([^\]]+)\]\]/g, (_match, rawName) => {
    const name = rawName.trim();
    const target = registry.resolve(name);
    if (target) {
      const href = './' + registry.outPathFor(target);
      return `<a href="${escapeAttr(href)}" class="xref">${escapeHtml(name)}</a>`;
    }
    unresolved.push({ ref: name });
    return escapeHtml(name);
  });

  // (b) relative markdown links: rewrite <a href="…/Foo.md"> to the resolved page.
  // Skip absolute/anchor/external/already-html hrefs.
  const $ = cheerio.load(out, { xmlMode: false });
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (!href.toLowerCase().endsWith('.md')) return;
    if (/^(https?:|\/\/|#|mailto:)/i.test(href)) return;
    // basename without extension → candidate slug (kebab-case, lowercased)
    const base = href.split(/[\\/]/).pop().replace(/\.md$/i, '');
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const target = registry.resolve(slug);
    if (target) {
      $(el).attr('href', './' + registry.outPathFor(target));
      $(el).addClass('xref');
    } else {
      unresolved.push({ ref: href });
    }
  });

  return { html: $.html(), unresolved };
}

// ─── renderMarkdown ─────────────────────────────────────────────────────────────
// Full per-page render. See module header for the pipeline order.
// @param {string} markdown
// @param {{registry: object, page: {slug:string}, mmdc?:string, dot?:string}} ctx
// @returns {RenderResult}
export function renderMarkdown(markdown, { registry, page, mmdc, dot } = {}) {
  let html = marked.parse(markdown);

  const xref = rewriteCrossLinks(html, { registry, page });
  html = xref.html;

  const diagrams = renderDiagrams(html, { mmdc, dot });
  html = diagrams.html;

  html = addHeadingIds(html);

  // Collect h2 texts (post-id) for the TOC and the return value.
  const $ = cheerio.load(html, { xmlMode: false });
  const headings = $('h2').map((_, el) => $(el).text().trim()).get();

  html = injectCopyButtons(html);

  // Inject TOC after the first h1 (or at the top if no h1) when >= 2 h2 headings.
  const toc = buildToc(headings);
  if (toc) {
    const $$ = cheerio.load(html, { xmlMode: false });
    const h1 = $$('h1').first();
    if (h1.length) h1.after(toc);
    else $$('body').prepend(toc);
    html = $$.html();
  }

  return {
    html,
    headings,
    unresolved: xref.unresolved,
    diagramFallbacks: diagrams.fallbacks,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
