import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolioWithFeature = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
    nextStep: false, discarded: false, majorFeature: false }],
}]};

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Cockpit shell', () => {
  it('does not crash when portfolioInitial has no products field', () => {
    expect(() =>
      render(Cockpit, { portfolioInitial: { error: 'db_error' } as any, brand: 'mentolder' })
    ).not.toThrow();
  });

  it('shows a retry button when portfolio fetch fails', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      .mockResolvedValue(new Response(JSON.stringify(portfolioWithFeature), { status: 200 }));

    const { findByRole } = render(Cockpit, { brand: 'mentolder' });
    const retryBtn = await findByRole('button', { name: /wiederholen|retry/i });
    expect(retryBtn).toBeTruthy();

    // Click retry — should reload portfolio successfully
    await fireEvent.click(retryBtn);
    await waitFor(() => expect(document.querySelector('[data-testid="cockpit-sidebar"]')).toBeTruthy());
  });
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
    await fireEvent.click(getByTestId('sidebar-feature'));
    await waitFor(() => expect(getByText('Alpha')).toBeTruthy());
    expect(getByTestId('cockpit-table')).toBeTruthy();
  });
  it('opens the create modal from the table + Ticket button', async () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: portfolioWithFeature, brand: 'mentolder' });
    await fireEvent.click(getByTestId('open-create'));
    expect(getByTestId('create-modal')).toBeTruthy();
  });
});
