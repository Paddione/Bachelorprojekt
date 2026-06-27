import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_NC = process.env.NEXTCLOUD_URL;
const ORIGINAL_EXT = process.env.NEXTCLOUD_EXTERNAL_URL;

async function loadModule() {
  vi.resetModules();
  return import('./nextcloud-files');
}

beforeEach(() => {
  process.env.NEXTCLOUD_URL = 'https://nc.internal';
  process.env.NEXTCLOUD_EXTERNAL_URL = 'https://nc.example.com';
});
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_NC === undefined) delete process.env.NEXTCLOUD_URL;
  else process.env.NEXTCLOUD_URL = ORIGINAL_NC;
  if (ORIGINAL_EXT === undefined) delete process.env.NEXTCLOUD_EXTERNAL_URL;
  else process.env.NEXTCLOUD_EXTERNAL_URL = ORIGINAL_EXT;
});

describe('getClientFolderPath', () => {
  it('returns Clients/<username>/', async () => {
    const m = await loadModule();
    expect(m.getClientFolderPath('alice')).toBe('Clients/alice/');
  });

  it('rejects usernames with characters outside the safe set', async () => {
    const m = await loadModule();
    expect(() => m.getClientFolderPath('../etc')).toThrow();
    expect(() => m.getClientFolderPath('ali ce')).toThrow();
  });

  it('rejects usernames longer than 200 characters', async () => {
    const m = await loadModule();
    expect(() => m.getClientFolderPath('a'.repeat(201))).toThrow();
  });
});

describe('getFileUrl', () => {
  it('builds an external NC URL from the file path', async () => {
    const m = await loadModule();
    expect(m.getFileUrl('Clients/alice/inv.pdf')).toBe(
      'https://nc.example.com/remote.php/dav/files/admin/Clients/alice/inv.pdf',
    );
  });

  it('falls back to NEXTCLOUD_URL when NEXTCLOUD_EXTERNAL_URL is unset', async () => {
    delete process.env.NEXTCLOUD_EXTERNAL_URL;
    const m = await loadModule();
    expect(m.getFileUrl('x.pdf')).toBe('https://nc.internal/remote.php/dav/files/admin/x.pdf');
  });
});

describe('constants', () => {
  it('exposes the pending/signed directory names', async () => {
    const m = await loadModule();
    expect(m.PENDING_SIGNATURES_DIR).toBe('pending-signatures');
    expect(m.SIGNED_DIR).toBe('signed');
  });
});

describe('createShareLink (network call shape)', () => {
  it('POSTs to the OCS share API and returns the share URL', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ ocs: { data: { url: 'https://nc.example.com/s/abc' } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;
    const m = await loadModule();
    const url = await m.createShareLink('Clients/alice/file.pdf');
    expect(url).toBe('https://nc.example.com/s/abc');
  });

  it('returns null when the share API returns a non-OK response', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    const url = await m.createShareLink('Clients/alice/file.pdf');
    expect(url).toBeNull();
  });
});
