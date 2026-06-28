import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import CockpitTable from './CockpitTable.svelte';
import { cockpitStore } from '../../lib/stores/cockpitStore';
import { makeFeature, makeRollup } from '../../lib/tickets/__tests__/fixtures';

const feature = makeFeature({ health: 'amber', rollup: makeRollup({ total: 2, open: 2 }) });
const tickets = [
  { id: 't1', extId: 'T1', title: 'Alpha', status: 'open', priority: 'mittel', type: 'task' },
  { id: 't2', extId: 'T2', title: 'Beta', status: 'in_progress', priority: 'hoch', type: 'task' },
];

beforeEach(() => {
  vi.restoreAllMocks();
  cockpitStore.set({
    selectedFeature: null,
    selectedTickets: new Set(),
    optimistic: {},
    error: null,
    isLoading: false,
    filter: { status: [], area: [], brand: [] },
  });
});

describe('CockpitTable', () => {
  it('blocks concurrent patchStatus mutations on the same ticket (busy guard)', async () => {
    let resolveFirst!: (v: Response) => void;
    const hangingFetch = new Promise<Response>((r) => { resolveFirst = r; });
    const spy = vi.spyOn(global, 'fetch')
      .mockReturnValueOnce(hangingFetch)
      .mockResolvedValue(new Response('{}', { status: 200 }));

    const { getAllByTestId } = render(CockpitTable,
      { feature, tickets: tickets.map((t) => ({ ...t })), features: [feature] });
    const selects = getAllByTestId('status-select');

    // Fire first mutation — will hang because fetch is unresolved
    fireEvent.change(selects[0], { target: { value: 'done' } });
    // Fire second mutation on the same ticket immediately
    fireEvent.change(selects[0], { target: { value: 'in_review' } });

    // Only ONE fetch should have been called (second blocked by busy guard)
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Resolve the first fetch
    resolveFirst(new Response('{}', { status: 200 }));
    // After the first fetch resolves, the second should still not fire (it returned early)
    await waitFor(() => {});
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('renders a row per ticket', () => {
    const { getAllByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    expect(getAllByTestId('row-checkbox')).toHaveLength(2);
  });
  it('filters rows live by search term', async () => {
    const { getByTestId, getAllByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    await fireEvent.input(getByTestId('table-search'), { target: { value: 'alpha' } });
    expect(getAllByTestId('row-checkbox')).toHaveLength(1);
  });
  it('filters by status chip', async () => {
    const { getAllByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    const chips = getAllByTestId('status-chip');
    const inArbeit = chips.find((c) => /in arbeit/i.test(c.textContent ?? ''))!;
    await fireEvent.click(inArbeit);
    expect(getAllByTestId('row-checkbox')).toHaveLength(1);
  });
  it('calls onOpenCreate when + Ticket is clicked', async () => {
    const onOpenCreate = vi.fn();
    const { getByTestId } = render(CockpitTable, { feature, tickets, features: [feature], onOpenCreate });
    await fireEvent.click(getByTestId('open-create'));
    expect(onOpenCreate).toHaveBeenCalled();
  });
  it('optimistically transitions status then POSTs', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.change(getAllByTestId('status-select')[0], { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1/transition', expect.objectContaining({ method: 'POST' })));
  });
  it('bulk-changes status via bulk-status endpoint', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{"changed":[],"skipped":[],"failed":[]}', { status: 200 }));
    const { getAllByTestId, getByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.click(getAllByTestId('row-checkbox')[0]);
    await fireEvent.click(getAllByTestId('row-checkbox')[1]);
    await fireEvent.change(getByTestId('bulk-status'), { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/bulk-status', expect.objectContaining({ method: 'POST' })));
  });
  it('reorders via keyboard Shift+ArrowDown and POSTs reorder', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.keyDown(getAllByTestId('row-checkbox')[0], { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/cockpit/reorder', expect.objectContaining({ method: 'POST' })));
  });
  it('hides done tickets by default and reveals them via "Alle"', async () => {
    const withDone = [
      { id: 't1', extId: 'T1', title: 'Alpha', status: 'in_progress', priority: 'mittel', type: 'task' },
      { id: 't2', extId: 'T2', title: 'ClosedOne', status: 'done', priority: 'mittel', type: 'task' },
    ];
    const { queryByText, getAllByTestId } = render(CockpitTable, { feature, tickets: withDone, features: [feature] });
    expect(queryByText('ClosedOne')).toBeNull();
    const alle = getAllByTestId('status-chip').find((c) => /alle/i.test(c.textContent ?? ''))!;
    await fireEvent.click(alle);
    expect(queryByText('ClosedOne')).toBeTruthy();
  });
  it('renders a column header', () => {
    const { getByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    expect(getByTestId('table-header')).toBeTruthy();
  });
  it('renders an OpenSpec column header', () => {
    const { getByTestId } = render(CockpitTable, { feature, tickets, features: [feature] });
    const header = getByTestId('table-header');
    expect(header.textContent).toMatch(/openspec/i);
  });
  it('paginates with a load-more button beyond the page size', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `t${i}`, extId: `T${i}`, title: `Item ${i}`, status: 'in_progress', priority: 'mittel', type: 'task',
    }));
    const { getAllByTestId, getByTestId, queryByTestId } = render(CockpitTable, { feature, tickets: many, features: [feature] });
    expect(getAllByTestId('row-checkbox')).toHaveLength(50);
    expect(getByTestId('load-more')).toBeTruthy();
    await fireEvent.click(getByTestId('load-more'));
    expect(getAllByTestId('row-checkbox')).toHaveLength(60);
    expect(queryByTestId('load-more')).toBeNull();
  });
});
