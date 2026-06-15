import { Video, VideoCategories } from '../types/video';
import { CategoryExtractor } from './category-extractor';
import { VideoThumbnailService } from './video-thumbnail';
import { VideoUrlRegistry } from './video-url-registry';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';
import { ApiClient } from './api-client';
import { SpriteCache } from './sprite-cache';
import { setSpriteMeta } from './sprite-indexeddb';
import { FileHandleRegistry } from './file-handle-registry';
import { generateVideoId } from '@shared/video-id';

// Throttled thumbnail generation requests to prevent server flooding
class ThumbnailRequestQueue {
  private queue: Array<{ rootKey: string; relativePath: string }> = [];
  private processing = false;
  private pendingPaths = new Set<string>();
  private readonly maxConcurrent = 4;
  private readonly delayMs = 100;

  enqueue(rootKey: string, relativePath: string): void {
    // Deduplicate
    const key = `${rootKey}:${relativePath}`;
    if (this.pendingPaths.has(key)) return;
    this.pendingPaths.add(key);
    this.queue.push({ rootKey, relativePath });
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Process batch
      const batch = this.queue.splice(0, this.maxConcurrent);
      await Promise.allSettled(
        batch.map(({ rootKey, relativePath }) =>
          ApiClient.post('/api/thumbnails/generate', { rootKey, relativePath })
            .catch((err: any) => console.warn('Thumbnail request failed:', err.message || err))
            .finally(() => this.pendingPaths.delete(`${rootKey}:${relativePath}`)),
        ),
      );
      // Small delay between batches to avoid overwhelming server
      if (this.queue.length > 0) {
        await new Promise((r) => setTimeout(r, this.delayMs));
      }
    }

    this.processing = false;
  }
}

const thumbnailRequestQueue = new ThumbnailRequestQueue();

// O(1) extension lookup instead of array .includes()
const SUPPORTED_EXTENSIONS_SET = new Set([
  '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v',
]);

export class FileScanner {
  static async scanDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    progressCallback?: (current: number, total: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<Video[]> {
    const videos: Video[] = [];

    // Create a session root key and register it
    const rootKey = `${(directoryHandle as any).name || 'root'}_${Date.now()}${abortSignal ? `_${Math.random().toString(36).slice(2, 6)}` : ''}`;
    DirectoryHandleRegistry.registerRoot(rootKey, directoryHandle);

    const { files, directories } = await this.getAllVideoFilesAndDirs(directoryHandle);

    // Persist directory structure for this root
    await DirectoryDatabase.setRootDirectories(
      rootKey,
      Array.from(directories),
      (directoryHandle as any).name,
    );

    let current = 0;
    const total = files.length;

    // Concurrency-limited processing
    const concurrency = this.determineConcurrency();
    let nextIndex = 0;
    const inFlight = new Set<Promise<void>>();

    const launchNext = () => {
      if (abortSignal?.aborted) return;
      if (nextIndex >= files.length) return;
      const entry = files[nextIndex++];

      const p = (async () => {
        try {
          const file = await entry.fileHandle.getFile();
          if (abortSignal?.aborted) return;
          const video = await this.generateVideoMetadata(
            file,
            entry.fileHandle,
            entry.relativePath,
            entry.parentDirHandle,
            rootKey,
          );
          if (abortSignal?.aborted) return;
          videos.push(video);
        } catch (error) {
          if (abortSignal?.aborted) return;
          console.warn(`Failed to process file ${entry.fileHandle.name}:`, error);
        } finally {
          if (!abortSignal?.aborted) {
            current++;
            if (progressCallback) {
              try {
                progressCallback(current, total);
              } catch (_e) {}
            }
          }
        }
      })();

      inFlight.add(p);
      void p.finally(() => inFlight.delete(p));
    };

    for (let i = 0; i < concurrency && i < files.length; i++) {
      launchNext();
    }

    while (!abortSignal?.aborted && (nextIndex < files.length || inFlight.size > 0)) {
      if (inFlight.size === 0) break;
      await Promise.race(inFlight);
      // Top off the pool
      while (!abortSignal?.aborted && inFlight.size < concurrency && nextIndex < files.length) {
        launchNext();
      }
    }

    // If aborted, drain remaining tasks quietly without reporting progress
    if (abortSignal?.aborted && inFlight.size > 0) {
      try {
        await Promise.allSettled(Array.from(inFlight));
      } catch (_e) {}
    }

    return videos;
  }

  /**
   * Optimized directory traversal: parallelizes subdirectory iteration
   * instead of awaiting each subdirectory sequentially.
   */
  static async getAllVideoFilesAndDirs(
    directoryHandle: FileSystemDirectoryHandle,
    basePath: string = '',
  ): Promise<{
    files: Array<{
      fileHandle: FileSystemFileHandle;
      relativePath: string;
      parentDirHandle: FileSystemDirectoryHandle;
    }>;
    directories: Set<string>;
  }> {
    const files: Array<{
      fileHandle: FileSystemFileHandle;
      relativePath: string;
      parentDirHandle: FileSystemDirectoryHandle;
    }> = [];
    const directories = new Set<string>();

    // Collect entries from current directory first
    const subdirs: Array<{ handle: FileSystemDirectoryHandle; relPath: string }> = [];

    const anyDir: any = directoryHandle as any;
    if (anyDir && typeof anyDir.entries === 'function') {
      for await (const [name, handle] of anyDir.entries() as AsyncIterable<
        [string, FileSystemHandle]
      >) {
        if (handle.kind === 'file') {
          const extension = this.getFileExtension(name);
          if (SUPPORTED_EXTENSIONS_SET.has(extension)) {
            files.push({
              fileHandle: handle as FileSystemFileHandle,
              relativePath: `${basePath}${name}`,
              parentDirHandle: directoryHandle,
            });
          }
        } else if (handle.kind === 'directory') {
          const dirRelPath = `${basePath}${name}/`;
          directories.add(dirRelPath);
          subdirs.push({ handle: handle as FileSystemDirectoryHandle, relPath: dirRelPath });
        }
      }
    }

    // Process subdirectories in parallel (up to 8 concurrent)
    if (subdirs.length > 0) {
      const MAX_DIR_CONCURRENCY = 8;
      let dirIndex = 0;
      const dirInFlight = new Set<Promise<void>>();

      const launchDir = () => {
        if (dirIndex >= subdirs.length) return;
        const { handle, relPath } = subdirs[dirIndex++];

        const p = (async () => {
          const sub = await this.getAllVideoFilesAndDirs(handle, relPath);
          sub.directories.forEach((d) => directories.add(d));
          files.push(...sub.files);
        })();

        dirInFlight.add(p);
        void p.finally(() => dirInFlight.delete(p));
      };

      // Seed the pool
      for (let i = 0; i < Math.min(MAX_DIR_CONCURRENCY, subdirs.length); i++) {
        launchDir();
      }

      while (dirIndex < subdirs.length || dirInFlight.size > 0) {
        if (dirInFlight.size === 0) break;
        await Promise.race(dirInFlight);
        while (dirInFlight.size < MAX_DIR_CONCURRENCY && dirIndex < subdirs.length) {
          launchDir();
        }
      }
    }

    return { files, directories };
  }

  static async generateVideoMetadata(
    file: File,
    fileHandle: FileSystemFileHandle,
    relativePath: string,
    parentDirHandle?: FileSystemDirectoryHandle,
    rootKey?: string,
  ): Promise<Video> {
    const categories = this.extractCategoriesFromFilename(file.name);

    // Prefer external pre-generated thumbnails from the same directory or sibling 'thumbnails' folder
    let thumbnail = undefined as any;
    try {
      if (parentDirHandle) {
        thumbnail = await (VideoThumbnailService as any).tryReadExternalThumbnail?.(
          parentDirHandle,
          file.name,
        );
      }
    } catch (_e) {
      // ignore and fallback to generation
    }

    if (!thumbnail && rootKey && relativePath) {
      // Queue server-side generation (throttled to prevent flooding)
      thumbnailRequestQueue.enqueue(rootKey, relativePath);
    }

    // Defer client-side thumbnail generation: use a lightweight placeholder first,
    // then generate the real thumbnail asynchronously after scan completes.
    // This avoids blocking the scan with canvas operations per file.
    if (!thumbnail) {
      thumbnail = this.generatePlaceholderThumbnail(file.name);
      // Fire and forget: generate real thumbnail in background
      VideoThumbnailService.generateThumbnail(file).then((realThumb) => {
        // Will be picked up by ThumbnailGenerator's progressive strategy on next render
        (file as any).__vvThumb = realThumb;
      }).catch(() => {});
    }

    // Extract metadata — parallelize with ID generation
    const [metadata, id] = await Promise.all([
      VideoThumbnailService.extractVideoMetadata(file),
      generateVideoId(
        rootKey?.replace(/_\d+(_[a-z0-9]+)?$/, '') || file.name,
        relativePath || file.name,
      ),
    ]);

    // Add quality category based on detected resolution
    const quality = VideoThumbnailService.determineQuality(metadata.width, metadata.height);
    if (quality && !categories.quality.includes(quality.toLowerCase())) {
      categories.quality.push(quality.toLowerCase());
    }

    const video: Video = {
      id,
      filename: file.name,
      displayName: this.generateDisplayName(file.name),
      path: relativePath || file.name,
      size: file.size,
      lastModified: new Date(file.lastModified).toISOString(),
      categories,
      customCategories: {},
      metadata,
      thumbnail,
      rootKey,
    };

    // Create and store blob URL for playback
    VideoUrlRegistry.register(video.id, file);

    // Defer sprite loading — don't block the scan for non-critical preview data
    if (parentDirHandle) {
      void this.loadExternalSpriteAsync(video.id, parentDirHandle, file.name);
    }

    // Keep a handle reference for potential filesystem operations in this session
    try {
      // fileHandle may be a mock when files are dropped; ignore failures
      FileHandleRegistry.register(video.id, fileHandle);
      if (parentDirHandle && rootKey) {
        DirectoryHandleRegistry.registerParentForFile(video.id, parentDirHandle, rootKey);
      }
    } catch (_e) {
      // ignore
    }

    return video;
  }

  /**
   * Load external sprite sheet asynchronously — non-blocking.
   * Separated from generateVideoMetadata to avoid scan delays.
   */
  private static async loadExternalSpriteAsync(
    videoId: string,
    parentDirHandle: FileSystemDirectoryHandle,
    fileName: string,
  ): Promise<void> {
    try {
      const spriteDataUrl = await VideoThumbnailService.tryReadExternalSprite(
        parentDirHandle,
        fileName,
      );
      if (spriteDataUrl) {
        const img = new Image();
        img.src = spriteDataUrl;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });

        if (img.naturalWidth > 0) {
          const cols = Math.max(1, Math.floor(img.naturalWidth / 64));
          const frameWidth = 64;
          const frameHeight = img.naturalHeight;

          SpriteCache.set(videoId, { cols, frameWidth, frameHeight }, spriteDataUrl, 2);
          setSpriteMeta(videoId, { cols, frameWidth, frameHeight }).catch(() => {});
        }
      }
    } catch (_e) {
      // Non-critical — silently ignore sprite loading failures
    }
  }

  /**
   * Generate a lightweight SVG placeholder thumbnail.
   * Much faster than canvas-based video frame capture.
   */
  private static generatePlaceholderThumbnail(filename: string) {
    // XML-escape and truncate the label, then URI-encode the SVG to handle non-Latin chars
    const label = filename.length > 20 ? filename.slice(0, 17) + '...' : filename;
    const escaped = label.replace(/[<>&"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#1a1a2e"/><text x="160" y="95" text-anchor="middle" fill="#888" font-size="12" font-family="monospace">${escaped}</text></svg>`;
    return {
      dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`,
      generated: false,
      timestamp: new Date().toISOString(),
    };
  }

  static extractCategoriesFromFilename(filename: string): VideoCategories {
    return CategoryExtractor.extractCategories(filename);
  }


  private static generateDisplayName(filename: string): string {
    // Remove extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');

    // Replace common patterns and clean up
    return nameWithoutExt
      .replace(/[-_]/g, ' ')
      .replace(/\b\w+\./g, '') // Remove patterns like "xvideos."
      .replace(/\b(mp4|avi|mkv|mov|wmv|hd|4k|1080p|720p|480p)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private static getFileExtension(filename: string): string {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  static async scanDroppedFiles(
    files: FileList,
    progressCallback?: (current: number, total: number) => void,
    abortSignal?: AbortSignal,
  ): Promise<Video[]> {
    const videos: Video[] = [];
    const videoFiles = Array.from(files).filter((file) => {
      const extension = this.getFileExtension(file.name);
      return SUPPORTED_EXTENSIONS_SET.has(extension);
    });

    let current = 0;
    const total = videoFiles.length;

    const concurrency = this.determineConcurrency();
    let nextIndex = 0;
    const inFlight = new Set<Promise<void>>();

    const launchNext = () => {
      if (abortSignal?.aborted) return;
      if (nextIndex >= videoFiles.length) return;
      const file = videoFiles[nextIndex++];

      const p = (async () => {
        try {
          // Create a mock file handle for compatibility
          const mockHandle = {
            name: file.name,
            getFile: () => Promise.resolve(file),
          } as FileSystemFileHandle;

          const video = await this.generateVideoMetadata(file, mockHandle, file.name);
          if (abortSignal?.aborted) return;
          videos.push(video);
        } catch (error) {
          if (abortSignal?.aborted) return;
          console.warn(`Failed to process dropped file ${file.name}:`, error);
        } finally {
          if (!abortSignal?.aborted) {
            current++;
            if (progressCallback) {
              try {
                progressCallback(current, total);
              } catch (_e) {}
            }
          }
        }
      })();

      inFlight.add(p);
      void p.finally(() => inFlight.delete(p));
    };

    for (let i = 0; i < concurrency && i < videoFiles.length; i++) {
      launchNext();
    }

    while (!abortSignal?.aborted && (nextIndex < videoFiles.length || inFlight.size > 0)) {
      if (inFlight.size === 0) break;
      await Promise.race(inFlight);
      while (
        !abortSignal?.aborted &&
        inFlight.size < concurrency &&
        nextIndex < videoFiles.length
      ) {
        launchNext();
      }
    }

    if (abortSignal?.aborted && inFlight.size > 0) {
      try {
        await Promise.allSettled(Array.from(inFlight));
      } catch (_e) {}
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
