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
