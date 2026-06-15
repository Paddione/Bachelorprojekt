import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilesystemOps } from './filesystem-ops';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { FileHandleRegistry } from './file-handle-registry';
import { DirectoryDatabase } from './directory-database';

vi.mock('./directory-handle-registry');
vi.mock('./file-handle-registry');
vi.mock('./directory-database');

// Minimal mock helpers
function makeFile(name: string, content = 'data') {
  return new File([content], name, { type: 'video/mp4', lastModified: Date.now() });
}

function makeDir(entries: Record<string, any> = {}) {
  const store: Record<string, any> = { ...entries };
  return {
    async getFileHandle(name: string, opts?: { create?: boolean }): Promise<unknown> {
      if (opts?.create === false) {
        if (!(name in store)) throw new Error('NotFound');
        return store[name] as unknown;
      }
      if (!(name in store)) {
        store[name] = {
          name,
          async getFile() {
            return makeFile(name);
          },
          async createWritable() {
            return {
              async write(_buf: ArrayBuffer) {},
              async close() {},
            };
          },
        };
      }
      return store[name] as unknown;
    },
    async removeEntry(name: string) {
      delete store[name];
    },
    async *entries(): AsyncGenerator<[string, any]> {
      for (const [k, v] of Object.entries(store)) {
        yield [k, v];
      }
    },
  } as unknown as FileSystemDirectoryHandle & { _store?: Record<string, any> };
}

describe('FilesystemOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDirectory', () => {
    it('should create directory successfully', async () => {
      vi.mocked(DirectoryHandleRegistry.ensureDirectory).mockResolvedValue(makeDir() as any);
      vi.mocked(DirectoryDatabase.addDirectory).mockReturnValue(undefined);

      const result = await FilesystemOps.createDirectory('root-key', 'new-folder');

      expect(result.success).toBe(true);
      expect(DirectoryHandleRegistry.ensureDirectory).toHaveBeenCalledWith(
        'root-key',
        'new-folder',
      );
      expect(DirectoryDatabase.addDirectory).toHaveBeenCalledWith('root-key', 'new-folder');
    });

    it('should handle directory creation error', async () => {
      const error = new Error('Permission denied');
      vi.mocked(DirectoryHandleRegistry.ensureDirectory).mockRejectedValue(error);

      const result = await FilesystemOps.createDirectory('root-key', 'new-folder');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Permission denied');
    });

    it('should handle non-Error exceptions', async () => {
      vi.mocked(DirectoryHandleRegistry.ensureDirectory).mockRejectedValue('String error');

      const result = await FilesystemOps.createDirectory('root-key', 'new-folder');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to create directory');
    });
  });

  describe('deleteDirectory', () => {
    it('should delete directory successfully', async () => {
      const subFolder = {
        kind: 'directory',
        name: 'subfolder',
        removeEntry: vi.fn(),
        entries: () => [].values(),
      };
      const mockDir = makeDir({
        'file1.txt': { kind: 'file', name: 'file1.txt' },
        subfolder: subFolder,
      });

      // Mock removeEntry to work with the recursive delete
      vi.spyOn(mockDir, 'removeEntry').mockResolvedValue(undefined);
      vi.spyOn(subFolder, 'removeEntry').mockResolvedValue(undefined);

      vi.mocked(DirectoryHandleRegistry.getSubdirectoryHandle).mockResolvedValue(mockDir as any);
      vi.mocked(DirectoryDatabase.removeDirectory).mockReturnValue(undefined);

      const result = await FilesystemOps.deleteDirectory('root-key', 'folder-to-delete');

      expect(result.success).toBe(true);
      expect(DirectoryHandleRegistry.getSubdirectoryHandle).toHaveBeenCalledWith(
        'root-key',
        'folder-to-delete',
        false,
      );
      expect(DirectoryDatabase.removeDirectory).toHaveBeenCalledWith(
        'root-key',
        'folder-to-delete',
      );
    });

    it('should handle directory deletion error', async () => {
      const error = new Error('Directory not found');
      vi.mocked(DirectoryHandleRegistry.getSubdirectoryHandle).mockRejectedValue(error);

      const result = await FilesystemOps.deleteDirectory('root-key', 'nonexistent-folder');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Directory not found');
    });
  });

  describe('moveFile', () => {
    const mockVideoId = 'video-123';
    const mockFileName = 'test-video.mp4';
    const mockFile = makeFile(mockFileName);
    const mockFileHandle = {
      name: mockFileName,
      getFile: vi.fn().mockResolvedValue(mockFile),
    };
    const mockParentDir = makeDir();
    const mockDestDir = makeDir();

    beforeEach(() => {
      vi.mocked(DirectoryHandleRegistry.getParentForFile).mockReturnValue({
        rootKey: 'root-key',
        parent: mockParentDir as any,
      });
      vi.mocked(FileHandleRegistry.get).mockReturnValue(mockFileHandle as any);
      vi.mocked(DirectoryHandleRegistry.ensureDirectory).mockResolvedValue(mockDestDir as any);
    });

    it('should move file successfully', async () => {
      // Mock that destination file doesn't exist
      (mockDestDir as any).getFileHandle = vi.fn(
        async (name: string, opts?: { create?: boolean }) => {
          if (opts?.create === false) {
            throw new Error('NotFoundError');
          }
          return {
            createWritable: vi.fn().mockResolvedValue({
            write: vi.fn(),
            close: vi.fn(),
          }),
        };
        },
      );

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder');

      expect(result.success).toBe(true);
      expect(DirectoryHandleRegistry.getParentForFile).toHaveBeenCalledWith(mockVideoId);
      expect(FileHandleRegistry.get).toHaveBeenCalledWith(mockVideoId);
      expect(DirectoryHandleRegistry.ensureDirectory).toHaveBeenCalledWith(
        'root-key',
        'destination-folder',
      );
    });

    it('should return conflict error when file exists and overwrite is false', async () => {
      // Mock that destination file exists
      vi.spyOn(mockDestDir as any, 'getFileHandle').mockResolvedValue(mockFileHandle);

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder');

      expect(result.success).toBe(false);
      expect(result.code).toBe('conflict');
      expect(result.message).toContain('already exists');
    });

    it('should overwrite file when overwrite option is true', async () => {
      // Mock that destination file exists
      (mockDestDir as any).getFileHandle = vi.fn(
        async (name: string, opts?: { create?: boolean }) => {
          if (opts?.create === false) {
            return mockFileHandle; // File exists
          }
          return {
            createWritable: vi.fn().mockResolvedValue({
            write: vi.fn(),
            close: vi.fn(),
          }),
        };
        },
      );

      vi.spyOn(mockDestDir as any, 'removeEntry').mockResolvedValue(undefined);

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder', {
        overwrite: true,
      });

      expect(result.success).toBe(true);
      expect(mockDestDir.removeEntry).toHaveBeenCalled();
    });

    it('should handle overwrite removal failure', async () => {
      // Mock that destination file exists
      vi.spyOn(mockDestDir as any, 'getFileHandle').mockResolvedValue(mockFileHandle);
      vi.spyOn(mockDestDir as any, 'removeEntry').mockRejectedValue(new Error('Permission denied'));

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder', {
        overwrite: true,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('permission_denied');
      expect(result.message).toBe('Permission denied');
    });

    it('should return error when no parent directory handle found', async () => {
      vi.mocked(DirectoryHandleRegistry.getParentForFile).mockReturnValue(null as any);

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No directory handle for this file');
    });

    it('should return error when no file handle found', async () => {
      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No file handle available');
    });

    it('should handle general move errors', async () => {
      vi.mocked(DirectoryHandleRegistry.ensureDirectory).mockRejectedValue(
        new Error('Network error'),
      );

      const result = await FilesystemOps.moveFile(mockVideoId, 'destination-folder');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Network error');
    });
  });

  describe('deleteFile', () => {
    const mockVideoId = 'video-456';
    const mockFileName = 'delete-me.mp4';
    const mockFileHandle = {
      name: mockFileName,
    };
    const mockParentDir = makeDir();

    beforeEach(() => {
      vi.mocked(DirectoryHandleRegistry.getParentForFile).mockReturnValue({
        rootKey: 'root-key',
        parent: mockParentDir as any,
      });
      vi.mocked(FileHandleRegistry.get).mockReturnValue(mockFileHandle as any);
    });

    it('should delete file successfully', async () => {
      vi.spyOn(mockParentDir, 'removeEntry').mockResolvedValue(undefined);

      const result = await FilesystemOps.deleteFile(mockVideoId);

      expect(result.success).toBe(true);
      expect(DirectoryHandleRegistry.getParentForFile).toHaveBeenCalledWith(mockVideoId);
      expect(FileHandleRegistry.get).toHaveBeenCalledWith(mockVideoId);
      expect(mockParentDir.removeEntry).toHaveBeenCalledWith(mockFileName);
    });

    it('should return error when no parent directory handle found', async () => {
      vi.mocked(DirectoryHandleRegistry.getParentForFile).mockReturnValue(null as any);

      const result = await FilesystemOps.deleteFile(mockVideoId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No directory handle for this file');
    });

    it('should return error when no file handle found', async () => {
      vi.mocked(FileHandleRegistry.get).mockReturnValue(undefined);

      const result = await FilesystemOps.deleteFile(mockVideoId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('No file handle available');
    });

    it('should handle file deletion error', async () => {
      vi.spyOn(mockParentDir, 'removeEntry').mockRejectedValue(new Error('File is locked'));

      const result = await FilesystemOps.deleteFile(mockVideoId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('File is locked');
    });

    it('should handle non-Error exceptions', async () => {
      vi.spyOn(mockParentDir, 'removeEntry').mockRejectedValue('String error');

      const result = await FilesystemOps.deleteFile(mockVideoId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to delete file');
    });
  });

  describe('recursivelyDelete', () => {
    it('should recursively delete directory contents', async () => {
      const subDir = makeDir({
        'nested-file.txt': { kind: 'file', name: 'nested-file.txt' },
      });

      // Create a proper directory handle object for the subdirectory
      const subdirectoryHandle = Object.assign(subDir, {
        kind: 'directory',
        name: 'subdirectory',
        entries: (subDir as any).entries,
      });

      const mockDir = makeDir({
        'file1.txt': { kind: 'file', name: 'file1.txt' },
        'file2.mp4': { kind: 'file', name: 'file2.mp4' },
        subdirectory: subdirectoryHandle,
      });

      vi.spyOn(mockDir, 'removeEntry').mockResolvedValue(undefined);
      vi.spyOn(subDir, 'removeEntry').mockResolvedValue(undefined);

      // Call the private method via type assertion
      await (FilesystemOps as any).recursivelyDelete(mockDir);

      // Should remove all entries
      expect(mockDir.removeEntry).toHaveBeenCalledTimes(3); // 2 files + 1 directory
      expect(subDir.removeEntry).toHaveBeenCalledWith('nested-file.txt');
    });
  });

  // Legacy tests for backward compatibility
  describe('moveFile conflict handling (legacy)', () => {
    const mockVideoId = 'vid1';
    const mockFileName = 'sample.mp4';
    const mockFile = makeFile(mockFileName);
    const mockFileHandle = {
      name: mockFileName,
      getFile: vi.fn().mockResolvedValue(mockFile),
    };
    const mockParentDir = makeDir();
    const mockDestDir = makeDir();

    beforeEach(() => {
      vi.mocked(DirectoryHandleRegistry.getParentForFile).mockReturnValue({
        rootKey: 'root-key',
        parent: mockParentDir as any,
      });
      vi.mocked(FileHandleRegistry.get).mockReturnValue(mockFileHandle as any);
      vi.mocked(DirectoryHandleRegistry.ensureDirectory).mockResolvedValue(mockDestDir as any);
    });

    it('returns conflict when destination already has file and overwrite not set', async () => {
      // Mock that destination file exists
      vi.spyOn(mockDestDir as any, 'getFileHandle').mockResolvedValue(mockFileHandle);

      const result = await FilesystemOps.moveFile(mockVideoId, 'dest/dir');
      expect(result.success).toBe(false);
      expect(result.code).toBe('conflict');
    });

    it('overwrites existing file when overwrite option is true', async () => {
      // Mock that destination file exists
      (mockDestDir as any).getFileHandle = vi.fn(
        async (name: string, opts?: { create?: boolean }) => {
          if (opts?.create === false) {
            return mockFileHandle; // File exists
          }
          return {
            createWritable: vi.fn().mockResolvedValue({
              write: vi.fn(),
              close: vi.fn(),
            }),
          };
        },
      );

      vi.spyOn(mockDestDir as any, 'removeEntry').mockResolvedValue(undefined);

      const result = await FilesystemOps.moveFile(mockVideoId, 'dest/dir', { overwrite: true });
      expect(result.success).toBe(true);
    });
  });
});
