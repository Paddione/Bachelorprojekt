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
  it('PATCHes title on blur', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByDisplayValue } = render(TicketDrawer, { ticket, open: true });
    await fireEvent.input(getByDisplayValue('Task One'), { target: { value: 'New Title' } });
    await fireEvent.blur(getByDisplayValue('New Title'));
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

describe('TicketDrawer transitions + inline edit', () => {
  const ticket = { id: 't1', extId: 'T000412', title: 'OIDC', status: 'open',
    priority: 'hoch', type: 'task', description: 'old desc' };

  it('renders status-transition buttons', () => {
    const { getAllByTestId } = render(TicketDrawer, { ticket, open: true });
    expect(getAllByTestId('drawer-transition').length).toBeGreaterThanOrEqual(3);
  });
  it('POSTs a transition when a status button is clicked', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByText } = render(TicketDrawer, { ticket: { ...ticket }, open: true });
    await fireEvent.click(getByText('→ Erledigt'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1/transition', expect.objectContaining({ method: 'POST' })));
  });
  it('saves an inline description edit via PATCH', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const { getByTestId } = render(TicketDrawer, { ticket: { ...ticket }, open: true });
    await fireEvent.input(getByTestId('drawer-description'), { target: { value: 'new desc' } });
    await fireEvent.blur(getByTestId('drawer-description'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets/t1', expect.objectContaining({ method: 'PATCH' })));
  });
});
