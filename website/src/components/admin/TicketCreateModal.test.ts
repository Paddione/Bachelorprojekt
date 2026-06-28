import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import TicketCreateModal from './TicketCreateModal.svelte';
import { makeFeature, makeRollup, makeProduct } from '../../lib/tickets/__tests__/fixtures';

const features = [
  makeFeature({ id: 'f1', extId: 'F1', title: 'Auth', priority: 'mittel', health: 'green', rollup: makeRollup({ total: 1, open: 1 }) }),
];

beforeEach(() => vi.restoreAllMocks());

describe('TicketCreateModal', () => {
  it('has a "bug" option in the type dropdown', () => {
    const { getByTestId } = render(TicketCreateModal,
      { open: true, features, onClose: () => {} });
    const typeSelect = getByTestId('type-select') as HTMLSelectElement;
    const values = Array.from(typeSelect.options).map((o) => o.value);
    expect(values).toContain('bug');
  });

  it('updates parentId when modal is reopened with a different defaultFeatureId', async () => {
    const features2 = [
      ...features,
      makeFeature({ id: 'f2', extId: 'F2', title: 'Billing', priority: 'hoch', health: 'green', rollup: makeRollup({ total: 0, open: 0 }) }),
    ];
    const onClose = vi.fn();
    const { getByTestId, rerender } = render(TicketCreateModal,
      { open: true, features: features2, onClose, defaultFeatureId: 'f1' });
    expect((getByTestId('feature-select') as HTMLSelectElement).value).toBe('f1');

    // Close the modal (simulates onClose -> parent sets open=false)
    await rerender({ open: false, features: features2, onClose, defaultFeatureId: 'f1' });
    // Reopen with a different feature selected in the parent
    await rerender({ open: true, features: features2, onClose, defaultFeatureId: 'f2' });
    expect((getByTestId('feature-select') as HTMLSelectElement).value).toBe('f2');
  });

  it('clears the error when the modal is closed and reopened', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'server error' }), { status: 400 }));
    const onClose = vi.fn();
    const { getByTestId, queryByText, rerender } = render(TicketCreateModal,
      { open: true, features, onClose });
    await fireEvent.input(getByTestId('create-title'), { target: { value: 'X' } });
    await fireEvent.click(getByTestId('create-submit'));
    await waitFor(() => expect(queryByText('server error')).toBeTruthy());

    // Close and reopen
    await rerender({ open: false, features, onClose });
    await rerender({ open: true, features, onClose });
    expect(queryByText('server error')).toBeNull();
  });

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

  it('groups features by product via optgroup when products are passed', () => {
    const products = [
      makeProduct({ id: 'p1', extId: 'p1', title: 'Produkt A', rollup: makeRollup({ total: 1, open: 1 }),
        features: [makeFeature({ id: 'f1', extId: 'F1', title: 'Auth', priority: 'mittel', health: 'green', rollup: makeRollup({ total: 1, open: 1 }) })] }),
    ];
    const { getByTestId } = render(TicketCreateModal,
      { open: true, products, features, onClose: () => {} });
    const sel = getByTestId('feature-select') as HTMLSelectElement;
    const optgroups = sel.querySelectorAll('optgroup');
    expect(optgroups).toHaveLength(1);
    expect(optgroups[0].getAttribute('label')).toBe('Produkt A');
    expect(sel.querySelector('option[value="f1"]')?.textContent).toBe('Auth');
  });
});
