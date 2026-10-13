import { logAiCall } from './ai-metrics';
import { resolveEndpoint, BgeRoutingError } from './bge-router';

// T016562: Voyage AI ist entfernt — einziger Embedding-Pfad ist der lokale
// bge-Router (llama.cpp, bge-m3). Ohne konfigurierte LLM_EMBED_URL wirft
// resolveEndpoint BgeRoutingError; beide Entry points fallen fail-closed
// durch. Es gibt keinen externen Fallback mehr.

const EMBED_BATCH = 128;

export type EmbeddingModel = 'bge-m3';
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

// T002551: die Zieladresse kommt aus dem bge-Router, nicht mehr direkt aus der
// Umgebung — damit gilt fuer den Embedding-Pfad dieselbe Aufloesung wie fuer
// den MCP-Shim und die HTTP-Endpunkte, an genau einer Stelle.
// `purpose` steuert seit dem Single-Pool keine Paarwahl mehr; es bleibt fuer
// den X-LLM-Purpose-Header und die Fehlerklassenunterscheidung erhalten.

// Maps internal model type to the actual model ID sent to the API.
// llama.cpp accepts the model field (ignored in single-model mode).
const resolveModelId = (m: string) =>
  m === 'bge-m3' ? (process.env.LLM_EMBED_MODEL ?? 'bge-m3') : m;

function isNetworkError(err: unknown, signal?: AbortSignal): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AbortError' && signal?.aborted) return false;
  // T002426: "kein Paar erreichbar" IST ein Erreichbarkeitsproblem und wird
  // genauso behandelt wie ein ECONNREFUSED gegen einen einzelnen Endpunkt.
  if (err instanceof BgeRoutingError) return true;
  return err.name === 'AbortError' ||
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed/i.test(err.message);
}

async function callRouter(inputs: string[], opts: Required<Pick<EmbedOpts, 'model' | 'purpose'>> & EmbedOpts) {
  const max = opts.maxAttempts ?? 4;
  const base = opts.baseDelayMs ?? 250;
  let lastErr: unknown;
  // Ein BgeRoutingError faellt hier bewusst UNVERPACKT durch: isNetworkError()
  // stuft ihn als Erreichbarkeitsproblem ein, damit die bestehende
  // Fallunterscheidung greift — fail-closed als Embedding*Error.
  const target = resolveEndpoint('embed');
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(`${target}/v1/embeddings`, {
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
  const model: EmbeddingModel = opts.model ?? 'bge-m3';
  try {
    const r = await callRouter([text], { ...opts, model, purpose });
    return { embedding: r.embeddings[0], tokens: r.tokens };
  } catch (err) {
    if (isNetworkError(err, opts.signal)) {
      throw new EmbeddingQueryError(err instanceof Error ? err.message : 'embed router unreachable');
    }
    throw err;
  }
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const model: EmbeddingModel = opts.model ?? 'bge-m3';
  const _start = Date.now();
  const out: number[][] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const slice = texts.slice(i, i + EMBED_BATCH);
    try {
      const r = await callRouter(slice, { ...opts, model, purpose });
      out.push(...r.embeddings);
      totalTokens += r.tokens;
    } catch (err) {
      if (isNetworkError(err, opts.signal)) {
        throw new EmbeddingIndexError(err instanceof Error ? err.message : 'embed router unreachable');
      }
      throw err;
    }
  }
  void logAiCall({
    workflow: 'embedding',
    model,
    latencyMs: Date.now() - _start,
    promptTokens: totalTokens,
    metadata: { batch_size: texts.length },
  });
  return { embeddings: out, tokens: totalTokens };
}
