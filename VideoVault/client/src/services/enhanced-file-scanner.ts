import { Video } from '../types/video';
import { FileScanner } from './file-scanner';
import { ScanStateManager, ScanState, ScanSegment } from './scan-state-manager';
import { DirectoryHandleRegistry } from './directory-handle-registry';
import { DirectoryDatabase } from './directory-database';

export interface ScanOptions {
  onProgress?: (state: ScanState) => void;
  onFileProcessed?: (file: string, video: Video | null, error: string | null) => void;
  onPaused?: (state: ScanState) => void;
  onResumed?: (state: ScanState) => void;
  onCompleted?: (state: ScanState) => void;
  onError?: (state: ScanState, error: string) => void;
  segmentSize?: number; // Process files in segments for better pause/resume
}

export class EnhancedFileScanner {
  private static readonly DEFAULT_SEGMENT_SIZE = 10;
  private static activeScanControllers = new Map<string, AbortController>();
  private static scanStates = new Map<string, ScanState>();

  static async startDirectoryScan(
    directoryHandle: FileSystemDirectoryHandle,
    options: ScanOptions = {},
  ): Promise<{ rootKey: string; scanState: ScanState }> {
    const rootKey = `${(directoryHandle as any).name || 'root'}_${Date.now()}`;
    const rootName = (directoryHandle as any).name || 'Unnamed Directory';

    // Register the directory handle
    DirectoryHandleRegistry.registerRoot(rootKey, directoryHandle);

    try {
      // Discovery phase: get all video files
      const { files, directories } = await (FileScanner as any).getAllVideoFilesAndDirs(
        directoryHandle,
      );

      // Persist directory structure
      void DirectoryDatabase.setRootDirectories(rootKey, Array.from(directories), rootName);

      // Create initial scan state
      const allFilePaths = files.map((f: any) => (f as { relativePath: string }).relativePath);
      const scanState = ScanStateManager.createInitialScanState(
        rootKey,
        rootName,
        files.length,
        allFilePaths,
      );

      // Save initial state
      ScanStateManager.saveScanState(scanState);
      this.scanStates.set(rootKey, scanState);

      // Start scanning in background
      void this.processFilesInSegments(files, scanState, options);

      return { rootKey, scanState };
    } catch (error) {
      const errorState = ScanStateManager.updateScanProgress(
        ScanStateManager.createInitialScanState(rootKey, rootName, 0, []),
        { status: 'error', error: error instanceof Error ? error.message : String(error) },
      );

      ScanStateManager.saveScanState(errorState);
      options.onError?.(errorState, errorState.error!);
      throw error;
    }
  }

  static async resumeScan(rootKey: string, options: ScanOptions = {}): Promise<ScanState | null> {
    const storedState = ScanStateManager.loadScanState(rootKey);
    if (!storedState || storedState.status === 'completed') {
      return null;
    }

    // Check if directory handle is still available
    const directoryHandle = DirectoryHandleRegistry.getRoot(rootKey);
    if (!directoryHandle) {
      const errorState = ScanStateManager.updateScanProgress(storedState, {
        status: 'error',
        error: 'Directory handle no longer available. Please rescan the directory.',
      });
      ScanStateManager.saveScanState(errorState);
      return errorState;
    }

    try {
      // Rebuild file list from remaining files
      const remainingPaths = storedState.progress.remainingFiles;
      const { files } = await (FileScanner as any).getAllVideoFilesAndDirs(directoryHandle);
      const remainingFiles = files.filter((f: any) => remainingPaths.includes(f.relativePath));

      const resumedState = ScanStateManager.updateScanProgress(storedState, {
        status: 'scanning',
      });

      this.scanStates.set(rootKey, resumedState);
      ScanStateManager.saveScanState(resumedState);

      options.onResumed?.(resumedState);

      // Continue processing remaining files
      void this.processFilesInSegments(remainingFiles, resumedState, options);

      return resumedState;
    } catch (error) {
      const errorState = ScanStateManager.updateScanProgress(storedState, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });

      ScanStateManager.saveScanState(errorState);
      options.onError?.(errorState, errorState.error!);
      return errorState;
    }
  }

  static pauseScan(rootKey: string): boolean {
    const controller = this.activeScanControllers.get(rootKey);
    const scanState = this.scanStates.get(rootKey);

    if (!controller || !scanState) return false;

    // Signal pause (not abort)
    controller.abort();

    const pausedState = ScanStateManager.updateScanProgress(scanState, {
      status: 'paused',
      pausedAt: Date.now(),
    });

    this.scanStates.set(rootKey, pausedState);
    ScanStateManager.saveScanState(pausedState);

    return true;
  }

  static cancelScan(rootKey: string): boolean {
    const controller = this.activeScanControllers.get(rootKey);
    const scanState = this.scanStates.get(rootKey);

    if (controller) {
      controller.abort();
      this.activeScanControllers.delete(rootKey);
    }

    if (scanState) {
      const cancelledState = ScanStateManager.updateScanProgress(scanState, {
        status: 'cancelled',
        completedAt: Date.now(),
      });

      this.scanStates.delete(rootKey);
      ScanStateManager.saveScanState(cancelledState);
    }

    return true;
  }

  static getScanState(rootKey: string): ScanState | null {
    return this.scanStates.get(rootKey) || ScanStateManager.loadScanState(rootKey);
  }

  static getActiveScans(): Map<string, ScanState> {
    return new Map(this.scanStates);
  }

  static getIncompleteScans(): ScanState[] {
    return ScanStateManager.getIncompleteScans();
  }

  private static async processFilesInSegments(
    files: Array<{
      fileHandle: FileSystemFileHandle;
      relativePath: string;
      parentDirHandle: FileSystemDirectoryHandle;
    }>,
    initialScanState: ScanState,
    options: ScanOptions,
  ): Promise<void> {
    const segmentSize = options.segmentSize || this.DEFAULT_SEGMENT_SIZE;
    let scanState = initialScanState;

    // Create abort controller for this scan
    const abortController = new AbortController();
    this.activeScanControllers.set(scanState.rootKey, abortController);

    // Update status to scanning
    scanState = ScanStateManager.updateScanProgress(scanState, { status: 'scanning' });
    this.scanStates.set(scanState.rootKey, scanState);
    ScanStateManager.saveScanState(scanState);
    options.onProgress?.(scanState);

    try {
      // Process files in segments
      for (let i = 0; i < files.length; i += segmentSize) {
        // Check for abort/pause
        if (abortController.signal.aborted) {
          const pausedState = ScanStateManager.updateScanProgress(scanState, {
            status: 'paused',
            pausedAt: Date.now(),
          });
          this.scanStates.set(scanState.rootKey, pausedState);
          ScanStateManager.saveScanState(pausedState);
          options.onPaused?.(pausedState);
          return;
        }

        const segment = files.slice(i, Math.min(i + segmentSize, files.length));
        await this.processSegment(segment, scanState, options, abortController.signal);

        // Update state after each segment
        scanState = this.scanStates.get(scanState.rootKey)!;
        options.onProgress?.(scanState);
      }

      // Mark as completed
      const completedState = ScanStateManager.updateScanProgress(scanState, {
        status: 'completed',
        completedAt: Date.now(),
      });

      this.scanStates.set(scanState.rootKey, completedState);
      ScanStateManager.saveScanState(completedState);
      this.activeScanControllers.delete(scanState.rootKey);

      options.onCompleted?.(completedState);
    } catch (error) {
      const errorState = ScanStateManager.updateScanProgress(scanState, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });

      this.scanStates.set(scanState.rootKey, errorState);
      ScanStateManager.saveScanState(errorState);
      this.activeScanControllers.delete(scanState.rootKey);

      options.onError?.(errorState, errorState.error!);
    }
  }

  private static async processSegment(
    files: Array<{
      fileHandle: FileSystemFileHandle;
      relativePath: string;
      parentDirHandle: FileSystemDirectoryHandle;
    }>,
    scanState: ScanState,
    options: ScanOptions,
    abortSignal: AbortSignal,
  ): Promise<void> {
    const concurrency = (FileScanner as any).determineConcurrency();
    const promises: Promise<void>[] = [];
    let processIndex = 0;

    const processNext = async () => {
      const file = files[processIndex++];
      if (!file) return;

      let currentScanState = this.scanStates.get(scanState.rootKey)!;

      // Update current file being processed
      currentScanState = ScanStateManager.updateScanProgress(currentScanState, {
        progress: { currentFile: file.relativePath },
      });
      this.scanStates.set(scanState.rootKey, currentScanState);

      try {
        if (abortSignal.aborted) return;

        const fileData = await file.fileHandle.getFile();
        if (abortSignal.aborted) return;

        const video = await FileScanner.generateVideoMetadata(
          fileData,
          file.fileHandle,
          file.relativePath,
          file.parentDirHandle,
          scanState.rootKey,
        );

        if (!abortSignal.aborted) {
          // Update scan state with processed file and new video
          const updated = ScanStateManager.updateScanProgress(
            this.scanStates.get(scanState.rootKey)!,
            {
              processedFile: file.relativePath,
              newVideo: video,
            },
          );

          this.scanStates.set(scanState.rootKey, updated);
          ScanStateManager.saveScanState(updated);

          options.onFileProcessed?.(file.relativePath, video, null);
        }
      } catch (error) {
        if (!abortSignal.aborted) {
          console.warn(`Failed to process file ${file.relativePath}:`, error);

          // Update scan state with processed file (even if failed)
          const updated = ScanStateManager.updateScanProgress(
            this.scanStates.get(scanState.rootKey)!,
            {
              processedFile: file.relativePath,
            },
          );

          this.scanStates.set(scanState.rootKey, updated);
          ScanStateManager.saveScanState(updated);

          const errorMessage = error instanceof Error ? error.message : String(error);
          options.onFileProcessed?.(file.relativePath, null, errorMessage);
        }
      }
    };

    // Start initial batch of concurrent processes
    for (let i = 0; i < Math.min(concurrency, files.length); i++) {
      promises.push(processNext());
    }

    // Process remaining files as slots become available
    while (processIndex < files.length && !abortSignal.aborted) {
      await Promise.race(promises);
      // Add more work if slots are available
      while (promises.length < concurrency && processIndex < files.length && !abortSignal.aborted) {
        promises.push(processNext());
      }
    }

    // Wait for all remaining promises to complete
    if (!abortSignal.aborted) {
      await Promise.allSettled(promises);
    }
  }
}
