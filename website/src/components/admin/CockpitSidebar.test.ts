import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CockpitSidebar from './CockpitSidebar.svelte';

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'System-Tests',
  rollup: { total: 7, done: 0, blocked: 0, inProgress: 0, open: 7, pctDone: 0 },
  features: [
    { id: 'f1', extId: 'F-AUTH', title: 'Auth', priority: 'mittel', health: 'amber' as const,
      rollup: { total: 4, done: 0, blocked: 0, inProgress: 0, open: 4, pctDone: 0 } },
    { id: 'f2', extId: 'F-CRM', title: 'CRM', priority: 'mittel', health: 'green' as const,
      rollup: { total: 5, done: 0, blocked: 0, inProgress: 0, open: 5, pctDone: 0 } },
  ],
}]};

describe('CockpitSidebar', () => {
  it('renders product heading and feature nodes with ticket counts', () => {
    const { getByText, getAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    expect(getByText('System-Tests')).toBeTruthy();
    expect(getAllByTestId('sidebar-feature')).toHaveLength(2);
    expect(getByText(/4 Tickets/)).toBeTruthy();
  });
  it('calls onSelectFeature with the feature extId on click', async () => {
    const onSelectFeature = vi.fn();
    const { getByText } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature });
    await fireEvent.click(getByText('Auth'));
    expect(onSelectFeature).toHaveBeenCalledWith('F-AUTH');
  });
  it('marks the selected feature active', () => {
    const { getAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: 'F-CRM', onSelectFeature: () => {} });
    const active = getAllByTestId('sidebar-feature').filter(
      (el) => el.classList.contains('active'));
    expect(active).toHaveLength(1);
    expect(active[0].textContent).toContain('CRM');
  });
  it('hamburger toggles the drawer-open class', async () => {
    const { getByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    const aside = getByTestId('cockpit-sidebar');
    expect(aside.classList.contains('drawer-open')).toBe(false);
    await fireEvent.click(getByTestId('sidebar-hamburger'));
    expect(aside.classList.contains('drawer-open')).toBe(true);
  });
  it('selecting a feature auto-closes the drawer', async () => {
    const { getByTestId, getByText } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    await fireEvent.click(getByTestId('sidebar-hamburger'));
    expect(getByTestId('cockpit-sidebar').classList.contains('drawer-open')).toBe(true);
    await fireEvent.click(getByText('Auth'));
    expect(getByTestId('cockpit-sidebar').classList.contains('drawer-open')).toBe(false);
  });
});
