import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { ShortcutsOverlay } from './shortcuts-overlay';

describe('ShortcutsOverlay', () => {
  beforeAll(() => {
    (Element.prototype as any).scrollIntoView = Element.prototype.scrollIntoView || (() => {});
  });

  it('toggles open state with ? when focus is not in a form field', async () => {
    render(<ShortcutsOverlay />);
    const dialog = screen.getByTestId('shortcuts-overlay');

    expect(dialog).toHaveAttribute('data-state', 'closed');

    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(dialog).toHaveAttribute('data-state', 'open');

    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    expect(dialog).toHaveAttribute('data-state', 'closed');
  });

  it('ignores ? when focus is inside an input-like element', async () => {
    render(<ShortcutsOverlay />);
    const dialog = screen.getByTestId('shortcuts-overlay');

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: '?', shiftKey: true });
    expect(dialog).toHaveAttribute('data-state', 'closed');

    input.remove();
  });

  it('filters shortcuts via search and resets filter on close', async () => {
    render(<ShortcutsOverlay />);
    const user = userEvent.setup();

    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    const searchInput = await screen.findByPlaceholderText('Search shortcuts...');
    expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();

    await user.type(searchInput, 'play');
    expect(screen.getByText('Play / Pause')).toBeInTheDocument();
    expect(screen.queryByText('Toggle sidebar')).not.toBeInTheDocument();

    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });

    const reopenedInput = await screen.findByPlaceholderText('Search shortcuts...');
    expect(reopenedInput).toHaveValue('');
    expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
  });
});
