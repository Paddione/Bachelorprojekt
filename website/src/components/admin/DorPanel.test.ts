import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import DorPanel from './DorPanel.svelte';

describe('DorPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    }));
  });

  it('renders textarea and preview when slug and content are provided', () => {
    render(DorPanel, {
      props: { slug: 's1', proposalContent: '# Hello' },
    });

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# Hello');
    expect(screen.getByText('Hello')).toBeTruthy();
  });

  it('shows no-slug warning and link when slug is null', () => {
    render(DorPanel, {
      props: { slug: null, proposalContent: null },
    });

    expect(screen.getByText('Kein Proposal verknüpft')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders empty editor when slug is provided but proposalContent is null', () => {
    render(DorPanel, {
      props: { slug: 's1', proposalContent: null },
    });

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');
    expect(screen.queryByText('Kein Proposal verknüpft')).toBeNull();
  });

  it('clicking Save calls fetch with correct parameters', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(DorPanel, {
      props: { slug: 's1', proposalContent: 'initial content' },
    });

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(textarea, { target: { value: 'updated content' } });

    const saveBtn = screen.getByRole('button', { name: 'Speichern' });
    await fireEvent.click(saveBtn);

    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/openspec/save-proposal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug: 's1', content: 'updated content' }),
    });
  });
});
