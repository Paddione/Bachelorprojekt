import { FileHandleRegistry } from './file-handle-registry';
import { DirectoryHandleRegistry } from './directory-handle-registry';

export interface DiskRenameResult {
  success: boolean;
  message?: string;
  code?: 'conflict' | 'not_supported' | 'permission_denied' | 'not_found';
  resolvedName?: string;
}

async function generateAvailableName(
  parent: FileSystemDirectoryHandle,
  desiredName: string,
): Promise<string> {
  const dotIdx = desiredName.lastIndexOf('.');
  const base = dotIdx > 0 ? desiredName.slice(0, dotIdx) : desiredName;
  const ext = dotIdx > 0 ? desiredName.slice(dotIdx) : '';

  for (let i = 1; i <= 50; i++) {
    const candidate = `${base} (${i})${ext}`;
    try {
      await (parent as any).getFileHandle(candidate, { create: false });
    } catch (_e) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}${ext}`;
}

export async function attemptDiskRename(
  videoId: string,
  newFilename: string,
  opts?: { overwrite?: boolean; conflictStrategy?: 'keep_both' },
): Promise<DiskRenameResult> {
  const handle = FileHandleRegistry.get(videoId) as unknown as
    | (FileSystemFileHandle & { move?: (newName: string) => Promise<void> })
    | undefined;
  if (!handle) {
    return { success: false, message: 'No file handle available in this session.' };
  }

  try {
    // If native rename is available, try it directly but detect conflicts via DirectoryHandleRegistry
    const parentInfo = DirectoryHandleRegistry.getParentForFile(videoId);
    if (!parentInfo) {
      return {
        success: false,
        message: 'No parent directory handle found. Rescan the root to reattach session handles.',
      };
    }
    const { parent } = parentInfo;
    let targetName = newFilename;

    // Check if a file with the new name already exists
    let exists = false;
    try {
      await (parent as any).getFileHandle(targetName, { create: false });
      exists = true;
    } catch (_e) {}

    if (exists) {
      if (opts?.conflictStrategy === 'keep_both') {
        targetName = await generateAvailableName(parent, targetName);
        exists = false;
      } else if (!opts?.overwrite) {
        return {
          success: false,
          message: `A file named "${newFilename}" already exists.`,
          code: 'conflict',
          resolvedName: newFilename,
        };
      }
    }

    if (exists && opts?.overwrite) {
      try {
        await (parent as any).removeEntry(targetName);
      } catch (e) {
        return {
          success: false,
          message: e instanceof Error ? e.message : 'Failed to overwrite existing file.',
          code: 'permission_denied',
        };
      }
    }

    if (handle.move && typeof handle.move === 'function') {
      await handle.move(targetName);
      return { success: true, resolvedName: targetName };
    }

    // Fallback: manual copy-then-delete within the same directory
    const file = await handle.getFile();
    const destFileHandle = await (parent as any).getFileHandle(targetName, { create: true });
    const writable = await destFileHandle.createWritable();
    await writable.write(file as unknown as Blob);
    await writable.close();

    // Remove original and replace registry handle
    await (parent as any).removeEntry((handle as any).name);
    try {
      FileHandleRegistry.register(videoId, destFileHandle as FileSystemFileHandle);
    } catch (_e) {}

    return { success: true, resolvedName: targetName };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to rename file.',
    };
  }
}
