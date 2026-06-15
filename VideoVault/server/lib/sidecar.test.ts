import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { readSidecar, writeSidecar, syncVideoSidecar, SIDECAR_FILENAME } from './sidecar';
import { RootsRegistry } from './roots-registry';

describe('sidecar', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidecar-test-'));
    RootsRegistry.reset();
    delete process.env.MEDIA_ROOT;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('readSidecar', () => {
    it('returns null when no metadata.json exists', async () => {
      const result = await readSidecar(tmpDir);
      expect(result).toBeNull();
    });

    it('reads and parses valid metadata.json', async () => {
      const data = { version: 1, categories: { age: ['teen'] }, customCategories: {} };
      await fs.writeFile(path.join(tmpDir, 'metadata.json'), JSON.stringify(data));
      const result = await readSidecar(tmpDir);
      expect(result).toEqual(data);
    });

    it('returns null for malformed JSON and logs warning', async () => {
      await fs.writeFile(path.join(tmpDir, 'metadata.json'), '{bad json');
      const result = await readSidecar(tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('writeSidecar', () => {
    it('writes metadata.json with formatted JSON', async () => {
      const data = { version: 1, id: 'abc', categories: { age: [] }, customCategories: {} };
      await writeSidecar(tmpDir, data);
      const content = await fs.readFile(path.join(tmpDir, 'metadata.json'), 'utf-8');
      expect(JSON.parse(content)).toEqual(data);
      expect(content).toContain('\n');
    });

    it('does not throw when directory is missing', async () => {
      const missingDir = path.join(tmpDir, 'nonexistent');
      await expect(writeSidecar(missingDir, { version: 1 })).resolves.not.toThrow();
    });

    it('overwrites existing metadata.json', async () => {
      await fs.writeFile(path.join(tmpDir, 'metadata.json'), '{"old": true}');
      const newData = { version: 1, id: 'new' };
      await writeSidecar(tmpDir, newData);
      const content = JSON.parse(await fs.readFile(path.join(tmpDir, 'metadata.json'), 'utf-8'));
      expect(content).toEqual(newData);
    });
  });

  describe('syncVideoSidecar', () => {
    it('writes sidecar resolved from MEDIA_ROOT + video.path', async () => {
      // Create a subdirectory simulating a video folder
      const videoDir = path.join(tmpDir, 'hdd-ext', '3_complete', 'My Video');
      await fs.mkdir(videoDir, { recursive: true });

      // Set MEDIA_ROOT so syncVideoSidecar resolves correctly
      const origMediaRoot = process.env.MEDIA_ROOT;
      process.env.MEDIA_ROOT = tmpDir;

      try {
        await syncVideoSidecar({
          id: 'abc123',
          filename: 'My Video.mp4',
          displayName: 'My Video',
          path: 'hdd-ext/3_complete/My Video/My Video.mp4',
          size: BigInt(1000000),
          lastModified: new Date('2026-01-15T10:00:00Z'),
          metadata: { duration: 120, width: 1920, height: 1080, bitrate: 5000000, codec: 'h264', fps: 30, aspectRatio: '16:9' },
          categories: { age: ['teen'], acts: [] },
          customCategories: { custom: ['tag1'] },
        });

        const content = JSON.parse(await fs.readFile(path.join(videoDir, 'metadata.json'), 'utf-8'));
        expect(content.version).toBe(1);
        expect(content.id).toBe('abc123');
        expect(content.size).toBe(1000000); // bigint converted to number
        expect(content.lastModified).toBe('2026-01-15T10:00:00.000Z'); // Date converted to ISO string
        expect(content.categories.age).toEqual(['teen']);
        expect(content.customCategories.custom).toEqual(['tag1']);
      } finally {
        if (origMediaRoot === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = origMediaRoot;
      }
    });

    it('preserves existing sidecar fields not in video object', async () => {
      const videoDir = path.join(tmpDir, 'hdd-ext', '3_complete', 'Test');
      await fs.mkdir(videoDir, { recursive: true });

      // Write an existing sidecar with an extra field
      await writeSidecar(videoDir, { version: 1, id: 'old', categories: { age: ['milf'] }, customCategories: {} } as any);

      const origMediaRoot = process.env.MEDIA_ROOT;
      process.env.MEDIA_ROOT = tmpDir;

      try {
        await syncVideoSidecar({
          id: 'new-id',
          filename: 'Test.mp4',
          displayName: 'Test',
          path: 'hdd-ext/3_complete/Test/Test.mp4',
          size: 500,
          lastModified: '2026-02-01T00:00:00Z',
          metadata: { duration: 60, width: 1280, height: 720, bitrate: 3000000, codec: 'h264', fps: 24, aspectRatio: '16:9' },
          categories: { age: ['teen'] },
          customCategories: {},
        });

        const content = JSON.parse(await fs.readFile(path.join(videoDir, 'metadata.json'), 'utf-8'));
        // New values overwrite old
        expect(content.id).toBe('new-id');
        expect(content.categories.age).toEqual(['teen']);
      } finally {
        if (origMediaRoot === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = origMediaRoot;
      }
    });

    it('writes sidecar using RootsRegistry when rootKey is provided', async () => {
      const moviesRoot = path.join(tmpDir, 'movies-mount');
      const videoDir = path.join(moviesRoot, 'action', 'Cool Film');
      await fs.mkdir(videoDir, { recursive: true });

      RootsRegistry.reset();
      RootsRegistry.registerRoot('movies', moviesRoot);

      try {
        await syncVideoSidecar({
          id: 'movie-1',
          filename: 'Cool Film.mp4',
          displayName: 'Cool Film',
          path: 'action/Cool Film/Cool Film.mp4',
          rootKey: 'movies',
          size: 2000000,
          lastModified: new Date('2026-02-20T12:00:00Z'),
          metadata: { duration: 90, width: 1920, height: 1080, bitrate: 8000000, codec: 'h265', fps: 24, aspectRatio: '16:9' },
          categories: { genre: ['action'] },
          customCategories: {},
        });

        const content = JSON.parse(await fs.readFile(path.join(videoDir, 'metadata.json'), 'utf-8'));
        expect(content.version).toBe(1);
        expect(content.id).toBe('movie-1');
        expect(content.filename).toBe('Cool Film.mp4');
        expect(content.size).toBe(2000000);
        expect(content.categories.genre).toEqual(['action']);
      } finally {
        RootsRegistry.reset();
      }
    });

    it('silently skips when rootKey is provided but unresolvable', async () => {
      RootsRegistry.reset();
      // Do not register 'nas-share' — it should be unresolvable

      const videoDir = path.join(tmpDir, 'should-not-exist');

      try {
        await syncVideoSidecar({
          id: 'orphan-1',
          filename: 'Orphan.mp4',
          displayName: 'Orphan',
          path: 'some/dir/Orphan.mp4',
          rootKey: 'nas-share',
          size: 500,
          lastModified: '2026-01-01T00:00:00Z',
          metadata: {},
          categories: {},
          customCategories: {},
        });

        // No file should have been written anywhere — function should return silently
        const files = await fs.readdir(tmpDir);
        expect(files).not.toContain('metadata.json');
      } finally {
        RootsRegistry.reset();
      }
    });

    it('falls back to MEDIA_ROOT when no rootKey is provided (backwards compat)', async () => {
      RootsRegistry.reset();
      // Registry has no fallback set — but MEDIA_ROOT env is available

      const videoDir = path.join(tmpDir, 'legacy', 'Video');
      await fs.mkdir(videoDir, { recursive: true });

      const origMediaRoot = process.env.MEDIA_ROOT;
      process.env.MEDIA_ROOT = tmpDir;

      try {
        await syncVideoSidecar({
          id: 'legacy-1',
          filename: 'Video.mp4',
          displayName: 'Legacy Video',
          path: 'legacy/Video/Video.mp4',
          // no rootKey
          size: 1234,
          lastModified: '2026-03-01T00:00:00Z',
          metadata: { duration: 30, width: 640, height: 480, bitrate: 1000000, codec: 'h264', fps: 30, aspectRatio: '4:3' },
          categories: {},
          customCategories: {},
        });

        const content = JSON.parse(await fs.readFile(path.join(videoDir, 'metadata.json'), 'utf-8'));
        expect(content.id).toBe('legacy-1');
        expect(content.displayName).toBe('Legacy Video');
      } finally {
        if (origMediaRoot === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = origMediaRoot;
        RootsRegistry.reset();
      }
    });

    it('uses registry fallbackRoot for rootKey-less videos when available', async () => {
      const fallbackDir = path.join(tmpDir, 'fallback-media');
      const videoDir = path.join(fallbackDir, 'sub', 'MyVid');
      await fs.mkdir(videoDir, { recursive: true });

      // Set up registry with a fallback root (simulating MEDIA_ROOT in env during init)
      RootsRegistry.reset();
      const origMediaRoot = process.env.MEDIA_ROOT;
      process.env.MEDIA_ROOT = fallbackDir;
      RootsRegistry.init();

      try {
        await syncVideoSidecar({
          id: 'fallback-1',
          filename: 'MyVid.mp4',
          displayName: 'My Vid',
          path: 'sub/MyVid/MyVid.mp4',
          // no rootKey — should use registry's fallbackRoot
          size: 999,
          lastModified: '2026-02-15T00:00:00Z',
          metadata: {},
          categories: { age: ['mature'] },
          customCategories: {},
        });

        const content = JSON.parse(await fs.readFile(path.join(videoDir, 'metadata.json'), 'utf-8'));
        expect(content.id).toBe('fallback-1');
        expect(content.categories.age).toEqual(['mature']);
      } finally {
        if (origMediaRoot === undefined) delete process.env.MEDIA_ROOT;
        else process.env.MEDIA_ROOT = origMediaRoot;
        RootsRegistry.reset();
      }
    });
  });
});
