import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import SessionsListView from './SessionsListView.svelte';

const sample = {
  sessions: [
    { slug: 'feature-intake', type: 'form', title: 'Feature-Intake', port: 1,
      public_url: 'https://session-feature-intake.dev.example.test',
      local_url: 'http://localhost:1/x.html', started_at: '2026-06-20T00:00:00Z' },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => sample }));
});
afterEach(() => vi.unstubAllGlobals());

describe('SessionsListView', () => {
  it('renders a card per session from the API', async () => {
    const { getByText } = render(SessionsListView);
    await waitFor(() => expect(getByText('Feature-Intake')).toBeTruthy());
  });

  it('dispatches mediaviewer:open-session on card click', async () => {
    const handler = vi.fn();
    window.addEventListener('mediaviewer:open-session', handler as EventListener);
    const { getByRole } = render(SessionsListView);
    await waitFor(() => getByRole('button', { name: /Feature-Intake/i }));
    await fireEvent.click(getByRole('button', { name: /Feature-Intake/i }));
    expect(handler).toHaveBeenCalledOnce();
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail.url).toBe('https://session-feature-intake.dev.example.test');
    expect(ev.detail.slug).toBe('feature-intake');
    window.removeEventListener('mediaviewer:open-session', handler as EventListener);
  });

  it('shows an empty state when there are no sessions', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ sessions: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const { getByText } = render(SessionsListView);
    await waitFor(() => expect(getByText(/Keine aktiven Sessions/i)).toBeTruthy());
  });
});
