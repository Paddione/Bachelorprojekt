import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { pool } from '../../../../../lib/website-db';
import { generateQuestionnaireInsights } from '../../../../../lib/coaching-questionnaire-insights';
import { EmbeddingIndexError, EmbeddingQueryError } from '../../../../../lib/embeddings';
import { BgeRoutingError } from '../../../../../lib/bge-router';

export const prerender = false;

/**
 * POST /api/admin/coaching/questionnaire/insights
 *
 * Erzeugt (oder liefert aus dem 24h-Cache) die semantische Analyse aller
 * Questionnaire-Antworten. fail-closed: Ist das Embedding-Backend nicht
 * erreichbar, kommt 503 — die Analyse wird nie mit Teilantworten ausgeliefert.
 * Ohne on-premises-Provider werden die Cluster ohne Labels ausgeliefert (nie
 * ueber einen ungeprueften LLM-Pfad erzeugt).
 */
export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let force = false;
  try {
    const body = await request.json().catch(() => null);
    force = body?.force === true;
  } catch { /* body optional */ }

  try {
    const result = await generateQuestionnaireInsights(pool, { force });
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof EmbeddingIndexError || err instanceof EmbeddingQueryError || err instanceof BgeRoutingError) {
      return new Response(JSON.stringify({ error: 'Embedding-Backend nicht erreichbar — Analyse abgebrochen' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw err;
  }
};
