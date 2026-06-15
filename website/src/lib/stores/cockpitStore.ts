import { writable, derived, get } from 'svelte/store';

export type Lens = 'ueberblick' | 'werkbank';
export type Mode = 'karten' | 'tabelle';

export interface OptimisticEdit {
  ticketId: string; field: string; oldValue: unknown; newValue: unknown;
}
export interface CockpitState {
  lens: Lens;
  mode: Mode;
  currentProduct: string | null;
  currentFeature: string | null;
  selectedTickets: Set<string>;
  optimistic: Record<string, OptimisticEdit>;
  error: string | null;
  isLoading: boolean;
}

const ls = (k: string): string | null =>
  typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
const setLs = (k: string, v: string | null): void => {
  if (typeof localStorage === 'undefined') return;
  if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
};

const initial: CockpitState = {
  lens: (ls('cockpit:lens') as Lens) ?? 'ueberblick',
  mode: (ls('cockpit:mode') as Mode) ?? 'karten',
  currentProduct: ls('cockpit:produkt'),
  currentFeature: null,
  selectedTickets: new Set<string>(),
  optimistic: {},
  error: null,
  isLoading: false,
};

export const cockpitStore = writable<CockpitState>(initial);
export const selectedCount = derived(cockpitStore, ($s) => $s.selectedTickets.size);

function syncUrl(s: CockpitState): void {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  u.searchParams.set('lens', s.lens);
  u.searchParams.set('mode', s.mode);
  if (s.currentProduct) u.searchParams.set('produkt', s.currentProduct);
  else u.searchParams.delete('produkt');
  window.history.replaceState({}, '', u);
}

export function initStoreFromUrl(p: URLSearchParams): void {
  cockpitStore.update((s) => ({
    ...s,
    lens: (p.get('lens') as Lens) ?? s.lens,
    mode: (p.get('mode') as Mode) ?? s.mode,
    currentProduct: p.get('produkt') ?? s.currentProduct,
  }));
}

export function setLens(lens: Lens): void {
  cockpitStore.update((s) => { const n = { ...s, lens }; setLs('cockpit:lens', lens); syncUrl(n); return n; });
}
export function setMode(mode: Mode): void {
  cockpitStore.update((s) => { const n = { ...s, mode }; setLs('cockpit:mode', mode); syncUrl(n); return n; });
}
export function selectProduct(extId: string | null): void {
  cockpitStore.update((s) => {
    const n = { ...s, currentProduct: extId, currentFeature: null };
    setLs('cockpit:produkt', extId); syncUrl(n); return n;
  });
}
export function selectFeature(extId: string | null): void {
  cockpitStore.update((s) => ({ ...s, currentFeature: extId }));
}
export function toggleTicketSelection(id: string): void {
  cockpitStore.update((s) => {
    const next = new Set(s.selectedTickets);
    next.has(id) ? next.delete(id) : next.add(id);
    return { ...s, selectedTickets: next };
  });
}
export function clearSelection(): void {
  cockpitStore.update((s) => ({ ...s, selectedTickets: new Set<string>() }));
}
export function applyOptimistic(ticketId: string, field: string, newValue: unknown, oldValue: unknown): () => void {
  const key = `${ticketId}:${field}`;
  cockpitStore.update((s) => ({
    ...s, optimistic: { ...s.optimistic, [key]: { ticketId, field, oldValue, newValue } },
  }));
  return () => rollbackOptimistic(ticketId, field);
}
export function rollbackOptimistic(ticketId: string, field: string): void {
  const key = `${ticketId}:${field}`;
  cockpitStore.update((s) => { const { [key]: _drop, ...rest } = s.optimistic; return { ...s, optimistic: rest }; });
}
export function clearOptimistic(ticketId: string, field: string): void { rollbackOptimistic(ticketId, field); }
export function setError(error: string | null): void { cockpitStore.update((s) => ({ ...s, error })); }
export function setLoading(isLoading: boolean): void { cockpitStore.update((s) => ({ ...s, isLoading })); }
export { get };
