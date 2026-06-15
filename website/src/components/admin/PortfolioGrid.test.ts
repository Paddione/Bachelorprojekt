import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import PortfolioGrid from './PortfolioGrid.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'Produkt Alpha',
  rollup: { total: 5, done: 3, blocked: 2, inProgress: 0, open: 0, pctDone: 60 },
  features: [{
    id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'red' as const,
    rollup: { total: 3, done: 1, blocked: 2, inProgress: 0, open: 0, pctDone: 33 },
  }],
}]};

describe('PortfolioGrid', () => {
  it('renders product header with aggregate pill', () => {
    const { getByText } = render(PortfolioGrid, { portfolio, onSelectFeature: () => {} });
    expect(getByText('Produkt Alpha')).toBeTruthy();
    expect(getByText(/60%/)).toBeTruthy();
  });
  it('shows blocked warning when blocked > 0', () => {
    const { getByText } = render(PortfolioGrid, { portfolio, onSelectFeature: () => {} });
    expect(getByText(/2 blockiert/)).toBeTruthy();
  });
  it('calls onSelectFeature on card click', async () => {
    const onSelectFeature = vi.fn();
    const { getByTestId } = render(PortfolioGrid, { portfolio, onSelectFeature });
    await fireEvent.click(getByTestId('feature-card'));
    expect(onSelectFeature).toHaveBeenCalledWith('f1');
  });
});
