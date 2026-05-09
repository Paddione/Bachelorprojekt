#!/usr/bin/env node
import { makePool, sha256, ensureCollection, upsertDocumentAndChunks, bumpCollectionStats, embedAll, chunkPlain } from './lib-knowledge-pg.mjs';

const COLLECTION_NAME = 'Bug Tickets';
const COLLECTION_SOURCE = 'bug_tickets';
const BRAND = process.env.BRAND ?? 'mentolder';

async function main() {
  const pool = makePool();
  try {
    const collectionId = await ensureCollection(pool, {
      name: COLLECTION_NAME,
      source: COLLECTION_SOURCE,
      brand: BRAND,
      description: `Bug tickets for brand: ${BRAND}`,
    });

    const { rows } = await pool.query(
      `SELECT id, title, description, status, brand, created_at, fixed_in_pr
         FROM bugs.bug_tickets
        WHERE brand = $1
        ORDER BY created_at DESC`,
      [BRAND],
    );

    console.log(`Found ${rows.length} bug tickets for brand "${BRAND}"`);

    for (const row of rows) {
      const text = [
        `${row.id}: ${row.title}`,
        `Status: ${row.status}`,
        row.fixed_in_pr ? `Fixed in PR #${row.fixed_in_pr}` : '',
        row.description ?? '',
      ].filter(Boolean).join('\n\n');

      const hash = sha256(text);
      const sourceUri = `bug:${row.id}`;
      const rawChunks = chunkPlain(text);
      const embeddings = await embedAll(rawChunks.map(c => c.text));
      const chunks = rawChunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      await upsertDocumentAndChunks(pool, {
        collectionId,
        title: `${row.id}: ${row.title}`,
        sourceUri,
        rawText: text,
        hash,
        metadata: {
          ticket_id: row.id,
          status: row.status,
          brand: row.brand,
          fixed_in_pr: row.fixed_in_pr,
          created_at: row.created_at,
        },
        chunks,
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
