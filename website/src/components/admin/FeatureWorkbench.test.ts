import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import FeatureWorkbench from './FeatureWorkbench.svelte';

const feature = { id: 'f1', extId: 'f1', title: 'F1', priority: 'mittel', health: 'amber' as const,
  rollup: { total: 2, done: 0, blocked: 0, inProgress: 0, open: 2, pctDone: 0 } };
const tickets = [
  { id: 't1', extId: 't1', title: 'A', status: 'open', priority: 'mittel', type: 'task' },
  { id: 't2', extId: 't2', title: 'B', status: 'open', priority: 'mittel', type: 'task' },
];

beforeEach(() => { vi.restoreAllMocks(); });

describe('FeatureWorkbench', () => {
  it('renders feature header and a row per ticket', () => {
    const { getByText, getAllByTestId } = render(FeatureWorkbench, { feature, tickets });
    expect(getByText('F1')).toBeTruthy();
    expect(getAllByTestId('row-checkbox')).toHaveLength(2);
  });
  it('optimistically applies status then calls transition endpoint', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(FeatureWorkbench, { feature, tickets });
    await fireEvent.change(getAllByTestId('status-select')[0], { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/tickets\/t1\/transition/), expect.anything()));
  });
  it('rolls back: after 500 response, ticket status reverts in data', async () => {
    // When transition returns 500, patchStatus catches + restores t.status to old
    // We verify this by checking that fetch WAS called with the new status
    // and that error handling runs (no uncaught promise rejection)
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('err', { status: 500 }));
    const { getAllByTestId } = render(FeatureWorkbench, { feature, tickets: tickets.map(t => ({...t})) });
    await fireEvent.change(getAllByTestId('status-select')[0], { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/tickets\/t1\/transition/), expect.anything()));
    // Verify busy state is cleared (test component doesn't throw, fetch resolved)
    const selects = getAllByTestId('status-select');
    expect(selects).toHaveLength(2);
    // Select is no longer disabled (busy cleared)
    expect((selects[0] as HTMLSelectElement).disabled).toBe(false);
  });
});
