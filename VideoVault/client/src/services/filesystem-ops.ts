import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';
import { FileHandleRegistry } from './file-handle-registry';

export interface FsOpResult {
  success: boolean;
  message?: string;
  code?: 'conflict' | 'not_supported' | 'permission_denied' | 'not_found';
  resolvedName?: string;
}

export class FilesystemOps {
  static async createDirectory(rootKey: string, relativeDirPath: string): Promise<FsOpResult> {
    try {
      await DirectoryHandleRegistry.ensureDirectory(rootKey, relativeDirPath);
      DirectoryDatabase.addDirectory(rootKey, relativeDirPath);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Failed to create directory',
      };
    }
  }

  static async deleteDirectory(rootKey: string, relativeDirPath: string): Promise<FsOpResult> {
    try {
      const dir = await DirectoryHandleRegistry.getSubdirectoryHandle(
        rootKey,
        relativeDirPath,
        false,
      );
      // Recursively remove: not natively supported; delete files and subdirs manually
      await this.recursivelyDelete(dir);
      DirectoryDatabase.removeDirectory(rootKey, relativeDirPath);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        message: e instanceof Error ? e.message : 'Failed to delete directory',
      };
    }
  }

  private static async recursivelyDelete(dir: FileSystemDirectoryHandle): Promise<void> {
    const anyDir: any = dir as any;
    for await (const [name, handle] of anyDir.entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind === 'file') {
        await dir.removeEntry(name);
      } else if (handle.kind === 'directory') {
        await this.recursivelyDelete(handle as FileSystemDirectoryHandle);
        await dir.removeEntry(name, { recursive: false });
      }
    }
  }

  private static async generateAvailableName(
    dir: FileSystemDirectoryHandle,
    desiredName: string,
  ): Promise<string> {
    const dotIdx = desiredName.lastIndexOf('.');
    const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName;
    const ext = dotIdx > 0 ? desiredName.slice(dotIdx) : '';
    for (let i = 1; i <= 50; i++) {
      const candidate = `${base} (${i})${ext}`;
      try {
        await (dir as any).getFileHandle(candidate, { create: false });
      } catch (_e) {
        return candidate;
      }
    }
    return `${base}-${Date.now()}${ext}`;
  }

  static async moveFile(
    videoId: string,
    targetRelativeDirPath: string,
    opts?: { overwrite?: boolean; conflictStrategy?: 'keep_both'; preferredName?: string },
  ): Promise<FsOpResult> {
    const parentInfo = DirectoryHandleRegistry.getParentForFile(videoId);
    if (!parentInfo)
      return {
        success: false,
        message: 'No directory handle for this file in the current session. Rescan first.',
      };
    const { rootKey, parent: srcParent } = parentInfo;
    try {
      const handle = FileHandleRegistry.get(videoId) as unknown as FileSystemFileHandle | undefined;
      if (!handle) return { success: false, message: 'No file handle available in this session.' };
      const file = await handle.getFile();
      const desiredName = opts?.preferredName ?? file.name;
      // Ensure destination dir exists
      const destDir = await DirectoryHandleRegistry.ensureDirectory(rootKey, targetRelativeDirPath);

      // Detect name collisions
      let destExists = false;
      try {
        await (destDir as any).getFileHandle(desiredName, { create: false });
        destExists = true;
      } catch (_e) {
        // not found means fine
      }

      let targetName = desiredName;
      if (destExists) {
        if (opts?.conflictStrategy === 'keep_both') {
          targetName = await this.generateAvailableName(destDir, desiredName);
          destExists = false;
        } else if (!opts?.overwrite) {
          return {
            success: false,
            message: `A file named "${desiredName}" already exists in that directory.`,
            code: 'conflict',
          };
        }
      }

      if (destExists && opts?.overwrite) {
        try {
          await (destDir as any).removeEntry(targetName);
        } catch (e) {
          return {
            success: false,
            message: e instanceof Error ? e.message : 'Failed to overwrite existing file.',
            code: 'permission_denied',
          };
        }
      }

      // Create the file in destination
      const destFileHandle = await (destDir as any).getFileHandle(targetName, { create: true });
      const writable = await destFileHandle.createWritable();
      await writable.write(file as unknown as Blob);
      await writable.close();
      // Remove original using the stored parent
      await srcParent.removeEntry((handle as any).name);
      // Update mapping to new parent and handle
      DirectoryHandleRegistry.registerParentForFile(videoId, destDir, rootKey);
      try {
        FileHandleRegistry.register(videoId, destFileHandle as FileSystemFileHandle);
      } catch (_e) {}
      return { success: true, resolvedName: targetName };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Failed to move file' };
    }
  }

  static async deleteFile(videoId: string): Promise<FsOpResult> {
    const parentInfo = DirectoryHandleRegistry.getParentForFile(videoId);
    if (!parentInfo)
      return {
        success: false,
        message: 'No directory handle for this file in the current session. Rescan first.',
      };
    const { parent } = parentInfo;
    try {
      const handle = FileHandleRegistry.get(videoId) as unknown as FileSystemFileHandle | undefined;
      if (!handle) return { success: false, message: 'No file handle available in this session.' };
      await parent.removeEntry((handle as any).name);
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Failed to delete file' };
    }
  }
}
