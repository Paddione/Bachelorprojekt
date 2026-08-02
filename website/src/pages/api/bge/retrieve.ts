import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listCollections, queryNearest, MixedEmbeddingModelError } from '../../../lib/knowledge-db';
import { rerankCandidates } from '../../../lib/rerank';
import { BgeRoutingError } from '../../../lib/bge-router';
import { EmbeddingQueryError } from '../../../lib/embeddings';

export const prerender = false;

/**
 * T002426 — Retrieval-Endpunkt zum Batch-Paar.
 *
 * Der Aufrufer uebergibt eine Query und `top_k`, sonst nichts. Modellname,
 * Vektordimension und Distanzmass bleiben serverseitig — genau das ist der
 * Zweck: Agenten sollen die Einbettung nicht selbst richtig anwenden muessen.
 *
 * Failover: KEINE eigene Ausweichlogik. Embedding laeuft ueber `queryNearest` →
 * `embedQuery`, Reranking ueber `rerankCandidates` — beide loesen die
 * Zieladresse ueber den bge-Router (`website/src/lib/bge-router.ts`). Wird hier
 * ein zweiter Health-Check eingebaut, gibt es zwei Wahrheiten statt einer.
 *
 * Cross-Space: `queryNearest` wirft `MixedEmbeddingModelError`, sobald die
 * gewaehlten Collections mehr als einen Vektorraum umfassen. Das wird als 400
 * durchgereicht statt Treffer aus gemischten Raeumen zu mischen.
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const GET: APIRoute = async ({ request, url, locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'Unauthorized' }, 401);

  const q = url.searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return json({ error: 'query parameter q is required (min 2 chars)' }, 400);
  }
  const topK = Math.min(Math.max(parseInt(url.searchParams.get('top_k') ?? '5', 10) || 5, 1), 20);

  const requested = (url.searchParams.get('collections') ?? '')
    .split(',').map(s => s.trim()).filter(Boolean);

  try {
    const collectionIds = requested.length > 0
      ? requested
      : (await listCollections()).map(c => c.id);
    if (collectionIds.length === 0) return json({ query: q, results: [] }, 200);

    // Mehr Kandidaten holen als zurueckgegeben werden — sonst waere das
    // Reranking wirkungslos, weil es nur die bereits gewaehlten top_k umsortiert.
    const chunks = await queryNearest({
      collectionIds, queryText: q, limit: Math.min(topK * 4, 60), threshold: 0,
    });
    if (chunks.length === 0) return json({ query: q, results: [] }, 200);

    const ranked = await rerankCandidates(q, chunks.map(c => c.text));
    const byText = new Map(chunks.map(c => [c.text, c]));
    const results = ranked.slice(0, topK).map(({ doc, score }) => {
      const c = byText.get(doc);
      return {
        id: c?.id ?? null,
        text: doc,
        collection_id: c?.collection_id ?? null,
        collection_name: c?.collectionName ?? null,
        vector_score: c?.score ?? null,
        relevance_score: score,
      };
    });
    return json({ query: q, top_k: topK, results }, 200);
  } catch (err) {
    if (err instanceof MixedEmbeddingModelError) {
      return json({ error: err.message }, 400);
    }
    if (err instanceof BgeRoutingError || err instanceof EmbeddingQueryError) {
      // 503 statt stiller Leermenge — eine leere Trefferliste waere von einem
      // echten "nichts gefunden" nicht zu unterscheiden.
      return json({ error: 'embedding service unavailable' }, 503);
    }
    const status = (err as { status?: number }).status;
    if (status && status >= 500) return json({ error: 'embedding service unavailable' }, 503);
    locals.requestLogger?.error?.({ err }, '[api/bge/retrieve]');
    return json({ error: 'retrieval failed' }, 500);
  }
};
