import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import CockpitSidebar from './CockpitSidebar.svelte';

const baseFeatures = [
  { id: 'f1', extId: 'F-AUTH', title: 'Auth', priority: 'mittel', health: 'amber' as const,
    rollup: { total: 4, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 4, pctDone: 0 } },
  { id: 'f2', extId: 'F-CRM', title: 'CRM', priority: 'mittel', health: 'green' as const,
    rollup: { total: 5, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 5, pctDone: 0 } },
];

const portfolio = { products: [{
  id: 'p1', extId: 'p1', title: 'System-Tests',
  rollup: { total: 7, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 7, pctDone: 0 },
  features: baseFeatures,
}]};

describe('CockpitSidebar', () => {
  it('renders product heading and feature nodes with ticket counts', () => {
    const { getByText, getAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    expect(getByText('System-Tests')).toBeTruthy();
    expect(getAllByTestId('sidebar-feature')).toHaveLength(2);
    expect(getByText(/0\/4/)).toBeTruthy();
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

describe('CockpitSidebar scaling controls', () => {
  it('filters the feature list by the search box', async () => {
    const { getByTestId, getAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    await fireEvent.input(getByTestId('feature-filter'), { target: { value: 'Auth' } });
    const feats = getAllByTestId('sidebar-feature');
    expect(feats).toHaveLength(1);
    expect(feats[0].textContent).toContain('Auth');
  });

  it('hides fully-done features until "active only" is turned off', async () => {
    const portfolio2 = { products: [{
      id: 'p1', extId: 'p1', title: 'P',
      rollup: { total: 9, done: 9, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 0, pctDone: 100 },
      features: [
        { id: 'f1', extId: 'F-A', title: 'ActiveOne', priority: 'mittel', health: 'amber' as const,
          rollup: { total: 4, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 4, pctDone: 0 } },
        { id: 'f2', extId: 'F-D', title: 'DoneOne', priority: 'mittel', health: 'green' as const,
          rollup: { total: 5, done: 5, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 0, pctDone: 100 } },
      ],
    }]};
    const { getByTestId, queryByText } = render(CockpitSidebar,
      { portfolio: portfolio2, selectedFeature: null, onSelectFeature: () => {} });
    expect(queryByText('DoneOne')).toBeNull();
    await fireEvent.click(getByTestId('feature-active-only'));
    expect(queryByText('DoneOne')).toBeTruthy();
  });

  it('collapses a product when its heading is clicked', async () => {
    const { getByTestId, getAllByTestId, queryAllByTestId } = render(CockpitSidebar,
      { portfolio, selectedFeature: null, onSelectFeature: () => {} });
    expect(getAllByTestId('sidebar-feature').length).toBeGreaterThan(0);
    await fireEvent.click(getByTestId('product-toggle'));
    expect(queryAllByTestId('sidebar-feature')).toHaveLength(0);
  });
});

describe('CockpitSidebar batch roundtrip (B2)', () => {
  const batchPortfolio = { products: [{
    id: 'p1', extId: 'p1', title: 'Test',
    rollup: { total: 3, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 3, pctDone: 0 },
    features: [
      { id: 'fa', extId: 'F-A', title: 'Feature A', priority: 'mittel', health: 'amber' as const,
        rollup: { total: 3, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 3, pctDone: 0 },
        nextStep: true, discarded: false, majorFeature: false },
      { id: 'fb', extId: 'F-B', title: 'Feature B', priority: 'mittel', health: 'amber' as const,
        rollup: { total: 3, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 3, pctDone: 0 },
        nextStep: true, discarded: false, majorFeature: false },
      { id: 'fc', extId: 'F-C', title: 'Feature C', priority: 'mittel', health: 'amber' as const,
        rollup: { total: 3, done: 0, blocked: 0, inProgress: 0, awaitingDeploy: 0, open: 3, pctDone: 0 },
        nextStep: true, discarded: false, majorFeature: false },
    ],
  }]};

  it('handleApply triggers exactly one batch call for all marked features', async () => {
    const onBatchFeatureAction = vi.fn();
    const { getByText } = render(CockpitSidebar, {
      portfolio: batchPortfolio,
      selectedFeature: null,
      onSelectFeature: () => {},
      onBatchFeatureAction,
    });
    await fireEvent.click(getByText('Übernehmen'));
    // Exactly one batch call containing all 3 features
    expect(onBatchFeatureAction).toHaveBeenCalledTimes(1);
    const callArgs = onBatchFeatureAction.mock.calls[0][0];
    expect(callArgs).toHaveLength(3);
    expect(callArgs.map((a: any) => a.featureId)).toEqual(['fa', 'fb', 'fc']);
    expect(callArgs.every((a: any) => a.action === 'next_step' && a.value === true)).toBe(true);
  });

  it('handleReset triggers exactly one batch call for all marked features', async () => {
    const onBatchFeatureAction = vi.fn();
    const { getByText } = render(CockpitSidebar, {
      portfolio: batchPortfolio,
      selectedFeature: null,
      onSelectFeature: () => {},
      onBatchFeatureAction,
    });
    await fireEvent.click(getByText('Zurücksetzen'));
    expect(onBatchFeatureAction).toHaveBeenCalledTimes(1);
    const callArgs = onBatchFeatureAction.mock.calls[0][0];
    expect(callArgs).toHaveLength(3);
    expect(callArgs.every((a: any) => a.action === 'next_step' && a.value === false)).toBe(true);
  });
});
