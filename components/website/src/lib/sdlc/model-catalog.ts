// components/website/src/lib/sdlc/model-catalog.ts
// Die eine Modell-Auswahlliste des KI-Decks: Vereinigung aus den vom llm-proxy
// entdeckten Modellen und den konfigurierten provider_config-Zeilen, dedupliziert
// über die Modell-Id. Ein konfiguriertes Modell ohne erreichbares Backend bleibt
// in der Liste (als nicht verfügbar markiert) — es darf nicht herausfallen, weil
// eine gesetzte Zuordnung sonst gelöscht aussieht, obwohl sie in der DB steht.
//
// Reine Berechnung ohne Rück-Import auf UI-Module: das Panel zeigt nur noch an.

import { pool } from '../db-pool';

const PROXY_URL = process.env.LLM_PROXY_URL ?? 'http://127.0.0.1:18235';
const PROXY_TIMEOUT_MS = 1500;

export interface ModelCatalogEntry {
  /** DB-Provider der Zeile; 'local' für nur vom Proxy entdeckte Modelle. */
  provider: string;
  modelId: string;
  /** true/false = Proxy meldet Verfügbarkeit; null = unbekannt (Proxy offline). */
  available: boolean | null;
}

export interface ModelCatalog {
  entries: ModelCatalogEntry[];
  proxyOnline: boolean;
}

interface DiscoveredModel { id?: unknown; loaded?: unknown }
interface BackendState {
  name?: unknown;
  enabled?: unknown;
  health?: unknown;
  priority?: unknown;
  models?: DiscoveredModel[];
}

/** Factory-Phase → provider_config-Quelle (Deckblatt der KiRoutingPanel-Zuordnung). */
export const PHASE_SOURCE_MAP: Record<string, string> = {
  scout: 'factory-scout',
  design: 'factory-plan',
  plan: 'factory-plan',
  implement: 'factory-implement',
  verify: 'factory-review',
  deploy: 'factory-implement',
};

export const PHASES = ['scout', 'design', 'plan', 'implement', 'verify', 'deploy'] as const;
export type CatalogPhase = typeof PHASES[number];

export function isCatalogPhase(x: unknown): x is CatalogPhase {
  return typeof x === 'string' && (PHASES as readonly string[]).includes(x);
}

export interface PhaseResolution {
  phase: CatalogPhase;
  source: string;
  /** Konfigurierte Modell-Id; null wenn weder Phasen- noch Default-Zeile existiert. */
  configuredModel: string | null;
  /** true, wenn configuredModel von der '*'-Zeile geerbt ist. */
  inheritsDefault: boolean;
  /** Was der Proxy gerade liefern würde. */
  servedModel: string | null;
  /** true, wenn servedModel ein Fallback des Proxy ist statt der Konfiguration. */
  fallback: boolean;
  backendName: string | null;
}

async function fetchProxyBackends(): Promise<BackendState[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS);
  try {
    const res = await fetch(`${PROXY_URL}/admin/state`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { status?: BackendState[] } | BackendState[];
    const list = Array.isArray(data) ? data : data.status;
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function healthyBackends(backends: BackendState[]): { name: string; models: string[] }[] {
  return backends
    .filter((b) => b.enabled === true && b.health === 'ok')
    .sort((a, b) => Number(a.priority ?? 0) - Number(b.priority ?? 0))
    .map((b) => ({
      name: typeof b.name === 'string' ? b.name : '',
      models: (b.models ?? [])
        .map((m) => (typeof m.id === 'string' ? m.id : ''))
        .filter((id) => id !== ''),
    }));
}

async function loadConfiguredRows(): Promise<{ rows: { source: string; provider: string; model_id: string; priority: number }[] }> {
  const res = await pool.query(
    `SELECT source, provider, model_id, priority FROM tickets.provider_config WHERE enabled = true`,
  );
  return { rows: res.rows as { source: string; provider: string; model_id: string; priority: number }[] };
}

export async function resolveModelCatalog(): Promise<ModelCatalog> {
  const [configured, backends] = await Promise.all([
    loadConfiguredRows().catch(() => ({ rows: [] as never[] })),
    fetchProxyBackends(),
  ]);

  const proxyOnline = backends !== null;
  const healthy = proxyOnline ? healthyBackends(backends!) : [];
  const servesModel = (modelId: string): boolean =>
    healthy.some((b) => b.models.some((id) => id.toLowerCase() === modelId.toLowerCase()));

  // Deduplizierung über die Modell-Id: nennen Proxy und DB dasselbe Modell,
  // bleibt ein Eintrag — mit dem DB-Provider als Namen.
  const byModel = new Map<string, ModelCatalogEntry>();
  for (const row of configured.rows) {
    if (!byModel.has(row.model_id)) {
      byModel.set(row.model_id, {
        provider: row.provider,
        modelId: row.model_id,
        available: proxyOnline ? servesModel(row.model_id) : null,
      });
    }
  }
  for (const backend of healthy) {
    for (const id of backend.models) {
      if (!byModel.has(id)) {
        byModel.set(id, { provider: 'local', modelId: id, available: true });
      }
    }
  }

  return { entries: Array.from(byModel.values()), proxyOnline };
}

export async function resolvePhaseResolutions(): Promise<PhaseResolution[]> {
  const [configured, backends] = await Promise.all([
    loadConfiguredRows(),
    fetchProxyBackends(),
  ]);

  const healthy = backends ? healthyBackends(backends) : [];

  const resolveServed = (
    configuredModel: string | null,
  ): { servedModel: string | null; fallback: boolean; backendName: string | null } => {
    if (!healthy.length || !configuredModel) {
      return { servedModel: null, fallback: false, backendName: null };
    }
    for (const b of healthy) {
      if (b.models.some((id) => id.toLowerCase() === configuredModel.toLowerCase())) {
        return { servedModel: configuredModel, fallback: false, backendName: b.name };
      }
    }
    const top = healthy[0];
    return { servedModel: top.models[0] ?? null, fallback: true, backendName: top.name };
  };

  return PHASES.map((phase) => {
    const source = PHASE_SOURCE_MAP[phase];
    const specific = configured.rows
      .filter((r) => r.source === source)
      .sort((a, b) => a.priority - b.priority);
    const global = configured.rows
      .filter((r) => r.source === '*')
      .sort((a, b) => a.priority - b.priority);

    const chosen = specific[0] ?? global[0];
    const inheritsDefault = specific.length === 0 && global.length > 0;
    const served = resolveServed(chosen?.model_id ?? null);
    return {
      phase,
      source,
      configuredModel: chosen?.model_id ?? null,
      inheritsDefault,
      ...served,
    };
  });
}
