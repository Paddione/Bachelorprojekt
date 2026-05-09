#!/usr/bin/env node
import { makePool, sha256, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats, embedAll, chunkPlain } from './lib-knowledge-pg.mjs';

const COLLECTION_NAME = 'PR History';
const COLLECTION_SOURCE = 'pr_history';

async function main() {
  const pool = makePool();
  try {
    const collectionId = await ensureCollection(pool, {
      name: COLLECTION_NAME,
      source: COLLECTION_SOURCE,
      description: 'Merged pull requests from bachelorprojekt.features',
    });

    const { rows } = await pool.query(
      `SELECT pr_number, title, description, body, merged_at, labels
         FROM bachelorprojekt.features
        WHERE merged_at IS NOT NULL
        ORDER BY merged_at DESC`,
    );

    console.log(`Found ${rows.length} PRs to ingest`);

    for (const row of rows) {
      const text = [
        `PR #${row.pr_number}: ${row.title}`,
        row.description ?? '',
        row.body ?? '',
        row.labels?.length ? `Labels: ${row.labels.join(', ')}` : '',
      ].filter(Boolean).join('\n\n');

      const hash = sha256(text);
      const sourceUri = `pr:${row.pr_number}`;
      const chunks = chunkPlain(text).map(c => ({ ...c, embedding: null }));

      // Embed
      const embeddings = await embedAll(chunks.map(c => c.text));
      const chunksWithEmbed = chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      await upsertDocumentAndChunks(pool, {
        collectionId,
        title: `PR #${row.pr_number}: ${row.title}`,
        sourceUri,
        rawText: text,
        hash,
        metadata: {
          pr_number: row.pr_number,
          merged_at: row.merged_at,
          labels: row.labels ?? [],
        },
        chunks: chunksWithEmbed,
      });
      process.stdout.write('.');
    }

    console.log('\nBumping collection stats...');
    await bumpCollectionStats(pool, collectionId);
    console.log('Done.');
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
