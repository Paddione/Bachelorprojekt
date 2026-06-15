import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TicketDrawer from './TicketDrawer.svelte';

const ticket = { id: 't1', extId: 't1', title: 'Task One', status: 'open', priority: 'mittel', type: 'task' };
beforeEach(() => vi.restoreAllMocks());

describe('TicketDrawer', () => {
  it('hidden when open=false', () => {
    const { queryByTestId } = render(TicketDrawer, { ticket, open: false });
    expect(queryByTestId('ticket-drawer')).toBeNull();
  });
  it('renders fields when open', () => {
    const { getByDisplayValue } = render(TicketDrawer, { ticket, open: true });
    expect(getByDisplayValue('Task One')).toBeTruthy();
  });
  it('PATCHes title on save', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByDisplayValue, getByText } = render(TicketDrawer, { ticket, open: true });
    await fireEvent.input(getByDisplayValue('Task One'), { target: { value: 'New Title' } });
    await fireEvent.click(getByText(/speichern/i));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/admin\/tickets\/t1$/), expect.objectContaining({ method: 'PATCH' })));
  });
  it('dispatches close on close button', async () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(TicketDrawer, { ticket, open: true, onClose });
    await fireEvent.click(getByLabelText(/schließen/i));
    expect(onClose).toHaveBeenCalled();
  });
});
