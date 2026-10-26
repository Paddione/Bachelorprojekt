// scripts/knowledge/dense-client.mjs
//
// Gemma-Transport fuer Dense-Index und -Query (llama.cpp, direkt).
// Reale /tokenize-Abfrage mit add_special, gemeinsame Formatierung genau
// einmal, Vektorpruefung vor jeder Rueckgabe. Kleine sequenzielle Batches,
// konfigurierbare endliche Timeouts, Fehlantworten stoppen den Lauf.

import {
  assertDenseVectors,
  formatDenseInput,
  splitDenseText,
  DENSE_DIMENSIONS,
  DENSE_MAX_TOKENS,
  DENSE_MODEL,
  DENSE_PROFILE,
} from '../lib/dense-embedding.mjs';

export { DENSE_DIMENSIONS, DENSE_MAX_TOKENS, DENSE_MODEL, DENSE_PROFILE };

const DEFAULT_TIMEOUT_MS = 60_000;
const EMBED_BATCH = 8;

function cleanUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('makeDenseClient: url is required (DENSE_MIGRATION_EMBED_URL oder LLM_EMBED_URL)');
  }
  return url.replace(/\/+$/, '');
}

/** Transport ueber llama.cpp-Server: { url, fetchImpl, timeoutMs }. */
export function makeDenseClient({ url, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const base = cleanUrl(url);
  if (typeof fetchImpl !== 'function') throw new Error('makeDenseClient: fetchImpl must be a function');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('makeDenseClient: timeoutMs must be a finite positive number');
  }

  async function post(path, payload) {
    const r = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LLM-Purpose': 'dense' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      throw new Error(`dense-client: ${path} answered ${r.status}: ${await r.text().catch(() => '')}`);
    }
    return r.json();
  }

  /** Reale Modell-Tokens inkl. Spezialtokens und vollständigem Prompt. */
  async function tokenize(formattedText) {
    const j = await post('/tokenize', { content: formattedText, add_special: true });
    if (!Array.isArray(j.tokens)) throw new Error('dense-client: /tokenize returned no tokens array');
    return j.tokens.length;
  }

  async function embedFormatted(formatted) {
    const embeddings = [];
    let tokens = 0;
    for (let i = 0; i < formatted.length; i += EMBED_BATCH) {
      const slice = formatted.slice(i, i + EMBED_BATCH);
      for (const text of slice) tokens += await tokenize(text);
      const j = await post('/v1/embeddings', { model: DENSE_MODEL, input: slice });
      const vecs = Array.isArray(j.data) ? j.data.map((d) => d.embedding) : [];
      // Genau ein Vektor pro Text; 1024/767/NaN/Null/Count-Mismatch scheitert.
      assertDenseVectors(vecs, slice.length);
      embeddings.push(...vecs);
    }
    return { embeddings, tokens, model: DENSE_MODEL, profile: DENSE_PROFILE };
  }

  async function embedQueries(texts) {
    if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t) => typeof t === 'string')) {
      throw new Error('embedQueries: non-empty string array required');
    }
    return embedFormatted(texts.map((t) => formatDenseInput(t, 'query')));
  }

  async function embedDocuments(texts) {
    if (!Array.isArray(texts) || texts.length === 0 || !texts.every((t) => typeof t === 'string')) {
      throw new Error('embedDocuments: non-empty string array required');
    }
    return embedFormatted(texts.map((t) => formatDenseInput(t, 'index')));
  }

  return { url: base, timeoutMs, tokenize, embedQueries, embedDocuments };
}

/**
 * Zerlegt rohe Quellchunks verlustfrei in 1:n Teilchunks.
 * Rueckgabe pro Teil: { position (neu, lueckenlos), text (roh), metadata
 * (Quellmetadaten + sourcePosition/partIndex), sourcePosition, partIndex }.
 * Leere oder ungueltige Quelltexte sind explizite Fehler, kein stiller Skip.
 */
export async function prepareDenseChunks(chunks, client) {
  if (!Array.isArray(chunks)) throw new Error('prepareDenseChunks: chunks must be an array');
  if (!client || typeof client.tokenize !== 'function') {
    throw new Error('prepareDenseChunks: client with tokenize() required');
  }
  const out = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk.text !== 'string' || chunk.text === '') {
      throw new Error(`prepareDenseChunks: invalid source chunk at position ${chunk?.position ?? '?'}`);
    }
    const parts = await splitDenseText(chunk.text, {
      tokenize: (s) => client.tokenize(s),
      purpose: 'index',
      maxTokens: DENSE_MAX_TOKENS,
    });
    if (parts.length === 0) throw new Error(`prepareDenseChunks: empty split at position ${chunk.position}`);
    parts.forEach((text, partIndex) => {
      out.push({
        position: out.length,
        text,
        metadata: { ...(chunk.metadata ?? {}), sourcePosition: chunk.position, partIndex },
        sourcePosition: chunk.position,
        partIndex,
      });
    });
  }
  return out;
}
