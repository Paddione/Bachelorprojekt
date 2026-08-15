import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import BulkToast from './BulkToast.svelte';

describe('BulkToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders text with status and number of changed tickets', () => {
    const { getByText, queryByTestId } = render(BulkToast, {
      result: { changed: 3, skipped: 1, failed: 0, status: 'backlog', undoToken: 'token123' },
      onUndo: vi.fn(),
      onDismiss: vi.fn(),
    });

    expect(getByText(/3 Tickets auf backlog gesetzt/i)).toBeTruthy();
    expect(queryByTestId('bulk-undo')).toBeTruthy();
  });

  it('calls onUndo callback when undo button is clicked', async () => {
    const onUndo = vi.fn();
    const { getByTestId } = render(BulkToast, {
      result: { changed: 3, skipped: 1, failed: 0, status: 'backlog', undoToken: 'token123' },
      onUndo,
      onDismiss: vi.fn(),
    });

    const undoBtn = getByTestId('bulk-undo');
    await fireEvent.click(undoBtn);
    expect(onUndo).toHaveBeenCalledWith('token123');
  });

  it('calls onDismiss after 5 seconds', () => {
    const onDismiss = vi.fn();
    render(BulkToast, {
      result: { changed: 3, skipped: 0, failed: 0, status: 'backlog' },
      onUndo: vi.fn(),
      onDismiss,
    });

    vi.advanceTimersByTime(5000);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('renders failure banner and does not dismiss automatically when result.failed > 0', () => {
    const onDismiss = vi.fn();
    const { getByText } = render(BulkToast, {
      result: { changed: 3, skipped: 0, failed: 1, status: 'backlog' },
      onUndo: vi.fn(),
      onDismiss,
    });

    expect(getByText(/Undo fehlgeschlagen — manuell prüfen/i)).toBeTruthy();
    vi.advanceTimersByTime(5000);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
