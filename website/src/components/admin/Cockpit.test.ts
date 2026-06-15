import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';
import { setLens } from '../../lib/stores/cockpitStore';

vi.mock('../../lib/stores/cockpitStore', async (orig) => {
  const mod = await (orig as any)();
  return { ...mod, setLens: vi.fn(mod.setLens) };
});

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P', rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
  features: [],
}]};

describe('Cockpit', () => {
  it('renders lens and mode toggles', () => {
    const { getByRole } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    expect(getByRole('button', { name: /überblick/i })).toBeTruthy();
    expect(getByRole('button', { name: /werkbank/i })).toBeTruthy();
    expect(getByRole('button', { name: /karten/i })).toBeTruthy();
    expect(getByRole('button', { name: /tabelle/i })).toBeTruthy();
  });
  it('mounts PortfolioGrid in ueberblick lens', () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    expect(getByTestId('portfolio-grid')).toBeTruthy();
  });
  it('calls setLens on toggle', async () => {
    const { getByRole } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByRole('button', { name: /werkbank/i }));
    expect(setLens).toHaveBeenCalledWith('werkbank');
  });
  it('shows empty state when no products', () => {
    const { getByTestId } = render(Cockpit, { portfolioInitial: { products: [] }, brand: 'mentolder' });
    expect(getByTestId('cockpit-empty')).toBeTruthy();
  });
});

describe('Cockpit drill-in', () => {
  it('loads feature tickets and mounts workbench in werkbank lens', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      feature: { id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber',
        rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 } },
      tickets: [],
    }), { status: 200 }));
    const portfolio = { products: [{ id: 'p1', extId: 'p1', title: 'P',
      rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
      features: [{ id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber' as const,
        rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }] }] };
    const { getByText, getByTestId } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByText('F1'));
    await waitFor(() => expect(getByTestId('feature-workbench')).toBeTruthy());
  });
});
