import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import CockpitTable from './CockpitTable.svelte';

const feature = { id: 'f1', extId: 'F1', title: 'F1', priority: 'mittel', health: 'amber' as const,
  rollup: { total: 2, done: 0, blocked: 0, inProgress: 0, open: 2, pctDone: 0 } };
const tickets = [
  { id: 't1', extId: 'T1', title: 'Alpha', status: 'open', priority: 'mittel', type: 'task' },
  { id: 't2', extId: 'T2', title: 'Beta', status: 'in_progress', priority: 'hoch', type: 'task' },
];

beforeEach(() => vi.restoreAllMocks());

describe('CockpitTable', () => {
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
  it('bulk-changes status via batch endpoint', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId, getByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.click(getAllByTestId('row-checkbox')[0]);
    await fireEvent.click(getAllByTestId('row-checkbox')[1]);
    await fireEvent.change(getByTestId('bulk-status'), { target: { value: 'done' } });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/cockpit/batch', expect.objectContaining({ method: 'POST' })));
  });
  it('reorders via keyboard Shift+ArrowDown and POSTs reorder', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getAllByTestId } = render(CockpitTable, { feature, tickets: tickets.map(t => ({...t})), features: [feature] });
    await fireEvent.keyDown(getAllByTestId('row-checkbox')[0], { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/cockpit/reorder', expect.objectContaining({ method: 'POST' })));
  });
  it('opens the drawer via row title click', async () => {
    const onOpenDrawer = vi.fn();
    const { getByText } = render(CockpitTable, { feature, tickets, features: [feature], onOpenDrawer });
    await fireEvent.click(getByText('Alpha'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });
});
