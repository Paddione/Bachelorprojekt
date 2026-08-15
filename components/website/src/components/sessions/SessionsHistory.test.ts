import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SessionsHistory from './SessionsHistory.svelte';

const sampleHistory = {
  items: [
    { id: 's1', slug: 's1', type: 'form', title: 'S1 Title', date: '2026-06-20T12:00:00Z', owner: 'gekko', participants: ['gekko'], content_available: true },
    { id: 's2', slug: 's2', type: 'brainstorm', title: 'S2 Title', date: '2026-06-20T11:00:00Z', owner: 'gekko', participants: [], content_available: true }
  ],
  total: 2,
  hasMore: false
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/admin/sessions/history/')) {
      // Mock markdown detail fetch
      return Promise.resolve({
        ok: true,
        text: async () => '# Markdown Session Details'
      });
    }
    return Promise.resolve({
      ok: true,
      json: async () => sampleHistory
    });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SessionsHistory', () => {
  it('renders cards for sessions from the history API', async () => {
    const { getByText, getAllByText } = render(SessionsHistory);
    await waitFor(() => {
      expect(getByText('S1 Title')).toBeTruthy();
      expect(getByText('S2 Title')).toBeTruthy();
      expect(getAllByText(/Besitzer: gekko/).length).toBe(2);
    });
  });

  it('loads markdown detail on session card click and renders read-only panel', async () => {
    const { getByText, getByRole, queryByText } = render(SessionsHistory);
    
    // Wait for item to render and click it
    await waitFor(() => getByText('S1 Title'));
    const button = getByRole('button', { name: /S1 Title/i });
    await fireEvent.click(button);

    // Should fetch individual markdown and display in a panel
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/sessions/history/s1'), expect.any(Object));
      expect(getByText(/Markdown Session Details/)).toBeTruthy();
    });

    // Close the panel
    const closeBtn = getByRole('button', { name: /Schließen/i });
    await fireEvent.click(closeBtn);
    expect(queryByText('Markdown Session Details')).toBeNull();
  });

  it('applies type filter dropdown change', async () => {
    const { getByLabelText } = render(SessionsHistory);
    const select = getByLabelText(/Typ:/i) as HTMLSelectElement;
    
    await fireEvent.change(select, { target: { value: 'form' } });
    
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('type=form'), expect.any(Object));
    });
  });

  it('shows Load More button if hasMore is true and fetches offset 50', async () => {
    // Override fetch mock to return hasMore: true
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: sampleHistory.items,
        total: 52,
        hasMore: true
      })
    } as Response);

    const { getByRole } = render(SessionsHistory);
    
    await waitFor(() => getByRole('button', { name: /Mehr laden/i }));
    const loadMoreBtn = getByRole('button', { name: /Mehr laden/i });
    await fireEvent.click(loadMoreBtn);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('offset=50'), expect.any(Object));
    });
  });

  it('renders empty state if no archived sessions', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        total: 0,
        hasMore: false
      })
    } as Response);

    const { getByText } = render(SessionsHistory);
    await waitFor(() => {
      expect(getByText(/Keine vergangenen Sessions/i)).toBeTruthy();
    });
  });
});
