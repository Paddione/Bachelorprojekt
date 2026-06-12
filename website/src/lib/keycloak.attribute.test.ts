import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('updateUserAttribute', () => {
  it('GET-merges existing attributes then PUTs', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'u1', attributes: { existing: ['v'] } }) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 't' }) });
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' });

    const { updateUserAttribute } = await import('./keycloak');
    const ok = await updateUserAttribute('u1', 'phoneNumber', '+49 30 1');
    expect(ok).toBe(true);
    const putCall = fetchMock.mock.calls.find(c => c[1]?.method === 'PUT');
    const body = JSON.parse(putCall![1].body);
    expect(body.attributes.existing).toEqual(['v']);
    expect(body.attributes.phoneNumber).toEqual(['+49 30 1']);
  });
});
