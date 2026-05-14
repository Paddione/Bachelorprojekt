// scripts/build-docs.js
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