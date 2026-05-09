const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_BATCH = 128;
const VOYAGE_DOLLARS_PER_M_TOKENS = 0.06;

export const ANTHROPIC_FALLBACK_MODEL_DIM = 1024;

export interface EmbedResult { embedding: number[]; tokens: number; }
export interface BatchResult  { embeddings: number[][]; tokens: number; }
export interface EmbedOpts    { maxAttempts?: number; baseDelayMs?: number; signal?: AbortSignal; }

const apiKey = () => {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY is unset');
  return k;
};

async function callVoyage(inputs: string[], inputType: 'query' | 'document', opts: EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: inputs, model: VOYAGE_MODEL, input_type: inputType }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage: { total_tokens: number } };
      return { embeddings: j.data.slice(0, inputs.length).map(d => d.embedding), tokens: j.usage.total_tokens };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`voyage ${r.status} ${await r.clone().text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw new Error(`voyage ${r.status} ${await r.clone().text().catch(() => '')}`);
  }
  throw lastErr instanceof Error ? lastErr : new Error('voyage retry exhausted');
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<EmbedResult> {
  const r = await callVoyage([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    const r = await callVoyage(slice, 'document', opts);
    out.push(...r.embeddings);
    totalTokens += r.tokens;
  }
  return { embeddings: out, tokens: totalTokens };
}

export function costCentsForTokens(tokens: number): number {
  return (tokens / 1_000_000) * VOYAGE_DOLLARS_PER_M_TOKENS * 100;
}
