import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchModelIds } from './llm-models-probe';

describe('fetchModelIds', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    Object.defineProperty(global, 'fetch', { value: mockFetch, writable: true });
  });

  it('returns reachable with models when OpenAI body is valid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ id: 'qwen2.5-7b' }, { id: 'mistral-7b' }] }),
    });

    const baseUrl = 'http://localhost:1234/v1';
    const result = await fetchModelIds(baseUrl);

    expect(result.reachable).toBe(true);
    expect(result.models).toEqual(['qwen2.5-7b', 'mistral-7b']);
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:1234/v1/models', expect.any(Object));
  });

  it('returns not reachable when fetch rejects with connection refused', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await fetchModelIds('http://localhost:9999/v1');

    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns not reachable when response status is non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await fetchModelIds('http://localhost:1234/v1');

    expect(result.reachable).toBe(false);
    expect(result.models).toEqual([]);
  });

  it('returns empty models when body JSON parsing fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
    });

    const result = await fetchModelIds('http://localhost:1234/v1');

    expect(result.reachable).toBe(true);
    expect(result.models).toEqual([]);
  });

  it('returns empty models when body data has non-string id values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({ data: [{ id: null }] }),
    });

    const result = await fetchModelIds('http://localhost:1234/v1');

    expect(result.reachable).toBe(true);
    // null ids are filtered out
    expect(result.models).toEqual([]);
  });
});
