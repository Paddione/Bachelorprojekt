import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, render } from '@/test/renderWithProviders';
import { RenameModal } from './rename-modal';

vi.mock('@/services/rename-engine', () => ({
  buildNameFromCategories: (_video: any) => 'CATS',
}));

const video = {
  id: 'v1',
  displayName: 'Old Name',
  filename: 'old.mp4',
} as any;

describe('RenameModal', () => {
  it('prefills, validates, generates from categories and submits', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue({ success: true });

    render(
      <RenameModal
        video={video}
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    const input = await screen.findByTestId('input-rename');
    expect((input as HTMLInputElement).value).toBe('Old Name');

    // Empty name shows validation error
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getAllByTestId('button-rename-submit')[0]);
    expect(screen.getByText('rename.emptyError')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    // Generate from categories
    fireEvent.click(screen.getByTestId('button-name-from-categories'));
    expect((input as HTMLInputElement).value).toBe('CATS');

    // Successful submit closes
    fireEvent.click(screen.getAllByTestId('button-rename-submit')[0]);
    expect(onSubmit).toHaveBeenCalledWith('v1', 'CATS', 'both');
    await Promise.resolve();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows server error message on failure', async () => {
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue({ success: false, message: 'Oops' });

    render(
      <RenameModal
        video={video}
        isOpen={true}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getAllByTestId('button-rename-submit')[0]);
    expect(await screen.findByText('Oops')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
