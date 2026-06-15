import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScanStateManager, ScanState } from './scan-state-manager';
import { Video } from '../types/video';

describe('ScanStateManager', () => {
  const mockVideo: Video = {
    id: 'v1',
    displayName: 'Test Video',
    filename: 'test.mp4',
    path: '/videos/test.mp4',
    size: 1024 * 1024,
    lastModified: new Date().toISOString(),
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    },
    customCategories: {},
    metadata: {
      duration: 60,
      width: 1920,
      height: 1080,
      bitrate: 0,
      codec: '',
      fps: 0,
      aspectRatio: '',
    },
    thumbnail: { dataUrl: '', generated: false, timestamp: '' },
    rootKey: 'root1',
  };

  const createMockScanState = (
    rootKey: string = 'root1',
    status: ScanState['status'] = 'idle',
  ): ScanState => ({
    rootKey,
    rootName: `Root ${rootKey}`,
    status,
    progress: {
      current: 0,
      total: 10,
      scannedFiles: [],
      remainingFiles: ['file1.mp4', 'file2.mp4'],
    },
    startTime: Date.now(),
    lastUpdateTime: Date.now(),
    videos: [],
  });

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('saveScanState', () => {
    it('should save a new scan state', () => {
      const scanState = createMockScanState();
      ScanStateManager.saveScanState(scanState);

      const stored = ScanStateManager.getStoredStates();
      expect(stored).toHaveLength(1);
      expect(stored[0].rootKey).toBe('root1');
    });

    it('should update existing scan state', () => {
      const scanState1 = createMockScanState('root1', 'scanning');
      const scanState2 = createMockScanState('root1', 'completed');

      ScanStateManager.saveScanState(scanState1);
      ScanStateManager.saveScanState(scanState2);

      const stored = ScanStateManager.getStoredStates();
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('completed');
    });

    it('should maintain max stored states limit', () => {
      for (let i = 0; i < 10; i++) {
        const scanState = createMockScanState(`root${i}`);
        ScanStateManager.saveScanState(scanState);
      }

      const stored = ScanStateManager.getStoredStates();
      expect(stored.length).toBeLessThanOrEqual(5);
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage full');
      });

      const scanState = createMockScanState();
      expect(() => ScanStateManager.saveScanState(scanState)).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      setItemSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('loadScanState', () => {
    it('should load existing scan state', () => {
      const scanState = createMockScanState('root1');
      ScanStateManager.saveScanState(scanState);

      const loaded = ScanStateManager.loadScanState('root1');
      expect(loaded).not.toBeNull();
      expect(loaded?.rootKey).toBe('root1');
    });

    it('should return null for non-existent scan state', () => {
      const loaded = ScanStateManager.loadScanState('nonexistent');
      expect(loaded).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage unavailable');
      });

      const loaded = ScanStateManager.loadScanState('root1');
      expect(loaded).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalled();

      getItemSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('getStoredStates', () => {
    it('should return empty array when no states stored', () => {
      const stored = ScanStateManager.getStoredStates();
      expect(stored).toEqual([]);
    });

    it('should return all stored states', () => {
      const state1 = createMockScanState('root1');
      const state2 = createMockScanState('root2');

      ScanStateManager.saveScanState(state1);
      ScanStateManager.saveScanState(state2);

      const stored = ScanStateManager.getStoredStates();
      expect(stored).toHaveLength(2);
    });

    it('should handle corrupted localStorage data', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('vv_scan_state', 'invalid json');

      const stored = ScanStateManager.getStoredStates();
      expect(stored).toEqual([]);
      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('deleteScanState', () => {
    it('should delete specific scan state', () => {
      const state1 = createMockScanState('root1');
      const state2 = createMockScanState('root2');

      ScanStateManager.saveScanState(state1);
      ScanStateManager.saveScanState(state2);

      ScanStateManager.deleteScanState('root1');

      const stored = ScanStateManager.getStoredStates();
      expect(stored).toHaveLength(1);
      expect(stored[0].rootKey).toBe('root2');
    });

    it('should handle deletion of non-existent state', () => {
      expect(() => ScanStateManager.deleteScanState('nonexistent')).not.toThrow();
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => ScanStateManager.deleteScanState('root1')).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      setItemSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('clearAllScanStates', () => {
    it('should clear all scan states', () => {
      const state1 = createMockScanState('root1');
      const state2 = createMockScanState('root2');

      ScanStateManager.saveScanState(state1);
      ScanStateManager.saveScanState(state2);

      ScanStateManager.clearAllScanStates();

      const stored = ScanStateManager.getStoredStates();
      expect(stored).toEqual([]);
    });

    it('should handle localStorage errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => ScanStateManager.clearAllScanStates()).not.toThrow();
      expect(consoleWarnSpy).toHaveBeenCalled();

      removeItemSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  describe('createInitialScanState', () => {
    it('should create initial scan state with correct properties', () => {
      const files = ['file1.mp4', 'file2.mp4', 'file3.mp4'];
      const scanState = ScanStateManager.createInitialScanState(
        'root1',
        'My Videos',
        files.length,
        files,
      );

      expect(scanState.rootKey).toBe('root1');
      expect(scanState.rootName).toBe('My Videos');
      expect(scanState.status).toBe('idle');
      expect(scanState.progress.total).toBe(3);
      expect(scanState.progress.current).toBe(0);
      expect(scanState.progress.remainingFiles).toEqual(files);
      expect(scanState.progress.scannedFiles).toEqual([]);
      expect(scanState.videos).toEqual([]);
      expect(scanState.startTime).toBeDefined();
      expect(scanState.lastUpdateTime).toBeDefined();
    });
  });

  describe('updateScanProgress', () => {
    it('should update scan status', () => {
      const scanState = createMockScanState('root1', 'idle');
      const updated = ScanStateManager.updateScanProgress(scanState, {
        status: 'scanning',
      });

      expect(updated.status).toBe('scanning');
      expect(updated.lastUpdateTime).toBeGreaterThanOrEqual(scanState.lastUpdateTime);
    });

    it('should update progress', () => {
      const scanState = createMockScanState('root1');
      const updated = ScanStateManager.updateScanProgress(scanState, {
        progress: {
          current: 5,
          currentFile: 'file5.mp4',
        },
      });

      expect(updated.progress.current).toBe(5);
      expect(updated.progress.currentFile).toBe('file5.mp4');
    });

    it('should process a file', () => {
      const scanState = createMockScanState('root1');
      scanState.progress.remainingFiles = ['file1.mp4', 'file2.mp4'];

      const updated = ScanStateManager.updateScanProgress(scanState, {
        processedFile: 'file1.mp4',
      });

      expect(updated.progress.scannedFiles).toContain('file1.mp4');
      expect(updated.progress.remainingFiles).not.toContain('file1.mp4');
      expect(updated.progress.current).toBe(1);
    });

    it('should add new video', () => {
      const scanState = createMockScanState('root1');
      const updated = ScanStateManager.updateScanProgress(scanState, {
        newVideo: mockVideo,
      });

      expect(updated.videos).toHaveLength(1);
      expect(updated.videos[0].id).toBe('v1');
    });

    it('should update error and completed state', () => {
      const scanState = createMockScanState('root1');
      const completedAt = Date.now();

      const updated = ScanStateManager.updateScanProgress(scanState, {
        status: 'error',
        error: 'Failed to read directory',
        completedAt,
      });

      expect(updated.status).toBe('error');
      expect(updated.error).toBe('Failed to read directory');
      expect(updated.completedAt).toBe(completedAt);
    });

    it('should update paused state', () => {
      const scanState = createMockScanState('root1', 'scanning');
      const pausedAt = Date.now();

      const updated = ScanStateManager.updateScanProgress(scanState, {
        status: 'paused',
        pausedAt,
      });

      expect(updated.status).toBe('paused');
      expect(updated.pausedAt).toBe(pausedAt);
    });
  });

  describe('getRecentScans', () => {
    it('should return scans within max age', () => {
      const recentState = createMockScanState('root1');
      const oldState = createMockScanState('root2');
      oldState.lastUpdateTime = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago

      ScanStateManager.saveScanState(recentState);
      ScanStateManager.saveScanState(oldState);

      const recent = ScanStateManager.getRecentScans(7 * 24 * 60 * 60 * 1000); // 7 days
      expect(recent).toHaveLength(1);
      expect(recent[0].rootKey).toBe('root1');
    });

    it('should use default max age', () => {
      const recentState = createMockScanState('root1');
      ScanStateManager.saveScanState(recentState);

      const recent = ScanStateManager.getRecentScans();
      expect(recent).toHaveLength(1);
    });
  });

  describe('getIncompleteScans', () => {
    it('should return paused scans', () => {
      const pausedState = createMockScanState('root1', 'paused');
      const completedState = createMockScanState('root2', 'completed');

      ScanStateManager.saveScanState(pausedState);
      ScanStateManager.saveScanState(completedState);

      const incomplete = ScanStateManager.getIncompleteScans();
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].status).toBe('paused');
    });

    it('should return recent scanning state', () => {
      const scanningState = createMockScanState('root1', 'scanning');
      scanningState.lastUpdateTime = Date.now() - 2 * 60 * 1000; // 2 minutes ago

      ScanStateManager.saveScanState(scanningState);

      const incomplete = ScanStateManager.getIncompleteScans();
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].status).toBe('scanning');
    });

    it('should not return stale scanning state', () => {
      const staleState = createMockScanState('root1', 'scanning');
      staleState.lastUpdateTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago (> 5 min timeout)

      ScanStateManager.saveScanState(staleState);

      const incomplete = ScanStateManager.getIncompleteScans();
      expect(incomplete).toHaveLength(0);
    });

    it('should not return completed or cancelled scans', () => {
      const completedState = createMockScanState('root1', 'completed');
      const cancelledState = createMockScanState('root2', 'cancelled');

      ScanStateManager.saveScanState(completedState);
      ScanStateManager.saveScanState(cancelledState);

      const incomplete = ScanStateManager.getIncompleteScans();
      expect(incomplete).toHaveLength(0);
    });
  });
});
