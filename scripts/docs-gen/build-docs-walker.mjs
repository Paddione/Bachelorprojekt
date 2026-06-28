// Helper module for docs builder search indexing and report printing.
// Extracted from scripts/build-docs.mjs.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as cheerio from 'cheerio';
import { tokenize, foldGerman } from './tokenize.mjs';
import { buildNavModel } from './navigation.mjs';

const SEARCH_STOPWORDS = new Set([
  'der','die','das','den','dem','des','ein','eine','einer','eines','und','ist','sind',
  'wird','werden','sich','mit','von','bei','fuer','aus','nach','vor','als','auch','nur',
  'wie','was','bei','oder','aber','wenn','this','that','with','from','have','been','will',
  'they','their','there','than','then','these','those','some','into','your','more',
  'the','and','for','not','are','can','all','was','were','has','its',
]);
const MAX_TOKENS_PER_PAGE = 200;  // unique tokens indexed per page
const MAX_PAGES_PER_TOKEN = 15;   // cap postings per token (size control)

/**
 * Compute a short, whitespace-collapsed excerpt from rendered HTML.
 * @param {string} html
 * @returns {string}
 */
export function excerptFromHtml(html) {
  const $ = cheerio.load(html);
  return $('p').first().text().trim().slice(0, 160).replace(/\s+/g, ' ');
}

/**
 * Derive a display title from rendered HTML, falling back to a slug.
 * @param {string} html
 * @param {string} fallback
 * @returns {string}
 */
export function titleFromHtml(html, fallback) {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;
  const t = $('title').first().text().replace(/ — Workspace MVP$/, '').trim();
  return t || fallback;
}

/** Convert heading text to an anchor id (same as slugifyHeading in render-markdown.mjs). */
export function headingToId(text) {
  return foldGerman(text).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Build the inverted index from all pages.
 * @param {object[]} pages
 * @returns {{ pages: object[], index: Record<string,object[]> }}
 */
export function buildSearchIndex(pages) {
  const navModel = buildNavModel(pages);
  const indexMap = new Map(); // token → [{slug, headingId?, weight}]
  const pageEntries = [];

  for (const page of pages) {
    const sectionKey = navModel.sectionOf(page);
    const section = navModel.sections.find((s) => s.key === sectionKey);
    const sectionPath = section ? section.label : sectionKey;
    pageEntries.push({ slug: page.slug, title: page.title, sectionPath, outRelPath: page.outRelPath });

    const pageTokens = new Map(); // token → {headingId, weight} — best weight per token per page

    /** Add token to page map if weight is higher than existing entry. */
    function addToken(tok, headingId, weight) {
      if (SEARCH_STOPWORDS.has(tok)) return;
      const existing = pageTokens.get(tok);
      if (!existing || existing.weight < weight) {
        pageTokens.set(tok, { headingId: headingId ?? null, weight });
      }
    }

    // Title tokens (weight 3 — highest priority).
    for (const tok of tokenize(page.title)) addToken(tok, null, 3);

    // Heading tokens from bodyMarkdown (weight 2).
    const headingRe = /^#{1,3}\s+(.+)$/gm;
    let m;
    while ((m = headingRe.exec(page.bodyMarkdown ?? '')) !== null) {
      const hText = m[1].trim();
      const hId = headingToId(hText);
      for (const tok of tokenize(hText)) addToken(tok, hId, 2);
    }

    // Body tokens (weight 1 — strip markdown syntax first).
    const bodyText = (page.bodyMarkdown ?? '')
      .replace(/#{1,6}\s+/g, ' ')
      .replace(/[`*_[\]]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ');
    for (const tok of tokenize(bodyText)) addToken(tok, null, 1);

    // Add per-page tokens to the global index (respect caps).
    let count = 0;
    for (const [token, info] of pageTokens) {
      if (++count > MAX_TOKENS_PER_PAGE) break;
      const postings = indexMap.get(token) ?? [];
      if (postings.length < MAX_PAGES_PER_TOKEN) {
        const entry = info.headingId ? { slug: page.slug, headingId: info.headingId, weight: info.weight } : { slug: page.slug, weight: info.weight };
        postings.push(entry);
        indexMap.set(token, postings);
      }
    }
  }

  return { pages: pageEntries, index: Object.fromEntries(indexMap) };
}

/**
 * Rebuild search.json by scanning the already-written HTML in OUT_DIR.
 * Used only by the --rebuild-page fast path (the full build writes it directly).
 * @param {string} outDir
 */
export function refreshSearchIndexFromOutDir(outDir) {
  const files = readdirSync(outDir)
    .filter((f) => f.endsWith('.html') && statSync(join(outDir, f)).isFile())
    .sort();
  const index = files.map((file) => {
    const slug = file.replace(/\.html$/, '');
    const raw = readFileSync(join(outDir, file), 'utf8');
    return { slug, title: titleFromHtml(raw, slug), excerpt: excerptFromHtml(raw) };
  });
  writeOutDirect(outDir, 'search.json', JSON.stringify(index));
}

// Internal helper needed by refreshSearchIndexFromOutDir
function writeOutDirect(outDir, relPath, content) {
  const dest = join(outDir, relPath);
  writeFileSync(dest, content, 'utf8');
}

/**
 * Print the human-readable build report.
 * @param {object} report
 */
export function printReport(report) {
  const c = report.counts;
  console.log('\n── Docs build report ────────────────────────────');
  console.log(`  docs:               ${c.doc}`);
  console.log(`  skills (raw):       ${c.skillsRaw ?? c.skill}`);
  console.log(`  skills (unique):    ${c.skillsUnique ?? '–'}`);
  console.log(`  agents:             ${c.agent}`);
  console.log(`  legacy rewrapped:   ${c.legacyRewrapped}`);
  console.log(`  legacy copied:      ${c.legacyCopied}`);
  console.log(`  passthrough:        ${c.passthrough}`);
  console.log(`  search entries:     ${c.searchEntries ?? 0}`);
  console.log(`  diagram fallbacks:  ${report.diagramFallbacks}`);
  console.log(`  unresolved refs:    ${report.unresolved.length}`);
  console.log(`  graph nodes:        ${report.graphNodes ?? 0}`);
  console.log(`  graph edges:        ${report.graphEdges ?? 0}`);
  {
    const unplaced = report.unplacedNodes ?? [];
    console.log(`  unplaced nodes:     ${unplaced.length}${unplaced.length ? ' (' + unplaced.join(', ') + ')' : ''}`);
  }
  if (report.unresolved.length) {
    for (const u of report.unresolved.slice(0, 20)) {
      console.log(`      ✗ ${u.from} → [[${u.ref}]]`);
    }
    if (report.unresolved.length > 20) {
      console.log(`      … and ${report.unresolved.length - 20} more`);
    }
  }
  if (!report.pluginsRootPresent || report.skippedPluginSources.length) {
    console.log(`  skipped plugin sources:`);
    for (const s of report.skippedPluginSources) console.log(`      ⚠ ${s}`);
  }
  console.log('─────────────────────────────────────────────────');
}
