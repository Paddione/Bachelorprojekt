import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { purgeOldSessions, listArchivedSessions, getArchivedMarkdown } from './archive';

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

  it('purges sessions older than maxAgeDays, archving metadata and markdown, and keeps young sessions', async () => {
    // 1. Registry with two Entries (one 31 days old, one 5 days old)
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
        owner: 'gekko',
        participants: ['gekko', 'companion']
      },
      {
        slug: 'young-session',
        type: 'brainstorm',
        title: 'Young Session Title',
        port: 18002,
        public_url: 'https://session-young-session.example.com',
        local_url: 'http://localhost:18002/',
        started_at: youngDate,
        owner: 'paddione',
        participants: ['paddione']
      }
    ];

    await writeFile(tmpRegistryPath, JSON.stringify(registryData), 'utf8');

    // Mock fetch for the local_url of old-session
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('# Old Session Markdown Content', { status: 200 }))
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
    // Should have old-session-<sanitized-date>.md and old-session-<sanitized-date>.meta.json
    expect(archivedFiles.length).toBe(2);

    const metaFile = archivedFiles.find(f => f.endsWith('.meta.json'));
    const mdFile = archivedFiles.find(f => f.endsWith('.md'));

    expect(metaFile).toBeDefined();
    expect(mdFile).toBeDefined();

    const metaContent = JSON.parse(await readFile(join(tmpArchiveDir, metaFile!), 'utf8'));
    expect(metaContent.slug).toBe('old-session');
    expect(metaContent.type).toBe('form');
    expect(metaContent.title).toBe('Old Session Title');
    expect(metaContent.owner).toBe('gekko');
    expect(metaContent.participants).toEqual(['gekko', 'companion']);
    expect(metaContent.content_available).toBe(true);
    expect(metaContent.id).toBeDefined();

    const mdContent = await readFile(join(tmpArchiveDir, mdFile!), 'utf8');
    expect(mdContent).toContain('# Old Session Markdown Content');
  });

  it('handles corrupt registry JSON with corrupt-registry warning', async () => {
    // 2. Korrupte JSON (}{not json) → Rückgabe {purged:0, warnings:['corrupt-registry']}, Archiv-Dir unverändert, keine Exception.
    await writeFile(tmpRegistryPath, '}{not json', 'utf8');

    const result = await purgeOldSessions({ maxAgeDays: 30 });
    expect(result.purged).toBe(0);
    expect(result.warnings).toEqual(['corrupt-registry']);

    // Check that archive dir was not created or is empty
    let dirExists = true;
    try {
      const files = await readdir(tmpArchiveDir);
      expect(files.length).toBe(0);
    } catch {
      dirExists = false;
    }
    // EITHER it doesn't exist, OR it is empty
    if (dirExists) {
      const files = await readdir(tmpArchiveDir);
      expect(files.length).toBe(0);
    }
  });

  it('handles fetch timeout/error by writing content_available:false and placeholder text', async () => {
    // 3. Entry ohne erreichbares Markdown (lokale URL tot) → Meta-Sidecar mit content_available:false, <id>.md enthält Platzhalter „Inhalt nicht verfügbar", Entry wird dennoch gepurged.
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
        started_at: oldDate,
      }
    ];

    await writeFile(tmpRegistryPath, JSON.stringify(registryData), 'utf8');

    // Mock fetch to timeout/fail
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.reject(new Error('Connect timeout'))
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await purgeOldSessions({ maxAgeDays: 30 });
    expect(result.purged).toBe(1);
    expect(result.warnings).toEqual([]);

    // Check registry is empty
    const updatedRegistryRaw = await readFile(tmpRegistryPath, 'utf8');
    expect(JSON.parse(updatedRegistryRaw)).toHaveLength(0);

    // Check archive directory files
    const archivedFiles = await readdir(tmpArchiveDir);
    expect(archivedFiles.length).toBe(2);

    const metaFile = archivedFiles.find(f => f.endsWith('.meta.json'));
    const mdFile = archivedFiles.find(f => f.endsWith('.md'));

    const metaContent = JSON.parse(await readFile(join(tmpArchiveDir, metaFile!), 'utf8'));
    expect(metaContent.slug).toBe('timeout-session');
    expect(metaContent.content_available).toBe(false);
    expect(metaContent.owner).toBe('unknown');

    const mdContent = await readFile(join(tmpArchiveDir, mdFile!), 'utf8');
    expect(mdContent).toContain('Inhalt nicht verfügbar');
  });
});

describe('listArchivedSessions and getArchivedMarkdown', () => {
  let tmpRegistryPath: string;
  let tmpArchiveDir: string;
  let tmpDirInstance: string;

  beforeEach(async () => {
    tmpDirInstance = await mkdtemp(join(tmpdir(), 'sessions-archive-test-'));
    tmpRegistryPath = join(tmpDirInstance, 'active-sessions.json');
    tmpArchiveDir = join(tmpDirInstance, 'archive');
    process.env.SESSION_HUB_REGISTRY = tmpRegistryPath;
    process.env.SESSIONS_ARCHIVE_DIR = tmpArchiveDir;
    await mkdir(tmpArchiveDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.SESSION_HUB_REGISTRY;
    delete process.env.SESSIONS_ARCHIVE_DIR;
    await rm(tmpDirInstance, { recursive: true, force: true });
  });

  it('filters by viewer visibility and admin privilege', async () => {
    // 1. Drei archivierte Sessions (owner gekko, gekko, paddione)
    const now = new Date();
    const date1 = new Date(now.getTime() - 1000).toISOString();
    const date2 = new Date(now.getTime() - 2000).toISOString();
    const date3 = new Date(now.getTime() - 3000).toISOString();

    const items = [
      { id: 's1', slug: 's1', type: 'form', title: 'S1', date: date1, participants: [], owner: 'gekko', content_available: true },
      { id: 's2', slug: 's2', type: 'brainstorm', title: 'S2', date: date2, participants: [], owner: 'gekko', content_available: true },
      { id: 's3', slug: 's3', type: 'form', title: 'S3', date: date3, participants: [], owner: 'paddione', content_available: true }
    ];

    for (const item of items) {
      await writeFile(join(tmpArchiveDir, `${item.id}.meta.json`), JSON.stringify(item), 'utf8');
      await writeFile(join(tmpArchiveDir, `${item.id}.md`), '# Markdown', 'utf8');
    }

    // Gekko viewer list (non-admin) -> only gekko items
    const resGekko = await listArchivedSessions({ viewer: 'gekko', isAdmin: false, offset: 0, limit: 50 });
    expect(resGekko.total).toBe(2);
    expect(resGekko.items.map(i => i.id)).toEqual(['s1', 's2']); // chronologically descending order (latest first)
    expect(resGekko.hasMore).toBe(false);

    // Admin list -> all items
    const resAdmin = await listArchivedSessions({ viewer: 'gekko', isAdmin: true, offset: 0, limit: 50 });
    expect(resAdmin.total).toBe(3);
    expect(resAdmin.items.map(i => i.id)).toEqual(['s1', 's2', 's3']);
    expect(resAdmin.hasMore).toBe(false);
  });

  it('filters by type and sorts chronologically absteigend', async () => {
    // 2. type:'form'-Filter → nur Form-Typ, chronologisch absteigend
    const now = new Date();
    const date1 = new Date(now.getTime() - 1000).toISOString();
    const date2 = new Date(now.getTime() - 2000).toISOString();
    const date3 = new Date(now.getTime() - 3000).toISOString();

    const items = [
      { id: 's1', slug: 's1', type: 'form', title: 'S1', date: date1, participants: [], owner: 'gekko', content_available: true },
      { id: 's2', slug: 's2', type: 'brainstorm', title: 'S2', date: date2, participants: [], owner: 'gekko', content_available: true },
      { id: 's3', slug: 's3', type: 'form', title: 'S3', date: date3, participants: [], owner: 'gekko', content_available: true }
    ];

    for (const item of items) {
      await writeFile(join(tmpArchiveDir, `${item.id}.meta.json`), JSON.stringify(item), 'utf8');
    }

    const resForm = await listArchivedSessions({ viewer: 'gekko', isAdmin: false, offset: 0, limit: 50, type: 'form' });
    expect(resForm.total).toBe(2);
    expect(resForm.items.map(i => i.id)).toEqual(['s1', 's3']);
  });

  it('paginates correctly', async () => {
    // 3. 60 Entries, limit:50, offset:0 → 50 Items, hasMore:true; offset:50 → 10 Items, hasMore:false
    const now = new Date();
    for (let i = 0; i < 60; i++) {
      const item = {
        id: `s-${i}`,
        slug: `s-${i}`,
        type: 'form',
        title: `S ${i}`,
        date: new Date(now.getTime() - i * 1000).toISOString(),
        participants: [],
        owner: 'gekko',
        content_available: true
      };
      await writeFile(join(tmpArchiveDir, `${item.id}.meta.json`), JSON.stringify(item), 'utf8');
    }

    const resPage1 = await listArchivedSessions({ viewer: 'gekko', isAdmin: false, offset: 0, limit: 50 });
    expect(resPage1.items.length).toBe(50);
    expect(resPage1.total).toBe(60);
    expect(resPage1.hasMore).toBe(true);

    const resPage2 = await listArchivedSessions({ viewer: 'gekko', isAdmin: false, offset: 50, limit: 50 });
    expect(resPage2.items.length).toBe(10);
    expect(resPage2.total).toBe(60);
    expect(resPage2.hasMore).toBe(false);
  });

  it('retrieves markdown and handles missing/permission issues safely', async () => {
    // 4. getArchivedMarkdown(id) liefert den Markdown-String; unbekannte id → null; nicht lesbare Datei (Permission) → null
    await writeFile(join(tmpArchiveDir, 'test-md.md'), '# Hello Test', 'utf8');

    const md = await getArchivedMarkdown('test-md');
    expect(md).toBe('# Hello Test');

    const missingMd = await getArchivedMarkdown('missing-id');
    expect(missingMd).toBeNull();

    const invalidPathMd = await getArchivedMarkdown('../test-md');
    expect(invalidPathMd).toBeNull();
  });
});

