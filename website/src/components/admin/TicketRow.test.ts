import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import TicketRow from './TicketRow.svelte';

const ticket = { id: 't1', extId: 't1', title: 'Task One', status: 'open', priority: 'mittel', type: 'task' };

describe('TicketRow', () => {
  it('renders title, extId and dropdowns', () => {
    const { getByText, getAllByRole } = render(TicketRow, { ticket, selected: false });
    expect(getByText('Task One')).toBeTruthy();
    expect(getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });
  it('dispatches statusChange on status select', async () => {
    const handler = vi.fn();
    const { getByTestId } = render(TicketRow, { ticket, selected: false, onStatusChange: handler });
    await fireEvent.change(getByTestId('status-select'), { target: { value: 'done' } });
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0]).toEqual({ id: 't1', status: 'done' });
  });
  it('dispatches selectToggle on checkbox', async () => {
    const handler = vi.fn();
    const { getByTestId } = render(TicketRow, { ticket, selected: false, onSelectToggle: handler });
    await fireEvent.click(getByTestId('row-checkbox'));
    expect(handler).toHaveBeenCalled();
  });
  it('dispatches openDrawer on title click', async () => {
    const handler = vi.fn();
    const { getByText } = render(TicketRow, { ticket, selected: false, onOpenDrawer: handler });
    await fireEvent.click(getByText('Task One'));
    expect(handler).toHaveBeenCalled();
  });
});

describe('TicketRow responsive', () => {
  const base = { id: 't1', extId: 'T000412', title: 'OIDC Token', status: 'open',
    priority: 'hoch', type: 'task', createdAt: '2026-06-10T00:00:00Z' };

  it('renders the ext id inside a .ticket-col-id element', () => {
    const { container } = render(TicketRow, { ticket: base });
    const idCol = container.querySelector('.ticket-col-id');
    expect(idCol).toBeTruthy();
    expect(idCol!.textContent).toContain('T000412');
  });
  it('applies a priority class for the left border', () => {
    const { container } = render(TicketRow, { ticket: base });
    expect(container.querySelector('.row.prio-hoch')).toBeTruthy();
  });
  it('renders created date inside a .ticket-col-created element', () => {
    const { container } = render(TicketRow, { ticket: base });
    expect(container.querySelector('.ticket-col-created')).toBeTruthy();
  });
});

describe('TicketRow labels + priorities', () => {
  const ticket = { id: 't1', extId: 'T1', title: 'X', status: 'in_progress', priority: 'mittel', type: 'task' };
  it('offers kritisch in the priority dropdown', () => {
    const { getByTestId } = render(TicketRow, { ticket });
    const prio = getByTestId('priority-select') as HTMLSelectElement;
    expect(Array.from(prio.options).map((o) => o.value)).toContain('kritisch');
  });
  it('shows a human label for in_progress status', () => {
    const { getByTestId } = render(TicketRow, { ticket });
    const status = getByTestId('status-select') as HTMLSelectElement;
    expect(Array.from(status.options).map((o) => o.textContent)).toContain('In Arbeit');
  });
});
