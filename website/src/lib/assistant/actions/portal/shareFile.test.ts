import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetClientFolderPath, mockListFiles, mockCreateShareLink } = vi.hoisted(() => ({
  mockGetClientFolderPath: vi.fn(),
  mockListFiles: vi.fn(),
  mockCreateShareLink: vi.fn(),
}));

vi.mock('../../../nextcloud-files', () => ({
  getClientFolderPath: mockGetClientFolderPath,
  listFiles: mockListFiles,
  createShareLink: mockCreateShareLink,
}));

import './shareFile';
import { executeAction } from '../../actions';

beforeEach(() => {
  mockGetClientFolderPath.mockReset();
  mockListFiles.mockReset();
  mockCreateShareLink.mockReset();
});

describe('shareFile handler', () => {
  it('returns ok:false when fileName is empty', async () => {
    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'sub',
      preferredUsername: 'testuser',
      payload: {},
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Namen der Datei/i);
  });

  it('returns ok:false when no username available', async () => {
    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: '',
      preferredUsername: '',
      payload: { fileName: 'report.pdf' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Nutzerdaten/i);
  });

  it('returns ok:false when folder has no files', async () => {
    mockGetClientFolderPath.mockReturnValue('Clients/testuser/');
    mockListFiles.mockResolvedValue([]);

    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'sub',
      preferredUsername: 'testuser',
      payload: { fileName: 'report.pdf' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/keine Dateien/i);
  });

  it('returns ok:false when no matching file found', async () => {
    mockGetClientFolderPath.mockReturnValue('Clients/testuser/');
    mockListFiles.mockResolvedValue([
      { name: 'notizen.txt', path: 'Clients/testuser/notizen.txt', lastModified: '2026-01-01', contentType: 'text/plain' },
      { name: 'bild.jpg', path: 'Clients/testuser/bild.jpg', lastModified: '2026-01-01', contentType: 'image/jpeg' },
    ]);

    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'sub',
      preferredUsername: 'testuser',
      payload: { fileName: 'report.pdf' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Keine Datei gefunden/);
    expect(r.message).toContain('notizen.txt');
    expect(r.message).toContain('bild.jpg');
  });

  it('matches exact filename and creates share link', async () => {
    mockGetClientFolderPath.mockReturnValue('Clients/testuser/');
    mockListFiles.mockResolvedValue([
      { name: 'report.pdf', path: 'Clients/testuser/report.pdf', lastModified: '2026-01-01', contentType: 'application/pdf' },
    ]);
    mockCreateShareLink.mockResolvedValue('https://cloud.example.com/s/abc123');

    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'sub',
      preferredUsername: 'testuser',
      payload: { fileName: 'report.pdf' },
    });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('https://cloud.example.com/s/abc123');
    expect(mockCreateShareLink).toHaveBeenCalledWith('Clients/testuser/report.pdf');
  });

  it('matches partial filename and creates share link', async () => {
    mockGetClientFolderPath.mockReturnValue('Clients/testuser/');
    mockListFiles.mockResolvedValue([
      { name: 'vertrag_2026.pdf', path: 'Clients/testuser/vertrag_2026.pdf', lastModified: '2026-01-01', contentType: 'application/pdf' },
    ]);
    mockCreateShareLink.mockResolvedValue('https://cloud.example.com/s/xyz789');

    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'sub',
      preferredUsername: 'testuser',
      payload: { fileName: 'vertrag' },
    });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('https://cloud.example.com/s/xyz789');
    expect(mockCreateShareLink).toHaveBeenCalledWith('Clients/testuser/vertrag_2026.pdf');
  });

  it('falls back to userSub when preferredUsername is empty', async () => {
    mockGetClientFolderPath.mockReturnValue('Clients/uuid-value/');
    mockListFiles.mockResolvedValue([
      { name: 'report.pdf', path: 'Clients/uuid-value/report.pdf', lastModified: '2026-01-01', contentType: 'application/pdf' },
    ]);
    mockCreateShareLink.mockResolvedValue('https://cloud.example.com/s/abc123');

    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'uuid-value',
      preferredUsername: undefined,
      payload: { fileName: 'report.pdf' },
    });
    expect(r.ok).toBe(true);
    expect(mockGetClientFolderPath).toHaveBeenCalledWith('uuid-value');
  });

  it('returns ok:false when share link creation fails', async () => {
    mockGetClientFolderPath.mockReturnValue('Clients/testuser/');
    mockListFiles.mockResolvedValue([
      { name: 'report.pdf', path: 'Clients/testuser/report.pdf', lastModified: '2026-01-01', contentType: 'application/pdf' },
    ]);
    mockCreateShareLink.mockResolvedValue(null);

    const r = await executeAction('portal:share-file', {
      profile: 'portal',
      userSub: 'sub',
      preferredUsername: 'testuser',
      payload: { fileName: 'report.pdf' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/konnte nicht erstellt werden/i);
  });
});
