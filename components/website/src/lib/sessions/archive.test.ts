import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { purgeOldSessions, listArchivedSessions, getArchivedContent } from './archive';

describe('purgeOldSessions', () => {
  let tmpRegistryPath: string;
  let tmpArchiveDir: string;
  let tmpDirInstance: string;

  beforeEach(async () => {
    tmpDirInstance = await mkdtemp(join(tmpdir(), 'sessions-archive-test-'));
    tmpRegistryPath = join(tmpDirInstance, 'active-sessions.json');
    tmpArchiveDir = join(tmpDirInstance, 'archive');
    process.env.SESSION_HUB_REGISTRY = tmpRegistryPath;
    process.env.SESSIONS_ARCHIVE_DIR = tmpArchiveDir;
  });

  afterEach(async () => {
    delete process.env.SESSION_HUB_REGISTRY;
    delete process.env.SESSIONS_ARCHIVE_DIR;
    await rm(tmpDirInstance, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('purges sessions older than maxAgeDays, archiving metadata and HTML content, and keeps young sessions', async () => {
    // 1. Registry mit zwei Einträgen (31 Tage alt, 5 Tage alt) — Feldbestand
    //    wie von session-hub.sh real geschrieben [T016251].
    const now = new Date();
    const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const youngDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

    const registryData = [
      {
        slug: 'old-session',
        type: 'form',
        title: 'Old Session Title',
        port: 18001,
        public_url: 'https://session-old-session.example.com',
        local_url: 'http://localhost:18001/some-path.html',
        started_at: oldDate,
        ticket_id: 'T000123',
        source_file: '/tmp/old-session.html'
      },
      {
        slug: 'young-session',
        type: 'brainstorm',
        title: 'Young Session Title',
        port: 18002,
        public_url: 'https://session-young-session.example.com',
        local_url: 'http://localhost:18002/',
        started_at: youngDate
      }
    ];

    await writeFile(tmpRegistryPath, JSON.stringify(registryData), 'utf8');

    // Mock fetch for the local_url of old-session — HTML-Content-Type
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('<html><body>Old Session</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      }))
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await purgeOldSessions({ maxAgeDays: 30 });
    expect(result.purged).toBe(1);
    expect(result.warnings).toEqual([]);

    // Check registry content - young session should remain, old should be removed
    const updatedRegistryRaw = await readFile(tmpRegistryPath, 'utf8');
    const updatedRegistry = JSON.parse(updatedRegistryRaw);
    expect(updatedRegistry).toHaveLength(1);
    expect(updatedRegistry[0].slug).toBe('young-session');

    // Check archive directory files
    const archivedFiles = await readdir(tmpArchiveDir);
    // HTML-Inhalt wird als .html archiviert (nicht als .md gelabelt) [T016251]
    expect(archivedFiles.length).toBe(2);

    const metaFile = archivedFiles.find(f => f.endsWith('.meta.json'));
    const htmlFile = archivedFiles.find(f => f.endsWith('.html'));

    expect(metaFile).toBeDefined();
    expect(htmlFile).toBeDefined();

    const metaContent = JSON.parse(await readFile(join(tmpArchiveDir, metaFile!), 'utf8'));
    expect(metaContent.slug).toBe('old-session');
    expect(metaContent.type).toBe('form');
    expect(metaContent.title).toBe('Old Session Title');
    expect(metaContent.ticket_id).toBe('T000123');
    expect(metaContent.content_type).toBe('html');
    expect(metaContent.content_available).toBe(true);
    expect(metaContent.id).toBeDefined();

    const htmlContent = await readFile(join(tmpArchiveDir, htmlFile!), 'utf8');
    expect(htmlContent).toContain('Old Session');
  });

  it('handles corrupt registry JSON with corrupt-registry warning', async () => {
    await writeFile(tmpRegistryPath, '}{not json', 'utf8');

    const result = await purgeOldSessions({ maxAgeDays: 30 });
    expect(result.purged).toBe(0);
    expect(result.warnings).toEqual(['corrupt-registry']);

    let dirExists = true;
    try {
      const files = await readdir(tmpArchiveDir);
      expect(files.length).toBe(0);
    } catch {
      dirExists = false;
    }
    if (dirExists) {
      const files = await readdir(tmpArchiveDir);
      expect(files.length).toBe(0);
    }
  });

  it('handles fetch timeout/error by writing content_available:false and placeholder text', async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();

    const registryData = [
      {
        slug: 'timeout-session',
        type: 'form',
        title: 'Timeout Session Title',
        port: 18003,
        public_url: 'https://session-timeout.example.com',
        local_url: 'http://localhost:18003/timeout.html',
        started_at: oldDate
      }
    ];

    await writeFile(tmpRegistryPath, JSON.stringify(registryData), 'utf8');

    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.reject(new Error('Connect timeout'))
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await purgeOldSessions({ maxAgeDays: 30 });
    expect(result.purged).toBe(1);
    expect(result.warnings).toEqual([]);

    const updatedRegistryRaw = await readFile(tmpRegistryPath, 'utf8');
    expect(JSON.parse(updatedRegistryRaw)).toHaveLength(0);

    const archivedFiles = await readdir(tmpArchiveDir);
    expect(archivedFiles.length).toBe(2);

    const metaFile = archivedFiles.find(f => f.endsWith('.meta.json'));
    const mdFile = archivedFiles.find(f => f.endsWith('.md'));

    const metaContent = JSON.parse(await readFile(join(tmpArchiveDir, metaFile!), 'utf8'));
    expect(metaContent.slug).toBe('timeout-session');
    expect(metaContent.content_available).toBe(false);

    const mdContent = await readFile(join(tmpArchiveDir, mdFile!), 'utf8');
    expect(mdContent).toContain('Inhalt nicht verfügbar');
  });
});

describe('listArchivedSessions and getArchivedContent', () => {
  let tmpArchiveDir: string;
  let tmpDirInstance: string;

  beforeEach(async () => {
    tmpDirInstance = await mkdtemp(join(tmpdir(), 'sessions-archive-test-'));
    tmpArchiveDir = join(tmpDirInstance, 'archive');
    process.env.SESSION_HUB_REGISTRY = join(tmpDirInstance, 'active-sessions.json');
    process.env.SESSIONS_ARCHIVE_DIR = tmpArchiveDir;
    await mkdir(tmpArchiveDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.SESSION_HUB_REGISTRY;
    delete process.env.SESSIONS_ARCHIVE_DIR;
    await rm(tmpDirInstance, { recursive: true, force: true });
  });

  it('lists all archived sessions (visibility is route-level admin-only now)', async () => {
    // T016251: kein Owner-Feld mehr — die Liste filtert nicht nach viewer.
    const now = new Date();
    const date1 = new Date(now.getTime() - 1000).toISOString();
    const date2 = new Date(now.getTime() - 2000).toISOString();
    const date3 = new Date(now.getTime() - 3000).toISOString();

    const items = [
      { id: 's1', slug: 's1', type: 'form', title: 'S1', date: date1, ticket_id: null, content_type: 'md', content_available: true },
      { id: 's2', slug: 's2', type: 'brainstorm', title: 'S2', date: date2, ticket_id: null, content_type: 'md', content_available: true },
      { id: 's3', slug: 's3', type: 'form', title: 'S3', date: date3, ticket_id: null, content_type: 'md', content_available: true }
    ];

    for (const item of items) {
      await writeFile(join(tmpArchiveDir, `${item.id}.meta.json`), JSON.stringify(item), 'utf8');
      await writeFile(join(tmpArchiveDir, `${item.id}.md`), '# Markdown', 'utf8');
    }

    const res = await listArchivedSessions({ offset: 0, limit: 50 });
    expect(res.total).toBe(3);
    expect(res.items.map(i => i.id)).toEqual(['s1', 's2', 's3']); // chronologically descending order (latest first)
    expect(res.hasMore).toBe(false);
  });

  it('filters by type and sorts chronologically absteigend', async () => {
    const now = new Date();
    const date1 = new Date(now.getTime() - 1000).toISOString();
    const date2 = new Date(now.getTime() - 2000).toISOString();
    const date3 = new Date(now.getTime() - 3000).toISOString();

    const items = [
      { id: 's1', slug: 's1', type: 'form', title: 'S1', date: date1, ticket_id: null, content_type: 'md', content_available: true },
      { id: 's2', slug: 's2', type: 'brainstorm', title: 'S2', date: date2, ticket_id: null, content_type: 'md', content_available: true },
      { id: 's3', slug: 's3', type: 'form', title: 'S3', date: date3, ticket_id: null, content_type: 'md', content_available: true }
    ];

    for (const item of items) {
      await writeFile(join(tmpArchiveDir, `${item.id}.meta.json`), JSON.stringify(item), 'utf8');
    }

    const resForm = await listArchivedSessions({ offset: 0, limit: 50, type: 'form' });
    expect(resForm.total).toBe(2);
    expect(resForm.items.map(i => i.id)).toEqual(['s1', 's3']);
  });

  it('paginates correctly', async () => {
    const now = new Date();
    for (let i = 0; i < 60; i++) {
      const item = {
        id: `s-${i}`,
        slug: `s-${i}`,
        type: 'form',
        title: `S ${i}`,
        date: new Date(now.getTime() - i * 1000).toISOString(),
        ticket_id: null,
        content_type: 'md',
        content_available: true
      };
      await writeFile(join(tmpArchiveDir, `${item.id}.meta.json`), JSON.stringify(item), 'utf8');
    }

    const resPage1 = await listArchivedSessions({ offset: 0, limit: 50 });
    expect(resPage1.items.length).toBe(50);
    expect(resPage1.total).toBe(60);
    expect(resPage1.hasMore).toBe(true);

    const resPage2 = await listArchivedSessions({ offset: 50, limit: 50 });
    expect(resPage2.items.length).toBe(10);
    expect(resPage2.total).toBe(60);
    expect(resPage2.hasMore).toBe(false);
  });

  it('retrieves content by stored extension and handles missing/invalid ids safely', async () => {
    // T016251: getArchivedContent liefert Content + Content-Type je Endung.
    await writeFile(join(tmpArchiveDir, 'test-md.md'), '# Hello Test', 'utf8');
    await writeFile(join(tmpArchiveDir, 'test-html.html'), '<p>Hello HTML</p>', 'utf8');

    const md = await getArchivedContent('test-md');
    expect(md?.content).toBe('# Hello Test');
    expect(md?.contentType).toBe('text/markdown');

    const html = await getArchivedContent('test-html');
    expect(html?.content).toContain('Hello HTML');
    expect(html?.contentType).toBe('text/html');

    const missing = await getArchivedContent('missing-id');
    expect(missing).toBeNull();

    const invalidPath = await getArchivedContent('../test-md');
    expect(invalidPath).toBeNull();
  });
});
