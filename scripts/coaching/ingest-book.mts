#!/usr/bin/env tsx
import { basename } from 'node:path';
import { extractText } from './lib-extract.mjs';
// eslint-disable-next-line import/extensions
import { makePool, sha256, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats } from '../knowledge/lib-knowledge-pg.mjs';
import { chunkText } from '../../website/src/lib/chunking.ts';
import { embedBatch } from '../../website/src/lib/embeddings.ts';

interface CliFlags {
  title?: string;
  author?: string;
  'license-note'?: string;
}

interface PageMapEntry { page: number; charStart: number; }

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ingest-book.mts <file.pdf|.epub> <slug> [--title="..."] [--author="..."] [--license-note="..."]');
    process.exit(2);
  }
  const [filePath, slug, ...rest] = args;
  const opts = parseFlags(rest);

  console.log(`[ingest] extracting ${filePath}…`);
  const { text, pageCount, pageMap, format } = await extractText(filePath);
  console.log(`[ingest] extracted ${text.length} chars, ${pageCount} pages, format=${format}`);

  const pool = makePool();
  try {
    const collectionId: string = await ensureCollection(pool, {
      name: `coaching-${slug}`,
      source: 'custom',
      brand: 'mentolder',
      description: opts.title ?? slug,
    });

    const chunks = chunkText(text, { mode: 'plain', targetTokens: 600, overlapTokens: 80 });
    console.log(`[ingest] embedding ${chunks.length} chunks…`);
    const { embeddings, tokens } = await embedBatch(chunks.map((c) => c.text));
    console.log(`[ingest] embeddings done (${tokens} tokens)`);

    // Resolve approximate character offsets for each chunk so we can map to pages.
    // chunkText returns `position` as a sequential index, not a char offset, so we
    // re-locate each chunk in the source text to derive the offset for pageMap lookup.
    let searchCursor = 0;
    const charOffsets: number[] = chunks.map((c) => {
      const head = c.text.slice(0, 64);
      const idx = text.indexOf(head, searchCursor);
      const offset = idx >= 0 ? idx : searchCursor;
      if (idx >= 0) searchCursor = idx + Math.max(1, c.text.length - 64);
      return offset;
    });

    const chunksWithEmbeddings = chunks.map((c, i) => ({
      position: c.position,
      text: c.text,
      embedding: embeddings[i],
      metadata: { page: pageForOffset(charOffsets[i], pageMap as PageMapEntry[] | null) },
    }));

    await upsertDocumentAndChunks(pool, {
      collectionId,
      title: opts.title ?? slug,
      sourceUri: `file://${basename(filePath)}`,
      rawText: text,
      hash: sha256(text),
      metadata: { format, pageCount },
      chunks: chunksWithEmbeddings,
    });

    await bumpCollectionStats(pool, collectionId);

    await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, author, source_filename, license_note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (knowledge_collection_id) DO UPDATE
         SET title = EXCLUDED.title, author = EXCLUDED.author, license_note = EXCLUDED.license_note`,
      [collectionId, opts.title ?? slug, opts.author ?? null, basename(filePath), opts['license-note'] ?? null],
    );

    console.log(`[ingest] done. collectionId=${collectionId}`);
  } finally {
    await pool.end();
  }
}

function parseFlags(rest: string[]): CliFlags {
  const out: Record<string, string> = {};
  for (const a of rest) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out as CliFlags;
}

function pageForOffset(charOffset: number, pageMap: PageMapEntry[] | null): number | null {
  if (!pageMap || pageMap.length === 0) return null;
  let page = pageMap[0].page;
  for (const entry of pageMap) {
    if (entry.charStart > charOffset) break;
    page = entry.page;
  }
  return page;
}

main().catch((err) => { console.error(err); process.exit(1); });
