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
    const r = await fetch(`${rerankerUrl}/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, texts: docs }),
      signal: opts.signal,
    });
    if (!r.ok) return docs.map(doc => ({ doc, score: 0 }));
    const j = await r.json() as Array<{ index: number; score: number }>;
    return j
      .map(({ index, score }) => ({ doc: docs[index], score }))
      .sort((a, b) => b.score - a.score);
  } catch {
    return docs.map(doc => ({ doc, score: 0 }));
  }
}
