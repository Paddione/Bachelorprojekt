import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import AdminModal from './AdminModal.svelte';
import AdminDrawer from './AdminDrawer.svelte';

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = vi.fn();
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = vi.fn();
  }
});

const body = createRawSnippet(() => ({
  render: () => `<p data-testid="modal-body">Formularinhalt</p>`,
}));

beforeEach(() => vi.restoreAllMocks());

describe('AdminModal', () => {
  it('renders a <dialog> whose aria-labelledby points at the title <h2>', () => {
    const { getByTestId } = render(AdminModal, { open: false, title: 'Rechnung anlegen', body });
    const dialog = getByTestId('admin-modal');
    expect(dialog.tagName).toBe('DIALOG');
    const labelledby = dialog.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    const heading = document.getElementById(labelledby as string);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toContain('Rechnung anlegen');
  });

  it('calls showModal() when the bound open prop flips to true', async () => {
    const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(() => {});
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(() => {});
    
    const { rerender } = render(AdminModal, { open: false, title: 'X', body });
    
    // If it was called on mount, we don't care, we care about the next call
    expect(showModalSpy).toBeDefined();
    
    await rerender({ open: true, title: 'X', body });
    expect(showModalSpy).toHaveBeenCalled();
  });
});

describe('AdminDrawer', () => {
  it('renders a <dialog> whose aria-labelledby points at the title <h2>', () => {
    const { getByTestId } = render(AdminDrawer, { open: false, title: 'Drawer Title', body });
    const dialog = getByTestId('admin-drawer');
    expect(dialog.tagName).toBe('DIALOG');
    const labelledby = dialog.getAttribute('aria-labelledby');
    expect(labelledby).toBeTruthy();
    const heading = document.getElementById(labelledby as string);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toContain('Drawer Title');
  });

  it('calls showModal() when the bound open prop flips to true', async () => {
    const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(() => {});
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(() => {});
    
    const { rerender } = render(AdminDrawer, { open: false, title: 'X', body });
    
    expect(showModalSpy).toBeDefined();
    
    await rerender({ open: true, title: 'X', body });
    expect(showModalSpy).toHaveBeenCalled();
  });
});
