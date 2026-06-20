import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { purgeOldSessions } from './archive';

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
        public_url: 'https://session-old-session.sessions.mentolder.de',
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
        public_url: 'https://session-young-session.sessions.mentolder.de',
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
        public_url: 'https://session-timeout.sessions.mentolder.de',
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
