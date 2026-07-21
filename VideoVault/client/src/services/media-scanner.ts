/**
 * MediaScanner - Unified media scanning service
 * Detects media type and routes to appropriate scanner
 */

import type { MediaType, MediaScanResult, VideoWithType } from '../types/media';
import { FileScanner } from './file-scanner';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';
import {
  VIDEO_EXTENSIONS,
  ScannerStrategies,
  type DiscoveredBook,
} from './scanner-strategies';

export type MediaTypeFilter = MediaType | 'all';

export interface MediaScanProgress {
  current: number;
  total: number;
  mediaType: MediaType | null;
  phase: 'discovery' | 'processing';
}

export interface ScanOptions {
  mediaTypes?: MediaType[];
  progressCallback?: (progress: MediaScanProgress) => void;
  abortSignal?: AbortSignal;
}

interface DiscoveredEntry {
  fileHandle: FileSystemFileHandle;
  relativePath: string;
  parentDirHandle: FileSystemDirectoryHandle;
  mediaType: MediaType;
}

export class MediaScanner {
  static async scanDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    options: ScanOptions = {},
  ): Promise<MediaScanResult> {
    const { mediaTypes = ['video', 'audiobook', 'ebook'], progressCallback, abortSignal } = options;

    const result: MediaScanResult = {
      videos: [],
      audiobooks: [],
      ebooks: [],
      errors: [],
    };

    const rootKey = `${(directoryHandle as any).name || 'root'}_${Date.now()}`;
    DirectoryHandleRegistry.registerRoot(rootKey, directoryHandle);

    progressCallback?.({
      current: 0,
      total: 0,
      mediaType: null,
      phase: 'discovery',
    });

    const { entries, books, directories } = await this.discoverMedia(
      directoryHandle,
      mediaTypes,
      abortSignal,
    );

    if (abortSignal?.aborted) {
      return result;
    }

    await DirectoryDatabase.setRootDirectories(
      rootKey,
      Array.from(directories),
      (directoryHandle as any).name,
    );

    const totalItems = entries.length + books.size;

    if (mediaTypes.includes('video')) {
      const videoEntries = entries.filter((e) => e.mediaType === 'video');
      if (videoEntries.length > 0) {
        let processed = 0;
        const videos = await this.processVideoEntries(
          videoEntries,
          rootKey,
          (current) => {
            processed = current;
            progressCallback?.({
              current: processed,
              total: totalItems,
              mediaType: 'video',
              phase: 'processing',
            });
          },
          abortSignal,
        );
        result.videos = videos;
      }
    }

    if (mediaTypes.includes('audiobook')) {
      const audiobookDirs = Array.from(books.values()).filter((b) => b.mediaType === 'audiobook');
      for (const bookDir of audiobookDirs) {
        if (abortSignal?.aborted) break;
        try {
          const audiobook = await ScannerStrategies.processAudiobookDirectory(bookDir, rootKey);
          if (audiobook) {
            result.audiobooks.push(audiobook);
          }
        } catch (error) {
          result.errors.push({
            path: bookDir.path,
            error: error instanceof Error ? error.message : String(error),
            mediaType: 'audiobook',
          });
        }
      }
    }

    if (mediaTypes.includes('ebook')) {
      const ebookDirs = Array.from(books.values()).filter((b) => b.mediaType === 'ebook');
      for (const bookDir of ebookDirs) {
        if (abortSignal?.aborted) break;
        try {
          const ebook = await ScannerStrategies.processEbookDirectory(bookDir, rootKey);
          if (ebook) {
            result.ebooks.push(ebook);
          }
        } catch (error) {
          result.errors.push({
            path: bookDir.path,
            error: error instanceof Error ? error.message : String(error),
            mediaType: 'ebook',
          });
        }
      }
    }

    return result;
  }

  private static async discoverMedia(
    directoryHandle: FileSystemDirectoryHandle,
    mediaTypes: MediaType[],
    abortSignal?: AbortSignal,
    basePath: string = '',
  ): Promise<{
    entries: DiscoveredEntry[];
    books: Map<string, DiscoveredBook>;
    directories: Set<string>;
  }> {
    const entries: DiscoveredEntry[] = [];
    const books = new Map<string, DiscoveredBook>();
    const directories = new Set<string>();

    const currentDirFiles = new Map<string, FileSystemFileHandle>();
    const subdirs: Array<{
      handle: FileSystemDirectoryHandle;
      path: string;
    }> = [];

    const anyDir = directoryHandle as any;
    if (anyDir && typeof anyDir.entries === 'function') {
      for await (const [name, handle] of anyDir.entries() as AsyncIterable<
        [string, FileSystemHandle]
      >) {
        if (abortSignal?.aborted) break;

        if (handle.kind === 'file') {
          currentDirFiles.set(name, handle as FileSystemFileHandle);
          const ext = ScannerStrategies.getFileExtension(name);

          if (VIDEO_EXTENSIONS.includes(ext) && mediaTypes.includes('video')) {
            entries.push({
              fileHandle: handle as FileSystemFileHandle,
              relativePath: `${basePath}${name}`,
              parentDirHandle: directoryHandle,
              mediaType: 'video',
            });
          }
        } else if (handle.kind === 'directory') {
          const dirPath = `${basePath}${name}/`;
          directories.add(dirPath);
          subdirs.push({
            handle: handle as FileSystemDirectoryHandle,
            path: dirPath,
          });
        }
      }
    }

    for (const subdir of subdirs) {
      if (abortSignal?.aborted) break;

      const bookType = await ScannerStrategies.detectBookDirectory(subdir.handle, mediaTypes);

      if (bookType) {
        const bookFiles = await ScannerStrategies.collectBookFiles(subdir.handle);
        books.set(subdir.path, {
          path: subdir.path,
          parentDirHandle: subdir.handle,
          files: bookFiles,
          mediaType: bookType,
        });
      } else {
        const sub = await this.discoverMedia(subdir.handle, mediaTypes, abortSignal, subdir.path);
        sub.entries.forEach((e) => entries.push(e));
        sub.books.forEach((b, k) => books.set(k, b));
        sub.directories.forEach((d) => directories.add(d));
      }
    }

    return { entries, books, directories };
  }

  private static async processVideoEntries(
    entries: DiscoveredEntry[],
    rootKey: string,
    progressCallback?: (current: number, total: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<VideoWithType[]> {
    const videos: VideoWithType[] = [];
    let current = 0;
    const total = entries.length;

    const concurrency = this.determineConcurrency();
    let nextIndex = 0;
    const inFlight = new Set<Promise<void>>();

    const launchNext = () => {
      if (abortSignal?.aborted) return;
      if (nextIndex >= entries.length) return;
      const entry = entries[nextIndex++];

      const p = (async () => {
        try {
          const file = await entry.fileHandle.getFile();
          if (abortSignal?.aborted) return;

          const video = await FileScanner.generateVideoMetadata(
            file,
            entry.fileHandle,
            entry.relativePath,
            entry.parentDirHandle,
            rootKey,
          );

          if (abortSignal?.aborted) return;

          const videoWithType: VideoWithType = {
            ...video,
            type: 'video',
          };
          videos.push(videoWithType);
        } catch (error) {
          if (abortSignal?.aborted) return;
          console.warn(`Failed to process video ${entry.fileHandle.name}:`, error);
        } finally {
          if (!abortSignal?.aborted) {
            current++;
            progressCallback?.(current, total);
          }
        }
      })();

      inFlight.add(p);
      void p.finally(() => inFlight.delete(p));
    };

    for (let i = 0; i < concurrency && i < entries.length; i++) {
      launchNext();
    }

    while (!abortSignal?.aborted && (nextIndex < entries.length || inFlight.size > 0)) {
      if (inFlight.size === 0) break;
      await Promise.race(inFlight);
      while (!abortSignal?.aborted && inFlight.size < concurrency && nextIndex < entries.length) {
        launchNext();
      }
    }

    if (abortSignal?.aborted && inFlight.size > 0) {
      await Promise.allSettled(Array.from(inFlight));
    }

    return videos;
  }

  private static determineConcurrency(): number {
    try {
      const hc = typeof navigator !== 'undefined' ? (navigator as any).hardwareConcurrency : 4;
      const suggested = Math.max(2, Math.floor((hc || 4) / 2));
      return Math.min(6, suggested);
    } catch (_e) {
      return 4;
    }
  }
}
