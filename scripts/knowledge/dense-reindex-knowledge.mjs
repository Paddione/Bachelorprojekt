// scripts/knowledge/dense-reindex-knowledge.mjs
//
// Vollstaendiger Durchlauf ueber gespeicherte Knowledge-Chunktexte (nicht nur
// erneut abrufbare Quellen): Custom-, Web-, Context7- und Coaching-Daten
// bleiben erhalten. Originaltext pro Quellchunk wird ueber splitDenseText
// vollstaendig zerlegt, alle Teilchunks eingebettet und pro Source-ID
// transaktional in die Shadow-Tabelle geschrieben. Checkpoint nur nach
// vollstaendigem Commit; Resume nutzt nur nachgewiesen fertige, profilidentische
// Eintraege und prueft Run-/Profil-/Quellhash.

import { makeDenseClient, prepareDenseChunks } from './dense-client.mjs';
import {
  assertRunId,
  getGeneration,
  setPhase,
  shadowName,
  SOURCE_PROFILE,
} from './dense-migration-control.mjs';
import {
  assertDenseVectors,
  profileContentHash,
  DENSE_MODEL,
  DENSE_PROFILE,
} from '../lib/dense-embedding.mjs';

const SOURCE_BATCH = 25;

function targetClient(embedUrl, fetchImpl) {
  const url = embedUrl ?? process.env.DENSE_MIGRATION_EMBED_URL;
  if (!url) throw new Error('reindex-knowledge: DENSE_MIGRATION_EMBED_URL fehlt');
  return makeDenseClient({ url, fetchImpl });
}

export async function reindexKnowledge({ pool, embedUrl, fetchImpl, runId, sourceBatch = SOURCE_BATCH } = {}) {
  assertRunId(runId);
  if (!pool) throw new Error('reindex-knowledge: pool erforderlich');
  const gen = await getGeneration(pool, runId);
  if (!gen) throw new Error(`reindex-knowledge: run '${runId}' unbekannt (prepare zuerst)`);
  if (!['prepared', 'indexing'].includes(gen.phase)) {
    throw new Error(`reindex-knowledge: unerwartete Phase '${gen.phase}'`);
  }
  if (gen.target_profile !== DENSE_PROFILE) throw new Error('reindex-knowledge: Profil-Mismatch zum Run');
  const table = shadowName('knowledge', runId);
  const client = targetClient(embedUrl, fetchImpl);

  const src = await pool.query(
    `SELECT c.id, c.document_id, c.collection_id, c.text, c.metadata
       FROM knowledge.chunks c ORDER BY c.id`,
  );
  const doneRes = await pool.query(`SELECT DISTINCT source_chunk_id AS id FROM ${table}`);
  const done = new Set(doneRes.rows.map((r) => String(r.id)));
  const pending = src.rows.filter((r) => !done.has(String(r.id)));
  await setPhase(pool, runId, 'indexing');

  let processed = Number(gen.counters?.knowledge_done ?? 0);
  let embedded = processed;
  for (let i = 0; i < pending.length; i += sourceBatch) {
    const slice = pending.slice(i, i + sourceBatch);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      for (const row of slice) {
        const subs = await prepareDenseChunks(
          [{ position: 0, text: row.text, metadata: row.metadata ?? {} }],
          client,
        );
        const { embeddings } = await client.embedDocuments(subs.map((s) => s.text));
        assertDenseVectors(embeddings, subs.length);
        for (let p = 0; p < subs.length; p++) {
          await db.query(
            `INSERT INTO ${table}
               (document_id, collection_id, position, text, embedding, metadata,
                source_chunk_id, part_index, source_hash, profile)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
            [row.document_id, row.collection_id, p, subs[p].text,
              `[${embeddings[p].join(',')}]`,
              JSON.stringify({ ...(row.metadata ?? {}), embedding_model: DENSE_MODEL }),
              row.id, p, profileContentHash(row.text), DENSE_PROFILE],
          );
        }
        processed++;
        embedded += subs.length;
      }
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    } finally {
      db.release();
    }
    await setPhase(pool, runId, 'indexing', {
      ...(gen.counters ?? {}),
      knowledge_done: processed,
      knowledge_total: src.rows.length,
      knowledge_embedded: embedded,
    });
  }
  return { runId, source_total: src.rows.length, processed, embedded };
}

export function sourceProfile() {
  return SOURCE_PROFILE;
}
