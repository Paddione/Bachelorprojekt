import pg from 'pg';
import { createHash } from 'node:crypto';

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

export async function ensureCollection(pool, { name, source, brand = null, description = null }) {
  const r = await pool.query(
    `INSERT INTO knowledge.collections (name, source, brand, description)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET description = COALESCE(EXCLUDED.description, knowledge.collections.description)
     RETURNING id`,
    [name, source, brand, description],
  );
  return r.rows[0].id;
}

export async function upsertDocumentAndChunks(pool, {
  collectionId, title, sourceUri, rawText, hash, metadata = {}, chunks,
}) {
  const docRes = await pool.query(
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
  const prevHash = docRes.rows[0].sha256;
  if (prevHash === hash && chunks === null) return { docId, reused: true };

  await pool.query('DELETE FROM knowledge.chunks WHERE document_id = $1', [docId]);
  for (const c of chunks) {
    await pool.query(
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
  return { docId, reused: false };
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

export async function callVoyage(inputs, inputType = 'document') {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY unset');
  const r = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: inputs, model: 'voyage-multilingual-2', input_type: inputType }),
  });
  if (!r.ok) throw new Error(`voyage ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { embeddings: j.data.map(d => d.embedding), tokens: j.usage.total_tokens };
}

// T002570: LLM_ROUTER_URL/llm-router.workspace.svc.cluster.local:4000 war toter
// Code — dieser Service existiert im Cluster nicht. bge-m3 laeuft ueber
// LLM_EMBED_URL, dieselbe Konvention wie website/src/lib/bge-router.ts
// (http://llm-gateway-embed.workspace.svc.cluster.local:8081, k3d/llm-gpu.yaml).
async function embedViaBge(texts, url) {
  const r = await fetch(`${url}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'bge-m3', input: texts }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`bge ${r.status} ${await r.text()}`);
  const j = await r.json();
  return { embeddings: j.data.map(d => d.embedding) };
}

// T002570: bge-m3 ist primaer, Voyage AI nur Fallback. bgeDead lebt nur fuer
// den aktuellen Prozesslauf (Modul-Variable, kein persistenter Zustand) —
// die Ingest-Skripte rufen embedAll() pro Dokument in einer Schleife auf;
// ohne diesen Cache wuerde bei totem bge jedes Dokument erneut 10s Timeout
// kosten, bevor auf Voyage ausgewichen wird.
let bgeDead = false;

export async function embedAll(texts, batch = 128) {
  const bgeUrl = process.env.LLM_EMBED_URL;
  if (bgeUrl && !bgeDead) {
    try {
      const out = [];
      const bgeBatch = 64;
      for (let i = 0; i < texts.length; i += bgeBatch) {
        const r = await embedViaBge(texts.slice(i, i + bgeBatch), bgeUrl);
        out.push(...r.embeddings);
      }
      return out;
    } catch (err) {
      console.warn(
        `[embedAll] bge-m3 (${bgeUrl}) fehlgeschlagen — falle fuer den Rest `
        + `dieses Laufs auf Voyage AI zurueck: ${err.message}`,
      );
      bgeDead = true;
    }
  } else if (!bgeUrl) {
    console.warn('[embedAll] LLM_EMBED_URL nicht konfiguriert — falle auf Voyage AI zurueck');
  }

  const out = [];
  for (let i = 0; i < texts.length; i += batch) {
    const r = await callVoyage(texts.slice(i, i + batch), 'document');
    out.push(...r.embeddings);
  }
  return out;
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
