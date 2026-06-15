import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P',
  rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 },
  features: [{ id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } }],
}]};

beforeEach(() => localStorage.clear());

describe('Cockpit shell integration', () => {
  it('persists the selected feature to localStorage', async () => {
    const { getByText } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByText('F1'));
    expect(localStorage.getItem('cockpit:feature')).toBe('F1');
  });
});
