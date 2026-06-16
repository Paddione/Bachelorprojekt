import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';
import { selectFeature } from '../../lib/stores/cockpitStore';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }],
}]};

beforeEach(() => {
  // The cockpit store is a module singleton — reset it so state doesn't leak between tests.
  selectFeature(null);
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('Cockpit shell integration', () => {
  it('persists the selected feature to localStorage', async () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByTestId('sidebar-feature'));
    expect(localStorage.getItem('cockpit:feature')).toBe('F1');
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

    const { findByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });

    // Without any manual click, the cockpit must already render a ticket list.
    expect(await findByText('Erstes Ticket')).toBeTruthy();
    expect(localStorage.getItem('cockpit:feature')).toBe('F1');
  });
});
