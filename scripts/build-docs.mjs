// scripts/build-docs.mjs
// Orchestrator / entry point for the docs-site generator.
// Replaces scripts/build-docs.js (removed in a later task). Discovers all
// sources, builds an editorial cross-linked site under k3d/docs-content-built/,
// and prints a build report. The OUT_DIR is fully generated, so a clean rebuild
// safely removes its generated contents — every input lives under docs/ and
// docs/legacy-html/, so nothing is lost.

import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync,
  rmSync, copyFileSync, statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import * as cheerio from 'cheerio';

import { discoverSources } from './docs-gen/discover.mjs';
import { buildPages, buildRegistry, parseRoutingTable, collectEdges } from './docs-gen/registry.mjs';
import { renderMarkdown } from './docs-gen/render-markdown.mjs';
import { editorialCss, clientJs } from './docs-gen/theme.mjs';
import { renderPage, renderSkillsIndex, renderAgentsIndex, renderDocsIndex, renderLanding, deduplicateSkills } from './docs-gen/templates.mjs';
import { rewrapLegacyPage } from './docs-gen/legacy.mjs';
import { buildGraph } from './docs-gen/graph-data.mjs';
import { layoutGraph } from './docs-gen/graph-layout.mjs';
import { tokenize, foldGerman } from './docs-gen/tokenize.mjs';
import { buildNavModel } from './docs-gen/navigation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

export const OUT_DIR = join(REPO_ROOT, 'k3d/docs-content-built');

// Default plugin cache root; absent on machines without plugins installed.
const DEFAULT_PLUGINS_ROOT = join(homedir(), '.claude/plugins/cache');

// Pages copied verbatim (machine-generated, too large to rewrap reliably).
const PASSTHROUGH_LEGACY = new Set(['datamodel-workflow.html']);

// db-schema is rendered from markdown but pinned to this output slug.
const DB_SCHEMA_SOURCE_REL = 'docs/db-schema-diagram.md';
const DB_SCHEMA_SLUG = 'db-schema';

/** @typedef {{ slug: string, title: string, excerpt: string }} SearchEntry */

/**
 * Compute a short, whitespace-collapsed excerpt from rendered HTML.
 * @param {string} html
 * @returns {string}
 */
function excerptFromHtml(html) {
  const $ = cheerio.load(html);
  return $('p').first().text().trim().slice(0, 160).replace(/\s+/g, ' ');
}

/**
 * Derive a display title from rendered HTML, falling back to a slug.
 * @param {string} html
 * @param {string} fallback
 * @returns {string}
 */
function titleFromHtml(html, fallback) {
  const $ = cheerio.load(html);
  const h1 = $('h1').first().text().trim();
  if (h1) return h1;
  const t = $('title').first().text().replace(/ — Workspace MVP$/, '').trim();
  return t || fallback;
}

/**
 * Ensure OUT_DIR exists and is empty of previously generated content.
 * Only the generated output dir is touched; all inputs live under docs/.
 * @param {string} outDir
 */
function cleanOutDir(outDir) {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
}

/**
 * Write a file, creating parent directories as needed.
 * @param {string} outDir
 * @param {string} relPath
 * @param {string} content
 */
function writeOut(outDir, relPath, content) {
  const dest = join(outDir, relPath);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, 'utf8');
}

/**
 * Full build. Accepts an options object so tests can point it at a fixture repo.
 * @param {{ repoRoot?: string, pluginsRoot?: string, outDir?: string, homeDir?: string }} [opts]
 * @returns {Promise<object>} build report
 */
export async function runBuild(opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const outDir = opts.outDir ?? OUT_DIR;
  const homeDir = opts.homeDir ?? homedir();
  const pluginsRoot = opts.pluginsRoot ?? DEFAULT_PLUGINS_ROOT;

  const report = {
    counts: { doc: 0, skill: 0, agent: 0, legacyRewrapped: 0, legacyCopied: 0, passthrough: 0 },
    unresolved: [],
    diagramFallbacks: 0,
    skippedPluginSources: [],
    pluginsRootPresent: existsSync(pluginsRoot),
  };

  cleanOutDir(outDir);

  const usedSnapshots = new Set();
  const recordSnapshot = (p) => usedSnapshots.add(p);

  // (1) Discover all sources (repo + plugin skills/agents + docs).
  const sources = await discoverSources({ repoRoot, pluginsRoot, homeDir });
  if (!report.pluginsRootPresent) {
    report.skippedPluginSources.push(`plugins root absent: ${pluginsRoot}`);
  }

  // (2) Parse the routing table from CLAUDE.md (drives domains + routing edges).
  //     IC-3: must run BEFORE buildPages and be passed in as the second arg.
  const claudeMdPath = join(repoRoot, 'CLAUDE.md');
  const claudeMdText = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
  const routingRows = parseRoutingTable(claudeMdText);

  // (3) Build pages + registry. routingRows feeds assignDomain for non-agent pages.
  const pages = buildPages(sources, routingRows);

  const registry = buildRegistry(pages);

  // (4) Collect cross-link edges (used by the landing graph in Plan 2; the
  // unresolved list feeds the build report here).
  const { edges, unresolved } = collectEdges(pages, registry);
  report.unresolved.push(...unresolved);

  // Build navigation model once — shared by renderPage (sidebar/prevnext) and search index.
  const navModel = buildNavModel(pages);

  /** @type {SearchEntry[]} */
  const searchIndex = [];

  // (5) Render every markdown-backed Page and write it to OUT_DIR/outRelPath.
  for (const page of pages) {
    const rendered = await renderMarkdown(page.bodyMarkdown, { registry, page, recordSnapshot });
    report.diagramFallbacks += rendered.diagramFallbacks;
    report.unresolved.push(...rendered.unresolved.map((u) => ({ from: page.slug, ref: u.ref })));
    // IC-4: renderMarkdown already injected the TOC into rendered.html; pass toc: ''.
    const html = renderPage({ page, contentHtml: rendered.html, toc: '', related: [], navModel });
    writeOut(outDir, page.outRelPath, html);
    if (report.counts[page.type] !== undefined) report.counts[page.type] += 1;
    searchIndex.push({
      slug: page.slug,
      title: page.title,
      excerpt: excerptFromHtml(rendered.html),
    });
  }

  // (6a) Legacy HTML: rewrap each (except passthrough) and write at bare slug.
  const legacyDir = join(repoRoot, 'docs/legacy-html');
  if (existsSync(legacyDir)) {
    const legacyFiles = readdirSync(legacyDir)
      .filter((f) => f.endsWith('.html'))
      .sort();
    for (const file of legacyFiles) {
      const slug = file.replace(/\.html$/, '');
      const srcPath = join(legacyDir, file);
      if (PASSTHROUGH_LEGACY.has(file)) {
        // Copy verbatim — too large / machine-generated to rewrap reliably.
        copyFileSync(srcPath, join(outDir, file));
        report.counts.passthrough += 1;
        const raw = readFileSync(srcPath, 'utf8');
        searchIndex.push({
          slug,
          title: titleFromHtml(raw, slug),
          excerpt: excerptFromHtml(raw),
        });
        continue;
      }
      const raw = readFileSync(srcPath, 'utf8');
      const { title, innerHtml, mode } = rewrapLegacyPage(raw, slug);
      if (mode === 'copied') {
        copyFileSync(srcPath, join(outDir, file));
        report.counts.legacyCopied += 1;
        searchIndex.push({ slug, title, excerpt: excerptFromHtml(raw) });
        continue;
      }
      const legacyPage = {
        slug,
        type: 'doc',
        provenance: 'repo',
        name: slug,
        title,
        description: '',
        domain: null,
        bodyMarkdown: '',
        sourcePath: srcPath,
        outRelPath: `${slug}.html`,
      };
      // IC-4: toc is a pre-rendered HTML string; pass '' for legacy pages.
      const html = renderPage({ page: legacyPage, contentHtml: innerHtml, toc: '', related: [] });
      writeOut(outDir, `${slug}.html`, html);
      report.counts.legacyRewrapped += 1;
      searchIndex.push({ slug, title, excerpt: excerptFromHtml(innerHtml) });
    }
  }

  // (7) Section index pages (specialized renderers replace renderSectionIndex).
  const skillPages = pages.filter((p) => p.type === 'skill');
  const agentPages = pages.filter((p) => p.type === 'agent');
  const docPages = pages.filter((p) => p.type === 'doc');

  report.counts.skillsRaw = skillPages.length;
  report.counts.skillsUnique = deduplicateSkills(skillPages).length;

  writeOut(outDir, 'skills.html', renderSkillsIndex({ pages: skillPages }));
  writeOut(outDir, 'agents.html', renderAgentsIndex({ pages: agentPages }));
  writeOut(outDir, 'docs.html', renderDocsIndex({ pages: docPages }));

  // (8) Landing page (graph-forward in Plan 2; editorial card grid in Plan 1).
  writeOut(outDir, 'index.html', renderLanding({ pages, registry, edges, routingRows }));

  // Graph metrics for the build report (same deterministic inputs the landing uses).
  const reportGraph = buildGraph(pages, edges, routingRows);
  const reportLayout = layoutGraph(reportGraph, { width: 1600, height: 1000 });
  const placedIds = new Set(reportLayout.nodes.map((n) => n.id));
  const unplacedNodes = reportGraph.nodes
    .filter((n) => !placedIds.has(n.id))
    .map((n) => n.id)
    .sort();
  report.graphNodes = reportGraph.nodes.length;
  report.graphEdges = reportGraph.edges.length;
  report.unplacedNodes = unplacedNodes;

  // (9) Assets.
  writeOut(outDir, 'style.css', editorialCss());
  writeOut(outDir, 'app.js', clientJs());

  // (10) search.json — array of { slug, title, excerpt }.
  searchIndex.sort((a, b) => a.slug.localeCompare(b.slug));
  writeOut(outDir, 'search.json', JSON.stringify(searchIndex));
  report.counts.searchEntries = searchIndex.length;

  // (10.1) search-index.json — full-text inverted index for the ranked search client.
  // LIMITATION: only written on full build; incremental rebuildPage does NOT update
  // this file. After an incremental run, search-index.json may be stale until the
  // next full build.
  const searchInvertedIndex = buildSearchIndex(pages);
  writeOut(outDir, 'search-index.json', JSON.stringify(searchInvertedIndex));
  report.counts.searchIndexTokens = Object.keys(searchInvertedIndex.index).length;

  // (10.5) Prune unused snapshots in full build
  const snapshotsDir = join(repoRoot, 'docs/mermaid-snapshots');
  if (existsSync(snapshotsDir)) {
    const files = readdirSync(snapshotsDir);
    for (const file of files) {
      if (file.endsWith('.svg')) {
        const fullPath = join(snapshotsDir, file);
        if (!usedSnapshots.has(fullPath)) {
          console.log(`Pruning unused snapshot: ${file}`);
          rmSync(fullPath);
        }
      }
    }
  }

  // (11) Build report.
  printReport(report);
  return report;
}

/**
 * Render a single markdown file to OUT_DIR/<slug>.html and refresh search.json,
 * for parity with the old builder's --rebuild-page fast path.
 * @param {string} slug
 * @param {string} mdPath
 * @param {string} outDir
 * @returns {Promise<void>}
 */
export async function rebuildPage(slug, mdPath, outDir = OUT_DIR) {
  mkdirSync(outDir, { recursive: true });
  const md = readFileSync(mdPath, 'utf8');
  const page = {
    slug,
    type: 'doc',
    provenance: 'repo',
    name: slug,
    title: slug,
    description: '',
    domain: null,
    bodyMarkdown: md,
    sourcePath: mdPath,
    outRelPath: `${slug}.html`,
  };
  // No global registry on the fast path; cross-links degrade to plain text.
  // IC-2: buildRegistry([]) still carries outPathFor on its returned object.
  const registry = buildRegistry([]);
  const rendered = await renderMarkdown(md, { registry, page });
  const title = titleFromHtml(rendered.html, slug);
  // IC-4: renderMarkdown already injected the TOC; pass toc: ''.
  const html = renderPage({
    page: { ...page, title },
    contentHtml: rendered.html,
    toc: '',
    related: [],
  });
  writeOut(outDir, `${slug}.html`, html);
  refreshSearchIndexFromOutDir(outDir);
  console.log(`  → ${slug}.html ✓ (search.json refreshed)`);
}

/**
 * Rebuild search.json by scanning the already-written HTML in OUT_DIR.
 * Used only by the --rebuild-page fast path (the full build writes it directly).
 * @param {string} outDir
 */
function refreshSearchIndexFromOutDir(outDir) {
  const files = readdirSync(outDir)
    .filter((f) => f.endsWith('.html') && statSync(join(outDir, f)).isFile())
    .sort();
  const index = files.map((file) => {
    const slug = file.replace(/\.html$/, '');
    const raw = readFileSync(join(outDir, file), 'utf8');
    return { slug, title: titleFromHtml(raw, slug), excerpt: excerptFromHtml(raw) };
  });
  writeOut(outDir, 'search.json', JSON.stringify(index));
}

// ─── buildSearchIndex ───────────────────────────────────────────────────────
// Builds the full-text inverted index written as search-index.json.
// Schema: { pages: [{slug,title,sectionPath,outRelPath}], index: {token:[{slug,headingId?,weight}]} }
// Imported by the search client (search-client.mjs) for ranked lookup.
// sectionPath comes from buildNavModel().sectionOf so index and sidebar share one model.

const SEARCH_STOPWORDS = new Set([
  'der','die','das','den','dem','des','ein','eine','einer','eines','und','ist','sind',
  'wird','werden','sich','mit','von','bei','fuer','aus','nach','vor','als','auch','nur',
  'wie','was','bei','oder','aber','wenn','this','that','with','from','have','been','will',
  'they','their','there','than','then','these','those','some','into','your','more',
  'the','and','for','not','are','can','all','was','were','has','its',
]);
const MAX_TOKENS_PER_PAGE = 200;  // unique tokens indexed per page
const MAX_PAGES_PER_TOKEN = 15;   // cap postings per token (size control)

/** Convert heading text to an anchor id (same as slugifyHeading in render-markdown.mjs). */
function headingToId(text) {
  return foldGerman(text).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Build the inverted index from all pages.
 * @param {object[]} pages
 * @returns {{ pages: object[], index: Record<string,object[]> }}
 */
function buildSearchIndex(pages) {
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
 * Print the human-readable build report.
 * @param {object} report
 */
function printReport(report) {
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

/**
 * CLI entry. Supports a default full build and --rebuild-page <slug> <mdfile>.
 */
async function main() {
  const argv = process.argv.slice(2);
  const rebuildIdx = argv.indexOf('--rebuild-page');
  if (rebuildIdx !== -1) {
    const slug = argv[rebuildIdx + 1];
    const mdPath = argv[rebuildIdx + 2];
    if (!slug || !mdPath) {
      console.error('Usage: build-docs.mjs --rebuild-page <slug> <mdfile>');
      process.exit(1);
    }
    await rebuildPage(slug, mdPath, OUT_DIR);
    console.log(`\n✓ Rebuilt ${slug}.html and refreshed search.json`);
    return;
  }
  await runBuild({ repoRoot: REPO_ROOT, outDir: OUT_DIR });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
