#!/usr/bin/env node
/**
 * ingest-context7.mjs — Fetch markdown docs from context7 API and ingest into
 * a pgvector knowledge collection with markdown-aware chunking.
 *
 * Required env vars:
 *   COLLECTION_ID   UUID of the target knowledge.collections row
 *   LIBRARY_ID      context7 library path (e.g. /withastro/docs)
 *   PGURL           Full postgres connection string
 *   VOYAGE_API_KEY  (or LLM_ENABLED=true + TEI running) for embeddings
 *
 * Optional env vars:
 *   TOKENS          Max tokens to request from context7 (default 20000)
 */

import { sha256, embedAll, upsertDocumentAndChunks, bumpCollectionStats } from './lib-knowledge-pg.mjs';
import pg from 'pg';

const { Pool } = pg;

const COLLECTION_ID = process.env.COLLECTION_ID;
const LIBRARY_ID    = process.env.LIBRARY_ID;
const PGURL         = process.env.PGURL;
const TOKENS        = Number(process.env.TOKENS || 20000);

if (!COLLECTION_ID) { console.error('COLLECTION_ID is required'); process.exit(1); }
if (!LIBRARY_ID)    { console.error('LIBRARY_ID is required');    process.exit(1); }
if (!PGURL)         { console.error('PGURL is required');         process.exit(1); }

const CONTEXT7_BASE = 'https://context7.com/api/v1';
const FETCH_TIMEOUT = 30_000;
const MIN_CONTENT_CHARS = 200;
const MAX_CHUNK_CHARS = 1200;

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

/**
 * Markdown-aware chunker: splits at ## / ### boundaries, preserving the heading
 * in each chunk for context. Oversized sections get sub-chunked at paragraph
 * breaks (\n\n).
 */
function chunkMarkdown(text) {
  const HEADING_RE = /^#{2,3}\s/m;
  const sections = [];
  let currentHeading = '';
  let buf = '';

  for (const line of text.split('\n')) {
    if (HEADING_RE.test(line) && buf.length > 0) {
      sections.push({ heading: currentHeading, text: buf.trim() });
      currentHeading = line;
      buf = '';
    } else if (HEADING_RE.test(line)) {
      currentHeading = line;
    }
    buf += line + '\n';
  }
  if (buf.trim().length > 0) {
    sections.push({ heading: currentHeading, text: buf.trim() });
  }

  const chunks = [];
  let pos = 0;

  for (const section of sections) {
    if (section.text.length <= MAX_CHUNK_CHARS) {
      chunks.push({ position: pos++, text: section.text });
      continue;
    }

    // Sub-chunk at paragraph breaks
    const paragraphs = section.text.split(/\n\n+/);
    let subBuf = section.heading ? section.heading + '\n\n' : '';

    for (const para of paragraphs) {
      if (subBuf.length + para.length + 2 > MAX_CHUNK_CHARS && subBuf.trim().length > 0) {
        chunks.push({ position: pos++, text: subBuf.trim() });
        // Prepend heading to next sub-chunk for context
        subBuf = section.heading ? section.heading + ' (cont.)\n\n' : '';
      }
      subBuf += para + '\n\n';
    }
    if (subBuf.trim().length > 0) {
      chunks.push({ position: pos++, text: subBuf.trim() });
    }
  }

  return chunks;
}

async function fetchContext7(libraryId, tokens) {
  const url = `${CONTEXT7_BASE}${libraryId}?tokens=${tokens}`;
  console.log(`  GET ${url}`);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'Accept': 'text/plain, text/markdown' },
    });
    clearTimeout(t);

    if (res.status === 404) {
      console.warn(`  ⚠ 404 — library "${libraryId}" not found on context7. Skipping.`);
      return null;
    }
    if (!res.ok) {
      throw new Error(`context7 HTTP ${res.status}: ${await res.text()}`);
    }

    const text = await res.text();
    if (text.length < MIN_CONTENT_CHARS) {
      console.warn(`  ⚠ Response too short (${text.length} chars). Skipping.`);
      return null;
    }

    return text;
  } catch (err) {
    clearTimeout(t);
    if (err.name === 'AbortError') {
      throw new Error(`context7 request timed out after ${FETCH_TIMEOUT}ms`);
    }
    throw err;
  }
}

async function main() {
  const pool = makePoolFromUrl(PGURL);

  try {
    // Verify collection exists
    const colRes = await pool.query(
      `SELECT name FROM knowledge.collections WHERE id = $1`,
      [COLLECTION_ID],
    );
    if (colRes.rows.length === 0) {
      console.error(`Collection ${COLLECTION_ID} not found`);
      process.exit(1);
    }
    const colName = colRes.rows[0].name;

    console.log(`Ingesting context7 library: ${LIBRARY_ID}`);
    console.log(`  Collection: "${colName}" (${COLLECTION_ID})`);
    console.log(`  Tokens: ${TOKENS}`);

    const markdown = await fetchContext7(LIBRARY_ID, TOKENS);
    if (!markdown) {
      console.log('  Nothing to ingest — exiting cleanly.');
      process.exit(0);
    }

    console.log(`  Fetched ${markdown.length} chars`);

    const rawChunks = chunkMarkdown(markdown);
    console.log(`  Split into ${rawChunks.length} chunks`);

    console.log('  Embedding…');
    const embeddings = await embedAll(rawChunks.map(c => c.text));

    const chunks = rawChunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

    const sourceUri = `https://context7.com${LIBRARY_ID}`;

    await upsertDocumentAndChunks(pool, {
      collectionId: COLLECTION_ID,
      title:        `context7: ${LIBRARY_ID}`,
      sourceUri,
      rawText:      markdown,
      hash:         sha256(markdown),
      metadata:     { libraryId: LIBRARY_ID, tokens: TOKENS },
      chunks,
    });

    console.log('  Bumping collection stats…');
    await bumpCollectionStats(pool, COLLECTION_ID);
    console.log('  ✓ Done.');
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
