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
    const res = await fetch('/api/factory-floor', { credentials: 'same-origin' });
    if (res.ok) ingestFloorPayload(await res.json() as FloorPayload);
    else store.update((s) => ({ ...s, stale: true }));
  } catch { store.update((s) => ({ ...s, stale: true })); }
}

function connect(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  es = new EventSource('/api/factory-floor/stream', { withCredentials: true });
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

export interface FactoryMetricsPayload { brand: string; metrics: unknown[]; activeFeatures: unknown[]; flags: unknown[]; }
let metricsCache: FactoryMetricsPayload | null = null;
let metricsInflight: Promise<FactoryMetricsPayload> | null = null;
export async function getSharedMetrics(force = false): Promise<FactoryMetricsPayload> {
  if (!force && metricsCache) return metricsCache;
  if (!metricsInflight) {
    metricsInflight = fetch('/api/factory-metrics', { credentials: 'same-origin' })
      .then((r) => r.json() as Promise<FactoryMetricsPayload>)
      .then((p) => { metricsCache = p; return p; })
      .finally(() => { metricsInflight = null; });
  }
  return metricsInflight;
}
