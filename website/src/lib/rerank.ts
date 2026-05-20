const rerankEnabled = () => process.env.LLM_RERANK_ENABLED === 'true';

export interface RerankResult { doc: string; score: number; }

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
      body: JSON.stringify({ model: 'workspace-rerank', query, documents: docs }),
      signal: opts.signal,
    });
    if (!r.ok) return docs.map(doc => ({ doc, score: 0 }));
    const j = await r.json() as { results: Array<{ index: number; relevance_score: number }> };
    return j.results
      .map(({ index, relevance_score }) => ({ doc: docs[index], score: relevance_score }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return docs.map(doc => ({ doc, score: 0 }));
  }
}
