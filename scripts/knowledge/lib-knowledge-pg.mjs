import pg from 'pg';
import { createHash } from 'node:crypto';
import {
  assertDenseVectors,
  DENSE_MODEL,
  DENSE_PROFILE,
} from '../lib/dense-embedding.mjs';
import { makeDenseClient } from './dense-client.mjs';

const { Pool } = pg;

export function makePool() {
  if (process.env.PGURL) {
    return new Pool({ connectionString: process.env.PGURL });
  }
  return new Pool({
    host:     process.env.PGHOST     ?? 'shared-db',
    port:     Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? 'website',
    user:     process.env.PGUSER     ?? 'website',
    password: process.env.PGPASSWORD,
  });
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * Legt eine Collection bei Bedarf an. Neue Collections tragen das aktive
 * Gemma-Profil; eine bestehende Collection wird waehrend des Shadow-Laufs
 * NICHT auf Gemma umgeschrieben (kein stilles Umetikettieren).
 */
export async function ensureCollection(pool, { name, source, brand = null, description = null }) {
  // embedding_model wird nie nachtraeglich umgeschrieben: Bestand bleibt
  // bis zum Cutover unveraendert, neue Collections starten im Gemma-Profil.
  const r = await pool.query(
    `INSERT INTO knowledge.collections (name, source, brand, description, embedding_model)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (name) DO UPDATE SET description = COALESCE(EXCLUDED.description, knowledge.collections.description)
     RETURNING id`,
    [name, source, brand, description, DENSE_MODEL],
  );
  return r.rows[0].id;
}

/**
 * Writer-Gate auf App-Ebene (DB-Trigger sind die harte Sperre): blockt
 * Schreibvorgaenge waehrend einer laufenden Migration und ohne aktive
 * Gemma-Generation. Fehlender Tracking-Stand ist ein Profilfehler.
 */
export async function assertWriteAllowed(client) {
  let rows;
  try {
    const r = await client.query(
      `SELECT writer_locked, phase, target_profile
         FROM public.dense_embedding_migrations
        WHERE active = true
        LIMIT 1`,
    );
    rows = r.rows;
  } catch {
    throw new Error('dense write blocked: no active dense generation (run dense-migration prepare/cutover)');
  }
  const active = rows[0];
  if (!active) {
    throw new Error('dense write blocked: no active dense generation (run dense-migration prepare/cutover)');
  }
  if (active.writer_locked || active.phase !== 'active') {
    throw new Error(`dense write blocked: migration running (phase=${active.phase})`);
  }
  if (active.target_profile !== DENSE_PROFILE) {
    throw new Error(`dense write blocked: unexpected profile '${active.target_profile}'`);
  }
}

export async function upsertDocumentAndChunks(pool, {
  collectionId, title, sourceUri, rawText, hash, metadata = {}, chunks,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Writer-Gate in derselben Transaktion wie der Write; Vektoren vor
    // Ersetzen der alten vollstaendigen Chunks pruefen.
    await assertWriteAllowed(client);
    if (chunks !== null) {
      assertDenseVectors(chunks.map((c) => c.embedding), chunks.length);
    }

    // Lock existing document row if present to check previous hash and serialize concurrent updates
    const existingRes = await client.query(
      `SELECT id, sha256 FROM knowledge.documents
       WHERE collection_id = $1 AND source_uri = $2
       FOR UPDATE`,
      [collectionId, sourceUri],
    );

    const prevDoc = existingRes.rows[0];
    if (prevDoc && prevDoc.sha256 === hash && chunks === null) {
      await client.query('COMMIT');
      return { docId: prevDoc.id, reused: true };
    }

    if (chunks === null) {
      throw new Error(`Cannot update document ${sourceUri} without chunks when hash differs`);
    }

    const docRes = await client.query(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (collection_id, source_uri) DO UPDATE
         SET title = EXCLUDED.title,
             raw_text = EXCLUDED.raw_text,
             sha256 = EXCLUDED.sha256,
             metadata = EXCLUDED.metadata
       RETURNING id, sha256`,
      [collectionId, title, sourceUri, rawText, hash, JSON.stringify(metadata)],
    );
    const docId = docRes.rows[0].id;

    await client.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [docId]);
    for (const c of chunks) {
      await client.query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          docId,
          collectionId,
          c.position,
          c.text,
          `[${c.embedding.join(',')}]`,
          JSON.stringify(c.metadata ?? {}),
        ],
      );
    }

    await client.query('COMMIT');
    return { docId, reused: false };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function bumpCollectionStats(pool, collectionId) {
  await pool.query(
    `UPDATE knowledge.collections
        SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
            last_indexed_at = now()
      WHERE id = $1`,
    [collectionId],
  );
}

export async function updateCollectionChunkCount(pool, collectionId) {
  await pool.query(
    `UPDATE knowledge.collections
        SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1)
      WHERE id = $1`,
    [collectionId],
  );
}

// Einziger Embed-Pfad ist das aktive Gemma-Dense-Profil ueber LLM_EMBED_URL
// (fail-closed). Signatur bleibt (Rueckgabe inkl. Modellname), damit alle
// Ingest-Skripte weiterlaufen.
export async function embedAllWithModel(texts, batch = 128) {
  void batch;
  const url = process.env.LLM_EMBED_URL;
  if (!url) throw new Error('LLM_EMBED_URL nicht konfiguriert — aktives Gemma-Dense-Backend erforderlich');
  const client = makeDenseClient({ url });
  const { embeddings } = await client.embedDocuments(texts);
  return { embeddings, model: DENSE_MODEL };
}

export async function embedAll(texts, batch = 128) {
  const res = await embedAllWithModel(texts, batch);
  return res.embeddings;
}

export function chunkPlain(text, target = 600, overlap = 100) {
  const charPerTok = 4;
  const targetChars  = target  * charPerTok;
  const overlapChars = overlap * charPerTok;
  if (text.length <= targetChars) return [{ position: 0, text }];
  const out = [];
  let pos = 0;
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + targetChars, text.length);
    if (end < text.length) {
      const slice = text.slice(end - 100, end);
      const idx = slice.lastIndexOf(' ');
      if (idx >= 0) end = end - 100 + idx;
    }
    out.push({ position: pos++, text: text.slice(cursor, end).trim() });
    if (end >= text.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return out;
}
