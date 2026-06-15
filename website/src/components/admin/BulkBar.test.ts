import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BulkBar from './BulkBar.svelte';

describe('BulkBar', () => {
  it('hidden when no selection', () => {
    const { queryByTestId } = render(BulkBar, { selectedIds: [] });
    expect(queryByTestId('bulk-bar')).toBeNull();
  });
  it('shows count when selection present', () => {
    const { getByText } = render(BulkBar, { selectedIds: ['a', 'b', 'c'] });
    expect(getByText(/3 .* ausgewählt/i)).toBeTruthy();
  });
  it('dispatches bulkStatus on status change', async () => {
    const onBulkStatus = vi.fn();
    const { getByTestId } = render(BulkBar, { selectedIds: ['a', 'b'], onBulkStatus });
    await fireEvent.change(getByTestId('bulk-status'), { target: { value: 'done' } });
    expect(onBulkStatus.mock.calls[0][0]).toEqual({ ids: ['a', 'b'], status: 'done' });
  });
  it('dispatches clear on Escape', async () => {
    const onClear = vi.fn();
    const { getByTestId } = render(BulkBar, { selectedIds: ['a'], onClear });
    await fireEvent.keyDown(getByTestId('bulk-bar'), { key: 'Escape' });
    expect(onClear).toHaveBeenCalled();
  });
});
