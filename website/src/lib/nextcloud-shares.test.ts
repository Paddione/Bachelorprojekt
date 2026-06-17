import { describe, it, expect, vi } from 'vitest';

vi.mock('./nextcloud-files', () => ({
  getClientFolderPath: (u: string) => {
    if (!/^[a-zA-Z0-9._@-]+$/.test(u)) throw new Error(`Invalid username: ${u}`);
    return `Clients/${u}/`;
  },
  listFiles: vi.fn().mockResolvedValue([]),
}));

import { assertPathAllowed } from './nextcloud-shares';

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
});
