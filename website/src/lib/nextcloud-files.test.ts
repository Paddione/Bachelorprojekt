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

  it('returns null when fetch itself throws', async () => {
    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    const m = await loadModule();
    const url = await m.createShareLink('Clients/alice/file.pdf');
    expect(url).toBeNull();
  });

  it('returns null when the response url is missing/non-string', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ocs: { data: {} } }), { status: 200 })) as typeof fetch;
    const m = await loadModule();
    const url = await m.createShareLink('Clients/alice/file.pdf');
    expect(url).toBeNull();
  });
});

describe('davUrl path validation (via listFiles/downloadFile)', () => {
  it('rejects paths containing traversal segments', async () => {
    const m = await loadModule();
    await expect(m.listFiles('../etc')).rejects.toThrow(/Invalid path/);
    await expect(m.downloadFile('a/../b')).rejects.toThrow(/Invalid path/);
    await expect(m.downloadFile('..')).rejects.toThrow(/Invalid path/);
  });
});

describe('listFiles', () => {
  it('returns [] when the PROPFIND response is not ok', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const m = await loadModule();
    expect(await m.listFiles('Clients/alice')).toEqual([]);
  });

  it('parses multistatus XML into NcFile entries, skipping the folder-self response', async () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/admin/Clients/alice/</d:href>
    <d:propstat><d:prop><d:displayname>alice</d:displayname></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/remote.php/dav/files/admin/Clients/alice/report.pdf</d:href>
    <d:propstat><d:prop>
      <d:displayname>report.pdf</d:displayname>
      <d:getlastmodified>Mon, 01 Jul 2026 00:00:00 GMT</d:getlastmodified>
      <d:getcontenttype>application/pdf</d:getcontenttype>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>`;
    globalThis.fetch = (async () => new Response(xml, { status: 207 })) as typeof fetch;
    const m = await loadModule();
    const files = await m.listFiles('Clients/alice');
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      name: 'report.pdf',
      path: '/remote.php/dav/files/admin/Clients/alice/report.pdf',
      lastModified: 'Mon, 01 Jul 2026 00:00:00 GMT',
      contentType: 'application/pdf',
    });
  });

  it('defaults lastModified/contentType when missing from the response block', async () => {
    const xml = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response><d:href>/x/</d:href><d:propstat><d:prop><d:displayname>x</d:displayname></d:prop></d:propstat></d:response>
  <d:response><d:href>/x/bare.txt</d:href><d:propstat><d:prop><d:displayname>bare.txt</d:displayname></d:prop></d:propstat></d:response>
</d:multistatus>`;
    globalThis.fetch = (async () => new Response(xml, { status: 207 })) as typeof fetch;
    const m = await loadModule();
    const files = await m.listFiles('x');
    expect(files[0]).toMatchObject({ name: 'bare.txt', lastModified: '', contentType: 'application/octet-stream' });
  });
});

describe('moveFile', () => {
  it('returns true on 201/204 and false otherwise', async () => {
    let status = 201;
    globalThis.fetch = (async () => new Response(null, { status })) as typeof fetch;
    const m = await loadModule();
    expect(await m.moveFile('a.txt', 'b.txt')).toBe(true);
    status = 204;
    expect(await m.moveFile('a.txt', 'b.txt')).toBe(true);
    status = 409;
    expect(await m.moveFile('a.txt', 'b.txt')).toBe(false);
  });
});

describe('downloadFile', () => {
  it('returns file contents as a Buffer on success', async () => {
    globalThis.fetch = (async () => new Response('hello world', { status: 200 })) as typeof fetch;
    const m = await loadModule();
    const buf = await m.downloadFile('a.txt');
    expect(buf.toString('utf-8')).toBe('hello world');
  });

  it('throws with status code when the response is not ok', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;
    const m = await loadModule();
    await expect(m.downloadFile('missing.txt')).rejects.toThrow(/404/);
  });
});

describe('hashFile', () => {
  it('computes the sha256 hash of the downloaded content', async () => {
    globalThis.fetch = (async () => new Response('hello world', { status: 200 })) as typeof fetch;
    const m = await loadModule();
    const hash = await m.hashFile('a.txt');
    const { createHash } = await import('node:crypto');
    expect(hash).toBe(createHash('sha256').update('hello world').digest('hex'));
  });
});

describe('uploadFile', () => {
  it('resolves on 201/204', async () => {
    let status = 201;
    globalThis.fetch = (async () => new Response(null, { status })) as typeof fetch;
    const m = await loadModule();
    await expect(m.uploadFile('a.txt', 'content')).resolves.toBeUndefined();
    status = 204;
    await expect(m.uploadFile('a.txt', Buffer.from('content'))).resolves.toBeUndefined();
  });

  it('throws when upload fails', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const m = await loadModule();
    await expect(m.uploadFile('a.txt', 'content')).rejects.toThrow(/Failed to upload/);
  });
});

describe('ensureFolder', () => {
  it('creates each path segment in order, tolerating 405 (already exists)', async () => {
    const calledUrls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calledUrls.push(String(url));
      return new Response(null, { status: calledUrls.length === 1 ? 201 : 405 });
    }) as typeof fetch;
    const m = await loadModule();
    await m.ensureFolder('/Clients/alice/');
    expect(calledUrls).toEqual([
      'https://nc.internal/remote.php/dav/files/admin/Clients',
      'https://nc.internal/remote.php/dav/files/admin/Clients/alice',
    ]);
  });

  it('throws when a segment creation fails with an unexpected status', async () => {
    globalThis.fetch = (async () => new Response(null, { status: 409 })) as typeof fetch;
    const m = await loadModule();
    await expect(m.ensureFolder('a/b')).rejects.toThrow(/Failed to ensure folder/);
  });
});

describe('deleteFile', () => {
  it('returns true on 200/204 and false otherwise', async () => {
    let status = 204;
    globalThis.fetch = (async () => new Response(null, { status })) as typeof fetch;
    const m = await loadModule();
    expect(await m.deleteFile('a.txt')).toBe(true);
    status = 200;
    expect(await m.deleteFile('a.txt')).toBe(true);
    status = 404;
    expect(await m.deleteFile('a.txt')).toBe(false);
  });
});
