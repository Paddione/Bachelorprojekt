import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMe, getHomepage, saveHomepage, loginUrl, logoutUrl } from './homepageApi';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonRes = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('getMe', () => {
  it('sends credentials and returns the parsed body', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { authenticated: true, user: { isAdmin: true } }));
    const me = await getMe();
    expect(me.authenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/me'), expect.objectContaining({ credentials: 'include' }));
  });

  it('returns logged-out on a non-OK response', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(500, { error: 'x' }));
    expect((await getMe()).authenticated).toBe(false);
  });

  it('returns logged-out when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    expect((await getMe()).authenticated).toBe(false);
  });
});

describe('getHomepage', () => {
  it('returns the document + version (from the X-Homepage-Version header) on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ schemaVersion: 1, blocks: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'X-Homepage-Version': '4' },
      }),
    );
    const r = await getHomepage();
    expect(r.document).toEqual({ schemaVersion: 1, blocks: [] });
    expect(r.version).toBe(4);
  });

  it('returns null document + version 0 on 204', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await getHomepage()).toEqual({ document: null, version: 0 });
  });

  it('returns null document when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await getHomepage()).toEqual({ document: null, version: 0 });
  });
});

describe('saveHomepage', () => {
  it('maps 200 to ok+version and posts baseVersion+payload', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(200, { version: 4 }));
    const r = await saveHomepage(3, { schemaVersion: 1, blocks: [] });
    expect(r).toEqual({ ok: true, status: 200, version: 4 });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ baseVersion: 3, payload: { schemaVersion: 1, blocks: [] } });
  });

  it('maps 409 to a conflict result', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(409, { currentVersion: 7, currentValue: { schemaVersion: 1, blocks: [] } }));
    const r = await saveHomepage(2, {});
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.currentVersion).toBe(7);
  });

  it('maps 422 to field errors', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(422, { errors: [{ path: 'blocks.0', message: 'bad' }] }));
    const r = await saveHomepage(0, {});
    expect(r.status).toBe(422);
    expect(r.errors?.[0].path).toBe('blocks.0');
  });
});

describe('loginUrl / logoutUrl', () => {
  it('builds an absolute login URL with an encoded returnTo', () => {
    const u = loginUrl('https://react.mentolder.de/admin/homepage');
    expect(u).toContain('/api/auth/login?returnTo=');
    expect(u).toContain(encodeURIComponent('https://react.mentolder.de/admin/homepage'));
  });

  it('builds a logout URL with an encoded returnTo', () => {
    const u = logoutUrl('https://react.mentolder.de/');
    expect(u).toContain('/api/auth/logout?returnTo=');
  });
});
