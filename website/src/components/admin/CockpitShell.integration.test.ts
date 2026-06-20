import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';
import { selectFeature, cockpitStore } from '../../lib/stores/cockpitStore';
import { encodeState } from '../../lib/cockpit-presets';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 1, pctDone: 0 },
    nextStep: false, discarded: false, majorFeature: false }],
}]};

beforeEach(() => {
  selectFeature(null);
  localStorage.clear();
  cockpitStore.set({
    selectedFeature: null,
    selectedTickets: new Set(),
    optimistic: {},
    error: null,
    isLoading: false,
    filter: { status: [], area: [], brand: [] },
  });
  if (typeof window !== 'undefined') {
    window.history.replaceState({}, '', '/');
  }
});
afterEach(() => vi.unstubAllGlobals());

describe('Cockpit shell integration', () => {
  it('lädt Feature-Tickets wenn cockpit:feature-selected Event gefeuert wird', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/cockpit/feature')) {
        return new Response(JSON.stringify({
          feature: portfolio.products[0].features[0],
          tickets: [{ id: 't1', extId: 'T1', title: 'Erstes Ticket',
            status: 'open', priority: 'mittel', type: 'task' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { findByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });

    window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId: 'F1' } }));

    expect(await findByText('Erstes Ticket')).toBeTruthy();
  });

  it('auto-selects the first feature with tickets and shows them on open', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/cockpit/feature')) {
        return new Response(JSON.stringify({
          feature: portfolio.products[0].features[0],
          tickets: [{ id: 't1', extId: 'T1', title: 'Erstes Ticket',
            status: 'open', priority: 'mittel', type: 'task' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { findByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });

    expect(await findByText('Erstes Ticket')).toBeTruthy();
    expect(localStorage.getItem('cockpit:feature')).toBe('F1');
  });

  it('refetcht Portfolio bei cockpit:portfolio-mutated', async () => {
    let portfolioCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('portfolio')) portfolioCalls++;
      return new Response(JSON.stringify(portfolio), { status: 200 });
    }));

    render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });
    const before = portfolioCalls;
    window.dispatchEvent(new Event('cockpit:portfolio-mutated'));
    await waitFor(() => expect(portfolioCalls).toBeGreaterThan(before));
  });

  it('applies filters from preset in URL on mount', async () => {
    const filter = { status: ['in_progress'], area: ['website'], brand: ['testbrand'] };
    const encoded = encodeState(filter);
    
    window.history.replaceState({}, '', `?preset=${encoded}`);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/cockpit/feature')) {
        return new Response(JSON.stringify({
          feature: portfolio.products[0].features[0],
          tickets: [
            { id: 't1', extId: 'T1', title: 'Matching Ticket', status: 'in_progress', priority: 'mittel', type: 'task', component: 'website' },
            { id: 't2', extId: 'T2', title: 'Filtered Status', status: 'done', priority: 'mittel', type: 'task', component: 'website' },
            { id: 't3', extId: 'T3', title: 'Filtered Area', status: 'in_progress', priority: 'mittel', type: 'task', component: 'other' }
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { findByText, queryByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });

    window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId: 'F1' } }));

    expect(await findByText('Matching Ticket')).toBeTruthy();
    expect(queryByText('Filtered Status')).toBeNull();
    expect(queryByText('Filtered Area')).toBeNull();
  });

  it('shows error toast and does not filter when URL preset is invalid', async () => {
    window.history.replaceState({}, '', '?preset=!!!invalid!!!');

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/cockpit/feature')) {
        return new Response(JSON.stringify({
          feature: portfolio.products[0].features[0],
          tickets: [{ id: 't1', extId: 'T1', title: 'Erstes Ticket', status: 'open', priority: 'mittel', type: 'task' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify(portfolio), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { findByText, findByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'testbrand' });

    const errorEl = await findByTestId('preset-error');
    expect(errorEl.textContent).toBe('Preset ungültig');

    window.dispatchEvent(new CustomEvent('cockpit:feature-selected', { detail: { extId: 'F1' } }));

    expect(await findByText('Erstes Ticket')).toBeTruthy();
  });
});
