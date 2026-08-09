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
      description: 'Merged pull requests (live source: tickets.ticket_links)',
    });

    const { rows } = await pool.query(
      `SELECT DISTINCT l.pr_number, t.title, t.description
         FROM tickets.ticket_links l
         JOIN tickets.tickets t ON t.id = l.from_id
        WHERE l.pr_number IS NOT NULL
        ORDER BY l.pr_number DESC`,
    );

    if (rows.length === 0) {
      // [T002605] Zero-Item-Guard: siehe ingest-bug-tickets.mjs — stille-gruene
      // Fehlerklasse beheben, bevor der Live-Store uebersehen bleibt.
      const { rows: live } = await pool.query(
        `SELECT COUNT(DISTINCT pr_number) AS n FROM tickets.ticket_links WHERE pr_number IS NOT NULL`,
      );
      const liveCount = Number(live[0]?.n ?? 0);
      if (liveCount > 0) {
        console.error(`0 PRs, but live store has ${liveCount} — source misconfiguration?`);
        process.exit(1);
      }
      console.log('0 PRs (live store empty — nothing to ingest)');
    }

    console.log(`Found ${rows.length} PRs to ingest`);

    for (const row of rows) {
      const text = [
        `PR #${row.pr_number}: ${row.title}`,
        row.description ?? '',
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
