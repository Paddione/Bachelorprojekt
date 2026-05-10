#!/usr/bin/env tsx
import { Pool } from 'pg';
import { classifyChunk, CLASSIFIER_VERSION, DEFAULT_MODEL } from '../../website/src/lib/coaching-classifier.ts';
import { insertDraft } from '../../website/src/lib/coaching-db.ts';

interface CliFlags {
  slug?: string;     // book slug (matches `coaching-${slug}` collection name)
  all?: boolean;
  delayMs?: number;
}

async function main() {
  const opts = parseFlags(process.argv.slice(2));
  if (!opts.slug && !opts.all) {
    console.error('Usage: classify-book.mts --slug=<slug> | --all  [--delay-ms=1000]');
    process.exit(2);
  }
  const pool = new Pool();
  try {
    const books = opts.slug
      ? await pool.query(
          `SELECT b.id, b.title, b.knowledge_collection_id
             FROM coaching.books b
             JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
            WHERE c.name = $1`,
          [`coaching-${opts.slug}`],
        )
      : await pool.query(`SELECT id, title, knowledge_collection_id FROM coaching.books ORDER BY ingested_at DESC`);

    if (books.rowCount === 0) {
      console.error(`[classify] no book found for slug=${opts.slug}`);
      process.exit(1);
    }

    for (const book of books.rows) {
      console.log(`[classify] ${book.title} (id=${book.id})`);
      const chunks = await pool.query(
        `SELECT kc.id, kc.text
           FROM knowledge.chunks kc
           JOIN knowledge.documents kd ON kd.id = kc.document_id
          WHERE kd.collection_id = $1
            AND NOT EXISTS (
              SELECT 1 FROM coaching.drafts d
               WHERE d.knowledge_chunk_id = kc.id
                 AND d.classifier_version = $2
            )
          ORDER BY kc.position ASC`,
        [book.knowledge_collection_id, CLASSIFIER_VERSION],
      );
      console.log(`[classify] ${chunks.rowCount} chunks to process (model=${DEFAULT_MODEL}, version=${CLASSIFIER_VERSION})`);

      let drafts = 0, theory = 0, noise = 0, errors = 0;
      for (let i = 0; i < chunks.rowCount; i++) {
        const c = chunks.rows[i];
        try {
          const result = await classifyChunk(c.text);
          if (result.kind === 'theory') { theory++; }
          else if (result.kind === 'noise') { noise++; }
          else {
            await insertDraft(pool, {
              bookId: book.id,
              knowledgeChunkId: c.id,
              templateKind: result.kind,
              suggestedPayload: result.payload ?? {},
              classifierModel: result.model,
              classifierVersion: result.version,
            });
            drafts++;
          }
        } catch (err) {
          errors++;
          console.warn(`[classify] chunk ${c.id} failed: ${err instanceof Error ? err.message : err}`);
        }
        if ((i + 1) % 10 === 0) console.log(`[classify]   progress ${i + 1}/${chunks.rowCount}  drafts=${drafts} theory=${theory} noise=${noise} errors=${errors}`);
        if (opts.delayMs && i < chunks.rowCount - 1) await new Promise((r) => setTimeout(r, opts.delayMs));
      }
      console.log(`[classify] ${book.title}: drafts=${drafts} theory=${theory} noise=${noise} errors=${errors}`);
    }
  } finally {
    await pool.end();
  }
}

function parseFlags(argv: string[]): CliFlags {
  const out: any = { delayMs: 1000 };
  for (const a of argv) {
    if (a === '--all') out.all = true;
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) {
      if (m[1] === 'delay-ms') out.delayMs = parseInt(m[2], 10);
      else out[m[1]] = m[2];
    }
  }
  return out;
}

main().catch((err) => { console.error(err); process.exit(1); });
