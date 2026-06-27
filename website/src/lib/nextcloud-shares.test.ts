import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assertPathAllowed, createShareLink } from './nextcloud-shares';

vi.mock('./nextcloud-files', () => ({
  getClientFolderPath: vi.fn((u: string) => `clients/${u}/files`),
  listFiles: vi.fn(async () => []),
}));

import { getClientFolderPath } from './nextcloud-files';
const mockPrefix = getClientFolderPath as unknown as ReturnType<typeof vi.fn>;

describe('assertPathAllowed', () => {
  beforeEach(() => mockPrefix.mockClear());
  afterEach(() => mockPrefix.mockReset());

  it('rejects empty / whitespace-only paths', () => {
    expect(() => assertPathAllowed('', { isAdmin: true, username: 'u' })).toThrow();
    expect(() => assertPathAllowed('   ', { isAdmin: true, username: 'u' })).toThrow();
  });

  it('rejects ../ traversal attempts', () => {
    expect(() =>
      assertPathAllowed('../etc/passwd', { isAdmin: false, username: 'u' }),
    ).toThrow(/ungültige/);
  });

  it('rejects Windows-style traversal', () => {
    expect(() =>
      assertPathAllowed('..\\secret', { isAdmin: false, username: 'u' }),
    ).toThrow(/ungültige/);
  });

  it('rejects the literal ".." path', () => {
    expect(() => assertPathAllowed('..', { isAdmin: true, username: 'u' })).toThrow(/ungültige/);
  });

  it('returns any path for admins (normalized)', () => {
    expect(assertPathAllowed('foo/bar', { isAdmin: true, username: 'u' })).toBe('foo/bar');
    expect(assertPathAllowed('clients/other/files/x', { isAdmin: true, username: 'u' })).toBe(
      'clients/other/files/x',
    );
  });

  it('lets a customer access their own client prefix', () => {
    mockPrefix.mockReturnValue('clients/alice/files');
    expect(assertPathAllowed('clients/alice/files/x', { isAdmin: false, username: 'alice' })).toBe(
      'clients/alice/files/x',
    );
  });

  it('denies a customer accessing another user\'s prefix', () => {
    mockPrefix.mockReturnValue('clients/alice/files');
    expect(() =>
      assertPathAllowed('clients/bob/files/x', { isAdmin: false, username: 'alice' }),
    ).toThrow(/Zugriff verweigert/);
  });

  it('denies a customer accessing the top-level', () => {
    mockPrefix.mockReturnValue('clients/alice/files');
    expect(() => assertPathAllowed('x', { isAdmin: false, username: 'alice' })).toThrow();
  });
});

describe('createShareLink (network call shape)', () => {
  const ORIGINAL_FETCH = globalThis.fetch;
  const ORIGINAL_NC = process.env.NEXTCLOUD_URL;

  beforeEach(() => {
    process.env.NEXTCLOUD_URL = 'https://nc.example.com';
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_NC === undefined) delete process.env.NEXTCLOUD_URL;
    else process.env.NEXTCLOUD_URL = ORIGINAL_NC;
  });

  it('POSTs to the OCS Share API and parses the JSON response', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      capturedUrl = url as string;
      capturedInit = init;
      return new Response(
        JSON.stringify({ ocs: { data: { url: 'https://nc.example.com/s/abc', token: 'abc', share_type: 3 } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;
    const out = await createShareLink({ path: 'folder/file', shareType: 3, permissions: 1 });
    expect(out.url).toBe('https://nc.example.com/s/abc');
    expect(out.token).toBe('abc');
    expect(out.shareType).toBe(3);
    expect(capturedUrl).toContain('/ocs/v2.php/apps/files_sharing/api/v1/shares');
    expect(capturedInit?.method).toBe('POST');
  });
});
