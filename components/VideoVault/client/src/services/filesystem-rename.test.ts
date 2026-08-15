import { describe, it, expect } from 'vitest';
import { attemptDiskRename } from './filesystem-rename';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { FileHandleRegistry } from './file-handle-registry';

function makeFile(name: string, content = 'x') {
  return new File([content], name, { type: 'video/mp4', lastModified: Date.now() });
}

function makeDir(entries: Record<string, any> = {}) {
  const store: Record<string, any> = { ...entries };
  return {
    getFileHandle(name: string, opts?: { create?: boolean }) {
      if (opts?.create === false) {
        if (!(name in store)) return Promise.reject(new Error('NotFound'));
        return Promise.resolve(store[name] as unknown as FileSystemFileHandle);
      }
      if (!(name in store)) {
        store[name] = {
          name,
          getFile() {
            return Promise.resolve(makeFile(name));
          },
          createWritable() {
            return Promise.resolve({
              write: () => Promise.resolve(),
              close: () => Promise.resolve(),
            });
          },
        };
      }
      return Promise.resolve(store[name] as unknown as FileSystemFileHandle);
    },
    removeEntry(name: string) {
      delete store[name];
      return Promise.resolve();
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe('attemptDiskRename conflict handling', () => {
  it('returns conflict when target name exists and overwrite not set', async () => {
    const id = 'v1';
    const srcName = 'a.mp4';
    const dstName = 'b.mp4';
    const parent = makeDir({
      [dstName]: {
        name: dstName,
        getFile: () => Promise.resolve(makeFile(dstName)),
        createWritable: () =>
          Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
      },
    });
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });
    // Register a file handle without native move
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    } as any);
    const res = await attemptDiskRename(id, dstName);
    expect(res.success).toBe(false);
    expect(res.code).toBe('conflict');
    expect(res.message).toBe('A file named "b.mp4" already exists.');
  });

  it('overwrites when option provided and no native move', async () => {
    const id = 'v2';
    const srcName = 'c.mp4';
    const dstName = 'd.mp4';
    const parent = makeDir({
      [dstName]: {
        name: dstName,
        getFile: () => Promise.resolve(makeFile(dstName)),
        createWritable: () =>
          Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
      },
    });
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    } as any);
    const res = await attemptDiskRename(id, dstName, { overwrite: true });
    expect(res.success).toBe(true);
  });

  it('returns permission_denied when overwrite fails', async () => {
    const id = 'v3';
    const srcName = 'e.mp4';
    const dstName = 'f.mp4';
    const parent = {
      ...makeDir({
        [dstName]: {
          name: dstName,
          getFile: () => Promise.resolve(makeFile(dstName)),
          createWritable: async () => ({ write: async () => {}, close: async () => {} }),
        },
      }),
      async removeEntry() {
        throw new Error('Permission denied');
      },
    } as unknown as FileSystemDirectoryHandle;
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    } as any);
    const res = await attemptDiskRename(id, dstName, { overwrite: true });
    expect(res.success).toBe(false);
    expect(res.code).toBe('permission_denied');
    expect(res.message).toBe('Permission denied');
  });

  it('succeeds with native move when available', async () => {
    const id = 'v4';
    const srcName = 'g.mp4';
    const dstName = 'h.mp4';
    const parent = makeDir();
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });

    let moved = false;
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
      move: async () => {
        moved = true;
      },
    } as any);

    const res = await attemptDiskRename(id, dstName);
    expect(res.success).toBe(true);
    expect(moved).toBe(true);
  });

  it('handles native move with existing file and overwrite', async () => {
    const id = 'v5';
    const srcName = 'i.mp4';
    const dstName = 'j.mp4';
    const parent = makeDir({
      [dstName]: {
        name: dstName,
        getFile: () => Promise.resolve(makeFile(dstName)),
        createWritable: () =>
          Promise.resolve({ write: () => Promise.resolve(), close: () => Promise.resolve() }),
      },
    });
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });

    let moved = false;
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
      move: async () => {
        moved = true;
      },
    } as any);

    const res = await attemptDiskRename(id, dstName, { overwrite: true });
    expect(res.success).toBe(true);
    expect(moved).toBe(true);
  });

  it('returns error when no file handle available', async () => {
    (FileHandleRegistry as any).get = () => undefined;
    const res = await attemptDiskRename('nonexistent', 'new.mp4');
    expect(res.success).toBe(false);
    expect(res.message).toBe('No file handle available in this session.');
  });

  it('returns error when no parent directory found', async () => {
    const id = 'v6';
    (FileHandleRegistry as any).get = (videoId: string) =>
      videoId === id
        ? { name: 'test.mp4', getFile: () => Promise.resolve(makeFile('test.mp4')) }
        : undefined;
    (DirectoryHandleRegistry as any).getParentForFile = () => undefined;

    const res = await attemptDiskRename(id, 'new.mp4');
    expect(res.success).toBe(false);
    expect(res.message).toBe(
      'No parent directory handle found. Rescan the root to reattach session handles.',
    );
  });

  it('handles fallback copy-delete method when move not available', async () => {
    const id = 'v7';
    const srcName = 'k.mp4';
    const dstName = 'l.mp4';
    const parent = makeDir();
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });

    let registeredNewHandle = false;
    (FileHandleRegistry as any).register = (newId: string, handle: any) => {
      if (newId === id && handle.name === dstName) {
        registeredNewHandle = true;
      }
    };

    (FileHandleRegistry as any).get = () => ({
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    });

    const res = await attemptDiskRename(id, dstName);
    expect(res.success).toBe(true);
    expect(registeredNewHandle).toBe(true);
  });

  it('handles errors during fallback method', async () => {
    const id = 'v8';
    const srcName = 'm.mp4';
    const dstName = 'n.mp4';
    const parent = {
      ...makeDir(),
      async removeEntry() {
        throw new Error('Cannot remove original file');
      },
    } as unknown as FileSystemDirectoryHandle;
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    } as any);

    const res = await attemptDiskRename(id, dstName);
    expect(res.success).toBe(false);
    expect(res.message).toBe('Cannot remove original file');
  });

  it('handles file creation errors during fallback', async () => {
    const id = 'v9';
    const srcName = 'o.mp4';
    const dstName = 'p.mp4';
    const parent = {
      async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (opts?.create === false) throw new Error('NotFound');
        if (name === dstName) throw new Error('Cannot create destination file');
        return {
          name,
          getFile: () => Promise.resolve(makeFile(name)),
        } as unknown as FileSystemFileHandle;
      },
      async removeEntry() {},
    } as unknown as FileSystemDirectoryHandle;
    (DirectoryHandleRegistry as any).getParentForFile = () => ({ parent, rootKey: 'root' });
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    } as any);

    const res = await attemptDiskRename(id, dstName);
    expect(res.success).toBe(false);
    expect(res.message).toBe('Cannot create destination file');
  });

  it('handles write stream errors during fallback', async () => {
    const id = 'v10';
    const srcName = 'q.mp4';
    const dstName = 'r.mp4';
    const parent = makeDir();
    // Override to return failing writable
    const originalMakeDir = makeDir;
    const parentWithFailingWritable = {
      ...originalMakeDir(),
      async getFileHandle(name: string, opts?: { create?: boolean }) {
        if (opts?.create === false) throw new Error('NotFound');
        if (name === dstName) {
          return {
            name,
            async createWritable() {
              throw new Error('Cannot create write stream');
            },
          } as unknown as FileSystemFileHandle;
        }
        return {
          name,
          getFile: () => Promise.resolve(makeFile(name)),
        } as unknown as FileSystemFileHandle;
      },
    } as unknown as FileSystemDirectoryHandle;

    (DirectoryHandleRegistry as any).getParentForFile = () => ({
      parent: parentWithFailingWritable,
      rootKey: 'root',
    });
    FileHandleRegistry.register(id, {
      name: srcName,
      getFile: () => Promise.resolve(makeFile(srcName)),
    } as any);

    const res = await attemptDiskRename(id, dstName);
    expect(res.success).toBe(false);
    expect(res.message).toBe('Cannot create write stream');
  });
});
