import { writable, get, type Readable } from 'svelte/store';
import type { FloorPayload } from '../factory-floor-types';
import { SSE_RECONNECT_MS } from '../factory-constants';

export interface FloorState { payload: FloorPayload | null; stale: boolean; }
const store = writable<FloorState>({ payload: null, stale: false });
export const floorStore: Readable<FloorState> = { subscribe: store.subscribe };

let refCount = 0;
let es: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function seedFloor(payload: FloorPayload | null): void {
  if (payload) store.set({ payload, stale: false });
}
export function ingestFloorPayload(payload: FloorPayload): void {
  store.set({ payload, stale: false });
}
export function floorSubscriberCount(): number { return refCount; }

async function loadOnce(): Promise<void> {
  try {
    const res = await fetch('/sdlc/api/factory-floor', { credentials: 'same-origin' });
    if (res.ok) ingestFloorPayload(await res.json() as FloorPayload);
    else store.update((s) => ({ ...s, stale: true }));
  } catch { store.update((s) => ({ ...s, stale: true })); }
}

function connect(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  es = new EventSource('/sdlc/api/factory-floor/stream', { withCredentials: true });
  es.addEventListener('phase', () => { void loadOnce(); });
  es.addEventListener('heartbeat', () => store.update((s) => ({ ...s, stale: false })));
  es.onerror = () => {
    es?.close(); es = null;
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, SSE_RECONNECT_MS);
  };
}

export function acquireFloor(): () => void {
  refCount += 1;
  if (refCount === 1) {
    if (get(store).payload === null) void loadOnce();
    connect();
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0) {
      es?.close(); es = null;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }
  };
}

/** Eine Tageszeile aus `tickets.v_factory_metrics`, neuester Tag zuerst. */
export interface FactoryMetricRow {
  day: string;
  features_shipped: number;
  avg_cycle_time_h: number | null;
  escalations: number;
  total_features: number;
}

export interface FactoryMetricsPayload {
  brand: string;
  metrics: FactoryMetricRow[];
  activeFeatures: unknown[];
  flags: unknown[];
}

// [T003459] Der Endpunkt liegt unter /sdlc/api/, NICHT unter /api/. Ein
// website/src/pages/api/factory-metrics.ts hat es nie gegeben; der Aufruf lief
// seit dem SDLC-Umzug (T002624) in einen 404. Weil die Konsumenten den Fehler
// still schluckten, sah es nach "keine Daten vorhanden" statt nach "Route
// falsch" aus — und war die Begruendung, mit der die Analytics-Komponenten in
// T003417 als "never worked" geloescht wurden.
const METRICS_ENDPOINT = '/sdlc/api/factory-metrics';

let metricsCache: FactoryMetricsPayload | null = null;
let metricsInflight: Promise<FactoryMetricsPayload> | null = null;

export async function getSharedMetrics(force = false): Promise<FactoryMetricsPayload> {
  if (!force && metricsCache) return metricsCache;
  if (!metricsInflight) {
    metricsInflight = fetch(METRICS_ENDPOINT, { credentials: 'same-origin' })
      .then(async (r) => {
        // Den Status pruefen, BEVOR der Body gelesen wird: eine Fehlerantwort
        // traegt `{ error: … }` und wuerde als gueltige Payload durchgehen —
        // die Kachel zeigte dann dauerhaft leere Werte, ohne dass irgendwo ein
        // Fehler auftaucht. Genau diese Tarnung hat den 404 so lange verdeckt.
        if (!r.ok) throw new Error(`${METRICS_ENDPOINT} antwortete mit ${r.status}`);
        return (await r.json()) as FactoryMetricsPayload;
      })
      .then((p) => { metricsCache = p; return p; })
      .finally(() => { metricsInflight = null; });
  }
  return metricsInflight;
}
