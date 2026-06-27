import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const heroDoc = {
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
  ],
};

const admin = { authenticated: true, isAdmin: true, loading: false, user: { name: 'G', email: 'g@m.de', username: 'gekko', isAdmin: true } };

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

beforeEach(() => {
  (useAuth as any).mockReset();
  (getHomepage as any).mockReset();
  (saveHomepage as any).mockReset();
  (getHomepage as any).mockResolvedValue({ document: heroDoc, version: 4 });
  (saveHomepage as any).mockResolvedValue({ ok: true, status: 200, version: 5 });
});

describe('HomepageEditorPage guard', () => {
  it('redirects an authenticated non-admin away from the editor', async () => {
    (useAuth as any).mockReturnValue({ ...admin, isAdmin: false });
    renderEditor();
    await waitFor(() => expect(screen.getByText('HOME_MARKER')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Old Title')).not.toBeInTheDocument();
  });
});

describe('HomepageEditorPage editing', () => {
  it('loads the document and saves an edited field with the base version', async () => {
    (useAuth as any).mockReturnValue(admin);
    renderEditor();

    const titleInput = await screen.findByDisplayValue('Old Title');
    fireEvent.change(titleInput, { target: { value: 'New Title' } });

    fireEvent.click(screen.getByRole('button', { name: /speichern|save/i }));

    await waitFor(() => expect(saveHomepage).toHaveBeenCalledTimes(1));
    const [baseVersion, payload] = (saveHomepage as any).mock.calls[0];
    expect(baseVersion).toBe(4);
    expect(payload.blocks[0].props.title).toBe('New Title');
    // unrelated fields preserved
    expect(payload.blocks[0].props.personName).toBe('Gerald');
  });

  it('shows a conflict notice on a 409 save', async () => {
    (useAuth as any).mockReturnValue(admin);
    (saveHomepage as any).mockResolvedValue({ ok: false, status: 409, currentVersion: 9 });
    renderEditor();
    await screen.findByDisplayValue('Old Title');
    fireEvent.click(screen.getByRole('button', { name: /speichern|save/i }));
    await waitFor(() => expect(screen.getByText(/anderswo geändert|neu laden|konflikt/i)).toBeInTheDocument());
  });

  it('shows a success notice after a 200 save', async () => {
    (useAuth as any).mockReturnValue(admin);
    renderEditor();
    await screen.findByDisplayValue('Old Title');
    fireEvent.click(screen.getByRole('button', { name: /speichern|save/i }));
    await waitFor(() => expect(screen.getByText(/gespeichert|version 5/i)).toBeInTheDocument());
  });
});
