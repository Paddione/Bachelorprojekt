import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { HomepageEditorPage } from './HomepageEditorPage';

vi.mock('../../auth/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('../../lib/homepageApi', () => ({
  getHomepage: vi.fn(),
  saveHomepage: vi.fn(),
  loginUrl: (r: string) => `https://web.mentolder.de/api/auth/login?returnTo=${encodeURIComponent(r)}`,
}));

import { useAuth } from '../../auth/useAuth';
import { getHomepage, saveHomepage } from '../../lib/homepageApi';

// Two blocks so "only the changed block is previewed" is meaningful: edit hero,
// the faq block must NOT appear in the confirmation dialog.
const baseDoc = {
  schemaVersion: 1,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      props: {
        title: 'Old Title',
        titleEmphasis: 'Emph',
        subtitle: 'Sub',
        tagline: 'Tag',
        avatarType: 'image',
        avatarSrc: '/g.jpg',
        personName: 'Gerald',
        personRole: 'Coach',
      },
    },
    { id: 'faq', type: 'faq', props: { title: 'Häufige Fragen', items: [] } },
  ],
};

const admin = {
  authenticated: true,
  isAdmin: true,
  loading: false,
  user: { name: 'G', email: 'g@m.de', username: 'gekko', isAdmin: true },
};

function renderEditor() {
  return render(
    <MemoryRouter initialEntries={['/admin/homepage']}>
      <Routes>
        <Route path="/admin/homepage" element={<HomepageEditorPage />} />
        <Route path="/" element={<div>HOME_MARKER</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const saveButton = () => screen.getByRole('button', { name: 'Speichern' });

async function loadAndEditTitle(value = 'New Title') {
  const titleInput = await screen.findByDisplayValue('Old Title');
  fireEvent.change(titleInput, { target: { value } });
}

beforeEach(() => {
  (useAuth as any).mockReset();
  (getHomepage as any).mockReset();
  (saveHomepage as any).mockReset();
  (getHomepage as any).mockResolvedValue({ document: baseDoc, version: 4 });
  (saveHomepage as any).mockResolvedValue({ ok: true, status: 200, version: 5 });
  (useAuth as any).mockReturnValue(admin);
});

describe('HomepageEditorPage guard', () => {
  it('redirects an authenticated non-admin away from the editor', async () => {
    (useAuth as any).mockReturnValue({ ...admin, isAdmin: false });
    renderEditor();
    await waitFor(() => expect(window.location.href).toBe('http://localhost:3000/'));
  });
});

describe('HomepageEditorPage — save confirmation flow', () => {
  it('disables Speichern until a block is actually changed', async () => {
    renderEditor();
    await screen.findByDisplayValue('Old Title');
    expect(saveButton()).toBeDisabled();
    await loadAndEditTitle();
    expect(saveButton()).toBeEnabled();
  });

  it('opens a confirmation dialog on Speichern instead of saving immediately', async () => {
    renderEditor();
    await loadAndEditTitle();
    fireEvent.click(saveButton());
    expect(saveHomepage).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('previews only the changed block (before/after) in the dialog', async () => {
    renderEditor();
    await loadAndEditTitle();
    fireEvent.click(saveButton());
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Hero')).toBeInTheDocument();
    expect(within(dialog).queryByText('FAQ')).not.toBeInTheDocument();
    expect(within(dialog).getByText('Vorher')).toBeInTheDocument();
    expect(within(dialog).getByText('Nachher')).toBeInTheDocument();
  });

  it('saves with the base version and closes the dialog on confirm', async () => {
    renderEditor();
    await loadAndEditTitle('New Title');
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

    await waitFor(() => expect(saveHomepage).toHaveBeenCalledTimes(1));
    const [baseVersion, payload] = (saveHomepage as any).mock.calls[0];
    expect(baseVersion).toBe(4);
    expect(payload.blocks[0].props.title).toBe('New Title');
    expect(payload.blocks[0].props.personName).toBe('Gerald'); // unrelated fields preserved

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/gespeichert|version 5/i)).toBeInTheDocument();
    // baseline advanced to the saved doc → nothing left to save
    expect(saveButton()).toBeDisabled();
  });

  it('does not save when the dialog is cancelled', async () => {
    renderEditor();
    await loadAndEditTitle();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(saveHomepage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it('shows a conflict notice on a 409 save', async () => {
    (saveHomepage as any).mockResolvedValue({ ok: false, status: 409, currentVersion: 9 });
    renderEditor();
    await loadAndEditTitle();
    fireEvent.click(saveButton());
    fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));
    await waitFor(() =>
      expect(screen.getByText(/anderswo geändert|neu laden|konflikt/i)).toBeInTheDocument(),
    );
  });
});

describe('HomepageEditorPage — collapsible live preview', () => {
  it('keeps the live preview collapsed by default and reveals it on toggle', async () => {
    renderEditor();
    await screen.findByDisplayValue('Old Title');
    expect(screen.queryByRole('region', { name: 'Hero-Bereich' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /vorschau einblenden|ausblenden/i }));
    expect(screen.getByRole('region', { name: 'Hero-Bereich' })).toBeInTheDocument();
  });
});
