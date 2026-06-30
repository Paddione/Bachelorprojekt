import { writable } from 'svelte/store';
import type { CockpitFilterState } from '../cockpit-presets';

interface OptimisticEdit {
  ticketId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface CockpitState {
  selectedFeature: string | null;
  selectedTickets: Set<string>;
  optimistic: Record<string, OptimisticEdit>;
  error: string | null;
  isLoading: boolean;
  filter: CockpitFilterState;
}

const ls = (k: string): string | null =>
  typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
const setLs = (k: string, v: string | null): void => {
  if (typeof localStorage === 'undefined') return;
  if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
};

const initial: CockpitState = {
  selectedFeature: ls('cockpit:feature'),
  selectedTickets: new Set<string>(),
  optimistic: {},
  error: null,
  isLoading: false,
  filter: { status: [], area: [], brand: [] },
};

export const cockpitStore = writable<CockpitState>(initial);

function syncUrl(s: CockpitState): void {
  if (typeof window === 'undefined') return;
  const u = new URL(window.location.href);
  if (s.selectedFeature) u.searchParams.set('feature', s.selectedFeature);
  else u.searchParams.delete('feature');
  u.searchParams.delete('lens');
  u.searchParams.delete('mode');
  u.searchParams.delete('produkt');
  window.history.replaceState({}, '', u);
}

export function initStoreFromUrl(p: URLSearchParams): void {
  cockpitStore.update((s) => ({
    ...s,
    selectedFeature: p.get('feature') ?? s.selectedFeature,
  }));
}

export function selectFeature(extId: string | null): void {
  cockpitStore.update((s) => {
    const n = { ...s, selectedFeature: extId, selectedTickets: new Set<string>() };
    setLs('cockpit:feature', extId); syncUrl(n); return n;
  });
}
export const MAX_BULK_SELECT = 10;

export function toggleTicketSelection(id: string): void {
  cockpitStore.update((s) => {
    const next = new Set(s.selectedTickets);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= MAX_BULK_SELECT) return s;
      next.add(id);
    }
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

function rollbackOptimistic(ticketId: string, field: string): void {
  const key = `${ticketId}:${field}`;
  cockpitStore.update((s) => { const { [key]: _drop, ...rest } = s.optimistic; return { ...s, optimistic: rest }; });
}

export function setError(error: string | null): void { cockpitStore.update((s) => ({ ...s, error })); }
export function setLoading(isLoading: boolean): void { cockpitStore.update((s) => ({ ...s, isLoading })); }

export function setFilter(filter: CockpitFilterState): void {
  cockpitStore.update((s) => ({ ...s, filter }));
}

