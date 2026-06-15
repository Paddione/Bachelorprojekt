import { Video } from '../types/video';

export interface ScanState {
  rootKey: string;
  rootName: string;
  status: 'idle' | 'scanning' | 'paused' | 'completed' | 'cancelled' | 'error';
  progress: {
    current: number;
    total: number;
    currentFile?: string;
    scannedFiles: string[];
    remainingFiles: string[];
  };
  error?: string;
  startTime: number;
  lastUpdateTime: number;
  pausedAt?: number;
  completedAt?: number;
  videos: Video[];
}

export interface ScanSegment {
  files: Array<{
    fileHandle: FileSystemFileHandle;
    relativePath: string;
    parentDirHandle: FileSystemDirectoryHandle;
  }>;
  startIndex: number;
  processed: boolean;
}

export class ScanStateManager {
  private static readonly STORAGE_KEY = 'vv_scan_state';
  private static readonly MAX_STORED_STATES = 5;

  static saveScanState(scanState: ScanState): void {
    try {
      const stored = this.getStoredStates();
      const existing = stored.findIndex((s) => s.rootKey === scanState.rootKey);

      if (existing >= 0) {
        stored[existing] = scanState;
      } else {
        stored.unshift(scanState);
        if (stored.length > this.MAX_STORED_STATES) {
          stored.splice(this.MAX_STORED_STATES);
        }
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stored));
    } catch (error) {
      console.warn('Failed to save scan state:', error);
    }
  }

  static loadScanState(rootKey: string): ScanState | null {
    try {
      const stored = this.getStoredStates();
      return stored.find((s) => s.rootKey === rootKey) || null;
    } catch (error) {
      console.warn('Failed to load scan state:', error);
      return null;
    }
  }

  static getStoredStates(): ScanState[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored) as unknown;
      return Array.isArray(parsed) ? (parsed as ScanState[]) : [];
    } catch (error) {
      console.warn('Failed to parse stored scan states:', error);
      return [];
    }
  }

  static deleteScanState(rootKey: string): void {
    try {
      const stored = this.getStoredStates();
      const filtered = stored.filter((s) => s.rootKey !== rootKey);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.warn('Failed to delete scan state:', error);
    }
  }

  static clearAllScanStates(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear scan states:', error);
    }
  }

  static createInitialScanState(
    rootKey: string,
    rootName: string,
    totalFiles: number,
    allFiles: string[],
  ): ScanState {
    return {
      rootKey,
      rootName,
      status: 'idle',
      progress: {
        current: 0,
        total: totalFiles,
        scannedFiles: [],
        remainingFiles: [...allFiles],
      },
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      videos: [],
    };
  }

  static updateScanProgress(
    scanState: ScanState,
    updates: Partial<Pick<ScanState, 'status' | 'error' | 'pausedAt' | 'completedAt'>> & {
      currentFile?: string;
      processedFile?: string;
      newVideo?: Video;
      progress?: Partial<ScanState['progress']>;
    },
  ): ScanState {
    const updated = {
      ...scanState,
      status: updates.status ?? scanState.status,
      error: updates.error ?? scanState.error,
      pausedAt: updates.pausedAt ?? scanState.pausedAt,
      completedAt: updates.completedAt ?? scanState.completedAt,
      lastUpdateTime: Date.now(),
    };

    if (updates.progress) {
      updated.progress = {
        current: updates.progress.current ?? scanState.progress.current,
        total: updates.progress.total ?? scanState.progress.total,
        scannedFiles: updates.progress.scannedFiles ?? scanState.progress.scannedFiles,
        remainingFiles: updates.progress.remainingFiles ?? scanState.progress.remainingFiles,
        currentFile: updates.progress.currentFile ?? scanState.progress.currentFile,
      };
    }

    if (updates.processedFile) {
      updated.progress.scannedFiles = [
        ...(updated.progress.scannedFiles || []),
        updates.processedFile,
      ];
      updated.progress.remainingFiles = (updated.progress.remainingFiles || []).filter(
        (f) => f !== updates.processedFile,
      );
      updated.progress.current = updated.progress.scannedFiles.length;
    }

    if (updates.newVideo) {
      updated.videos.push(updates.newVideo);
    }

    return updated;
  }

  static getRecentScans(maxAge: number = 7 * 24 * 60 * 60 * 1000): ScanState[] {
    const stored = this.getStoredStates();
    const now = Date.now();
    return stored.filter((s) => now - s.lastUpdateTime <= maxAge);
  }

  static getIncompleteScans(): ScanState[] {
    const stored = this.getStoredStates();
    return stored.filter(
      (s) =>
        s.status === 'paused' ||
        (s.status === 'scanning' && Date.now() - s.lastUpdateTime < 5 * 60 * 1000), // 5 min timeout
    );
  }
}
