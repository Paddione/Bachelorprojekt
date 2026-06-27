import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

vi.mock('@/lib/homepageApi', () => ({ getHomepage: vi.fn() }));
import { getHomepage } from '@/lib/homepageApi';

const fetchedDoc = {
  schemaVersion: 1,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      props: {
        title: 'GEFETCHTE STARTSEITE',
        titleEmphasis: 'live aus der DB.',
        subtitle: 'Sub',
        tagline: 'Tag',
        avatarType: 'initials',
        avatarInitials: 'GK',
        personName: 'Gerald',
        personRole: 'Coach',
      },
    },
  ],
};

const renderHome = () =>
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );

beforeEach(() => {
  (getHomepage as any).mockReset();
  // default: empty → seed fallback (keeps the snapshot baseline deterministic)
  (getHomepage as any).mockResolvedValue({ document: null, version: 0 });
});

describe('HomePage document rendering', () => {
  it('renders the fetched document when valid', async () => {
    (getHomepage as any).mockResolvedValue({ document: fetchedDoc, version: 3 });
    renderHome();
    await waitFor(() => expect(screen.getByText('GEFETCHTE STARTSEITE')).toBeInTheDocument());
  });

  it('falls back to the seed when the response is empty', async () => {
    (getHomepage as any).mockResolvedValue({ document: null, version: 0 });
    renderHome();
    // seed hero title is present, fetched title is not
    await waitFor(() => expect(screen.getByText(/Technologie wieder verbindet/i)).toBeInTheDocument());
    expect(screen.queryByText('GEFETCHTE STARTSEITE')).not.toBeInTheDocument();
  });

  it('falls back to the seed when the fetch errors', async () => {
    (getHomepage as any).mockRejectedValue(new Error('offline'));
    renderHome();
    await waitFor(() => expect(screen.getByText(/Technologie wieder verbindet/i)).toBeInTheDocument());
  });

  it('falls back to the seed when the fetched document is schema-invalid', async () => {
    (getHomepage as any).mockResolvedValue({
      document: { schemaVersion: 1, blocks: [{ id: 'x', type: 'unknownBlock', props: {} }] },
      version: 1,
    });
    renderHome();
    await waitFor(() => expect(screen.getByText(/Technologie wieder verbindet/i)).toBeInTheDocument());
  });
});

describe('HomePage Null-Diff baseline', () => {
  it('renders the seed page as a stable snapshot', async () => {
    const { container } = renderHome();
    // let the (empty) fetch settle; render stays on the seed
    await waitFor(() => expect(getHomepage).toHaveBeenCalled());
    expect(container.firstChild).toMatchSnapshot('homepage-seed-page');
  });
});
