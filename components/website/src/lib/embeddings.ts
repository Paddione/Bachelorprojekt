import { logAiCall } from './ai-metrics';
import { resolveEndpoint, BgeRoutingError } from './bge-router';
import {
  assertDenseVectors,
  formatDenseInput,
  DENSE_MODEL,
  DENSE_PROFILE,
} from '../../../../scripts/lib/dense-embedding.mjs';

// T016562: Voyage AI ist entfernt — einziger Embedding-Pfad ist der lokale
// Router (llama.cpp, Gemma-Dense). Ohne konfigurierte LLM_EMBED_URL wirft
// resolveEndpoint BgeRoutingError; beide Entry points fallen fail-closed
// durch. Es gibt keinen externen Fallback mehr.

const EMBED_BATCH = 128;

export type EmbeddingModel = typeof DENSE_MODEL;
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
// Weder ein altes 'bge-m3' noch ein fremdes Label wird still auf das aktive
// Profil umgebogen; LLM_EMBED_MODEL muss dem aktiven Profil entsprechen.
const resolveModelId = (m: string) => {
  if (m !== DENSE_MODEL) {
    throw new Error(`unsupported embedding model '${m}' (active: '${DENSE_MODEL}')`);
  }
  const env = process.env.LLM_EMBED_MODEL ?? DENSE_MODEL;
  if (env !== DENSE_MODEL) {
    throw new Error(`LLM_EMBED_MODEL='${env}' does not match active profile '${DENSE_PROFILE}'`);
  }
  return env;
};

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
  // Rohe Texte werden genau einmal nach Purpose formatiert; der Proxy
  // praefixiert nicht zusaetzlich. Ein Ergebnis pro Eingabetext — lange
  // Texte werden hier nicht still in mehrere Ergebnisse verwandelt.
  const formatted = inputs.map(t => formatDenseInput(t, opts.purpose));
  for (let attempt = 1; attempt <= max; attempt++) {
    const r = await fetch(`${target}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': opts.purpose },
      body: JSON.stringify({ model: resolveModelId(opts.model), input: formatted }),
      signal: opts.signal,
    });
    if (r.ok) {
      const j = await r.clone().json() as { data: Array<{ embedding: number[] }>; usage?: { total_tokens?: number } };
      const vecs = Array.isArray(j.data) ? j.data.map(d => d.embedding) : [];
      // Fehlende/duplizierte/nichtnumerische/Null-Vektoren sind Index-/Query-Fehler.
      try {
        assertDenseVectors(vecs, inputs.length);
      } catch (err) {
        throw opts.purpose === 'index'
          ? new EmbeddingIndexError(`invalid embedding payload: ${err instanceof Error ? err.message : err}`)
          : new EmbeddingQueryError(`invalid embedding payload: ${err instanceof Error ? err.message : err}`);
      }
      return { embeddings: vecs, tokens: j.usage?.total_tokens ?? 0 };
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
  const model: EmbeddingModel = opts.model ?? DENSE_MODEL;
  try {
    const r = await callRouter([text], { ...opts, model, purpose });
    return { embedding: r.embeddings[0], tokens: r.tokens };
  } catch (err) {
    if (isNetworkError(err, opts.signal)) {
      throw new EmbeddingQueryError(err instanceof Error ? err.message : 'embed router unreachable');
    }
    if (err instanceof Error && /unsupported embedding model|does not match active profile/.test(err.message)) {
      throw new EmbeddingQueryError(err.message);
    }
    throw err;
  }
}

export async function embedBatch(texts: string[], opts: EmbedOpts = {}): Promise<BatchResult> {
  const purpose: EmbeddingPurpose = opts.purpose ?? 'index';
  const model: EmbeddingModel = opts.model ?? DENSE_MODEL;
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
      if (err instanceof Error && /unsupported embedding model|does not match active profile/.test(err.message)) {
        throw new EmbeddingIndexError(err.message);
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
