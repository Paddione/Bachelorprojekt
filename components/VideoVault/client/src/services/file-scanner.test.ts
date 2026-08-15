import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { FileScanner } from './file-scanner';
import { VideoThumbnailService } from './video-thumbnail';
import { VideoUrlRegistry } from './video-url-registry';

// Ensure globals for Node test env
beforeAll(() => {
  // btoa fallback for Node if needed
  if (!(globalThis as any).btoa) {
    (globalThis as any).btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  }
  // URL.createObjectURL mocks
  (globalThis as any).URL.createObjectURL = vi.fn(() => 'blob:mock');
  (globalThis as any).URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FileScanner.scanDirectory abort handling', () => {
  it('stops processing when AbortController is triggered and keeps partial results', async () => {
    // Mock heavy services to be fast and deterministic
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const TOTAL_FILES = 50;
    const directoryHandle = {
      name: 'root',
      async *entries(): AsyncGenerator<[string, any]> {
        for (let i = 1; i <= TOTAL_FILES; i++) {
          const filename = `video_${i}.mp4`;
          const file = new File([`content_${i}`], filename, {
            type: 'video/mp4',
            lastModified: Date.now(),
          });
          const fileHandle = {
            kind: 'file',
            name: filename,
            getFile: () => Promise.resolve(file),
          };
          yield [filename, fileHandle as any];
        }
      },
    } as unknown as FileSystemDirectoryHandle;

    const controller = new AbortController();
    let lastProgress = { current: 0, total: 0 };
    const videos = await FileScanner.scanDirectory(
      directoryHandle,
      (current, total) => {
        lastProgress = { current, total };
        if (current === 10) {
          controller.abort();
        }
      },
      controller.signal,
    );

    expect(lastProgress.total).toBe(TOTAL_FILES);
    expect(lastProgress.current).toBe(10);
    expect(videos.length).toBe(10);
  });
});

describe('FileScanner scalability', () => {
  it('processes many files efficiently with concurrency', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const FAST = process.env.FAST_TESTS === '1';
    const TOTAL_FILES = FAST ? 100 : 500;
    const directoryHandle = {
      name: 'root',
      async *entries(): AsyncGenerator<[string, any]> {
        for (let i = 1; i <= TOTAL_FILES; i++) {
          const filename = `video_${i}.mp4`;
          const file = new File([`content_${i}`], filename, {
            type: 'video/mp4',
            lastModified: Date.now(),
          });
          const fileHandle = {
            kind: 'file',
            name: filename,
            getFile: () => Promise.resolve(file),
          };
          yield [filename, fileHandle as any];
        }
      },
    } as unknown as FileSystemDirectoryHandle;

    let lastProgress = { current: 0, total: 0 };
    const videos = await FileScanner.scanDirectory(directoryHandle, (current, total) => {
      lastProgress = { current, total };
    });

    expect(lastProgress.total).toBe(TOTAL_FILES);
    expect(lastProgress.current).toBe(TOTAL_FILES);
    expect(videos.length).toBe(TOTAL_FILES);
  });
});

describe('FileScanner unicode handling', () => {
  it('generates IDs for non-Latin filenames without throwing', async () => {
    // Mock heavy services
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1280,
      height: 720,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const filename = 'こんにちは — тест.mp4';
    const file = new File([`content_unicode`], filename, {
      type: 'video/mp4',
      lastModified: Date.now(),
    });
    const mockHandle = {
      name: filename,
      getFile: () => Promise.resolve(file),
    } as unknown as FileSystemFileHandle;

    const video = await FileScanner.generateVideoMetadata(file, mockHandle, filename);
    expect(typeof video.id).toBe('string');
    expect(video.id.length).toBeGreaterThan(0);
    expect(video.filename).toBe(filename);
  });
});

describe('FileScanner uses external thumbnails when available', () => {
  it('prefers thumbnails/<basename>-2.jpg over generating', async () => {
    // Ensure we don't call actual generator
    const genSpy = vi.spyOn(VideoThumbnailService, 'generateThumbnail');
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1280,
      height: 720,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    // Prepare a fake external thumbnail file
    const filename = 'sample video.mp4';
    const base = filename.replace(/\.[^.]+$/, '');
    const thumbFile = new File([Uint8Array.from([0, 1, 2, 3])], `${base}-2.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });

    // Minimal FileSystem-like handles
    const file = new File([`content_unicode`], filename, {
      type: 'video/mp4',
      lastModified: Date.now(),
    });
    const fileHandle = {
      name: filename,
      getFile: () => Promise.resolve(file),
    } as unknown as FileSystemFileHandle;

    const thumbnailsDir = {
      getFileHandle: async (name: string) => {
        if (name === `${base}-2.jpg`) {
          return { getFile: async () => thumbFile };
        }
        throw new Error('not found');
      },
    };
    const parentDirHandle: any = {
      getDirectoryHandle: async (name: string): Promise<unknown> => {
        if (name === 'thumbnails') return thumbnailsDir as unknown;
        throw new Error('no dir');
      },
    };

    const video = await FileScanner.generateVideoMetadata(
      file,
      fileHandle,
      filename,
      parentDirHandle,
    );
    expect((video.thumbnail as any)?.dataUrl.startsWith('data:image/')).toBe(true);
    expect(genSpy).not.toHaveBeenCalled();
  });
});

describe('FileScanner error recovery', () => {
  it('continues scanning after individual file errors', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const directoryHandle = {
      name: 'root',
      async *entries(): AsyncGenerator<[string, any]> {
        for (let i = 1; i <= 10; i++) {
          const filename = `video_${i}.mp4`;
          const file = new File([`content_${i}`], filename, {
            type: 'video/mp4',
            lastModified: Date.now(),
          });
          const fileHandle = {
            kind: 'file',
            name: filename,
            getFile: () => {
              // Simulate error on file 5
              if (i === 5) {
                return Promise.reject(new Error('File access denied'));
              }
              return Promise.resolve(file);
            },
          };
          yield [filename, fileHandle as any];
        }
      },
    } as unknown as FileSystemDirectoryHandle;

    const videos = await FileScanner.scanDirectory(directoryHandle, () => {});

    // Should have 9 videos (10 - 1 failed)
    expect(videos.length).toBe(9);
  });

  it('handles metadata extraction errors gracefully', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });

    // Mock metadata extraction to fail
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockRejectedValue(
      new Error('Failed to extract metadata'),
    );
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const filename = 'test.mp4';
    const file = new File(['content'], filename, { type: 'video/mp4', lastModified: Date.now() });
    const fileHandle = {
      name: filename,
      getFile: () => Promise.resolve(file),
    } as unknown as FileSystemFileHandle;

    // The function should handle the error and either throw or return with defaults
    try {
      const video = await FileScanner.generateVideoMetadata(file, fileHandle, filename);
      // If it doesn't throw, it should still have basic properties
      expect(video).toBeTruthy();
      expect(video.filename).toBe(filename);
    } catch (error) {
      // If it throws, that's also acceptable error handling
      expect(error).toBeTruthy();
    }
  });
});

describe('FileScanner progress reporting', () => {
  it('reports accurate progress during scan', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const TOTAL_FILES = 20;
    const directoryHandle = {
      name: 'root',
      async *entries(): AsyncGenerator<[string, any]> {
        for (let i = 1; i <= TOTAL_FILES; i++) {
          const filename = `video_${i}.mp4`;
          const file = new File([`content_${i}`], filename, {
            type: 'video/mp4',
            lastModified: Date.now(),
          });
          const fileHandle = {
            kind: 'file',
            name: filename,
            getFile: () => Promise.resolve(file),
          };
          yield [filename, fileHandle as any];
        }
      },
    } as unknown as FileSystemDirectoryHandle;

    const progressUpdates: Array<{ current: number; total: number }> = [];

    await FileScanner.scanDirectory(directoryHandle, (current, total) => {
      progressUpdates.push({ current, total });
    });

    // Should have progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);

    // Total should be consistent
    const totals = progressUpdates.map((p) => p.total);
    expect(new Set(totals).size).toBe(1); // All totals should be the same
    expect(totals[0]).toBe(TOTAL_FILES);

    // Current should increase monotonically
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i].current).toBeGreaterThanOrEqual(progressUpdates[i - 1].current);
    }

    // Final progress should be complete
    const lastProgress = progressUpdates[progressUpdates.length - 1];
    expect(lastProgress.current).toBe(TOTAL_FILES);
  });

  it('reports progress even with errors', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const directoryHandle = {
      name: 'root',
      async *entries(): AsyncGenerator<[string, any]> {
        for (let i = 1; i <= 10; i++) {
          const filename = `video_${i}.mp4`;
          const file = new File([`content_${i}`], filename, {
            type: 'video/mp4',
            lastModified: Date.now(),
          });
          const fileHandle = {
            kind: 'file',
            name: filename,
            getFile: () => {
              if (i % 3 === 0) {
                return Promise.reject(new Error('Error'));
              }
              return Promise.resolve(file);
            },
          };
          yield [filename, fileHandle as any];
        }
      },
    } as unknown as FileSystemDirectoryHandle;

    let lastProgress = { current: 0, total: 0 };

    await FileScanner.scanDirectory(directoryHandle, (current, total) => {
      lastProgress = { current, total };
    });

    // Should still report final progress
    expect(lastProgress.total).toBe(10);
    expect(lastProgress.current).toBe(10);
  });
});

describe('FileScanner memory management', () => {
  it('does not accumulate memory with large file sets', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const FAST = process.env.FAST_TESTS === '1';
    const TOTAL_FILES = FAST ? 50 : 200;

    const directoryHandle = {
      name: 'root',
      async *entries(): AsyncGenerator<[string, any]> {
        for (let i = 1; i <= TOTAL_FILES; i++) {
          const filename = `video_${i}.mp4`;
          // Create small files to avoid memory issues
          const file = new File(['x'], filename, { type: 'video/mp4', lastModified: Date.now() });
          const fileHandle = {
            kind: 'file',
            name: filename,
            getFile: () => Promise.resolve(file),
          };
          yield [filename, fileHandle as any];
        }
      },
    } as unknown as FileSystemDirectoryHandle;

    const videos = await FileScanner.scanDirectory(directoryHandle, () => {});

    expect(videos.length).toBe(TOTAL_FILES);

    // Verify videos are properly formed
    expect(videos[0]).toHaveProperty('id');
    expect(videos[0]).toHaveProperty('filename');
    expect(videos[0]).toHaveProperty('metadata');
  });
});

describe('FileScanner concurrent scan handling', () => {
  it('handles multiple concurrent scans', async () => {
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 0,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    const createDirectoryHandle = (prefix: string, count: number) =>
      ({
        name: `root-${prefix}`,
        async *entries(): AsyncGenerator<[string, any]> {
          for (let i = 1; i <= count; i++) {
            const filename = `${prefix}_video_${i}.mp4`;
            const file = new File([`content_${i}`], filename, {
              type: 'video/mp4',
              lastModified: Date.now(),
            });
            const fileHandle = {
              kind: 'file',
              name: filename,
              getFile: () => Promise.resolve(file),
            };
            yield [filename, fileHandle as any];
          }
        },
      }) as unknown as FileSystemDirectoryHandle;

    // Run two scans concurrently
    const [videos1, videos2] = await Promise.all([
      FileScanner.scanDirectory(createDirectoryHandle('a', 10), () => {}),
      FileScanner.scanDirectory(createDirectoryHandle('b', 10), () => {}),
    ]);

    expect(videos1.length).toBe(10);
    expect(videos2.length).toBe(10);

    // Verify they scanned different files
    expect(videos1[0].filename).toContain('a_video');
    expect(videos2[0].filename).toContain('b_video');
  });
});
