const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_BATCH = 128;
const VOYAGE_DOLLARS_PER_M_TOKENS = 0.06;

export const ANTHROPIC_FALLBACK_MODEL_DIM = 1024;

export type EmbeddingModel = 'bge-m3' | 'voyage-multilingual-2';
export type EmbeddingPurpose = 'index' | 'query';

export interface EmbedResult { embedding: number[]; tokens: number; }
export interface BatchResult  { embeddings: number[][]; tokens: number; }
export interface EmbedOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  signal?: AbortSignal;
  model?: EmbeddingModel;
  purpose?: EmbeddingPurpose;
}

export class EmbeddingIndexError extends Error {
  constructor(msg: string) { super(`EmbeddingIndexError: ${msg}`); this.name = 'EmbeddingIndexError'; }
}
export class EmbeddingQueryError extends Error {
  constructor(msg: string) { super(`EmbeddingQueryError: ${msg}`); this.name = 'EmbeddingQueryError'; }
}

const voyageKey = () => {
  const k = process.env.VOYAGE_API_KEY;
  if (!k) throw new Error('VOYAGE_API_KEY is unset');
  return k;
};

const isLlmEnabled = () => process.env.LLM_ENABLED === 'true';
const routerUrl = () => process.env.LLM_ROUTER_URL ?? 'http://llm-router.workspace.svc.cluster.local:4000';

async function callVoyageDirect(inputs: string[], inputType: 'query' | 'document', opts: EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${voyageKey()}`, 'Content-Type': 'application/json' },
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

async function callRouter(inputs: string[], opts: Required<Pick<EmbedOpts, 'model' | 'purpose'>> & EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(`${routerUrl()}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': opts.purpose },
      body: JSON.stringify({ model: opts.model, input: inputs }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage?: { total_tokens?: number } };
      return { embeddings: j.data.slice(0, inputs.length).map(d => d.embedding), tokens: j.usage?.total_tokens ?? 0 };
    }
    if (r.status === 429 || r.status >= 500) {
      lastErr = new Error(`router ${r.status} ${await r.clone().text().catch(() => '')}`);
      await new Promise(res => setTimeout(res, base * 2 ** (attempt - 1)));
      continue;
    }
    throw opts.purpose === 'index'
      ? new EmbeddingIndexError(`router ${r.status} ${await r.clone().text().catch(() => '')}`)
      : new EmbeddingQueryError(`router ${r.status} ${await r.clone().text().catch(() => '')}`);
  }
  throw opts.purpose === 'index'
    ? new EmbeddingIndexError(lastErr instanceof Error ? lastErr.message : 'router retry exhausted')
    : new EmbeddingQueryError(lastErr instanceof Error ? lastErr.message : 'router retry exhausted');
}

export async function embedQuery(text: string, opts: EmbedOpts = {}): Promise<EmbedResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'query';
  if (isLlmEnabled()) {
    const model: EmbeddingModel = opts.model ?? 'bge-m3';
    const r = await callRouter([text], { ...opts, model, purpose });
    return { embedding: r.embeddings[0], tokens: r.tokens };
  }
  const r = await callVoyageDirect([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    const r = isLlmEnabled()
      ? await callRouter(slice, { ...opts, model: opts.model ?? 'bge-m3', purpose })
      : await callVoyageDirect(slice, 'document', opts);
    out.push(...r.embeddings);
    totalTokens += r.tokens;
  }
  return { embeddings: out, tokens: totalTokens };
}

export function costCentsForTokens(tokens: number): number {
  return (tokens / 1_000_000) * VOYAGE_DOLLARS_PER_M_TOKENS * 100;
}
