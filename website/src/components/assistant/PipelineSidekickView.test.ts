import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';
import PipelineSidekickView from './PipelineSidekickView.svelte';
import { PIPELINE_LANES } from '../../lib/factory-floor';

const FLOOR = {
  planningCount: { total: 3, ready: 1 }, staged: [{ extId: 'T1' }], loadingDock: [{ extId: 'T2' }, { extId: 'T3' }],
  hall: [{ extId: 'T4', phase: 'scout', phaseProgress: [] }], shipped: [{ extId: 'T5' }], attention: { blocked: [] },
  metrics: { shippedToday: 1, avgCycleH: null }, control: {},
};
const QA = [{ extId: 'T6' }];

beforeEach(() => {
  vi.stubGlobal('EventSource', class { close() {} addEventListener() {} onmessage = null; });
  vi.stubGlobal('fetch', vi.fn((url: string) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(String(url).includes('qa-queue') ? QA : FLOOR) })));
});

describe('PipelineSidekickView', () => {
  it('renders the linear lanes in SSOT front→back order', async () => {
    const { findAllByTestId } = render(PipelineSidekickView, { props: { onClose: () => {} } });
    const rows = await findAllByTestId('pipeline-lane');
    const labels = rows.map((r) => r.getAttribute('data-lane'));
    const expected = PIPELINE_LANES.filter((l) => !l.side).map((l) => l.key);
    expect(labels).toEqual(expected);
  });
});
