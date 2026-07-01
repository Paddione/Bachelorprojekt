import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockListFiles = vi.fn().mockResolvedValue([]);

vi.mock('./nextcloud-files', () => ({
  getClientFolderPath: (u: string) => {
    if (!/^[a-zA-Z0-9._@-]+$/.test(u)) throw new Error(`Invalid username: ${u}`);
    return `Clients/${u}/`;
  },
  listFiles: (...args: unknown[]) => mockListFiles(...args),
}));

import { assertPathAllowed, createShareLink, findFilesByName } from './nextcloud-shares';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_NC = process.env.NEXTCLOUD_URL;
const ORIGINAL_EXT = process.env.NEXTCLOUD_EXTERNAL_URL;

beforeEach(() => {
  process.env.NEXTCLOUD_URL = 'https://nc.internal';
  mockListFiles.mockClear();
});
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_NC === undefined) delete process.env.NEXTCLOUD_URL;
  else process.env.NEXTCLOUD_URL = ORIGINAL_NC;
  if (ORIGINAL_EXT === undefined) delete process.env.NEXTCLOUD_EXTERNAL_URL;
  else process.env.NEXTCLOUD_EXTERNAL_URL = ORIGINAL_EXT;
});

describe('assertPathAllowed', () => {
  it('admin is allowed any path', () => {
    expect(assertPathAllowed('/some/random/path', { isAdmin: true, username: 'admin' })).toBe('some/random/path');
    expect(assertPathAllowed('Clients/other/file.pdf', { isAdmin: true, username: 'admin' })).toBe('Clients/other/file.pdf');
  });

  it('customer allowed inside own client folder', () => {
    expect(assertPathAllowed('Clients/max.mustermann/report.pdf', { isAdmin: false, username: 'max.mustermann' })).toBe('Clients/max.mustermann/report.pdf');
  });

  it('customer denied for another client folder', () => {
    expect(() =>
      assertPathAllowed('Clients/other/report.pdf', { isAdmin: false, username: 'max.mustermann' }),
    ).toThrow(/Zugriff.*verweigert|Pfad.*nicht.*erlaubt|not allowed/);
  });

  it('customer denied for path traversal', () => {
    expect(() =>
      assertPathAllowed('../etc/passwd', { isAdmin: false, username: 'max.mustermann' }),
    ).toThrow();
    expect(() =>
      assertPathAllowed('Clients/max.mustermann/../../etc', { isAdmin: false, username: 'max.mustermann' }),
    ).toThrow();
  });

  it('denied for empty path', () => {
    expect(() =>
      assertPathAllowed('', { isAdmin: false, username: 'max.mustermann' }),
    ).toThrow();
    expect(() =>
      assertPathAllowed('  ', { isAdmin: false, username: 'max.mustermann' }),
    ).toThrow();
  });

  it('normalizes the path', () => {
    expect(assertPathAllowed('Clients/max.mustermann//report.pdf', { isAdmin: false, username: 'max.mustermann' })).toBe('Clients/max.mustermann/report.pdf');
  });

  it('rejects a path that is just "." after normalization', () => {
    expect(() =>
      assertPathAllowed('.', { isAdmin: true, username: 'admin' }),
    ).toThrow(/Pfad darf nicht leer sein/);
  });

  it('rejects backslash traversal', () => {
    expect(() =>
      assertPathAllowed('..\\etc\\passwd', { isAdmin: false, username: 'max.mustermann' }),
    ).toThrow(/ungültige Zeichen/);
  });
});

describe('createShareLink', () => {
  // NEXTCLOUD_URL / NEXTCLOUD_EXTERNAL_URL are read into module-level consts at
  // import time (top of nextcloud-shares.ts), so setting process.env in a test
  // body has no effect on them here — this module is imported statically once
  // per test file. The external-URL rewrite branch is therefore not exercised
  // by this suite (it is exercised for nextcloud-files.ts, which the tests
  // there import dynamically via vi.resetModules()).
  it('POSTs to the OCS API and returns url/token/shareType from the response', async () => {
    let capturedBody = '';
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({ ocs: { data: { url: 'https://nc.internal/s/abc123', token: 'abc123', share_type: 3 } } }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await createShareLink({ path: 'Clients/alice/report.pdf', shareType: 3, password: 'secret', expireDate: '2026-08-01' });

    expect(result).toEqual({ url: 'https://nc.internal/s/abc123', token: 'abc123', shareType: 3 });
    expect(capturedBody).toContain('path=Clients%2Falice%2Freport.pdf');
    expect(capturedBody).toContain('password=secret');
    expect(capturedBody).toContain('expireDate=2026-08-01');
  });

  it('defaults permissions to 1 and omits password/expireDate when not given', async () => {
    let capturedBody = '';
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      capturedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ ocs: { data: { url: 'https://nc.internal/s/xyz' } } }), { status: 200 });
    }) as typeof fetch;

    await createShareLink({ path: 'a.txt', shareType: 3 });
    expect(capturedBody).toContain('permissions=1');
    expect(capturedBody).not.toContain('password=');
    expect(capturedBody).not.toContain('expireDate=');
  });

  it('throws with status + body snippet when the OCS response is not ok', async () => {
    globalThis.fetch = (async () => new Response('server exploded', { status: 500 })) as typeof fetch;
    await expect(createShareLink({ path: 'a.txt', shareType: 3 }))
      .rejects.toThrow(/Nextcloud share creation failed: 500/);
  });

  it('throws when the OCS response is missing a url', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ ocs: { data: {} } }), { status: 200 })) as typeof fetch;
    await expect(createShareLink({ path: 'a.txt', shareType: 3 }))
      .rejects.toThrow(/missing URL/);
  });

  it('defaults token to "" and shareType to 0 when the OCS response omits them', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ocs: { data: { url: 'https://nc.internal/s/xyz' } } }), { status: 200 })) as typeof fetch;
    const result = await createShareLink({ path: 'a.txt', shareType: 3 });
    expect(result).toEqual({ url: 'https://nc.internal/s/xyz', token: '', shareType: 0 });
  });
});

describe('findFilesByName', () => {
  it('returns all files from listFiles when query is blank', async () => {
    mockListFiles.mockResolvedValueOnce([
      { name: 'a.pdf', path: '/a.pdf', lastModified: '', contentType: 'application/pdf' },
    ]);
    const files = await findFilesByName('Clients/alice', '  ');
    expect(files).toHaveLength(1);
    expect(mockListFiles).toHaveBeenCalledWith('Clients/alice');
  });

  it('filters files by case-insensitive substring match', async () => {
    mockListFiles.mockResolvedValueOnce([
      { name: 'Report.pdf', path: '/Report.pdf', lastModified: '', contentType: 'application/pdf' },
      { name: 'invoice.pdf', path: '/invoice.pdf', lastModified: '', contentType: 'application/pdf' },
    ]);
    const files = await findFilesByName('Clients/alice', 'report');
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('Report.pdf');
  });

  it('returns [] when no files match', async () => {
    mockListFiles.mockResolvedValueOnce([
      { name: 'invoice.pdf', path: '/invoice.pdf', lastModified: '', contentType: 'application/pdf' },
    ]);
    const files = await findFilesByName('Clients/alice', 'zzz-no-match');
    expect(files).toEqual([]);
  });
});
