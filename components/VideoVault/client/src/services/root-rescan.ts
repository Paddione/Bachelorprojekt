import { Video } from '@/types/video';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';
import { FileHandleRegistry } from './file-handle-registry';
import { VideoUrlRegistry } from './video-url-registry';

export interface RescanResult {
  success: boolean;
  reattached: number;
  removed?: number;
  missingIds?: string[];
  message?: string;
}

const SUPPORTED_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];

async function enumerateVideoFiles(
  rootHandle: FileSystemDirectoryHandle,
): Promise<Map<string, FileSystemFileHandle>> {
  const map = new Map<string, FileSystemFileHandle>();

  async function walk(dir: FileSystemDirectoryHandle, basePath: string) {
    const anyDir: any = dir as any;
    if (!anyDir || typeof anyDir.entries !== 'function') return;
    for await (const [name, handle] of anyDir.entries() as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind === 'file') {
        const lower = name.toLowerCase();
        const ext = lower.substring(lower.lastIndexOf('.'));
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          map.set(`${basePath}${name}`, handle as FileSystemFileHandle);
        }
      } else if (handle.kind === 'directory') {
        await walk(handle as FileSystemDirectoryHandle, `${basePath}${name}/`);
      }
    }
  }

  await walk(rootHandle, '');
  return map;
}

export async function reattachHandlesForRoot(
  rootKey: string,
  rootHandle: FileSystemDirectoryHandle,
  videos: Video[],
): Promise<{ reattached: number; missing: string[] }> {
  DirectoryHandleRegistry.registerRoot(rootKey, rootHandle);

  let reattached = 0;
  const missing: string[] = [];
  const candidates = videos.filter((v) => v.rootKey === rootKey);

  // Build a map of present files for robust detection
  let present: Map<string, FileSystemFileHandle> = new Map();
  try {
    present = await enumerateVideoFiles(rootHandle);
  } catch (_e) {
    // If enumeration fails, fall back to per-file probing below
  }

  for (const vid of candidates) {
    const existingHandle = present.get(vid.path);
    if (existingHandle) {
      try {
        try {
          FileHandleRegistry.register(vid.id, existingHandle);
        } catch (_e) {}
        try {
          const { parent } = await DirectoryHandleRegistry.getParentDirectoryForPath(
            rootKey,
            vid.path,
            false,
          );
          DirectoryHandleRegistry.registerParentForFile(vid.id, parent, rootKey);
        } catch (_e) {}
        try {
          const file = await (existingHandle as any).getFile();
          VideoUrlRegistry.register(vid.id, file);
        } catch (_e) {}
        reattached++;
        continue;
      } catch (_e) {
        // fall back to per-file probe below
      }
    }

    try {
      const { parent, name } = await DirectoryHandleRegistry.getParentDirectoryForPath(
        rootKey,
        vid.path,
        false,
      );
      const fileHandle = await (parent as any).getFileHandle(name, { create: false });
      try {
        FileHandleRegistry.register(vid.id, fileHandle as FileSystemFileHandle);
      } catch (_e) {}
      try {
        DirectoryHandleRegistry.registerParentForFile(vid.id, parent, rootKey);
      } catch (_e) {}
      try {
        const file = await fileHandle.getFile();
        VideoUrlRegistry.register(vid.id, file);
      } catch (_e) {}
      reattached++;
    } catch (_e) {
      missing.push(vid.id);
    }
  }

  return { reattached, missing };
}

export async function rescanLastRoot(videos: Video[]): Promise<RescanResult> {
  if (!('showDirectoryPicker' in window)) {
    return {
      success: false,
      reattached: 0,
      message: 'File System Access API is not supported in this browser.',
    };
  }

  const rootKey = DirectoryDatabase.getLastRootKey();
  if (!rootKey) {
    return { success: false, reattached: 0, message: 'No previously scanned root found.' };
  }

  try {
    const directoryHandle = await (window as any).showDirectoryPicker();
    const { reattached, missing } = await reattachHandlesForRoot(rootKey, directoryHandle, videos);

    // Revoke handles/URLs for missing files; actual removal from DB/state is handled by caller
    for (const id of missing) {
      try {
        FileHandleRegistry.revoke(id);
      } catch (_e) {}
      try {
        VideoUrlRegistry.revoke(id);
      } catch (_e) {}
    }

    return { success: true, reattached, removed: missing.length, missingIds: missing };
  } catch (e) {
    return {
      success: false,
      reattached: 0,
      message: e instanceof Error ? e.message : 'Rescan failed.',
    };
  }
}
