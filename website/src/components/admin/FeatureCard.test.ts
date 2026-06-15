import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import FeatureCard from './FeatureCard.svelte';

const feature = {
  id: 'f1', extId: 'f1', title: 'Feature Alpha', valueProp: 'Improves onboarding',
  priority: 'mittel', health: 'red' as const,
  rollup: { total: 11, done: 8, blocked: 1, inProgress: 0, open: 2, pctDone: 73 },
};

describe('FeatureCard', () => {
  it('renders title, value prop and status chips', () => {
    const { getByText } = render(FeatureCard, { feature, onClick: () => {} });
    expect(getByText('Feature Alpha')).toBeTruthy();
    expect(getByText('Improves onboarding')).toBeTruthy();
    expect(getByText(/8.*done/i)).toBeTruthy();
    expect(getByText(/1.*blocked/i)).toBeTruthy();
  });
  it('applies red health border when blocked', () => {
    const { getByTestId } = render(FeatureCard, { feature, onClick: () => {} });
    expect(getByTestId('feature-card').className).toMatch(/health-red/);
  });
  it('calls onClick when activated', async () => {
    const onClick = vi.fn();
    const { getByTestId } = render(FeatureCard, { feature, onClick });
    await fireEvent.click(getByTestId('feature-card'));
    expect(onClick).toHaveBeenCalled();
  });
});
