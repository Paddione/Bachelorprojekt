import { readFileSync, writeFileSync, mkdirSync, readdirSync,
         existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { marked } from 'marked';
import * as cheerio from 'cheerio';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = join(__dirname, '../k3d/docs-content');
export const OUT_DIR = join(__dirname, '../k3d/docs-content-built');

// ─── parseSidebar ─────────────────────────────────────────────────────────────
// Converts _sidebar.md content to an HTML <nav> string.
// activeSlug: the current page slug (e.g. "quickstart-enduser") for active highlight.
export function parseSidebar(md, activeSlug) {
  const lines = md.split('\n');
  let html = '<nav class="sidebar-nav"><ul>\n';
  for (const line of lines) {
    const sectionMatch = line.match(/^-\s+\*\*(.+?)\*\*/);
    const linkMatch = line.match(/^\s+-\s+\[(.+?)\]\((.+?)\)/);
    if (sectionMatch) {
      html += `  <li class="sidebar-section">${sectionMatch[1]}</li>\n`;
    } else if (linkMatch) {
      const [, text, slug] = linkMatch;
      const isActive = slug === activeSlug;
      html += `  <li class="sidebar-item${isActive ? ' active' : ''}">`;
      html += `<a href="./${slug}.html"${isActive ? ' class="active"' : ''}>${text}</a></li>\n`;
    }
  }
  html += '</ul></nav>';
  return html;
}

// ─── rewriteLinks ─────────────────────────────────────────────────────────────
// Converts Docsify hash-routing links (#/slug) to relative .html links.
export function rewriteLinks(html) {
  return html
    .replace(/href="#\/([^"]+)"/g, 'href="./$1.html"')
    .replace(/href="#\/"(?!\w)/g, 'href="./index.html"');
}

// ─── buildToc ─────────────────────────────────────────────────────────────────
// Generates a .toc-box HTML block from a list of h2 heading text strings.
export function buildToc(headings) {
  if (headings.length < 2) return '';
  const items = headings.map((h, i) => {
    const id = slugifyHeading(h);
    return `<li class="toc-item"><a href="#${id}"><span class="toc-num">${i + 1}.</span> ${h}</a></li>`;
  }).join('\n');
  return `<div class="toc-box auto-toc">
  <div class="toc-title">Auf dieser Seite</div>
  <ul class="toc-list">${items}</ul>
</div>`;
}

function slugifyHeading(text) {
  return text.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── renderMermaidBlocks ──────────────────────────────────────────────────────
// Finds <pre><code class="language-mermaid">…</code></pre> blocks in HTML,
// pre-renders each to inline SVG via mmdc, wraps in .mermaid-svg-wrapper.
// Falls back to a styled <pre> block if mmdc fails or is missing.
export function renderMermaidBlocks(html, mmdc = join(__dirname, '../node_modules/.bin/mmdc')) {
  const $ = cheerio.load(html, { xmlMode: false });
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
      } catch (_err) {
        // fall through to fallback
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }
    const replacement = svg
      ? `<div class="mermaid-svg-wrapper">${svg}<span class="mermaid-zoom-hint">Scroll = Zoom · Ziehen = Pan</span></div>`
      : `<pre class="mermaid-fallback"><code>${src}</code></pre>`;
    $(el).parent().replaceWith(replacement);
  });
  return $.html();
}

// ─── postProcess ──────────────────────────────────────────────────────────────
// Runs cheerio DOM post-processing:
//   1. Adds id attributes to h2 elements for TOC anchors
//   2. Injects copy buttons on <pre><code> blocks (not mermaid fallbacks)
//   3. Builds and injects auto-TOC after the first .page-hero or h1
//   4. Rewrites Docsify hash links to relative .html links
export function postProcess(html) {
  const processed = rewriteLinks(html);
  const $ = cheerio.load(processed, { xmlMode: false });

  // Add ids to h2 headings
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    if (!$(el).attr('id')) $(el).attr('id', slugifyHeading(text));
  });

  // Copy buttons on code blocks (skip mermaid fallbacks)
  $('pre code').each((_, el) => {
    const $pre = $(el).parent();
    if ($pre.hasClass('mermaid-fallback')) return;
    $pre.wrap('<div class="code-wrapper"></div>');
    $pre.after('<button class="copy-btn" aria-label="Copy code">Copy</button>');
  });

  // Auto-TOC from h2 headings
  const headings = $('h2').map((_, el) => $(el).text().trim()).get();
  const toc = buildToc(headings);
  if (toc) {
    const hero = $('.page-hero').first();
    const h1 = $('h1').first();
    if (hero.length) hero.after(toc);
    else if (h1.length) h1.after(toc);
  }

  return $.html();
}