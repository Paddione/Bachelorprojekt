import { logger } from './logger';
import { resolveEndpoint, type LlamaRerankResponse } from './bge-router';

const rerankEnabled = () => process.env.LLM_RERANK_ENABLED === 'true';
const rerankModelId = () => process.env.LLM_RERANK_MODEL ?? 'bge-reranker-v2-m3';

export interface RerankResult { doc: string; score: number; }

const degrade = (docs: string[]): RerankResult[] => docs.map(doc => ({ doc, score: 0 }));

/**
 * Ein Rerank-Versuch gegen den bge-Endpoint. Gibt `null` zurueck, wenn er nicht
 * liefern konnte — der Aufrufer degradiert dann auf `score: 0`.
 */
async function tryPair(
  url: string, query: string, docs: string[], signal?: AbortSignal,
): Promise<RerankResult[] | null> {
  try {
    const r = await fetch(`${url}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: rerankModelId(), query, documents: docs }),
      signal,
    });
    if (!r.ok) {
      logger.warn({ status: r.status, url, docs: docs.length }, '[rerank] pair returned non-ok status');
      return null;
    }
    const j = await r.json() as LlamaRerankResponse;
    return (j.results ?? [])
      .map(({ index, relevance_score }) => ({ doc: docs[index], score: relevance_score }))
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), url, docs: docs.length },
      '[rerank] pair unreachable');
    return null;
  }
}

/**
 * T002426: bei Ausfall des Rerankers degradiert diese Funktion auf `score: 0`.
 *
 * Vorher (zwei Paare auf dem Windows-Host) fiel sie beim ersten Fehler still
 * auf `score: 0` zurueck — ein toter Reranker blieb dadurch wochenlang
 * unbemerkt, weil ein unsortiertes Ergebnis von aussen wie ein sortiertes
 * aussieht. Deshalb wird die Degradation als Warnung protokolliert.
 *
 * T002551: seit die bge-Server im Cluster laufen (k3d/llm-gpu.yaml), gibt es
 * nur noch einen Endpoint pro Rolle. Das bidirektionale Partner-Failover und
 * die Pair-Auswahl entfallen; ein toter Endpoint faellt beim Fetch auf und wird
 * genauso behandelt wie vorher der letzte verbleibende Partner.
 *
 * Signatur und Rueckgabetyp sind unveraendert; kein Aufrufer muss angefasst werden.
 */
export async function rerankCandidates(
  query: string,
  docs: string[],
  opts: { signal?: AbortSignal } = {},
): Promise<RerankResult[]> {
  if (docs.length === 0) return [];
  if (!rerankEnabled()) {
    logger.warn({ docs: docs.length }, '[rerank] disabled via LLM_RERANK_ENABLED — returning score:0');
    return degrade(docs);
  }

  let url: string;
  try {
    url = resolveEndpoint('rerank');
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), docs: docs.length },
      '[rerank] no endpoint configured — returning score:0');
    return degrade(docs);
  }

  const out = await tryPair(url, query, docs, opts.signal);
  if (out) return out;

  logger.warn({ docs: docs.length }, '[rerank] endpoint failed — returning score:0');
  return degrade(docs);
}
