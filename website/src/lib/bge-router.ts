/**
 * T002426 — die einzige Stelle, die entscheidet, welches bge-Paar eine Anfrage
 * bedient.
 *
 * Zwei Paare auf demselben Windows-Host:
 *   - `interactive` (Paar B, :8095/:8096, GPU-nah) bedient Agenten zur Laufzeit.
 *   - `batch`       (Paar A, :8085/:8086, `-ngl 0`, CPU-RAM) bedient Reindex-Last.
 *
 * Ausgewichen wird in BEIDE Richtungen und aus ZWEI Gruenden: bei rotem
 * Health-Check und bei Ueberlast. Die Ueberlast-Bedingung traegt den
 * eigentlichen Wert — sie verhindert, dass ein laufender Reindex interaktive
 * Agenten blockiert, und sie ersetzt den dynamischen VRAM-Offload.
 *
 * Jede Umleitung wird als Warnung protokolliert. Der stille Rerank-Ausfall, der
 * wochenlang unbemerkt blieb, war genau das Ergebnis fehlender Sichtbarkeit.
 *
 * Sind BEIDE Paare unerreichbar, wird geworfen — nie ein Ersatz- oder
 * Nullvektor geliefert (fail-closed, konsistent zu `EmbeddingQueryError`).
 *
 * GRENZE: beide Paare laufen auf demselben Host. Das Failover deckt
 * Prozessausfall, VRAM-Verdraengung und Ueberlast ab, NICHT den Hostverlust.
 */

export type PairId = 'interactive' | 'batch';
export type BgeRole = 'embed' | 'rerank';

/** Antwortform von `llama-server` GET /health. */
export interface LlamaHealthResponse {
  status: string;
  slots_idle?: number;
  slots_processing?: number;
}

/** Antwortform von `llama-server` POST /v1/embeddings. */
export interface LlamaEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage?: { total_tokens?: number };
}

/** Antwortform von `llama-server` POST /v1/rerank. */
export interface LlamaRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

export interface PairHealth {
  pair: PairId;
  reachable: boolean;
  overloaded: boolean;
  latencyMs: number;
  queued: number;
}

export interface PairChoice {
  pair: PairId;
  url: string;
  health: PairHealth;
}

export class BgeRoutingError extends Error {
  constructor(msg: string) {
    super(`BgeRoutingError: ${msg}`);
    this.name = 'BgeRoutingError';
  }
}

// Defaults spiegeln die Gateway-Services aus k3d/llm-gpu.yaml. Die Werte selbst
// stehen in environments/<env>.yaml (LLM_*_BATCH_URL) — hier steht nur, was
// gilt, solange eine Umgebung sie nicht setzt.
const DEFAULTS: Record<PairId, Record<BgeRole, string>> = {
  interactive: {
    embed: 'http://llm-gateway-embed.workspace.svc.cluster.local:8095',
    rerank: 'http://llm-gateway-rerank.workspace.svc.cluster.local:8096',
  },
  batch: {
    embed: 'http://llm-gateway-embed-batch.workspace.svc.cluster.local:8085',
    rerank: 'http://llm-gateway-rerank-batch.workspace.svc.cluster.local:8086',
  },
};

const ENV_KEYS: Record<PairId, Record<BgeRole, string>> = {
  interactive: { embed: 'LLM_EMBED_URL', rerank: 'LLM_RERANKER_URL' },
  batch: { embed: 'LLM_EMBED_BATCH_URL', rerank: 'LLM_RERANKER_BATCH_URL' },
};

/**
 * Der Logger wird LAZY geladen, nicht statisch importiert.
 *
 * Grund: `scripts/bge-mcp/server.mjs` importiert dieses Modul direkt (Node
 * strippt die Typen), damit die Failover-Entscheidung an genau EINER Stelle
 * steht statt im Shim ein zweites Mal. Dort ist der pino-Logger der Website
 * nicht aufloesbar — mit einem statischen Import waere das Modul im Shim gar
 * nicht ladbar und der Shim muesste die Logik duplizieren.
 *
 * Der Fallback schreibt eine pino-foermige JSON-Zeile direkt nach stderr, statt
 * die globale Konsole zu benutzen: G-FE03 verbietet rohe Konsolen-Aufrufe unter
 * `website/src`, und die Regel soll hier nicht mit einer Ausnahme aufgeweicht
 * werden. Still wird eine Umleitung in keinem der beiden Kontexte.
 */
async function warn(fields: Record<string, unknown>, msg: string): Promise<void> {
  try {
    const { logger } = await import('./logger');
    logger.warn(fields, msg);
  } catch {
    process.stderr.write(`${JSON.stringify({ level: 40, service: 'bge-mcp', ...fields, msg })}\n`);
  }
}

export const partnerOf = (pair: PairId): PairId => (pair === 'interactive' ? 'batch' : 'interactive');

export function pairUrl(pair: PairId, role: BgeRole): string {
  const fromEnv = process.env[ENV_KEYS[pair][role]];
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULTS[pair][role];
}

const queueLimit = (): number => {
  const n = Number.parseInt(process.env.LLM_BGE_QUEUE_LIMIT ?? '4', 10);
  return Number.isFinite(n) && n > 0 ? n : 4;
};
const latencyBudgetMs = (): number => {
  const n = Number.parseInt(process.env.LLM_BGE_LATENCY_BUDGET_MS ?? '2000', 10);
  return Number.isFinite(n) && n > 0 ? n : 2000;
};

/**
 * Ermittelt Erreichbarkeit UND Auslastung eines Paars. Bewusst getrennt von der
 * Routing-Entscheidung: nur so sind beide Teile einzeln testbar.
 *
 * Die Round-Trip-Zeit des Health-Aufrufs ist der Latenz-Indikator — sie steigt
 * mit der Auslastung des Servers, weil ein voll belegter llama-server auch
 * seinen Health-Handler spaeter bedient.
 */
export async function probePair(
  pair: PairId,
  role: BgeRole,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PairHealth> {
  const started = Date.now();
  const budget = latencyBudgetMs();
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? budget);
  try {
    const r = await fetch(`${pairUrl(pair, role)}/health`, {
      signal: opts.signal ?? timeout,
    });
    const latencyMs = Date.now() - started;
    if (!r.ok) {
      return { pair, reachable: false, overloaded: false, latencyMs, queued: 0 };
    }
    const body = (await r.json()) as LlamaHealthResponse;
    const queued = body.slots_processing ?? 0;
    return {
      pair,
      reachable: body.status === 'ok',
      overloaded: queued > queueLimit() || latencyMs > budget,
      latencyMs,
      queued,
    };
  } catch {
    return { pair, reachable: false, overloaded: false, latencyMs: Date.now() - started, queued: 0 };
  }
}

/**
 * Bestimmt aus gewuenschter Rolle plus Health-Zustand das tatsaechlich zu
 * verwendende Paar und protokolliert jede Umleitung.
 *
 * Rangfolge:
 *   1. Primaerpaar gesund und unbelastet  → Primaerpaar.
 *   2. Partner gesund und unbelastet      → Partner (Warnung).
 *   3. Primaerpaar erreichbar, aber belastet → Primaerpaar (Warnung: Degradation
 *      schlaegt Ausfall; der Partner ist in diesem Zweig ebenfalls nicht besser).
 *   4. Partner erreichbar                 → Partner (Warnung).
 *   5. beide aus                          → BgeRoutingError.
 */
export async function resolvePair(
  preferred: PairId,
  role: BgeRole,
  opts: { signal?: AbortSignal } = {},
): Promise<PairChoice> {
  const primary = await probePair(preferred, role, opts);
  if (primary.reachable && !primary.overloaded) {
    return { pair: preferred, url: pairUrl(preferred, role), health: primary };
  }

  const other = partnerOf(preferred);
  const partner = await probePair(other, role, opts);
  const reason = primary.reachable ? 'overloaded' : 'unreachable';

  if (partner.reachable && !partner.overloaded) {
    await warn(
      { from: preferred, to: other, role, reason, latencyMs: primary.latencyMs, queued: primary.queued },
      '[bge-router] redirecting to partner pair',
    );
    return { pair: other, url: pairUrl(other, role), health: partner };
  }

  if (primary.reachable) {
    await warn(
      { from: preferred, to: preferred, role, reason: 'degraded', partnerReachable: partner.reachable },
      '[bge-router] both pairs degraded — staying on primary',
    );
    return { pair: preferred, url: pairUrl(preferred, role), health: primary };
  }

  if (partner.reachable) {
    await warn(
      { from: preferred, to: other, role, reason, partnerOverloaded: partner.overloaded },
      '[bge-router] redirecting to overloaded partner — primary is down',
    );
    return { pair: other, url: pairUrl(other, role), health: partner };
  }

  throw new BgeRoutingError(
    `no reachable bge pair for role=${role} (preferred=${preferred}); refusing to return substitute values`,
  );
}
