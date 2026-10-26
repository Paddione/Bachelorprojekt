import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import { embedBatch } from './embeddings.ts';
import { assertActiveDenseProfile } from './dense-embedding-guard.ts';
import {
  assertDenseVectors,
  DENSE_MODEL,
} from '../../../../scripts/lib/dense-embedding.mjs';

const EMBED_BATCH = 8;

// Konservativer Pre-Split: Der Proxy reicht /tokenize nicht durch, daher
// kennt der Website-Writer keine echten Modell-Tokens. 3000 Zeichen liegen
// fuer lateinische Texte weit unter 2048 Tokens; was dennoch zu lang ist,
// lehnt der Upstream mit HTTP 400 ab — die Transaktion rollt dann vollstaendig
// zurueck statt still zu kuerzen. join('') der Teile ist exakt der Ausgangstext.
const MAX_CHUNK_CHARS = 3000;

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

export function presplitJsonText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const out: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(cursor + MAX_CHUNK_CHARS, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > cursor) end = nl + 1;
    }
    if (end < text.length) {
      const hi = text.charCodeAt(end - 1);
      const lo = text.charCodeAt(end);
      if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) end += 1;
    }
    if (end <= cursor) throw new Error('presplitJsonText: split makes no progress');
    out.push(text.slice(cursor, end));
    cursor = end;
  }
  return out;
}

export async function ingestJsonChunks(
  pool: Pool,
  options: { entries: JsonEntry[]; slug: string; sourceUri: string; brand?: string | null },
  onProgress: (done: number, total: number) => void,
): Promise<{ collectionId: string; count: number }> {
  const { entries, slug, sourceUri, brand = null } = options;
  // Fail-closed vor jedem Netzwerkzugriff: ohne aktive Gemma-Generation
  // kein Schreiben, bei laufender Migration expliziter Fehler.
  await assertActiveDenseProfile(pool);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingRes = await client.query<{ id: string }>(
      `SELECT id FROM knowledge.collections WHERE name = $1 AND source = 'custom'`,
      [slug],
    );
    let collectionId: string;
    if (existingRes.rows.length > 0) {
      collectionId = existingRes.rows[0].id;
    } else {
      const newCol = await client.query<{ id: string }>(
        `INSERT INTO knowledge.collections (name, source, embedding_model, brand)
         VALUES ($1, 'custom', $2, $3) RETURNING id`,
        // Label bewusst erst hier, innerhalb der Transaktion: kein
        // Modellwechsel vor Netzwerk-/Insert-Erfolg.
        [slug, DENSE_MODEL, brand],
      );
      collectionId = newCol.rows[0].id;
    }

    const rawText = entries.map(e => e.content).join('\n\n');
    const sha256 = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
    const docRes = await client.query<{ id: string }>(
      `INSERT INTO knowledge.documents (collection_id, title, source_uri, raw_text, sha256)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (collection_id, source_uri) DO UPDATE
         SET title = EXCLUDED.title,
             raw_text = EXCLUDED.raw_text,
             sha256 = EXCLUDED.sha256
       RETURNING id`,
      [collectionId, slug, sourceUri, rawText, sha256],
    );
    const documentId: string = docRes.rows[0].id;

    // Pro Eintrag alle noetigen Teilchunks mit source_id/Part-Provenienz;
    // Positionen laufen konsistent ueber alle Teilchunks.
    const subchunks: Array<{ text: string; metadata: Record<string, unknown> }> = [];
    for (const entry of entries) {
      const parts = presplitJsonText(entry.content);
      parts.forEach((text, partIndex) => {
        subchunks.push({
          text,
          metadata: { source_id: entry.id, part_index: partIndex, ...(entry.metadata ?? {}) },
        });
      });
    }

    const texts = subchunks.map(s => s.text);
    const embeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      // embedBatch formatiert nach Purpose und prueft Count/Dimension;
      // ein zu langer Text scheitert hier explizit statt gekuerzt zu werden.
      const r = await embedBatch(texts.slice(i, i + EMBED_BATCH), { purpose: 'index' });
      embeddings.push(...r.embeddings);
      onProgress(Math.min(embeddings.length, texts.length), texts.length);
    }
    assertDenseVectors(embeddings, texts.length);

    await client.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [documentId]);
    for (let j = 0; j < subchunks.length; j++) {
      await client.query(
        `INSERT INTO knowledge.chunks (document_id, collection_id, position, text, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          documentId, collectionId, j,
          subchunks[j].text,
          `[${embeddings[j].join(',')}]`,
          JSON.stringify(subchunks[j].metadata),
        ],
      );
    }

    // Label und Zaehlung erst nach erfolgreichem Chunk-Commit.
    await client.query(
      `UPDATE knowledge.collections
          SET embedding_model = $1,
              chunk_count = (SELECT COUNT(*) FROM knowledge.chunks WHERE collection_id = $2),
              last_indexed_at = now()
        WHERE id = $2`,
      [DENSE_MODEL, collectionId],
    );

    await client.query('COMMIT');
    return { collectionId, count: subchunks.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
