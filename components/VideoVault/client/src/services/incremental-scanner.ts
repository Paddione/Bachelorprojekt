import { Video } from '../types/video';
import { FileScanner } from './file-scanner';
import { ApiClient } from './api-client';
import { calculateFastHash } from './hash-utils';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';

export interface ScanStateRecord {
  id: string;
  rootKey: string;
  relativePath: string;
  fileHash: string;
  fileSize: number;
  lastModified: string;
  metadataExtracted: string;
  thumbnailGenerated: string;
  spriteGenerated: string;
  lastScannedAt: string;
}

export interface IncrementalScanResult {
  videos: Video[];
  stats: {
    total: number;
    new: number;
    modified: number;
    unchanged: number;
    deleted: number;
  };
}

export interface IncrementalScanOptions {
  progressCallback?: (current: number, total: number, status: string) => void;
  abortSignal?: AbortSignal;
  enqueueJobs?: boolean; // Whether to enqueue background jobs (default: true)
}

/**
 * Incremental Scanner Service
 *
 * Detects changes in video directories and only processes new/modified files
 * Uses fast hashing (first 64KB + last 64KB + size) for change detection
 */
export class IncrementalScanner {
  /**
   * Scan directory incrementally
   * Only processes new or modified files, skips unchanged files
   */
  static async scanDirectoryIncremental(
    directoryHandle: FileSystemDirectoryHandle,
    rootKey: string,
    options: IncrementalScanOptions = {},
  ): Promise<IncrementalScanResult> {
    const { progressCallback, abortSignal, enqueueJobs = true } = options;

    // Register root
    DirectoryHandleRegistry.registerRoot(rootKey, directoryHandle);

    try {
      // 1. Get all video files in directory
      progressCallback?.(0, 0, 'Scanning directory...');
      const { files, directories } = await FileScanner.getAllVideoFilesAndDirs(directoryHandle);

      // Persist directory structure
      await DirectoryDatabase.setRootDirectories(
        rootKey,
        Array.from(directories),
        (directoryHandle as any).name || 'root',
      );

      // 2. Fetch existing scan state from server
      progressCallback?.(0, files.length, 'Fetching scan state...');
      let existingState: ScanStateRecord[] = [];
      try {
        const response = await ApiClient.get<{ rootKey: string; count: number; records: ScanStateRecord[] }>(
          `/api/scan-state/${encodeURIComponent(rootKey)}`,
        );
        existingState = response.records || [];
      } catch (error) {
        console.warn('[IncrementalScanner] Failed to fetch scan state, treating all as new', error);
      }

      const stateMap = new Map(existingState.map((s) => [s.relativePath, s]));

      // 3. Categorize files: new, modified, unchanged
      const newFiles: typeof files = [];
      const modifiedFiles: typeof files = [];
      const unchangedFiles: typeof files = [];
      const processedPaths = new Set<string>();

      for (let i = 0; i < files.length; i++) {
        if (abortSignal?.aborted) break;

        const entry = files[i];
        const file = await entry.fileHandle.getFile();
        const relativePath = entry.relativePath;

        processedPaths.add(relativePath);
        progressCallback?.(i + 1, files.length, 'Analyzing changes...');

        const existing = stateMap.get(relativePath);

        if (!existing) {
          // New file
          newFiles.push(entry);
          continue;
        }

        // Check if file changed (size or mtime)
        const mtimeChanged = new Date(existing.lastModified).getTime() !== file.lastModified;
        const sizeChanged = Number(existing.fileSize) !== file.size;

        if (mtimeChanged || sizeChanged) {
          modifiedFiles.push(entry);
        } else {
          unchangedFiles.push(entry);
        }
      }

      // 4. Detect deleted files
      const deletedPaths = existingState
        .filter((s) => !processedPaths.has(s.relativePath))
        .map((s) => s.relativePath);

      if (deletedPaths.length > 0) {
        try {
          await ApiClient.post('/api/scan-state/delete', {
            rootKey,
            paths: deletedPaths,
          });
          console.log(`[IncrementalScanner] Deleted ${deletedPaths.length} scan state records`);
        } catch (error) {
          console.warn('[IncrementalScanner] Failed to delete scan state', error);
        }
      }

      // 5. Process new and modified files
      const toProcess = [...newFiles, ...modifiedFiles];
      const videos: Video[] = [];

      for (let i = 0; i < toProcess.length; i++) {
        if (abortSignal?.aborted) break;

        const entry = toProcess[i];
        const file = await entry.fileHandle.getFile();

        const isNew = newFiles.includes(entry);
        const status = isNew ? 'Processing new file' : 'Processing modified file';
        progressCallback?.(i + 1, toProcess.length, `${status}: ${entry.relativePath}`);

        try {
          // Calculate hash for change detection and deduplication
          const fileHash = await calculateFastHash(file);

          // Generate video metadata (without thumbnail initially - will be fetched from server)
          const video = await FileScanner.generateVideoMetadata(
            file,
            entry.fileHandle,
            entry.relativePath,
            entry.parentDirHandle,
            rootKey,
          );

          video.hashFast = fileHash;
          videos.push(video);

          // Update scan state on server
          try {
            await ApiClient.post('/api/scan-state/update', {
              rootKey,
              relativePath: entry.relativePath,
              fileHash,
              fileSize: file.size,
              lastModified: new Date(file.lastModified).toISOString(),
              metadataExtracted: false,
              thumbnailGenerated: false,
              spriteGenerated: false,
            });
          } catch (error) {
            console.warn('[IncrementalScanner] Failed to update scan state', error);
          }

          // Enqueue background jobs for metadata extraction and thumbnail generation
          if (enqueueJobs) {
            // Metadata extraction (high priority)
            try {
              await ApiClient.post('/api/jobs/enqueue', {
                type: 'metadata',
                videoId: video.id,
                rootKey,
                relativePath: entry.relativePath,
                priority: 3,
                payload: {
                  inputPath: entry.relativePath,
                  videoId: video.id,
                  rootKey,
                  relativePath: entry.relativePath,
                },
              });
            } catch (error) {
              console.warn('[IncrementalScanner] Failed to enqueue metadata job', error);
            }

            // Thumbnail generation (medium priority)
            try {
              await ApiClient.post('/api/jobs/enqueue', {
                type: 'thumbnail',
                videoId: video.id,
                rootKey,
                relativePath: entry.relativePath,
                priority: 5,
                payload: {
                  inputPath: entry.relativePath,
                  videoId: video.id,
                  fileHash,
                  rootKey,
                  relativePath: entry.relativePath,
                },
              });
            } catch (error) {
              console.warn('[IncrementalScanner] Failed to enqueue thumbnail job', error);
            }
          }
        } catch (error) {
          console.error(`[IncrementalScanner] Failed to process file: ${entry.relativePath}`, error);
        }
      }

      // 6. Load unchanged videos from database
      progressCallback?.(0, 0, 'Loading unchanged videos...');
      if (unchangedFiles.length > 0) {
        // Get video IDs from scan state (would need to store videoId in scan_state)
        // For now, we'll need to rely on the existing VideoDatabase.load() after scan
        // This is a limitation - we could enhance scan_state to include videoId
        console.log(`[IncrementalScanner] Skipped ${unchangedFiles.length} unchanged files`);
      }

      const stats = {
        total: files.length,
        new: newFiles.length,
        modified: modifiedFiles.length,
        unchanged: unchangedFiles.length,
        deleted: deletedPaths.length,
      };

      console.log('[IncrementalScanner] Scan complete', stats);

      return {
        videos,
        stats,
      };
    } catch (error) {
      console.error('[IncrementalScanner] Scan failed', error);
      throw error;
    }
  }

  /**
   * Get scan statistics for a root without scanning
   */
  static async getScanStats(rootKey: string): Promise<{
    total: number;
    metadataExtracted: number;
    thumbnailGenerated: number;
    spriteGenerated: number;
    pending: number;
  }> {
    try {
      const response = await ApiClient.get<{
        rootKey: string;
        stats: {
          total: number;
          metadataExtracted: number;
          thumbnailGenerated: number;
          spriteGenerated: number;
          pending: number;
        };
      }>(`/api/scan-state/${encodeURIComponent(rootKey)}/stats`);
      return response.stats;
    } catch (error) {
      console.warn('[IncrementalScanner] Failed to fetch stats', error);
      return {
        total: 0,
        metadataExtracted: 0,
        thumbnailGenerated: 0,
        spriteGenerated: 0,
        pending: 0,
      };
    }
  }

  /**
   * Check if a rescan is needed for a root
   * (Compares file count from FileSystem vs scan_state)
   */
  static async isRescanNeeded(
    directoryHandle: FileSystemDirectoryHandle,
    rootKey: string,
  ): Promise<boolean> {
    try {
      const { files } = await FileScanner.getAllVideoFilesAndDirs(directoryHandle);
      const stats = await this.getScanStats(rootKey);
      return files.length !== stats.total;
    } catch (error) {
      console.warn('[IncrementalScanner] Failed to check rescan status', error);
      return true; // Assume rescan needed on error
    }
  }
}
