import { describe, it, expect, beforeEach } from 'vitest';
import { reattachHandlesForRoot } from './root-rescan';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { FileHandleRegistry } from './file-handle-registry';
import { Video } from '@/types/video';

function makeFile(name: string, content = 'data') {
  return new File([content], name, { type: 'video/mp4', lastModified: Date.now() });
}

function makeDir(entries: Record<string, any> = {}) {
  const store: Record<string, any> = { ...entries };
  return {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (opts?.create === false) {
        if (!(name in store)) throw new Error('NotFound');
        return store[name] as unknown as FileSystemFileHandle;
      }
      if (!(name in store)) {
        store[name] = {
          name,
          async getFile() {
            return makeFile(name);
          },
          async createWritable() {
            return { write: async () => {}, close: async () => {} };
          },
        };
      }
      return store[name] as unknown as FileSystemFileHandle;
    },
    async removeEntry(name: string) {
      delete store[name];
    },
    async *entries(): AsyncGenerator<[string, any]> {
      for (const [k, v] of Object.entries(store)) {
        yield [k, v];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('reattachHandlesForRoot', () => {
  beforeEach(() => {
    (DirectoryHandleRegistry as any).clear?.();
    (FileHandleRegistry as any).clear?.();
  });

  it('reattaches handles and does not duplicate videos', async () => {
    const rootKey = 'root_1';
    const root = makeDir({
      'a.mp4': {
        name: 'a.mp4',
        getFile: () => Promise.resolve(makeFile('a.mp4')),
        createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      },
    });
    const videos: Video[] = [
      {
        id: 'id_a',
        filename: 'a.mp4',
        displayName: 'A',
        path: 'a.mp4',
        size: 1,
        lastModified: new Date().toISOString(),
        categories: {
          age: [],
          physical: [],
          ethnicity: [],
          relationship: [],
          acts: [],
          setting: [],
          quality: [],
          performer: [],
        },
        customCategories: {},
        metadata: {
          duration: 1,
          width: 1,
          height: 1,
          bitrate: 1,
          codec: 'h264',
          fps: 30,
          aspectRatio: '16:9',
        },
        thumbnail: { dataUrl: '', generated: false, timestamp: '' },
        rootKey,
      },
    ];

    // Exercise
    const res = await reattachHandlesForRoot(rootKey, root, videos);
    expect(res.reattached).toBe(1);
    expect(res.missing).toEqual([]);

    // Validations: file handle and parent should be stored
    const handle = FileHandleRegistry.get('id_a');
    expect(handle).toBeTruthy();
  });

  it('reports missing files for removal', async () => {
    const rootKey = 'root_2';
    const root = makeDir({});
    const videos: Video[] = [
      {
        id: 'id_b',
        filename: 'b.mp4',
        displayName: 'B',
        path: 'b.mp4',
        size: 1,
        lastModified: new Date().toISOString(),
        categories: {
          age: [],
          physical: [],
          ethnicity: [],
          relationship: [],
          acts: [],
          setting: [],
          quality: [],
          performer: [],
        },
        customCategories: {},
        metadata: {
          duration: 1,
          width: 1,
          height: 1,
          bitrate: 1,
          codec: 'h264',
          fps: 30,
          aspectRatio: '16:9',
        },
        thumbnail: { dataUrl: '', generated: false, timestamp: '' },
        rootKey,
      },
    ];

    const res = await reattachHandlesForRoot(rootKey, root, videos);
    expect(res.reattached).toBe(0);
    expect(res.missing).toEqual(['id_b']);
  });
});
