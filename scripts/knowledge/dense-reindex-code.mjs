// scripts/knowledge/dense-reindex-code.mjs
//
// Vollstaendiger Durchlauf ueber gespeicherte Code-Chunks. Aufstiegsregel:
// Quellindex, dann Part-Index, fortlaufend je Datei; file_dependencies bleibt
// unberuehrt. Leere Texte/ungueltige Eingaben sind explizite Quellfehler, kein
// stiller Skip. Profil-Datei-Hash ist eine Migrations-Linie (kein Skip-Hash):
// der erste indexFile-Lauf nach Cutover bettet einmal neu ein und etabliert
// danach Skip-Hashes aus echten Dateiinhalten.

import { makeDenseClient, prepareDenseChunks } from './dense-client.mjs';
import {
  assertRunId,
  getGeneration,
  setPhase,
  shadowName,
} from './dense-migration-control.mjs';
import {
  assertDenseVectors,
  profileContentHash,
  DENSE_PROFILE,
} from '../lib/dense-embedding.mjs';

const FILE_BATCH = 10;

function targetClient(embedUrl, fetchImpl) {
  const url = embedUrl ?? process.env.DENSE_MIGRATION_EMBED_URL;
  if (!url) throw new Error('reindex-code: DENSE_MIGRATION_EMBED_URL fehlt');
  return makeDenseClient({ url, fetchImpl });
}

export async function reindexCode({ pool, embedUrl, fetchImpl, runId, fileBatch = FILE_BATCH } = {}) {
  assertRunId(runId);
  if (!pool) throw new Error('reindex-code: pool erforderlich');
  const gen = await getGeneration(pool, runId);
  if (!gen) throw new Error(`reindex-code: run '${runId}' unbekannt (prepare zuerst)`);
  if (!['prepared', 'indexing'].includes(gen.phase)) {
    throw new Error(`reindex-code: unerwartete Phase '${gen.phase}'`);
  }
  if (gen.target_profile !== DENSE_PROFILE) throw new Error('reindex-code: Profil-Mismatch zum Run');
  const table = shadowName('code', runId);
  const client = targetClient(embedUrl, fetchImpl);

  const filesRes = await pool.query(`SELECT DISTINCT file_path FROM code_embeddings ORDER BY file_path`);
  const doneRes = await pool.query(`SELECT DISTINCT file_path FROM ${table}`);
  const done = new Set(doneRes.rows.map((r) => r.file_path));
  const pendingFiles = filesRes.rows.map((r) => r.file_path).filter((f) => !done.has(f));
  await setPhase(pool, runId, 'indexing');

  let files = Number(gen.counters?.code_files_done ?? 0);
  let embedded = Number(gen.counters?.code_done ?? 0);
  for (let i = 0; i < pendingFiles.length; i += fileBatch) {
    const slice = pendingFiles.slice(i, i + fileBatch);
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      for (const filePath of slice) {
        const src = await db.query(
          `SELECT id, chunk_index, content, file_hash FROM code_embeddings WHERE file_path = $1 ORDER BY chunk_index`,
          [filePath],
        );
        if (src.rows.length === 0) throw new Error(`reindex-code: Quelldatei '${filePath}' verschwunden`);
        const planned = [];
        for (const row of src.rows) {
          if (typeof row.content !== 'string' || row.content === '') {
            throw new Error(`reindex-code: ungueltiger Quelltext (${filePath}#${row.chunk_index})`);
          }
          const subs = await prepareDenseChunks([{ position: row.chunk_index, text: row.content }], client);
          const { embeddings } = await client.embedDocuments(subs.map((s) => s.text));
          assertDenseVectors(embeddings, subs.length);
          subs.forEach((s, p) => planned.push({ row, text: s.text, embedding: embeddings[p], partIndex: p }));
        }
        // Ein Profil-Datei-Hash je Datei (Migrations-Linie, kein Skip-Hash).
        const fileHash = profileContentHash(planned.map((x) => x.text).join('\n'));
        let chunkIndex = 0;
        for (const x of planned) {
          await db.query(
            `INSERT INTO ${table}
               (file_path, chunk_index, content, file_hash, embedding, metadata,
                source_row_id, source_chunk_index, part_index, profile)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)`,
            [filePath, chunkIndex++, x.text, fileHash,
              `[${x.embedding.join(',')}]`, JSON.stringify({ embedding_model: DENSE_PROFILE }),
              x.row.id, x.row.chunk_index, x.partIndex, DENSE_PROFILE],
          );
          embedded++;
        }
        files++;
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
      code_files_done: files,
      code_total: filesRes.rows.length,
      code_done: embedded,
    });
  }
  return { runId, files_total: filesRes.rows.length, files, embedded };
}
