import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolioWithFeature = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }],
}]};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Cockpit shell', () => {
  it('renders the sidebar and table (no lens/mode toggles)', () => {
    const { getByTestId, queryByRole } = render(Cockpit,
      { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    expect(getByTestId('cockpit-sidebar')).toBeTruthy();
    expect(getByTestId('cockpit-table')).toBeTruthy();
    expect(queryByRole('button', { name: /karten/i })).toBeNull();
    expect(queryByRole('button', { name: /werkbank/i })).toBeNull();
  });
  it('shows the empty state when no products', () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: { products: [] }, brand: 'mentolder' });
    expect(getByTestId('cockpit-empty')).toBeTruthy();
  });
  it('loads feature tickets when a sidebar feature is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      feature: portfolioWithFeature.products[0].features[0],
      tickets: [{ id: 't1', extId: 'T1', title: 'Alpha', status: 'open', priority: 'mittel', type: 'task' }],
    }), { status: 200 }));
    const { getByText, getByTestId } = render(Cockpit,
      { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    await fireEvent.click(getByText('F1'));
    await waitFor(() => expect(getByText('Alpha')).toBeTruthy());
    expect(getByTestId('cockpit-table')).toBeTruthy();
  });
  it('opens the create modal from the table + Ticket button', async () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    await fireEvent.click(getByTestId('open-create'));
    expect(getByTestId('create-modal')).toBeTruthy();
  });
});
