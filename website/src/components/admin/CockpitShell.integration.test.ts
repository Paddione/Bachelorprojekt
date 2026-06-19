import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';
import { selectFeature } from '../../lib/stores/cockpitStore';

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
});
