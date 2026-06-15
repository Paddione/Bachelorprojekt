import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Cockpit from './Cockpit.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'P', rollup: { total: 0, done: 0, blocked: 0, inProgress: 0, open: 0, pctDone: 0 },
  features: [],
}]};

beforeEach(() => localStorage.clear());

describe('Cockpit persistence', () => {
  it('persists lens to localStorage on toggle', async () => {
    const { getByRole } = render(Cockpit, { portfolioInitial: portfolio, brand: 'mentolder' });
    await fireEvent.click(getByRole('button', { name: /werkbank/i }));
    expect(localStorage.getItem('cockpit:lens')).toBe('werkbank');
  });
});
