import { logger } from './logger';

const rerankEnabled = () => process.env.LLM_RERANK_ENABLED === 'true';
const rerankModelId = () => process.env.LLM_RERANK_MODEL ?? 'bge-reranker-v2-m3';

export interface RerankResult { doc: string; score: number; }

/** Response shape from llama.cpp POST /v1/rerank */
interface LlamaRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

export async function rerankCandidates(
  query: string,
  docs: string[],
  opts: { signal?: AbortSignal } = {},
): Promise<RerankResult[]> {
  if (docs.length === 0) return [];
  if (!rerankEnabled()) return docs.map(doc => ({ doc, score: 0 }));

  const rerankerUrl = process.env.LLM_RERANKER_URL;
  if (!rerankerUrl) return docs.map(doc => ({ doc, score: 0 }));

  try {
    const r = await fetch(`${rerankerUrl}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: rerankModelId(), query, documents: docs }),
      signal: opts.signal,
    });
    if (!r.ok) {
      logger.warn({ status: r.status, docs: docs.length }, '[rerank] non-ok status — returning score:0');
      return docs.map(doc => ({ doc, score: 0 }));
    }
    const j = await r.json() as LlamaRerankResponse;
    return (j.results ?? [])
      .map(({ index, relevance_score }) => ({ doc: docs[index], score: relevance_score }))
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), docs: docs.length }, '[rerank] error — returning score:0');
    return docs.map(doc => ({ doc, score: 0 }));
  }
}
