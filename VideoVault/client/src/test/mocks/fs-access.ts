import { vi } from 'vitest';

export function createMockFile(
  name: string,
  opts: { size?: number; type?: string; lastModified?: number } = {},
): File {
  const { size = 1, type = 'video/mp4', lastModified = Date.now() } = opts;
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type, lastModified });
}

export function createMockFileHandle(file: File): FileSystemFileHandle {
  return {
    kind: 'file',
    name: file.name,
    getFile: vi.fn(() => Promise.resolve(file)),
  } as unknown as FileSystemFileHandle;
}

export type DirStructure = Record<string, FileSystemFileHandle | FileSystemDirectoryHandle | File>;

export function createMockDirHandle(
  name: string,
  structure: DirStructure = {},
): FileSystemDirectoryHandle {
  const dir: Record<string, unknown> = {
    kind: 'directory',
    name,
    _children: new Map<string, unknown>(),
    async *entries(): AsyncIterableIterator<[string, unknown]> {
      for (const [n, h] of (dir._children as Map<string, unknown>).entries()) {
        yield [n, h];
      }
    },
    getDirectoryHandle(n: string, _opts?: { create?: boolean }) {
      const child = (dir._children as Map<string, unknown>).get(n);
      if ((child as { kind?: string })?.kind === 'directory')
        return Promise.resolve(child as FileSystemDirectoryHandle);
      const newDir = createMockDirHandle(n, {});
      (dir._children as Map<string, unknown>).set(n, newDir);
      return Promise.resolve(newDir);
    },
  };

  for (const [key, value] of Object.entries(structure)) {
    if (
      (value as unknown as { kind?: string })?.kind === 'file' ||
      (value as unknown as { kind?: string })?.kind === 'directory'
    ) {
      (dir._children as Map<string, unknown>).set(key, value);
    } else if (value instanceof File) {
      (dir._children as Map<string, unknown>).set(key, createMockFileHandle(value));
    } else if (typeof value === 'object') {
      (dir._children as Map<string, unknown>).set(
        key,
        createMockDirHandle(key, value as unknown as DirStructure),
      );
    }
  }

  return dir as unknown as FileSystemDirectoryHandle;
}
