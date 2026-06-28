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
  mkdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { marked } from 'marked';
import * as cheerio from 'cheerio';
import { foldGerman } from './tokenize.mjs';

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

// ─── slugifyHeading ──────────────────────────────────────────────────────────────
// German-umlaut-safe heading anchor generator. Uses foldGerman from tokenize.mjs
// (the single source of umlaut folding) so that search-index headingId values and
// heading anchor ids are always byte-identical.
function slugifyHeading(text) {
  return foldGerman(text).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── diagram caption helpers ──────────────────────────────────────────────────
// Captions make a rendered diagram comprehensible beside the text (a11y).
// Two sources, in priority order:
//   1. a blockquote line directly before the diagram, "> **Abbildung:** <text>"
//      (marked turns it into <blockquote><p><strong>Abbildung:</strong> <text></p>);
//   2. the fenced info-string title ( ```mermaid title="…" ), captured pre-marked
//      and threaded in via opts.captions (keyed by the trimmed diagram source).
// When neither yields text we emit NO <figcaption> (never an empty element).
const ABBILDUNG_RE = /^\s*Abbildung\s*:\s*([\s\S]+?)\s*$/i;

// Pull the caption text from the immediately-preceding blockquote, if it matches
// the "Abbildung:" convention. Returns the text and removes the blockquote so it
// is not double-rendered above the figure. Returns null when there is no match.
function consumePrecedingCaption($, $diagramEl) {
  const $prev = $diagramEl.prev();
  if (!$prev.length || !$prev.is('blockquote')) return null;
  const text = $prev.text().trim();
  const m = ABBILDUNG_RE.exec(text);
  if (!m) return null;
  $prev.remove();
  return m[1].trim();
}

// Wrap a freshly-built diagram fragment in <figure class="diagram-figure">,
// appending a <figcaption> only when caption text is present.
function figureFor(inner, caption) {
  const cap = caption
    ? `<figcaption class="diagram-caption">${escapeHtml(caption)}</figcaption>`
    : '';
  return `<figure class="diagram-figure">${inner}${cap}</figure>`;
}

// ─── renderDiagrams ─────────────────────────────────────────────────────────────
// Replaces fenced mermaid and dot/graphviz code blocks with inline SVG, wrapping
// each successfully-rendered SVG in a <figure class="diagram-figure"> (+ optional
// <figcaption>; see the caption helpers above).
// On a missing/failing renderer binary, falls back to a styled code block
// (pre.diagram-fallback — shared by mermaid AND dot) and increments the counter.
//
// @param {string} html  HTML emitted by marked (contains <pre><code class="language-*">)
// @param {{mmdc?:string, dot?:string, recordSnapshot?:(p:string)=>void, snapshotDir?:string, captions?:Record<string,string>}} [opts]
// @returns {{ html: string, fallbacks: number }}
export function renderDiagrams(html, opts = {}) {
  const mmdc = opts.mmdc ?? DEFAULT_MMDC;
  const dot = opts.dot ?? DEFAULT_DOT;
  const recordSnapshot = opts.recordSnapshot;
  const snapshotDir = opts.snapshotDir ?? join(__dirname, '../../docs/mermaid-snapshots');
  const captions = opts.captions ?? {};
  const captionFor = (src) => captions[src] ?? captions[src.trim()] ?? null;
  const $ = cheerio.load(html, { xmlMode: false });
  let fallbacks = 0;

  // Mermaid — cached snapshot approach to prevent layout coordinate drift.
  $('pre code.language-mermaid').each((_, el) => {
    const src = $(el).text();
    // Caption (blockquote takes priority over the info-string title). Read it off
    // the <pre> wrapper — its previous sibling is the candidate blockquote.
    const caption = consumePrecedingCaption($, $(el).parent()) ?? captionFor(src);
    const hash = createHash('sha256').update(src).digest('hex');
    const snapshotFile = join(snapshotDir, `${hash}.svg`);
    let svg = null;

    if (existsSync(snapshotFile)) {
      try {
        svg = readFileSync(snapshotFile, 'utf8');
        if (recordSnapshot) recordSnapshot(snapshotFile);
      } catch (_err) { /* fallback to rendering below */ }
    }

    if (!svg && existsSync(mmdc)) {
      mkdirSync(snapshotDir, { recursive: true });
      const tmpDir = mkdtempSync(join(tmpdir(), 'mmdc-'));
      const inFile = join(tmpDir, 'diagram.mmd');
      const outFile = join(tmpDir, 'diagram.svg');
      const configJson = join(tmpDir, 'config.json');
      const configData = {
        deterministicIds: true,
        deterministicIDSeed: 'd' + hash.slice(0, 8),
      };

      try {
        writeFileSync(inFile, src);
        writeFileSync(configJson, JSON.stringify(configData));
        execFileSync(mmdc, [
          '-i', inFile,
          '-o', outFile,
          '-c', configJson,
          '-b', 'transparent',
          '--quiet',
        ], {
          stdio: ['ignore', 'ignore', 'pipe'],
          timeout: 30000,
        });
        if (existsSync(outFile)) {
          svg = readFileSync(outFile, 'utf8');
          writeFileSync(snapshotFile, svg, 'utf8');
          if (recordSnapshot) recordSnapshot(snapshotFile);
        }
      } catch (_err) {
        console.error('Mermaid render failed:', _err);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }

    if (svg) {
      const wrapper =
        `<div class="diagram-svg-wrapper">${svg}<span class="diagram-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`;
      $(el).parent().replaceWith(figureFor(wrapper, caption));
    } else {
      fallbacks += 1;
      const fallback = `<pre class="diagram-fallback"><code>${escapeHtml(src)}</code></pre>`;
      // Keep the caption attached to the fallback too, so it is never lost.
      $(el).parent().replaceWith(caption ? figureFor(fallback, caption) : fallback);
    }
  });

  // Graphviz / dot — same temp-file + execFileSync shape, invoking `dot -Tsvg`.
  // `dot` is resolved off PATH; execFileSync throws ENOENT when it is absent,
  // which routes us into the styled-fallback branch (same as a missing mmdc).
  $('pre code.language-dot, pre code.language-graphviz').each((_, el) => {
    const src = $(el).text();
    const caption = consumePrecedingCaption($, $(el).parent()) ?? captionFor(src);
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
      const wrapper =
        `<div class="diagram-svg-wrapper">${inlineSvg}<span class="diagram-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`;
      $(el).parent().replaceWith(figureFor(wrapper, caption));
    } else {
      fallbacks += 1;
      const fallback = `<pre class="diagram-fallback"><code>${escapeHtml(src)}</code></pre>`;
      $(el).parent().replaceWith(caption ? figureFor(fallback, caption) : fallback);
    }
  });

  return { html: $.html(), fallbacks };
}

// ─── addHeadingIds ──────────────────────────────────────────────────────────────
// Assigns a German-umlaut-safe slug id to every h2 and h3 that lacks one.
// Phase 3.1: extended to include h3 (was h2-only). Both level entries appear in
// the TOC with visual indentation.
// @param {string} html
// @returns {string}
export function addHeadingIds(html) {
  const $ = cheerio.load(html, { xmlMode: false });
  $('h2, h3').each((_, el) => {
    const text = $(el).text().trim();
    if (!$(el).attr('id')) $(el).attr('id', slugifyHeading(text));
  });
  return $.html();
}

// ─── buildToc ───────────────────────────────────────────────────────────────────
// Builds the "Auf dieser Seite" TOC box.
//
// Overloaded signature (Phase 3.1):
//   buildToc(Array<{level: 2|3, text: string}>)   — new structured form
//   buildToc(string[])                             — legacy flat form (h2-only)
//
// Returns '' for fewer than two headings (matches old build-docs.js behavior).
// h3 entries are visually indented one level in the TOC list.
//
// @param {Array<{level:2|3,text:string}> | string[]} headings
// @returns {string}
export function buildToc(headings) {
  if (!headings || headings.length < 2) return '';
  // Detect legacy flat-array form (string[]) vs new structured form ({level,text}[]).
  const structured = typeof headings[0] === 'object';
  let h2counter = 0;
  const items = headings.map((h) => {
    const text = structured ? h.text : h;
    const level = structured ? h.level : 2;
    const id = slugifyHeading(text);
    if (level === 2) h2counter += 1;
    const num = level === 2 ? `${h2counter}.` : '–';
    const indent = level === 3 ? ' class="toc-item toc-item--h3"' : ' class="toc-item"';
    return `<li${indent}><a href="#${id}"><span class="toc-num">${num}</span> ${escapeHtml(text)}</a></li>`;
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
// @param {{registry: object, page: {slug:string}, mmdc?:string, dot?:string, recordSnapshot?:Function, snapshotDir?:string}} ctx
// @returns {RenderResult}
export function renderMarkdown(markdown, { registry, page, mmdc, dot, recordSnapshot, snapshotDir } = {}) {
  // Capture fenced diagram titles (```mermaid|dot|graphviz title="…") BEFORE marked
  // parses, because marked drops everything after the first info-string word. The
  // map is keyed by the trimmed diagram source so renderDiagrams can match it back.
  const captions = extractDiagramCaptions(markdown);

  let html = marked.parse(markdown);

  const xref = rewriteCrossLinks(html, { registry, page });
  html = xref.html;

  const diagrams = renderDiagrams(html, { mmdc, dot, recordSnapshot, snapshotDir, captions });
  html = diagrams.html;

  html = addHeadingIds(html);

  // Collect h2 + h3 texts (post-id) for the TOC (Phase 3.1 structured form).
  // The legacy `headings` return value keeps only h2 for backward compat.
  const $ = cheerio.load(html, { xmlMode: false });
  const headings = $('h2').map((_, el) => $(el).text().trim()).get();
  const tocEntries = $('h2, h3').map((_, el) => ({
    level: el.name === 'h3' ? 3 : 2,
    text: $(el).text().trim(),
  })).get();

  html = injectCopyButtons(html);

  // Inject TOC after the first h1 (or at the top if no h1) when >= 2 h2 headings.
  const toc = buildToc(tocEntries);
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
function escapeHtml(str) { return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escapeAttr(str) { return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

// ─── extractDiagramCaptions ─────────────────────────────────────────────────────
// Scan raw markdown for fenced diagram blocks containing title="..." and return a map.
export function extractDiagramCaptions(markdown) {
  const captions = {};
  if (!markdown) return captions;
  const re = /^([ \t]*)(`{3,}|~{3,})[ \t]*(mermaid|dot|graphviz)\b([^\n]*)\n([\s\S]*?)\n?\1\2[ \t]*$/gim;
  let m;
  while ((m = re.exec(markdown)) !== null) {
    const info = m[4] || '';
    const body = m[5] ?? '';
    const titleMatch = /\btitle\s*=\s*"([^"]*)"|\btitle\s*=\s*'([^']*)'/.exec(info);
    if (!titleMatch) continue;
    const title = (titleMatch[1] ?? titleMatch[2] ?? '').trim();
    if (!title) continue;
    captions[body.trim()] = title;
  }
  return captions;
}
