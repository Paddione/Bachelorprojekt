import { logger } from './logger';
import { resolvePair, pairUrl, type PairId, type LlamaRerankResponse } from './bge-router';

const rerankEnabled = () => process.env.LLM_RERANK_ENABLED === 'true';
const rerankModelId = () => process.env.LLM_RERANK_MODEL ?? 'bge-reranker-v2-m3';

export interface RerankResult { doc: string; score: number; }

const degrade = (docs: string[]): RerankResult[] => docs.map(doc => ({ doc, score: 0 }));

/**
 * Ein Rerank-Versuch gegen genau ein Paar. Gibt `null` zurueck, wenn dieses Paar
 * nicht liefern konnte — der Aufrufer entscheidet dann ueber den Partner.
 */
async function tryPair(
  url: string, query: string, docs: string[], signal?: AbortSignal,
): Promise<RerankResult[] | null> {
  try {
    const r = await fetch(`${url}/v1/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: rerankModelId(), query, documents: docs }),
      signal,
    });
    if (!r.ok) {
      logger.warn({ status: r.status, url, docs: docs.length }, '[rerank] pair returned non-ok status');
      return null;
    }
    const j = await r.json() as LlamaRerankResponse;
    return (j.results ?? [])
      .map(({ index, relevance_score }) => ({ doc: docs[index], score: relevance_score }))
      .sort((a, b) => b.score - a.score);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), url, docs: docs.length },
      '[rerank] pair unreachable');
    return null;
  }
}

/**
 * T002426: bei Ausfall des primaeren Rerankers wird ERST der Partner versucht
 * und erst danach auf `score: 0` degradiert.
 *
 * Vorher fiel diese Funktion beim ersten Fehler still auf `score: 0` zurueck —
 * ein toter Reranker blieb dadurch wochenlang unbemerkt, weil ein unsortiertes
 * Ergebnis von aussen wie ein sortiertes aussieht. Deshalb wird jetzt sowohl
 * der Partner-Wechsel als auch die Degradation als Warnung protokolliert.
 *
 * Signatur und Rueckgabetyp sind unveraendert; kein Aufrufer muss angefasst werden.
 */
export async function rerankCandidates(
  query: string,
  docs: string[],
  opts: { signal?: AbortSignal } = {},
): Promise<RerankResult[]> {
  if (docs.length === 0) return [];
  if (!rerankEnabled()) {
    logger.warn({ docs: docs.length }, '[rerank] disabled via LLM_RERANK_ENABLED — returning score:0');
    return degrade(docs);
  }

  // Der Router bestimmt das Primaerpaar (und weicht dabei schon bei Ueberlast
  // aus). Die Reihenfolge unten deckt zusaetzlich den Fall ab, dass das
  // gewaehlte Paar zwischen Health-Probe und Anfrage wegbricht.
  let first: PairId = 'interactive';
  try {
    first = (await resolvePair('interactive', 'rerank', opts)).pair;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), docs: docs.length },
      '[rerank] no reachable pair — returning score:0');
    return degrade(docs);
  }

  const order: PairId[] = first === 'interactive' ? ['interactive', 'batch'] : ['batch', 'interactive'];
  for (const pair of order) {
    const out = await tryPair(pairUrl(pair, 'rerank'), query, docs, opts.signal);
    if (out) return out;
    logger.warn({ pair, docs: docs.length }, '[rerank] falling back to partner pair');
  }

  logger.warn({ docs: docs.length }, '[rerank] both pairs failed — returning score:0');
  return degrade(docs);
}
