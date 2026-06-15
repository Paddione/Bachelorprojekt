import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TicketCreateModal from './TicketCreateModal.svelte';

const features = [
  { id: 'f1', extId: 'F1', title: 'Auth', priority: 'mittel', health: 'green' as const,
    rollup: { total: 1, done: 0, blocked: 0, inProgress: 0, open: 1, pctDone: 0 } },
];

beforeEach(() => vi.restoreAllMocks());

describe('TicketCreateModal', () => {
  it('renders nothing when open=false', () => {
    const { queryByTestId } = render(TicketCreateModal,
      { open: false, features, onClose: () => {} });
    expect(queryByTestId('create-modal')).toBeNull();
  });
  it('renders the form when open=true', () => {
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose: () => {} });
    expect(getByTestId('create-modal')).toBeTruthy();
    expect(getByTestId('create-title')).toBeTruthy();
  });
  it('disables submit while the title is empty', () => {
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose: () => {} });
    expect((getByTestId('create-submit') as HTMLButtonElement).disabled).toBe(true);
  });
  it('POSTs the payload and calls onCreated + onClose on success', async () => {
    const spy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'new1' }), { status: 200 }));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose, onCreated });
    await fireEvent.input(getByTestId('create-title'), { target: { value: 'Neues Ticket' } });
    await fireEvent.click(getByTestId('create-submit'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(
      '/api/admin/tickets', expect.objectContaining({ method: 'POST' })));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });
  it('shows an error and stays open on failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 400 }));
    const onClose = vi.fn();
    const { getByTestId, getByText } = render(TicketCreateModal,
      { open: true, features, onClose });
    await fireEvent.input(getByTestId('create-title'), { target: { value: 'X' } });
    await fireEvent.click(getByTestId('create-submit'));
    await waitFor(() => expect(getByText('boom')).toBeTruthy());
    expect(onClose).not.toHaveBeenCalled();
  });
});
