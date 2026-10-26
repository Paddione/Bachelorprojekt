// scripts/lib/dense-embedding.mjs
// EmbeddingGemma-Dense-Profil (SSOT): Modell-/Prompt-/Dimensionsvertrag und
// verlustfreies tokenbasiertes Splitten. Seiteneffektfrei: kein Router-,
// DB- oder Web-Import; nur reine Funktionen und Konstanten.
import { createHash } from 'node:crypto';

export const DENSE_MODEL = 'embeddinggemma-300m';
export const DENSE_DIMENSIONS = 768;
export const DENSE_PROFILE = 'embeddinggemma-300m:768:Q8_0:v1';
export const DENSE_MAX_TOKENS = 2048;

const QUERY_PREFIX = 'task: search result | query: ';
const TITLE_PREFIX = 'title: ';
const TEXT_INFIX = ' | text: ';

/**
 * Profilgebundener Inhalts-Hash (Indexer und Migration nutzen exakt
 * dieselbe Funktion): nach Modell-/Promptwechsel ist kein stiller
 * Datei-Skip erlaubt, identisches Profil + identischer Inhalt darf
 * wiederverwenden.
 */
export function profileContentHash(content) {
  if (typeof content !== 'string') throw new Error('profileContentHash: content must be a string');
  return createHash('sha256').update(`${DENSE_PROFILE}\0${content}`).digest('hex');
}

/**
 * Formatiert Rohtext genau einmal zum Versand.
 * Query: exakt `task: search result | query: ` + unveraenderter Text.
 * Index: exakt `title: ` + Titel oder `none` + ` | text: ` + unveraenderter Text.
 */
export function formatDenseInput(text, purpose, title) {
  if (typeof text !== 'string') throw new Error('formatDenseInput: text must be a string');
  if (purpose !== 'query' && purpose !== 'index') {
    throw new Error("formatDenseInput: purpose must be 'query' | 'index'");
  }
  if (purpose === 'query') return `${QUERY_PREFIX}${text}`;
  const name = typeof title === 'string' && title.length > 0 ? title : 'none';
  return `${TITLE_PREFIX}${name}${TEXT_INFIX}${text}`;
}

/** Prueft Anzahl, 768 Dimensionen, endliche Werte und nichtleere Vektoren. */
export function assertDenseVectors(vectors, expectedCount) {
  if (!Array.isArray(vectors)) throw new Error('assertDenseVectors: vectors must be an array');
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error('assertDenseVectors: expectedCount must be a non-negative integer');
  }
  if (vectors.length !== expectedCount) {
    throw new Error(`assertDenseVectors: expected ${expectedCount} vectors, got ${vectors.length}`);
  }
  if (expectedCount === 0) return;
  for (let i = 0; i < vectors.length; i += 1) {
    const v = vectors[i];
    if (!Array.isArray(v)) throw new Error(`assertDenseVectors: vector ${i} must be an array`);
    if (v.length !== DENSE_DIMENSIONS) {
      throw new Error(`assertDenseVectors: vector ${i} has ${v.length} dims, expected ${DENSE_DIMENSIONS}`);
    }
    let sumSq = 0;
    for (let j = 0; j < v.length; j += 1) {
      const x = v[j];
      if (typeof x !== 'number' || !Number.isFinite(x)) {
        throw new Error(`assertDenseVectors: vector ${i}[${j}] is not finite`);
      }
      sumSq += x * x;
    }
    if (!Number.isFinite(sumSq) || sumSq <= 0) {
      throw new Error(`assertDenseVectors: vector ${i} is null or non-finite`);
    }
  }
}

/**
 * Teilt Rohtext verlustfrei so, dass jedes formatierte Teil in maxTokens passt.
 * Gibt rohe Teiltexte zurueck (parts.join('') === originalText).
 * tokenize(formattedText) zaehlt reale Modell-Tokens inkl. Spezialtokens und
 * vollständigem rollenabhaengigem Prompt. Titel via options.title eingefroren.
 */
export async function splitDenseText(text, options) {
  if (typeof text !== 'string') throw new Error('splitDenseText: text must be a string');
  const { tokenize, purpose = 'index', maxTokens = DENSE_MAX_TOKENS, title } = options ?? {};
  if (typeof tokenize !== 'function') throw new Error('splitDenseText: tokenize must be a function');
  if (purpose !== 'query' && purpose !== 'index') {
    throw new Error("splitDenseText: purpose must be 'query' | 'index'");
  }
  if (!Number.isFinite(maxTokens) || maxTokens <= 0 || maxTokens > DENSE_MAX_TOKENS) {
    throw new Error(`splitDenseText: maxTokens must be within 1..${DENSE_MAX_TOKENS}`);
  }
  if (text === '') return [];
  const frozenTitle = purpose === 'index'
    ? (typeof title === 'string' && title.length > 0 ? title : 'none')
    : undefined;
  const format = (chunk) => (purpose === 'query'
    ? formatDenseInput(chunk, purpose)
    : formatDenseInput(chunk, purpose, frozenTitle));
  // Fast-Path: der Regelfall (kleine Chunks) braucht genau einen Tokenize-Call.
  if ((await tokenize(format(text))) <= maxTokens) return [text];
  const promptTokens = await tokenize(format(''));
  if (promptTokens > maxTokens) {
    throw new Error(`splitDenseText: prompt alone uses ${promptTokens} tokens, budget is ${maxTokens}`);
  }
  const points = Array.from(text);
  const parts = [];
  let i = 0;
  while (i < points.length) {
    let lo = 1;
    let hi = points.length - i;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const chunk = points.slice(i, i + mid).join('');
      const tokens = await tokenize(format(chunk));
      if (tokens <= maxTokens) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best === 0) {
      throw new Error('splitDenseText: single character exceeds token budget');
    }
    parts.push(points.slice(i, i + best).join(''));
    i += best;
  }
  return parts;
}
