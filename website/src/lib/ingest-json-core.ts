import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { embedBatch } from './embeddings';

const EMBED_BATCH = 8;

export interface JsonEntry {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export function validateJsonEntries(raw: unknown): JsonEntry[] {
  if (!Array.isArray(raw)) throw new Error('Input must be an array');
  return raw.map((entry: unknown, i) => {
    const e = entry as Record<string, unknown>;
    if (typeof e?.id !== 'string' || !e.id)
      throw new Error(`Eintrag ${i}: "id" fehlt oder ist kein String`);
    if (typeof e?.content !== 'string' || !(e.content as string).trim())
      throw new Error(`Eintrag ${i}: "content" fehlt oder ist leer`);
    return e as unknown as JsonEntry;
  });
}

export async function ingestJsonChunks(
  pool: Pool,
  options: { entries: JsonEntry[]; slug: string; sourceUri: string },
  onProgress: (done: number, total: number) => void,
): Promise<{ collectionId: string; count: number }> {
  const { entries, slug, sourceUri } = options;
  const embeddingModel = process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';

  // Find or create collection by slug name
  const existingRes = await pool.query<{ id: string }>(
    `SELECT id FROM knowledge.collections WHERE name = $1 AND source = 'custom'`,
    [slug],
  );
  let collectionId: string;
  if (existingRes.rows.length > 0) {
    collectionId = existingRes.rows[0].id;
  } else {
    const newCol = await pool.query<{ id: string }>(
      `INSERT INTO knowledge.collections (name, source, embedding_model)
       VALUES ($1, 'custom', $2) RETURNING id`,
      [slug, embeddingModel],
    );
    collectionId = newCol.rows[0].id;
  }

  // Create or update the single document for this file
  const rawText = entries.map(e => e.content).join('\n\n');
  const sha256 = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  const docRes = await pool.query<{ id: string }>(
    `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (collection_id, source_uri) DO UPDATE
       SET title = EXCLUDED.title, raw_text = EXCLUDED.raw_text, sha256 = EXCLUDED.sha256
     RETURNING id`,
    [collectionId, slug, sourceUri, rawText, sha256],
  );
  const documentId: string = docRes.rows[0].id;

  // Clear old chunks so re-import is idempotent
  await pool.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [documentId]);

  // Embed and insert in batches of EMBED_BATCH for progress granularity
  let done = 0;
  const total = entries.length;

  for (let i = 0; i < entries.length; i += EMBED_BATCH) {
    const batch = entries.slice(i, i + EMBED_BATCH);
    const { embeddings } = await embedBatch(batch.map(e => e.content));

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j];
      const metadata = { source_id: entry.id, ...(entry.metadata ?? {}) };
      await pool.query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          documentId, collectionId, i + j,
          entry.content,
          `[${embeddings[j].join(',')}]`,
          JSON.stringify(metadata),
        ],
      );
      done++;
      onProgress(done, total);
    }
  }

  // Update chunk_count and last_indexed_at on the collection
  await pool.query(
    `UPDATE knowledge.collections
        SET chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $1),
            last_indexed_at = now()
      WHERE id = $1`,
    [collectionId],
  );

  return { collectionId, count: done };
}
