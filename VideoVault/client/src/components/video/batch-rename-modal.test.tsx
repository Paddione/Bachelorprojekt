import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@/test/renderWithProviders';
import { BatchRenameModal } from './batch-rename-modal';

vi.mock('@/services/rename-engine', () => ({
  buildBatchName: (_video: any, idx: number) => `NEWNAME-${idx}`,
  getFilenameWithOriginalExt: (base: string, _filename: string) => `${base}.mp4`,
}));

const videos = [
  { id: '1', displayName: 'One', filename: 'one.mkv' } as any,
  { id: '2', displayName: 'Two', filename: 'two.mkv' } as any,
];

describe('BatchRenameModal', () => {
  it('shows preview and submits with options', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(2);

    // Render open with two selected ids
    render(
      <BatchRenameModal
        videos={videos}
        selectedIds={['1', '2']}
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    // Preview shows mapped names using mocked builder
    expect(await screen.findByText(/Preview \(first 2\)/)).toBeTruthy();
    expect(screen.getByText(/One \(one.mkv\)/)).toBeTruthy();
    expect(screen.getByText(/Two \(two.mkv\)/)).toBeTruthy();
    expect(screen.getByText(/NEWNAME-0 \(NEWNAME-0.mp4\)/)).toBeTruthy();
    expect(screen.getByText(/NEWNAME-1 \(NEWNAME-1.mp4\)/)).toBeTruthy();

    // Submit triggers onSubmit with default options and closes
    fireEvent.click(screen.getByTestId('button-batch-rename-submit'));

    expect(onSubmit).toHaveBeenCalledWith(
      ['1', '2'],
      expect.objectContaining({
        prefix: '',
        suffix: '',
        startIndex: 1,
        padDigits: 2,
        transform: 'none',
        applyTo: 'both',
      })
    );

    // Wait microtask queue for onClose after resolution
    await Promise.resolve();
    expect(onClose).toHaveBeenCalled();
  });
});
