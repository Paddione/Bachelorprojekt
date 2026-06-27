import { logAiCall } from './ai-metrics';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-multilingual-2';
const VOYAGE_BATCH = 128;
const VOYAGE_DOLLARS_PER_M_TOKENS = 0.06;

export const ANTHROPIC_FALLBACK_MODEL_DIM = 1024;

export type EmbeddingModel = 'bge-m3' | 'voyage-multilingual-2';
type EmbeddingPurpose = 'index' | 'query';

interface EmbedResult { embedding: number[]; tokens: number; }
interface BatchResult  { embeddings: number[][]; tokens: number; }
interface EmbedOpts {
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
const embedUrl = () => process.env.LLM_EMBED_URL ?? 'http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234';

// Maps internal model type to the actual model ID sent to the API.
// TEI ignores this field; LM Studio routes by it.
const MODEL_ID_MAP: Record<string, string> = {
  'bge-m3': process.env.LLM_EMBED_MODEL ?? 'text-embedding-bge-m3',
  'voyage-multilingual-2': 'voyage-multilingual-2',
};
const resolveModelId = (m: string) => MODEL_ID_MAP[m] ?? m;

function isNetworkError(err: unknown, signal?: AbortSignal): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError' && signal?.aborted) return false;
  return err.name === 'AbortError' ||
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed/i.test(err.message);
}

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
    const r = await fetch(`${embedUrl()}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': opts.purpose },
      body: JSON.stringify({ model: resolveModelId(opts.model), input: inputs }),
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
    try {
      const r = await callRouter([text], { ...opts, model, purpose });
      return { embedding: r.embeddings[0], tokens: r.tokens };
    } catch (err) {
      if (isNetworkError(err, opts.signal)) {
        if (model === 'voyage-multilingual-2') {
          console.warn('[embeddings] GPU router unreachable, falling back to Voyage for voyage-multilingual-2');
          const r = await callVoyageDirect([text], 'query', opts);
          return { embedding: r.embeddings[0], tokens: r.tokens };
        }
        // bge-m3 and others: fail closed — re-wrap as EmbeddingQueryError
        throw new EmbeddingQueryError(err instanceof Error ? err.message : 'GPU router unreachable');
      }
      throw err;
    }
  }
  const r = await callVoyageDirect([text], 'query', opts);
  return { embedding: r.embeddings[0], tokens: r.tokens };
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const _start = Date.now();
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH) {
    const slice = texts.slice(i, i + VOYAGE_BATCH);
    if (isLlmEnabled()) {
      const model: EmbeddingModel = opts.model ?? 'bge-m3';
      try {
        const r = await callRouter(slice, { ...opts, model, purpose });
        out.push(...r.embeddings);
        totalTokens += r.tokens;
      } catch (err) {
        if (isNetworkError(err, opts.signal)) {
          if (model === 'voyage-multilingual-2') {
            console.warn('[embeddings] GPU router unreachable, falling back to Voyage for voyage-multilingual-2');
            const r = await callVoyageDirect(slice, 'document', opts);
            out.push(...r.embeddings);
            totalTokens += r.tokens;
          } else {
            // bge-m3 and others: fail closed — re-wrap as EmbeddingIndexError
            throw new EmbeddingIndexError(err instanceof Error ? err.message : 'GPU router unreachable');
          }
        } else {
          throw err;
        }
      }
    } else {
      const r = await callVoyageDirect(slice, 'document', opts);
      out.push(...r.embeddings);
      totalTokens += r.tokens;
    }
  }
  void logAiCall({
    workflow: 'embedding',
    model: opts.model ?? 'bge-m3',
    latencyMs: Date.now() - _start,
    promptTokens: totalTokens,
    metadata: { batch_size: texts.length },
  });
  return { embeddings: out, tokens: totalTokens };
}

export function costCentsForTokens(tokens: number): number {
  return (tokens / 1_000_000) * VOYAGE_DOLLARS_PER_M_TOKENS * 100;
}
