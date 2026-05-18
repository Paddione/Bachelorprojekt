#!/usr/bin/env node
/**
 * ingest-web.mjs — Crawl a website and ingest pages into a knowledge collection.
 *
 * Required env vars:
 *   COLLECTION_ID   UUID of the target knowledge.collections row
 *   PGURL           Full postgres connection string (postgres://user:pass@host:port/db)
 *   VOYAGE_API_KEY  (or LLM_ENABLED=true + TEI running) for embeddings
 *
 * Optional env vars (override crawl_config from DB):
 *   START_URL       Override the startUrl stored in crawl_config
 *   MAX_DEPTH       Override maxDepth (default 3)
 *   MAX_PAGES       Override maxPages (default 200)
 *   INCLUDE_PATTERN Regex string for URL inclusion filter
 */

import { sha256, chunkPlain, embedAll, upsertDocumentAndChunks, bumpCollectionStats } from './lib-knowledge-pg.mjs';
import { load as cheerioLoad } from 'cheerio';
import robotsParser from 'robots-parser';
import pg from 'pg';

const { Pool } = pg;

function makePoolFromUrl(pgurl) {
  const u = new URL(pgurl);
  return new Pool({
    host:     u.hostname,
    port:     Number(u.port || 5432),
    database: u.pathname.replace(/^\//, ''),
    user:     u.username,
    password: decodeURIComponent(u.password),
  });
}

const COLLECTION_ID = process.env.COLLECTION_ID;
if (!COLLECTION_ID) { console.error('COLLECTION_ID is required'); process.exit(1); }

const pgurl = process.env.PGURL;
if (!pgurl) { console.error('PGURL is required'); process.exit(1); }

const FETCH_TIMEOUT_MS = 10_000;
const MIN_PAGE_CHARS   = 100;
const DEFAULT_UA       = 'MentolderKnowledgeBot/1.0 (+https://web.mentolder.de)';

const robotsCache = new Map();

async function getRobots(origin, userAgent) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  const url = `${origin}/robots.txt`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': userAgent } });
    clearTimeout(t);
    const text = res.ok ? await res.text() : '';
    const r = robotsParser(url, text);
    robotsCache.set(origin, r);
    return r;
  } catch {
    const r = robotsParser(url, '');
    robotsCache.set(origin, r);
    return r;
  }
}

async function isAllowed(urlStr, userAgent) {
  try {
    const u = new URL(urlStr);
    const robots = await getRobots(u.origin, userAgent);
    return robots.isAllowed(urlStr, userAgent) !== false;
  } catch {
    return false;
  }
}

async function fetchSitemapUrls(origin, userAgent) {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const urls = new Set();
  for (const sitemapUrl of candidates) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(sitemapUrl, { signal: ctrl.signal, headers: { 'User-Agent': userAgent } });
      clearTimeout(t);
      if (!res.ok) continue;
      const text = await res.text();
      const locRe = /<loc>\s*(https?:\/\/[^\s<]+)\s*<\/loc>/gi;
      let m;
      while ((m = locRe.exec(text)) !== null) {
        urls.add(m[1].trim());
      }
      if (urls.size > 0) break;
    } catch {
      // Sitemap unavailable — fall through to link crawl
    }
  }
  return [...urls];
}

function extractContent($) {
  $('nav, header, footer, script, style, noscript, [aria-hidden="true"], .sr-only').remove();
  const main = $('main, article, [role="main"], #content, .content').first();
  const text = (main.length ? main : $('body')).text();
  return text.replace(/\s+/g, ' ').trim();
}

function extractLinks($, baseUrl, includeOrigin) {
  const links = [];
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      const resolved = new URL(href, baseUrl).href;
      const clean = new URL(resolved);
      clean.hash = '';
      if (clean.origin === includeOrigin) {
        links.push(clean.href);
      }
    } catch {
      // Relative URL resolution failed — skip
    }
  });
  return links;
}

async function crawl({ startUrl, maxDepth, maxPages, includePattern, userAgent }) {
  const ua = userAgent || DEFAULT_UA;
  const origin = new URL(startUrl).origin;
  const includeRe = includePattern ? new RegExp(includePattern) : null;

  const visited  = new Set();
  const queue    = [{ url: startUrl, depth: 0 }];
  const results  = [];

  console.log('Fetching sitemap…');
  const sitemapUrls = await fetchSitemapUrls(origin, ua);
  if (sitemapUrls.length > 0) {
    console.log(`  Sitemap: ${sitemapUrls.length} URLs found — using sitemap mode`);
    for (const u of sitemapUrls.slice(0, maxPages * 2)) {
      if (!visited.has(u)) queue.push({ url: u, depth: 1 });
    }
  } else {
    console.log('  No sitemap found — falling back to link crawl');
  }

  while (queue.length > 0 && results.length < maxPages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    if (includeRe && !includeRe.test(url)) continue;

    if (!(await isAllowed(url, ua))) {
      console.log(`  [robots] Skip ${url}`);
      continue;
    }

    let html;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': ua, 'Accept': 'text/html' },
        redirect: 'follow',
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/html')) continue;
      html = await res.text();
    } catch (err) {
      console.log(`  [fetch error] ${url}: ${err.message}`);
      continue;
    }

    const $ = cheerioLoad(html);
    const title = $('title').text().trim() || $('h1').first().text().trim() || url;
    const text  = extractContent($);

    if (text.length < MIN_PAGE_CHARS) {
      console.log(`  [skip short] ${url} (${text.length} chars)`);
      continue;
    }

    results.push({ url, title, text });
    process.stdout.write('.');

    if (depth < maxDepth && sitemapUrls.length === 0) {
      for (const link of extractLinks($, url, origin)) {
        if (!visited.has(link)) {
          queue.push({ url: link, depth: depth + 1 });
        }
      }
    }
  }

  console.log(`\nCrawled ${results.length} pages (${visited.size} visited).`);
  return results;
}

async function main() {
  const pool = makePoolFromUrl(pgurl);

  try {
    const colRes = await pool.query(
      `SELECT name, crawl_config FROM knowledge.collections WHERE id = $1`,
      [COLLECTION_ID],
    );
    if (colRes.rows.length === 0) {
      console.error(`Collection ${COLLECTION_ID} not found`);
      process.exit(1);
    }
    const { name: colName, crawl_config } = colRes.rows[0];
    const cfg = crawl_config ?? {};

    const startUrl       = process.env.START_URL    || cfg.startUrl;
    const maxDepth       = Number(process.env.MAX_DEPTH   || cfg.maxDepth  || 3);
    const maxPages       = Number(process.env.MAX_PAGES   || cfg.maxPages  || 200);
    const includePattern = process.env.INCLUDE_PATTERN    || cfg.includePattern || null;
    const userAgent      = cfg.userAgent || DEFAULT_UA;

    if (!startUrl) {
      console.error('No startUrl configured. Set crawl_config.startUrl in the collection or pass START_URL env var.');
      process.exit(1);
    }

    console.log(`Crawling "${colName}" (id=${COLLECTION_ID})`);
    console.log(`  startUrl:       ${startUrl}`);
    console.log(`  maxDepth:       ${maxDepth}`);
    console.log(`  maxPages:       ${maxPages}`);
    console.log(`  includePattern: ${includePattern ?? '(none)'}`);

    const pages = await crawl({ startUrl, maxDepth, maxPages, includePattern, userAgent });

    if (pages.length === 0) {
      console.error('ERROR: 0 pages crawled — aborting without touching the collection.');
      process.exit(1);
    }

    console.log(`Embedding ${pages.length} pages…`);
    for (const page of pages) {
      const rawChunks = chunkPlain(page.text);
      const embeddings = await embedAll(rawChunks.map(c => c.text));
      const chunks = rawChunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      await upsertDocumentAndChunks(pool, {
        collectionId: COLLECTION_ID,
        title:        page.title,
        sourceUri:    page.url,
        rawText:      page.text,
        hash:         sha256(page.text),
        metadata:     { url: page.url },
        chunks,
      });
      process.stdout.write('+');
    }

    console.log('\nBumping collection stats…');
    await bumpCollectionStats(pool, COLLECTION_ID);
    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
