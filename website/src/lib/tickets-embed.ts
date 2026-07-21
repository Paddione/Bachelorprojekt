/**
 * website/src/lib/tickets-embed.ts
 *
 * Ticket-embedding writer, similar-ticket search, and backfill helper.
 * All embedding work is BEST-EFFORT: a GPU-host outage must never block
 * ticket creation or reads.
 */
import { pool } from './website-db';
import { embedBatch, embedQuery } from './embeddings';
import { chunkText } from './chunking';
import { ticketEmbeddingModel, MixedEmbeddingModelError } from './tickets-db';
import type { EmbeddingModel } from './embeddings';
import { logger } from './logger';

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Bound a number[] into a VECTOR(1024) literal — mirrors knowledge-db.ts:157. */
function vecLiteral(v: number[]): string { return `[${v.join(',')}]`; }

const SYNC_CHUNK_CAP = 200; // mirror documents.ts — bound synchronous embed work

// ─── T3: embedTicket ─────────────────────────────────────────────────────────

export interface TicketTextParts {
  title: string;
  description?: string | null;
  spec?: string | null;
  lesson?: string | null;
}

type ChunkType = 'summary' | 'spec' | 'decision' | 'lesson';

/**
 * Embed a ticket's text into tickets.ticket_embeddings, tagged with the
 * env-derived model. BEST-EFFORT: all embedding/insert failures are swallowed
 * (logged) and returns the number of rows actually written — ticket
 * creation must never be coupled to GPU-host uptime.
 */
export async function embedTicket(ticketId: string, parts: TicketTextParts): Promise<number> {
  const model = ticketEmbeddingModel();
  // Build (text, chunk_type) pairs. summary = title + description.
  const pairs: Array<{ text: string; type: ChunkType }> = [];
  const summary = [parts.title, parts.description ?? ''].filter(Boolean).join('\n\n').trim();
  if (summary) for (const c of chunkText(summary, { mode: 'markdown' })) pairs.push({ text: c.text, type: 'summary' });
  if (parts.spec) for (const c of chunkText(parts.spec, { mode: 'markdown' })) pairs.push({ text: c.text, type: 'spec' });
  if (parts.lesson) for (const c of chunkText(parts.lesson, { mode: 'markdown' })) pairs.push({ text: c.text, type: 'lesson' });

  const bounded = pairs.slice(0, SYNC_CHUNK_CAP);
  if (bounded.length === 0) return 0;

  try {
    const { embeddings } = await embedBatch(bounded.map(p => p.text), { model, purpose: 'index' });
    let written = 0;
    for (let i = 0; i < bounded.length; i++) {
      await pool.query(
        `INSERT INTO tickets.ticket_embeddings (ticket_id, chunk, chunk_type, embedding, embedding_model)
         VALUES ($1, $2, $3, $4::vector(1024), $5)`,
        [ticketId, bounded[i].text, bounded[i].type, vecLiteral(embeddings[i]), model],
      );
      written++;
    }
    return written;
  } catch (err) {
    // BEST-EFFORT: never propagate to the caller (e.g. ticket create).
    logger.error({ ticketId, err: err instanceof Error ? err.message : err }, `[embedTicket] best-effort embed failed for ${ticketId}`);
    return 0;
  }
}

// ─── T4: findSimilarTickets ──────────────────────────────────────────────────

export interface SimilarTicket {
  ticket_id: string;
  external_id: string;
  chunk: string;
  chunk_type: string;
  similarity: number;
}

/**
 * Semantic similar-ticket search for the Scout phase. Embeds the query with
 * the SAME model the rows were written with, fails closed across vector
 * spaces, and returns ranked tickets. Returns [] when nothing is embedded yet.
 */
export async function findSimilarTickets(queryText: string, k = 5): Promise<SimilarTicket[]> {
  const distinct = await pool.query<{ embedding_model: string | null }>(
    `SELECT DISTINCT embedding_model FROM tickets.ticket_embeddings`,
  );
  const models = distinct.rows.map(r => r.embedding_model).filter((m): m is string => !!m);
  if (models.length === 0) return []; // nothing embedded yet — Scout treats as "no similar tickets"
  if (models.length > 1) throw new MixedEmbeddingModelError(models);

  const model = models[0] as EmbeddingModel;
  const { embedding } = await embedQuery(queryText, { model, purpose: 'query' });
  const res = await pool.query<SimilarTicket>(
    `SELECT * FROM tickets.fn_find_similar($1::vector(1024), $2)`,
    [vecLiteral(embedding), k],
  );
  return res.rows;
}

// ─── T5: backfillTicketEmbeddings ────────────────────────────────────────────

export interface BackfillResult { scanned: number; embedded: number; failed: number; }

/**
 * Backfill embeddings for tickets that have no rows for the CURRENT model.
 * Idempotent (skips already-embedded), batched (protects the single GPU host),
 * restore-safe (re-derivable; never touches external_id_seq). Best-effort per
 * ticket — a failure is counted, not fatal, so a re-run resumes.
 */
export async function backfillTicketEmbeddings(
  opts: { batchSize?: number; onProgress?: (r: BackfillResult) => void } = {},
): Promise<BackfillResult> {
  const model = ticketEmbeddingModel();
  const batchSize = opts.batchSize ?? 50;
  const result: BackfillResult = { scanned: 0, embedded: 0, failed: 0 };

  // Candidates: tickets with NO embedding row for THIS model. Sequential pages.
  for (;;) {
    const { rows } = await pool.query<{ id: string; title: string; description: string | null }>(
      `SELECT t.id, t.title, t.description
         FROM tickets.tickets t
        WHERE NOT EXISTS (
          SELECT 1 FROM tickets.ticket_embeddings te
           WHERE te.ticket_id = t.id AND te.embedding_model = $1)
        ORDER BY t.created_at
        LIMIT $2`,
      [model, batchSize],
    );
    if (rows.length === 0) break;

    for (const t of rows) {
      result.scanned++;
      const n = await embedTicket(t.id, { title: t.title, description: t.description }); // best-effort
      if (n > 0) result.embedded++; else result.failed++;
      opts.onProgress?.(result);
    }
    // If the whole page failed (e.g. GPU down) stop to avoid a hot spin; a re-run resumes.
    if (result.embedded === 0 && result.failed >= rows.length) break;
  }
  return result;
}
