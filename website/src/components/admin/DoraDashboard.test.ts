import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import DoraDashboard from './DoraDashboard.svelte';

const sample = {
  metrics: {
    window: '7d',
    deploymentFrequency: { merges: 5, perWeek: 5 },
    leadTimeHours: { median: 12, mean: 18 },
    changeFailureRate: { rate: 0.25, reverts: 1, bugs: 0, merges: 4, isProxy: true },
    mttrHours: { median: null, closedBugs: 0 },
    driverBreakdown: { factory: 3, devflow: 2 },
  },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sample }));
});
afterEach(() => vi.unstubAllGlobals());

describe('DoraDashboard', () => {
  it('renders the four metric cards from the API', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/Deployment Frequency/i)).toBeTruthy());
    expect(getByText(/Lead Time/i)).toBeTruthy();
    expect(getByText(/Change Failure Rate/i)).toBeTruthy();
    expect(getByText(/MTTR/i)).toBeTruthy();
  });

  it('labels Deployment Frequency honestly as merges to main', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/Merges nach main/i)).toBeTruthy());
  });

  it('shows n/a for MTTR when median is null', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/n\/a/i)).toBeTruthy());
  });

  it('flags Change Failure Rate as a proxy', async () => {
    const { getByText } = render(DoraDashboard);
    await waitFor(() => expect(getByText(/Proxy/i)).toBeTruthy());
  });
});
