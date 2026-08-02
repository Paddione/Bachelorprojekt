/**
 * T002551 — die einzige Stelle, die die Zieladresse eines bge-Endpoints
 * aufloest. Seit der Migration der bge-Server von WSL-CPU nach Kubernetes
 * (k3d/llm-gpu.yaml, Port 8081) gibt es genau einen Endpoint pro Rolle; die
 * Paar-Auswahl und das bidirektionale Failover aus T002426 sind entfallen.
 *
 * Die Variablen werden ohne Defaults gelesen: ein fehlender Wert WIRD geworfen
 * (fail-closed, 503 im API-Pfad). Cluster-DNS-Defaults waeren fuer den
 * bge-mcp-Prozess auf dem WSL-Host falsch (T002488, Port-Forward der Unit),
 * und in den API-Pfaden wuerden sie einen toten Endpoint verschleiern, den die
 * K8s-Readiness der Deployments ohnehin sichtbar macht.
 *
 * Diese Datei wird vom Website-Code (embedQuery/rerankCandidates/retrieve) und
 * vom bge-MCP-Shim (scripts/bge-mcp/server.mjs) importiert — die Aufloesung
 * gilt damit an genau einer Stelle.
 */

export type BgeRole = 'embed' | 'rerank';

/** Antwortform von `llama-server` POST /v1/rerank. */
export interface LlamaRerankResponse {
  results: Array<{ index: number; relevance_score: number }>;
}

export class BgeRoutingError extends Error {
  constructor(msg: string) {
    super(`BgeRoutingError: ${msg}`);
    this.name = 'BgeRoutingError';
  }
}

/**
 * Liefert die konfigurierte URL fuer eine Rolle oder wirft BgeRoutingError.
 * Ein fehlender Wert ist ein Konfigurationsfehler, kein Degradationsgrund:
 * die bge-MCP-Unit (scripts/bge-mcp/bge-mcp.service) pinnt die Variablen auf
 * das lokale Port-Forward, die environments/*.yaml tragen sie fuer die API
 * (z. B. http://llm-gateway-embed:8081 fuer die Cluster-Services aus
 * k3d/llm-gpu.yaml).
 */
export function resolveEndpoint(kind: BgeRole): string {
  // Bewusst zwei explizite Reads statt einer Map: die Variablennamen sind der
  // Vertrag mit der bge-MCP-Unit und den environments/*.yaml.
  const url = kind === 'embed' ? process.env.LLM_EMBED_URL : process.env.LLM_RERANKER_URL;
  if (!url) {
    throw new BgeRoutingError(
      kind === 'embed' ? 'LLM_EMBED_URL is not configured' : 'LLM_RERANKER_URL is not configured',
    );
  }
  return url;
}
