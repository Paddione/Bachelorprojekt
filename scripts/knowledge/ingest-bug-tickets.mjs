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
      `SELECT t.external_id AS ticket_id, t.title, t.description, t.status, t.brand, t.created_at,
              (SELECT l.pr_number FROM tickets.ticket_links l
                WHERE l.from_id = t.id AND l.kind = 'fixes' AND l.pr_number IS NOT NULL
                ORDER BY l.created_at DESC LIMIT 1) AS fixed_in_pr
         FROM tickets.tickets t
        WHERE t.brand = $1 AND t.type IN ('bug','fix')
        ORDER BY t.created_at DESC`,
      [BRAND],
    );

    if (rows.length === 0) {
      // [T002605] Zero-Item-Guard: leere Quelle ist verdaechtig, wenn der
      // Live-Store befuellt ist — vorher meldete der CronJob "Found 0 bug
      // tickets" mit Exit 0, obwohl die Legacy-Tabellen schon lange leer waren.
      const { rows: live } = await pool.query(
        `SELECT COUNT(*) AS n FROM tickets.tickets WHERE brand = $1 AND type IN ('bug','fix')`,
        [BRAND],
      );
      const liveCount = Number(live[0]?.n ?? 0);
      if (liveCount > 0) {
        console.error(`0 bug tickets, but live store has ${liveCount} — source misconfiguration?`);
        process.exit(1);
      }
      console.log('0 bug tickets (live store empty — nothing to ingest)');
    }

    console.log(`Found ${rows.length} bug tickets for brand "${BRAND}"`);

    for (const row of rows) {
      const text = [
        `${row.ticket_id}: ${row.title}`,
        `Status: ${row.status}`,
        row.fixed_in_pr ? `Fixed in PR #${row.fixed_in_pr}` : '',
        row.description ?? '',
      ].filter(Boolean).join('\n\n');

      const hash = sha256(text);
      const sourceUri = `bug:${row.ticket_id}`;
      const rawChunks = chunkPlain(text);
      const embeddings = await embedAll(rawChunks.map(c => c.text));
      const chunks = rawChunks.map((c, i) => ({ ...c, embedding: embeddings[i] }));

      await upsertDocumentAndChunks(pool, {
        collectionId,
        title: `${row.ticket_id}: ${row.title}`,
        sourceUri,
        rawText: text,
        hash,
        metadata: {
          ticket_id: row.ticket_id,
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
