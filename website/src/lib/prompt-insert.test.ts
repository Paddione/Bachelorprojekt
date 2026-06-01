import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  insertPromptBody,
  loadActivePrompts,
  recordPromptUse,
  type PromptOption,
} from './prompt-insert';

describe('insertPromptBody', () => {
  it('inserts into an empty draft', () => {
    expect(insertPromptBody('', 'Hallo')).toBe('Hallo');
  });

  it('appends to a non-empty draft with a separating newline', () => {
    expect(insertPromptBody('Guten Tag.', 'Hallo')).toBe('Guten Tag.\nHallo');
  });

  it('does not double the newline when the draft already ends with one', () => {
    expect(insertPromptBody('Guten Tag.\n', 'Hallo')).toBe('Guten Tag.\nHallo');
  });

  it('trims trailing whitespace-only drafts to a clean insert', () => {
    expect(insertPromptBody('   ', 'Hallo')).toBe('Hallo');
  });
});

describe('loadActivePrompts', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the admin prompt-library endpoint and returns the prompts array', async () => {
    const prompts: PromptOption[] = [
      { id: 1, title: 'A', body: 'a' },
      { id: 2, title: 'B', body: 'b' },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ prompts }),
    });
    const result = await loadActivePrompts();
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/prompt-library');
    expect(result).toEqual(prompts);
  });

  it('returns an empty array when the request fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect(await loadActivePrompts()).toEqual([]);
  });

  it('returns an empty array when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    expect(await loadActivePrompts()).toEqual([]);
  });
});

describe('recordPromptUse', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the per-id use endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await recordPromptUse(7);
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/prompt-library/7/use', { method: 'POST' });
  });

  it('swallows network errors (usage tracking is best-effort)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    await expect(recordPromptUse(7)).resolves.toBeUndefined();
  });
});
