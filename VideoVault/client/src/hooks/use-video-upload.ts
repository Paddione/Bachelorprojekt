import { useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { VideoManagerState } from '../types/video';
import { FileScanner } from '@/services/file-scanner';
import { VideoDatabase } from '@/services/video-database';
import { FilterEngine } from '@/services/filter-engine';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { DirectoryDatabase } from '@/services/directory-database';
import { rescanLastRoot as rescanLastRootService } from '@/services/root-rescan';
import { ThumbnailGenerator } from '@/services/thumbnail-generator';
import { EnhancedFileScanner, ScanOptions } from '@/services/enhanced-file-scanner';
import { ScanState } from '@/services/scan-state-manager';

export function useVideoUpload(
  state: VideoManagerState,
  setState: Dispatch<SetStateAction<VideoManagerState>>,
  currentScanAbortRef: MutableRefObject<AbortController | null>,
  setActiveScanStates: Dispatch<SetStateAction<Map<string, ScanState>>>
) {
  const cancelScan = useCallback(() => {
    currentScanAbortRef.current?.abort();
    currentScanAbortRef.current = null;
    setState((prev) => ({ ...prev, isScanning: false }));
  }, [currentScanAbortRef, setState]);

  const scanDirectory = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.',
      );
    }

    try {
      const prevRootKey = DirectoryDatabase.getLastRootKey();
      const directoryHandle = await (
        window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker();

      const abortController = new AbortController();
      currentScanAbortRef.current = abortController;
      setState((prev) => ({
        ...prev,
        isScanning: true,
        scanProgress: { current: 0, total: 0 },
      }));

      const newVideos = await FileScanner.scanDirectory(
        directoryHandle,
        (current, total) => {
          setState((prev) => ({
            ...prev,
            scanProgress: { current, total },
          }));
        },
        abortController.signal,
      );

      const withoutPrevRoot = prevRootKey
        ? VideoDatabase.removeVideosByDirectory(state.videos, prevRootKey, '')
        : state.videos;

      const updatedVideos = VideoDatabase.addVideos(withoutPrevRoot, newVideos);
      EnhancedFilterEngine.updateSearchIndex(updatedVideos, state.videos);

      try {
        const missing = updatedVideos.filter(
          (v) => !v.thumbnail?.dataUrl || v.thumbnail.dataUrl.trim() === '',
        );
        if (missing.length > 0) {
          let latestVideos = updatedVideos;
          for (const v of missing) {
            try {
              await ThumbnailGenerator.generateProgressiveForVideo(
                v.id,
                v.filename,
                { quality: 'auto', speed: 'auto', progressive: true },
                (update) => {
                  try {
                    const thumb = update.high || update.low;
                    if (!thumb) return;
                    latestVideos = VideoDatabase.updateVideoThumbnail(latestVideos, v.id, thumb);
                    setState((prev) => ({ ...prev, videos: latestVideos }));
                  } catch {}
                },
              );
            } catch {}
          }
        }
      } catch {}

      setState((prev) => ({
        ...prev,
        videos: updatedVideos,
        isScanning: false,
        scanProgress: { current: 0, total: 0 },
      }));

      currentScanAbortRef.current = null;
      return newVideos.length;
    } catch (error) {
      setState((prev) => ({ ...prev, isScanning: false }));
      currentScanAbortRef.current = null;
      throw error;
    }
  }, [state.videos, currentScanAbortRef, setState]);

  const handleDroppedFiles = useCallback(
    async (files: FileList) => {
      const abortController = new AbortController();
      currentScanAbortRef.current = abortController;
      setState((prev) => ({
        ...prev,
        isScanning: true,
        scanProgress: { current: 0, total: 0 },
      }));

      try {
        const newVideos = await FileScanner.scanDroppedFiles(
          files,
          (current, total) => {
            setState((prev) => ({
              ...prev,
              scanProgress: { current, total },
            }));
          },
          abortController.signal,
        );

        const updatedVideos = VideoDatabase.addVideos(state.videos, newVideos);

        try {
          const missing = updatedVideos.filter(
            (v) => !v.thumbnail?.dataUrl || v.thumbnail.dataUrl.trim() === '',
          );
          if (missing.length > 0) {
            let latestVideos = updatedVideos;
            for (const v of missing) {
              try {
                await ThumbnailGenerator.generateProgressiveForVideo(
                  v.id,
                  v.filename,
                  { quality: 'auto', speed: 'auto', progressive: true },
                  (update) => {
                    try {
                      const thumb = update.high || update.low;
                      if (!thumb) return;
                      latestVideos = VideoDatabase.updateVideoThumbnail(latestVideos, v.id, thumb);
                      setState((prev) => ({ ...prev, videos: latestVideos }));
                    } catch {}
                  },
                );
              } catch {}
            }
          }
        } catch {}

        setState((prev) => ({
          ...prev,
          videos: updatedVideos,
          isScanning: false,
          scanProgress: { current: 0, total: 0 },
        }));

        currentScanAbortRef.current = null;
        return newVideos.length;
      } catch (error) {
        setState((prev) => ({ ...prev, isScanning: false }));
        currentScanAbortRef.current = null;
        throw error;
      }
    },
    [state.videos, currentScanAbortRef, setState],
  );

  const rescanLastRoot = useCallback(async () => {
    const res = await rescanLastRootService(state.videos);
    if (res.success && res.missingIds && res.missingIds.length > 0) {
      const pruned = VideoDatabase.removeVideosByIds(state.videos, res.missingIds);
      setState((prev) => ({ ...prev, videos: pruned }));
    }
    return res;
  }, [state.videos, setState]);

  const startEnhancedScan = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.',
      );
    }

    try {
      const directoryHandle = await (
        window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }
      ).showDirectoryPicker();

      const scanOptions: ScanOptions = {
        onProgress: (scanState) => {
          setActiveScanStates((prev) => new Map(prev.set(scanState.rootKey, scanState)));
          setState((prev) => ({
            ...prev,
            isScanning: scanState.status === 'scanning',
            scanProgress: {
              current: scanState.progress.current,
              total: scanState.progress.total,
            },
          }));
        },
        onFileProcessed: (filePath, video, error) => {
          if (video) {
            setState((prev) => {
              const updatedVideos = VideoDatabase.addVideo(prev.videos, video);
              EnhancedFilterEngine.addVideoToSearchIndex(video);
              return {
                ...prev,
                videos: updatedVideos,
              };
            });
          }
          if (error) {
            console.warn(`Failed to process ${filePath}:`, error);
          }
        },
        onCompleted: (scanState) => {
          setState((prev) => ({
            ...prev,
            isScanning: false,
            scanProgress: { current: 0, total: 0 },
          }));
          setActiveScanStates((prev) => {
            const updated = new Map(prev);
            updated.delete(scanState.rootKey);
            return updated;
          });
        },
        onError: (scanState, error) => {
          console.error('Enhanced scan error:', error);
          setState((prev) => ({
            ...prev,
            isScanning: false,
            scanProgress: { current: 0, total: 0 },
          }));
        },
        onPaused: () => {
          setState((prev) => ({
            ...prev,
            isScanning: false,
          }));
        },
        onResumed: () => {
          setState((prev) => ({
            ...prev,
            isScanning: true,
          }));
        },
      };

      const { rootKey, scanState } = await EnhancedFileScanner.startDirectoryScan(
        directoryHandle,
        scanOptions,
      );

      setActiveScanStates((prev) => new Map(prev.set(rootKey, scanState)));
      return { rootKey, scanState };
    } catch (error) {
      setState((prev) => ({ ...prev, isScanning: false }));
      throw error;
    }
  }, [setActiveScanStates, setState]);

  const pauseEnhancedScan = useCallback((rootKey: string) => {
    return EnhancedFileScanner.pauseScan(rootKey);
  }, []);

  const resumeEnhancedScan = useCallback(async (rootKey: string) => {
    const scanOptions: ScanOptions = {
      onProgress: (scanState) => {
        setActiveScanStates((prev) => new Map(prev.set(scanState.rootKey, scanState)));
        setState((prev) => ({
          ...prev,
          isScanning: scanState.status === 'scanning',
          scanProgress: {
            current: scanState.progress.current,
            total: scanState.progress.total,
          },
        }));
      },
      onFileProcessed: (filePath, video, error) => {
        if (video) {
          setState((prev) => {
            const updatedVideos = VideoDatabase.addVideo(prev.videos, video);
            EnhancedFilterEngine.addVideoToSearchIndex(video);
            return {
              ...prev,
              videos: updatedVideos,
            };
          });
        }
        if (error) {
          console.warn(`Failed to process ${filePath}:`, error);
        }
      },
      onCompleted: (scanState) => {
        setState((prev) => ({
          ...prev,
          isScanning: false,
          scanProgress: { current: 0, total: 0 },
        }));
        setActiveScanStates((prev) => {
          const updated = new Map(prev);
          updated.delete(scanState.rootKey);
          return updated;
        });
      },
      onError: (scanState, error) => {
        console.error('Enhanced scan error:', error);
        setState((prev) => ({
          ...prev,
          isScanning: false,
        }));
      },
      onResumed: () => {
        setState((prev) => ({
          ...prev,
          isScanning: true,
        }));
      },
    };

    const scanState = await EnhancedFileScanner.resumeScan(rootKey, scanOptions);
    if (scanState) {
      setActiveScanStates((prev) => new Map(prev.set(rootKey, scanState)));
    }
    return scanState;
  }, [setActiveScanStates, setState]);

  const cancelEnhancedScan = useCallback((rootKey: string) => {
    const success = EnhancedFileScanner.cancelScan(rootKey);
    if (success) {
      setActiveScanStates((prev) => {
        const updated = new Map(prev);
        updated.delete(rootKey);
        return updated;
      });
      setState((prev) => ({
        ...prev,
        isScanning: false,
        scanProgress: { current: 0, total: 0 },
      }));
    }
    return success;
  }, [setActiveScanStates, setState]);

  const getScanState = useCallback((rootKey: string) => {
    return EnhancedFileScanner.getScanState(rootKey);
  }, []);

  const getIncompleteScans = useCallback(() => {
    return EnhancedFileScanner.getIncompleteScans();
  }, []);

  return {
    scanDirectory,
    handleDroppedFiles,
    cancelScan,
    rescanLastRoot,
    startEnhancedScan,
    pauseEnhancedScan,
    resumeEnhancedScan,
    cancelEnhancedScan,
    getScanState,
    getIncompleteScans,
  };
}
