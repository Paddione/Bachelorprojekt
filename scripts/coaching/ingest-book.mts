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

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: ingest-book.mts <file.pdf|.epub> <slug> [--title="..."] [--author="..."] [--license-note="..."]');
    process.exit(2);
  }
  const [filePath, slug, ...rest] = args;
  const opts = parseFlags(rest);

  console.log(`[ingest] extracting ${filePath}…`);
  const { text, pageCount, format } = await extractText(filePath);
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

    // Voyage free-tier without payment method: 3 RPM / 10K TPM rolling window.
    // 4 chunks ≈ 3K tokens, 30s pause = 2 RPM ≈ 6K TPM (safe headroom).
    // On 429 we sleep 70s and retry the same slice.
    const throttle = process.env.THROTTLE === '1' || process.env.THROTTLE === 'true';
    const sliceSize = throttle ? 4 : chunks.length;
    const sleepMs = throttle ? 30_000 : 0;
    const recoveryMs = 70_000;

    const embeddings: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < chunks.length; i += sliceSize) {
      const slice = chunks.slice(i, i + sliceSize).map((c) => c.text);
      let r: { embeddings: number[][]; tokens: number } | null = null;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          r = await embedBatch(slice);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('voyage 429') && attempt < 5) {
            console.warn(`[ingest] 429 at chunk ${i} (attempt ${attempt}/5), sleeping ${recoveryMs / 1000}s before retry`);
            await new Promise((res) => setTimeout(res, recoveryMs));
            continue;
          }
          throw err;
        }
      }
      if (!r) throw new Error('embed retries exhausted');
      embeddings.push(...r.embeddings);
      tokens += r.tokens;
      if (throttle) {
        const done = Math.min(i + sliceSize, chunks.length);
        console.log(`[ingest] embedded ${done}/${chunks.length} chunks (${tokens} tokens so far)`);
        if (done < chunks.length) await new Promise((res) => setTimeout(res, sleepMs));
      }
    }
    console.log(`[ingest] embeddings done (${tokens} tokens)`);

    // Resolve page anchor per chunk. pdf-parse's pagerender pageMap uses a different
    // character space than the assembled `data.text` (whitespace differs), so the offset-
    // based lookup is unreliable. We use a linear approximation instead: chunks are in
    // document order, so `chunk_index / total_chunks * pageCount` gives the right page
    // ±1-2, plenty for citation. EPUB sets pageCount = chapter count and we surface that.
    const totalChunks = chunks.length;
    const pageForChunkIndex = (i: number): number | null => {
      if (!pageCount || pageCount < 1) return null;
      return Math.min(Math.floor((i * pageCount) / totalChunks) + 1, pageCount);
    };

    const chunksWithEmbeddings = chunks.map((c, i) => ({
      position: c.position,
      text: c.text,
      embedding: embeddings[i],
      metadata: { page: pageForChunkIndex(i) },
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

main().catch((err) => { console.error(err); process.exit(1); });
