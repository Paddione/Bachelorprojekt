import { useState, useCallback, useEffect, useRef } from 'react';
import {
  VideoManagerState,
  Video,
  Category,
  SortField,
  SortDirection,
  AdvancedFilters,
} from '../types/video';
import { FileScanner } from '@/services/file-scanner';
import { VideoDatabase } from '@/services/video-database';
import { serverHealth } from '@/services/server-health';
import { FilterEngine } from '@/services/filter-engine';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { FilterPresetsService } from '@/services/filter-presets';
import { attemptDiskRename } from '@/services/filesystem-rename';
import {
  BatchRenameOptions,
  buildBatchName,
  getFilenameWithOriginalExt,
} from '@/services/rename-engine';
import { FilesystemOps } from '@/services/filesystem-ops';
import { DirectoryDatabase } from '@/services/directory-database';
import { SortEngine } from '@/services/sort-engine';
import { rescanLastRoot as rescanLastRootService } from '@/services/root-rescan';
import { ThumbnailGenerator } from '@/services/thumbnail-generator';
import { EnhancedFileScanner, ScanOptions } from '@/services/enhanced-file-scanner';
import { ScanStateManager, ScanState } from '@/services/scan-state-manager';
import {
  type SplitVideoOptions,
  type SplitVideoResult,
} from '@/services/video-splitter';
import { selectSplitterBackend } from '@/services/video-splitter-backend';
import { LibraryMetadataService } from '@/services/library-metadata';
import { WatchStateService, type WatchStatesByRoot } from '@/services/watch-state-service';
import { AppSettingsService } from '@/services/app-settings';
import { toast, toastWithUndo } from '@/hooks/use-toast';

// Public hook return type (keeps strong typing for state used by UI)
export type UseVideoManagerReturn = {
  state: VideoManagerState;
  activeScanStates: Map<string, ScanState>;
  useInstantSearch: boolean;
  searchSuggestions: string[];
  actions: Record<string, any>;
};

const UNDO_WINDOW_MS = 8000;

const getDirectoryFromPath = (path: string): string => {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) return '';
  const dir = normalized.slice(0, idx);
  return DirectoryDatabase.normalizeDir(dir);
};

export function useVideoManager(): UseVideoManagerReturn {
  const [state, setState] = useState<VideoManagerState>({
    videos: [],
    filteredVideos: [],
    selectedCategories: [],
    searchQuery: '',
    dateRange: { startDate: '', endDate: '' },
    fileSizeRange: { min: 0, max: 0 },
    durationRange: { min: 0, max: 0 },
    isScanning: false,
    scanProgress: { current: 0, total: 0 },
    currentVideo: null,
    availableCategories: [],
    knownTags: [],
    pinnedVideoId: null,
    sort: undefined,
    isProgressiveLoading: false,
  });

  const currentScanAbortRef = useRef<AbortController | null>(null);
  const [activeScanStates, setActiveScanStates] = useState<Map<string, ScanState>>(new Map());
  const [useInstantSearch, setUseInstantSearch] = useState(true);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const pendingDeleteFinalizers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Maintain a stable API object so external references observe live state
  const apiRef = useRef<UseVideoManagerReturn | null>(null);
  if (!apiRef.current) {
    apiRef.current = {
      state,
      activeScanStates,
      useInstantSearch,
      searchSuggestions,
      actions: {},
    };
  }

  const getSimulatedFailureRate = () => {
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem('vv.simulateFail') : null;
    const n = raw ? Number(raw) : 0;
    return isNaN(n) ? 0 : Math.min(1, Math.max(0, n));
  };

  // Load data on mount (hydrate roots, then fetch from server)
  useEffect(() => {
    // Hydrate directory roots state from server in background
    void (async () => {
      try {
        await DirectoryDatabase.hydrateFromServer?.();
      } catch {}
    })();
    void (async () => {
      try {
        await WatchStateService.hydrate();
      } catch {}
    })();

    const categories: Category[] = [];
    const sort = { field: 'displayName' as SortField, direction: 'asc' as SortDirection };

    setState((prev) => ({
      ...prev,
      videos: [],
      filteredVideos: [],
      availableCategories: categories,
      sort,
    }));

    // Load from server if healthy - with progressive loading for large datasets
    void (async () => {
      if (
        !(typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') &&
        !(await serverHealth.isHealthy())
      )
        return;
      try {
        // In test environment, introduce a tiny delay so initial state is observable
        if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
          await new Promise((res) => setTimeout(res, 5));
        }

        const remoteVideos = await VideoDatabase.load();
        const remoteTags = await VideoDatabase.loadTags();
        interface RemoteTag {
          type: string;
          name: string;
          count?: number;
          url?: string;
        }
        const knownTags: Category[] = remoteTags.map((t: RemoteTag) => ({
          type: t.type === 'imported' ? 'tag' : t.type,
          value: t.name,
          count: t.count || 0,
          isCustom: true,
          url: t.url || undefined,
        }));

        // Seed known tags early so category search suggestions include them
        setState((prev) => ({
          ...prev,
          knownTags,
          availableCategories: FilterEngine.getAvailableCategories(prev.videos, knownTags),
        }));

        // For large datasets (>1000 items), use progressive loading
        if (remoteVideos.length > 1000) {
          console.log(`Loading ${remoteVideos.length} videos progressively...`);

          setState((prev) => ({ ...prev, isProgressiveLoading: true }));

          // Import progressive loader
          const { ProgressiveLoader } = await import('@/services/progressive-loader');

          // Load videos in chunks
          let loadedCount = 0;
          await ProgressiveLoader.loadInChunks(remoteVideos, {
            chunkSize: 500,
            onProgress: (loaded, total) => {
              console.log(`Loaded ${loaded}/${total} videos`);
            },
            onChunkLoaded: (chunk, totalLoaded) => {
              loadedCount = totalLoaded;

              // Update state with each chunk
              setState((prev) => {
                const chunkVideos = chunk;
                const newVideos = prev.videos.concat(chunkVideos);
                const tagPool = prev.knownTags.length > 0 ? prev.knownTags : knownTags;
                return {
                  ...prev,
                  videos: newVideos,
                  filteredVideos: newVideos,
                  knownTags: tagPool,
                  // Defer category calculation until fully loaded to avoid O(N^2) complexity
                  // availableCategories: FilterEngine.getAvailableCategories(newVideos, tagPool),
                  isProgressiveLoading: true,
                };
              });

              // Build search index progressively
              EnhancedFilterEngine.addVideosToSearchIndex(chunk);
            },
          });

          console.log(`Progressive load complete: ${loadedCount} videos`);
          setState((prev) => {
            const tagPool = prev.knownTags.length > 0 ? prev.knownTags : knownTags;
            return {
              ...prev,
              knownTags: tagPool,
              availableCategories: FilterEngine.getAvailableCategories(prev.videos, tagPool),
              isProgressiveLoading: false,
            };
          });
        } else {
          // For smaller datasets, load normally
          EnhancedFilterEngine.initializeSearchIndex(remoteVideos);

          setState((prev) => ({
            ...prev,
            videos: remoteVideos,
            filteredVideos: remoteVideos,
            knownTags,
            availableCategories: FilterEngine.getAvailableCategories(remoteVideos, knownTags),
          }));
        }

        // Hydrate sort from server (deferred)
        try {
          const remoteSort = await AppSettingsService.get<{
            field: SortField;
            direction: SortDirection;
          }>('vv.sort');
          if (
            remoteSort &&
            ['displayName', 'lastModified', 'size', 'path', 'categoryCount'].includes(
              remoteSort.field,
            ) &&
            ['asc', 'desc'].includes(remoteSort.direction)
          ) {
            setState((prev) => ({ ...prev, sort: remoteSort }));
          }
        } catch {}
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      pendingDeleteFinalizers.current.forEach((handle) => clearTimeout(handle));
      pendingDeleteFinalizers.current.clear();
    };
  }, []);

  // Update filtered videos when filters change
  useEffect(() => {
    if (state.isProgressiveLoading) return;

    const advancedFilters: AdvancedFilters = {
      dateRange: state.dateRange,
      fileSizeRange: state.fileSizeRange,
      durationRange: state.durationRange,
    };

    const filtered = EnhancedFilterEngine.applyFiltersWithSearch(
      state.videos,
      state.selectedCategories,
      state.searchQuery,
      advancedFilters,
      { useInstantSearch },
    );

    const updatedCategories = EnhancedFilterEngine.updateFilterCountsWithSearch(
      state.videos,
      state.selectedCategories,
      state.searchQuery,
      advancedFilters,
      { useInstantSearch },
      state.knownTags,
    );

    const sorted = state.sort
      ? SortEngine.sortVideos(filtered, state.sort.field, state.sort.direction)
      : filtered;

    setState((prev) => ({
      ...prev,
      filteredVideos: sorted,
      availableCategories: updatedCategories,
    }));
  }, [
    state.videos,
    state.selectedCategories,
    state.searchQuery,
    state.dateRange,
    state.fileSizeRange,
    state.durationRange,
    state.sort,
    useInstantSearch,
    state.isProgressiveLoading,
  ]);

  const cancelScan = useCallback(() => {
    currentScanAbortRef.current?.abort();
    currentScanAbortRef.current = null;
    setState((prev) => ({ ...prev, isScanning: false }));
  }, []);

  const setSort = useCallback((field: SortField, direction: SortDirection) => {
    setState((prev) => {
      const next = { ...prev, sort: { field, direction } };
      void (async () => {
        try {
          await AppSettingsService.set('vv.sort', next.sort);
        } catch {}
      })();
      return next;
    });
  }, []);

  const scanDirectory = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) {
      throw new Error(
        'File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.',
      );
    }

    try {
      // Capture previously scanned root so we can replace its dataset
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

      // If there was a previously scanned root, drop its videos to avoid stale entries
      const withoutPrevRoot = prevRootKey
        ? VideoDatabase.removeVideosByDirectory(state.videos, prevRootKey, '')
        : state.videos;

      const updatedVideos = VideoDatabase.addVideos(withoutPrevRoot, newVideos);

      // Update search index with new videos
      EnhancedFilterEngine.updateSearchIndex(updatedVideos, state.videos);

      // After scan: ensure any videos lacking thumbnails get one generated (progressive)
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
            } catch {
              // ignore failures; placeholder already shown
            }
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
  }, [state.videos]);

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

        // Ensure thumbnails for any that missed generation (progressive)
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
    [state.videos],
  );

  const rescanLastRoot = useCallback(async () => {
    const res = await rescanLastRootService(state.videos);
    if (res.success && res.missingIds && res.missingIds.length > 0) {
      const pruned = VideoDatabase.removeVideosByIds(state.videos, res.missingIds);
      setState((prev) => ({ ...prev, videos: pruned }));
    }
    return res;
  }, [state.videos]);

  const toggleCategoryFilter = useCallback((categoryKey: string) => {
    setState((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryKey)
        ? prev.selectedCategories.filter((c) => c !== categoryKey)
        : [...prev.selectedCategories, categoryKey],
    }));
  }, []);

  const clearAllFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedCategories: [],
      searchQuery: '',
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));
  }, []);

  const setDateRange = useCallback((dateRange: { startDate: string; endDate: string }) => {
    setState((prev) => ({ ...prev, dateRange }));
  }, []);

  const setAdvancedFilters = useCallback((advancedFilters: AdvancedFilters) => {
    setState((prev) => ({
      ...prev,
      dateRange: advancedFilters.dateRange,
      fileSizeRange: advancedFilters.fileSizeRange,
      durationRange: advancedFilters.durationRange,
    }));
  }, []);

  const setCurrentVideo = useCallback((video: Video | null) => {
    setState((prev) => ({ ...prev, currentVideo: video }));
  }, []);

  const pinVideo = useCallback((videoId: string) => {
    setState((prev) => ({ ...prev, pinnedVideoId: videoId }));
  }, []);

  const unpinVideo = useCallback(() => {
    setState((prev) => ({ ...prev, pinnedVideoId: null }));
  }, []);

  const applyToVisible = useCallback(
    (categoryType: string, categoryValue: string, mode: 'add' | 'remove') => {
      const targetVideos = state.filteredVideos;
      if (targetVideos.length === 0) return;

      const normalizedValue = categoryValue.trim().toLowerCase();
      const targetIds = new Set(targetVideos.map((v) => v.id));

      const updatedVideos = state.videos.map((video) => {
        if (!targetIds.has(video.id)) return video;

        const updatedVideo = { ...video };
        const currentValues = [...(updatedVideo.categories[categoryType as keyof typeof updatedVideo.categories] || [])];

        if (mode === 'add') {
          if (!currentValues.includes(normalizedValue)) {
            currentValues.push(normalizedValue);
          }
        } else {
          const idx = currentValues.indexOf(normalizedValue);
          if (idx >= 0) currentValues.splice(idx, 1);
        }

        updatedVideo.categories = {
          ...updatedVideo.categories,
          [categoryType]: currentValues,
        };
        return updatedVideo;
      });

      // Update search index for affected videos
      for (const id of targetIds) {
        const updated = updatedVideos.find((v) => v.id === id);
        if (updated) EnhancedFilterEngine.updateVideoInSearchIndex(updated);
      }

      // Persist: save locally + sync affected videos to server via updateVideoCategories
      // We save locally in one shot, then sync all affected videos
      VideoDatabase.saveToStorage(updatedVideos);
      // Trigger server sync by re-saving the affected subset
      const affectedVideos = updatedVideos.filter((v) => targetIds.has(v.id));
      void VideoDatabase.syncAllToServer(affectedVideos);
      setState((prev) => ({ ...prev, videos: updatedVideos }));
    },
    [state.videos, state.filteredVideos],
  );

  const updateVideoCategories = useCallback(
    (videoId: string, categories: Partial<{ categories: any; customCategories: any }>) => {
      const updatedVideos = VideoDatabase.updateVideoCategories(state.videos, videoId, categories);
      // Update search index with the modified video
      const updatedVideo = updatedVideos.find((v) => v.id === videoId);
      if (updatedVideo) {
        EnhancedFilterEngine.updateVideoInSearchIndex(updatedVideo);
      }
      setState((prev) => ({ ...prev, videos: updatedVideos }));
    },
    [state.videos],
  );

  const removeVideoCategory = useCallback(
    (videoId: string, categoryType: string, categoryValue: string) => {
      // Save original video for undo
      const originalVideo = state.videos.find((v) => v.id === videoId);
      if (!originalVideo) return;

      const originalVideos = state.videos;
      const updatedVideos = VideoDatabase.removeCategory(
        state.videos,
        videoId,
        categoryType,
        categoryValue,
      );

      // Update search index with the modified video
      const updatedVideo = updatedVideos.find((v) => v.id === videoId);
      if (updatedVideo) {
        EnhancedFilterEngine.updateVideoInSearchIndex(updatedVideo);
      }
      setState((prev) => ({ ...prev, videos: updatedVideos }));

      // Show undo toast
      const displayName = originalVideo.displayName || originalVideo.filename;
      const categoryLabel =
        categoryType === 'custom' ? categoryValue : `${categoryType}: ${categoryValue}`;

      toastWithUndo({
        title: 'Category removed',
        description: `Removed "${categoryLabel}" from ${displayName}`,
        undoId: `remove-category-${videoId}-${Date.now()}`,
        undoType: 'delete',
        undoDescription: 'Remove category',
        undoCallback: async () => {
          // Restore original state
          setState((prev) => ({ ...prev, videos: originalVideos }));
          EnhancedFilterEngine.updateVideoInSearchIndex(originalVideo);
        },
        timeout: 10000,
      });
    },
    [state.videos],
  );

  const exportData = useCallback(
    async (options?: { fileHandle?: FileSystemFileHandle; fileName?: string }) => {
      let presets = FilterPresetsService.loadAllPresets();
      try {
        presets = await FilterPresetsService.hydrateFromServer();
      } catch {
        // fall back to cached presets
      }

      let watchStates: WatchStatesByRoot = {};
      try {
        watchStates = await WatchStateService.ensureHydrated();
      } catch {
        watchStates = WatchStateService.getSnapshot();
      }

      return LibraryMetadataService.exportLibrary({
        videos: state.videos,
        directoryState: DirectoryDatabase.getState(),
        filterPresets: presets,
        watchStates,
        fileHandle: options?.fileHandle,
        fileName: options?.fileName,
      });
    },
    [state.videos],
  );

  const importData = useCallback(async (jsonData: string) => {
    const result = await LibraryMetadataService.importFromJson(jsonData);

    // For large datasets (>1000 items), use progressive loading
    if (result.videos.length > 1000) {
      console.log(`Importing ${result.videos.length} videos progressively...`);

      // Import progressive loader
      const { ProgressiveLoader } = await import('@/services/progressive-loader');

      // Clear existing state first
      setState((prev) => ({
        ...prev,
        videos: [],
        filteredVideos: [],
        selectedCategories: [],
        searchQuery: '',
        availableCategories: [],
        isProgressiveLoading: true,
      }));

      // Load videos in chunks
      let loadedCount = 0;
      let allVideos: Video[] = [];

      await ProgressiveLoader.loadInChunks(result.videos, {
        chunkSize: 500,
        onProgress: (loaded, total) => {
          console.log(`Imported ${loaded}/${total} videos`);
        },
        onChunkLoaded: (chunk, totalLoaded) => {
          loadedCount = totalLoaded;
          const chunkVideos = chunk;
          allVideos = allVideos.concat(chunkVideos);

          // Update state with each chunk - but defer expensive operations
          setState((prev) => ({
            ...prev,
            videos: allVideos,
            filteredVideos: allVideos,
            // Don't recalculate categories on every chunk - defer until end
            isProgressiveLoading: true,
          }));

          // Build search index progressively
          EnhancedFilterEngine.addVideosToSearchIndex(chunkVideos);
        },
      });

      // Now calculate categories once at the end
      setState((prev) => ({
        ...prev,
        availableCategories: FilterEngine.getAvailableCategories(allVideos, prev.knownTags),
        isProgressiveLoading: false,
      }));

      console.log(`Progressive import complete: ${loadedCount} videos`);
    } else {
      // For smaller datasets, import normally
      EnhancedFilterEngine.initializeSearchIndex(result.videos);

      setState((prev) => ({
        ...prev,
        videos: result.videos,
        filteredVideos: result.videos,
        selectedCategories: [],
        searchQuery: '',
        availableCategories: FilterEngine.getAvailableCategories(result.videos, state.knownTags),
      }));
    }

    return {
      videos: result.videos.length,
      presets: result.presets.length,
      roots: Object.keys(result.directoryRoots.roots || {}).length,
      watchStates: Object.values(result.watchStates || {}).reduce(
        (total, rootMap) => total + Object.keys(rootMap || {}).length,
        0,
      ),
    };
  }, []);

  const createBackup = useCallback((description?: string) => {
    VideoDatabase.createBackup(description);
  }, []);

  const saveFilterPreset = useCallback(
    (name: string) => {
      const advancedFilters: AdvancedFilters = {
        dateRange: state.dateRange,
        fileSizeRange: state.fileSizeRange,
        durationRange: state.durationRange,
      };

      FilterPresetsService.savePreset(
        name,
        state.selectedCategories,
        state.searchQuery,
        advancedFilters,
      );
    },
    [
      state.selectedCategories,
      state.searchQuery,
      state.dateRange,
      state.fileSizeRange,
      state.durationRange,
    ],
  );

  const loadFilterPreset = useCallback((name: string) => {
    const preset = FilterPresetsService.loadPreset(name);
    if (preset) {
      setState((prev) => ({
        ...prev,
        selectedCategories: preset.categories,
        searchQuery: preset.searchQuery,
        dateRange: preset.dateRange,
        fileSizeRange: preset.fileSizeRange,
        durationRange: preset.durationRange,
      }));
    }
  }, []);

  const renameVideo = useCallback(
    async (
      videoId: string,
      newBaseName: string,
      applyTo: 'displayName' | 'filename' | 'both' = 'both',
      opts?: { overwrite?: boolean; conflictStrategy?: 'keep_both' },
    ) => {
      const target = state.videos.find((v) => v.id === videoId);
      if (!target) return { success: false, message: 'Video not found' };
      const original = { displayName: target.displayName, filename: target.filename };
      const dir = getDirectoryFromPath(target.path);

      const newDisplayName = applyTo === 'filename' ? target.displayName : newBaseName;

      const newFilenameBase =
        applyTo === 'displayName' ? target.filename.replace(/\.[^./\\]+$/, '') : newBaseName;

      const requestedFilename =
        applyTo === 'displayName'
          ? target.filename
          : `${newFilenameBase}${target.filename.match(/\.[^./\\]+$/)?.[0] ?? ''}`;

      const shouldRenameFile = applyTo !== 'displayName' && requestedFilename !== target.filename;
      const disk = shouldRenameFile
        ? await attemptDiskRename(videoId, requestedFilename, opts)
        : { success: true, resolvedName: requestedFilename };
      const appliedFilename =
        applyTo === 'displayName' ? target.filename : disk.resolvedName ?? requestedFilename;
      const updatedPath = dir ? `${dir}${appliedFilename}` : target.path;

      let updatedVideos = VideoDatabase.renameVideoInDb(
        state.videos,
        videoId,
        newDisplayName,
        applyTo === 'displayName' ? undefined : appliedFilename,
      );
      if (applyTo !== 'displayName' && updatedPath) {
        updatedVideos = VideoDatabase.updateVideoPath(
          updatedVideos,
          videoId,
          updatedPath,
          target.rootKey,
        );
      }
      const renamedVideo = updatedVideos.find((v) => v.id === videoId);
      if (renamedVideo) {
        EnhancedFilterEngine.updateVideoInSearchIndex(renamedVideo);
      }
      setState((prev) => ({ ...prev, videos: updatedVideos }));

      if (disk.success) {
        const undoId = `rename-${videoId}-${Date.now()}`;
        const updatedName = renamedVideo?.displayName || newDisplayName;
        toastWithUndo({
          title: 'Renamed',
          description: `Renamed "${original.displayName}" to "${updatedName}"`,
          undoId,
          undoType: 'rename',
          undoDescription: 'Revert rename',
          timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            if (original.filename !== appliedFilename) {
              const revertDisk = await attemptDiskRename(videoId, original.filename, {
                overwrite: true,
              });
              if (!revertDisk.success) {
                throw new Error(revertDisk.message || 'Failed to revert filename on disk');
              }
            }
            setState((prev) => {
              let restored = VideoDatabase.renameVideoInDb(prev.videos, videoId, original.displayName, original.filename);
              if (dir) {
                restored = VideoDatabase.updateVideoPath(
                  restored,
                  videoId,
                  `${dir}${original.filename}`,
                  target.rootKey,
                );
              }
              const restoredVideo = restored.find((v) => v.id === videoId);
              if (restoredVideo) {
                EnhancedFilterEngine.updateVideoInSearchIndex(restoredVideo);
              }
              return { ...prev, videos: restored };
            });
          },
        });
      }
      return disk;
    },
    [state.videos],
  );

  const batchRename = useCallback(
    async (videoIds: string[], options: BatchRenameOptions) => {
      // Build rename intents and capture originals for rollback
      const intents = videoIds
        .map((id, index) => {
          const vid = state.videos.find((v) => v.id === id);
          if (!vid) return null;
          const baseName = buildBatchName(vid, index, options);
          const applyTo = options.applyTo ?? 'both';
          const newDisplayName = applyTo === 'filename' ? vid.displayName : baseName;
          const newFilename =
            applyTo === 'displayName'
              ? undefined
              : getFilenameWithOriginalExt(baseName, vid.filename);
          return {
            id,
            original: { displayName: vid.displayName, filename: vid.filename },
            next: { displayName: newDisplayName, filename: newFilename ?? vid.filename },
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        original: { displayName: string; filename: string };
        next: { displayName: string; filename: string };
      }>;

      if (intents.length === 0) return 0;

      // Optimistically update UI and search index
      let optimistic = state.videos.map((v) => {
        const intent = intents.find((i) => i.id === v.id);
        return intent
          ? { ...v, displayName: intent.next.displayName, filename: intent.next.filename }
          : v;
      });
      setState((prev) => ({ ...prev, videos: optimistic }));
      intents.forEach((i) => {
        const vid = optimistic.find((v) => v.id === i.id);
        if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
      });

      // Execute disk operations in parallel; treat failure as needing rollback
      const results = await Promise.allSettled(
        intents.map(async (i) => {
          try {
            const res = await attemptDiskRename(i.id, i.next.filename);
            const rate = getSimulatedFailureRate();
            if (rate > 0 && Math.random() < rate) {
              return { id: i.id, success: false, error: 'Simulated failure' };
            }
            if (!res.success)
              return {
                id: i.id,
                success: false,
                error: res.message || 'Rename failed',
                code: res.code,
              };
            return { id: i.id, success: true };
          } catch (e) {
            return { id: i.id, success: false, error: (e as Error)?.message || 'Rename failed' };
          }
        }),
      );

      const perItem = results.map((r, idx) =>
        r.status === 'fulfilled'
          ? { ...(r.value as any), id: intents[idx].id, requestedFilename: intents[idx].next.filename }
          : {
              id: intents[idx].id,
              success: false,
              error: (r as any).reason?.message || 'Rename failed',
              requestedFilename: intents[idx].next.filename,
            },
      );
      const failedIds = new Set(perItem.filter((r) => !r.success).map((r) => r.id));
      const succeeded = intents.filter((i) => !failedIds.has(i.id));

      // Rollback failures in UI and search index
      if (failedIds.size > 0) {
        const rolledBack = optimistic.map((v) => {
          if (!failedIds.has(v.id)) return v;
          const orig = intents.find((i) => i.id === v.id)!.original;
          return { ...v, displayName: orig.displayName, filename: orig.filename };
        });
        setState((prev) => ({ ...prev, videos: rolledBack }));
        intents.forEach((i) => {
          const vid = rolledBack.find((v) => v.id === i.id);
          if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
        });
        optimistic = rolledBack;
      }

      // Persist only successful renames to server
      if (succeeded.length > 0) {
        const payload = succeeded.map((s) => ({
          id: s.id,
          displayName: s.next.displayName,
          filename: s.next.filename,
        }));
        const updated = VideoDatabase.batchRenameInDb(optimistic, payload);
        setState((prev) => ({ ...prev, videos: updated }));

        const undoId = `batch-rename-${Date.now()}`;
        const succeededMap = new Map(succeeded.map((s) => [s.id, s]));
        const originalsForUndo = succeeded.map((s) => ({
          id: s.id,
          displayName: s.original.displayName,
          filename: s.original.filename,
        }));

        toastWithUndo({
          title: 'Batch renamed',
          description: `Renamed ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}. Undo?`,
          undoId,
          undoType: 'rename',
          undoDescription: 'Batch rename',
          timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertable = new Set<string>();
            const errors: string[] = [];

            for (const original of originalsForUndo) {
              const next = succeededMap.get(original.id)?.next;
              const nextFilename = next?.filename ?? original.filename;
              if (nextFilename !== original.filename) {
                const revert = await attemptDiskRename(original.id, original.filename);
                if (!revert.success) {
                  errors.push(original.id);
                  continue;
                }
              }
              revertable.add(original.id);
            }

            setState((prev) => {
              const payloadUndo = originalsForUndo
                .filter((o) => revertable.has(o.id))
                .map((o) => ({ id: o.id, displayName: o.displayName, filename: o.filename }));

              if (payloadUndo.length === 0) return prev;

              const restored = VideoDatabase.batchRenameInDb(prev.videos, payloadUndo);
              payloadUndo.forEach((p) => {
                const vid = restored.find((v) => v.id === p.id);
                if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
              });
              return { ...prev, videos: restored };
            });

            if (errors.length > 0) {
              throw new Error(
                `Failed to undo ${errors.length} rename${errors.length === 1 ? '' : 's'}.`,
              );
            }
          },
        });
      }

      return {
        total: intents.length,
        success: succeeded.length,
        failed: failedIds.size,
        results: perItem,
      };
    },
    [state.videos],
  );

  const batchMove = useCallback(
    async (videoIds: string[], targetRelativeDirPath: string, opts?: { overwrite?: boolean }) => {
      // Capture originals and apply optimistic path updates
      const intents = videoIds
        .map((id) => {
          const vid = state.videos.find((v) => v.id === id);
          if (!vid) return null;
          const newPath = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${vid.filename}`;
          return {
            id,
            original: { path: vid.path, rootKey: vid.rootKey },
            next: { path: newPath, rootKey: vid.rootKey },
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        original: { path: string; rootKey?: string };
        next: { path: string; rootKey?: string };
      }>;
      if (intents.length === 0) return { total: 0, success: 0, failed: 0, results: [] };

      let working = state.videos.map((v) => {
        const i = intents.find((ii) => ii.id === v.id);
        return i ? { ...v, path: i.next.path } : v;
      });
      setState((prev) => ({ ...prev, videos: working }));
      intents.forEach((i) => {
        const vid = working.find((v) => v.id === i.id);
        if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
      });

      const results = await Promise.allSettled(
        intents.map(async (i) => {
          try {
            const res = await FilesystemOps.moveFile(i.id, targetRelativeDirPath, opts);
            const rate = getSimulatedFailureRate();
            if (rate > 0 && Math.random() < rate) {
              return { id: i.id, success: false, error: 'Simulated failure' };
            }
            if (!res.success)
              return {
                id: i.id,
                success: false,
                error: res.message || 'Move failed',
                code: res.code,
              };
            return { id: i.id, success: true };
          } catch (e) {
            return { id: i.id, success: false, error: (e as Error)?.message || 'Move failed' };
          }
        }),
      );

      const perItem = results.map((r, idx) =>
        r.status === 'fulfilled'
          ? { ...(r.value as any), id: intents[idx].id }
          : {
              id: intents[idx].id,
              success: false,
              error: (r as any).reason?.message || 'Move failed',
            },
      );
      const resolvedNameMap = new Map<string, string>();
      perItem.forEach((result, idx) => {
        if (result.success && result.resolvedName) {
          resolvedNameMap.set(result.id, result.resolvedName);
          intents[idx].next.path = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${result.resolvedName}`;
        }
      });
      const failedIds = new Set(perItem.filter((r) => !r.success).map((r) => r.id));
      const succeeded = intents.filter((i) => !failedIds.has(i.id));

      if (failedIds.size > 0) {
        const rolledBack = working.map((v) => {
          if (!failedIds.has(v.id)) return v;
          const orig = intents.find((i) => i.id === v.id)!.original;
          return { ...v, path: orig.path };
        });
        setState((prev) => ({ ...prev, videos: rolledBack }));
        intents.forEach((i) => {
          const vid = rolledBack.find((v) => v.id === i.id);
          if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
        });
        working = rolledBack;
      }

      // Persist successful moves to server
      const renamePayload: Array<{ id: string; displayName: string; filename: string }> = [];
      for (const s of succeeded) {
        working = VideoDatabase.updateVideoPath(working, s.id, s.next.path, s.next.rootKey);
        const resolvedName = resolvedNameMap.get(s.id);
        if (resolvedName) {
          const vidAfterPath = working.find((v) => v.id === s.id);
          if (vidAfterPath) {
            renamePayload.push({
              id: s.id,
              displayName: vidAfterPath.displayName,
              filename: resolvedName,
            });
          }
        }
      }
      if (renamePayload.length > 0) {
        working = VideoDatabase.batchRenameInDb(working, renamePayload);
      }
      if (succeeded.length > 0) {
        succeeded.forEach((s) => {
          const vid = working.find((v) => v.id === s.id);
          if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
        });
        setState((prev) => ({ ...prev, videos: working }));

        const undoId = `batch-move-${Date.now()}`;
        toastWithUndo({
          title: 'Batch move',
          description: `Moved ${succeeded.length} item${succeeded.length === 1 ? '' : 's'}. Undo?`,
          undoId,
          undoType: 'move',
          undoDescription: 'Batch move',
          timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertedIds: string[] = [];
            const errors: string[] = [];

            for (const mv of succeeded) {
              const revertDir = getDirectoryFromPath(mv.original.path);
              const originalFileName = mv.original.path.split('/').pop();
              const revert = await FilesystemOps.moveFile(mv.id, revertDir, {
                overwrite: true,
                preferredName: originalFileName,
              });
              if (!revert.success) {
                errors.push(mv.id);
                continue;
              }
              revertedIds.push(mv.id);
            }

            setState((prev) => {
              let next = prev.videos;
              revertedIds.forEach((id) => {
                const intent = succeeded.find((s) => s.id === id);
                if (!intent) return;
                next = VideoDatabase.updateVideoPath(
                  next,
                  id,
                  intent.original.path,
                  intent.original.rootKey,
                );
                const originalFileName = intent.original.path.split('/').pop();
                if (originalFileName) {
                  const vidAfterPath = next.find((v) => v.id === id);
                  next = VideoDatabase.renameVideoInDb(
                    next,
                    id,
                    vidAfterPath?.displayName ?? originalFileName,
                    originalFileName,
                  );
                }
              });
              revertedIds.forEach((id) => {
                const vid = next.find((v) => v.id === id);
                if (vid) EnhancedFilterEngine.updateVideoInSearchIndex(vid);
              });
              return { ...prev, videos: next };
            });

            if (errors.length > 0) {
              throw new Error(
                `Failed to undo move for ${errors.length} item${errors.length === 1 ? '' : 's'}.`,
              );
            }
          },
        });
      }

      return {
        total: intents.length,
        success: succeeded.length,
        failed: failedIds.size,
        results: perItem,
      };
    },
    [state.videos],
  );

  const batchDelete = useCallback(
    async (videoIds: string[]) => {
      const idSet = new Set(videoIds);
      const originals = state.videos.filter((v) => idSet.has(v.id));
      if (originals.length === 0) return { total: 0, success: 0, failed: 0, results: [] };

      originals.forEach((v) => void EnhancedFilterEngine.removeVideoFromSearchIndex(v.id));
      const updated = VideoDatabase.removeVideosByIds(state.videos, videoIds);
      setState((prev) => ({ ...prev, videos: updated }));

      const undoId = `batch-delete-${Date.now()}`;

      const finalize = async () => {
        pendingDeleteFinalizers.current.delete(undoId);
        const results = await Promise.allSettled(
          originals.map(async (v) => FilesystemOps.deleteFile(v.id)),
        );
        const failed: Array<{ video: (typeof originals)[number]; message?: string }> = [];
        results.forEach((r, idx) => {
          if (r.status === 'fulfilled' && r.value?.success) return;
          failed.push({
            video: originals[idx],
            message: r.status === 'fulfilled' ? r.value?.message : (r as any).reason?.message,
          });
        });

        if (failed.length > 0) {
          setState((prev) => {
            const restored = VideoDatabase.addVideos(
              prev.videos,
              failed.map((f) => f.video),
            );
            failed.forEach((f) => void EnhancedFilterEngine.addVideoToSearchIndex(f.video));
            return { ...prev, videos: restored };
          });
          toast({
            title: 'Delete failed',
            description: failed[0].message || 'One or more files could not be deleted.',
            variant: 'destructive',
          });
        }
      };

      pendingDeleteFinalizers.current.set(
        undoId,
        setTimeout(() => void finalize(), UNDO_WINDOW_MS),
      );

      toastWithUndo({
        title: 'Deleted',
        description: `Deleted ${originals.length} item${originals.length === 1 ? '' : 's'}. Undo available for ${Math.floor(UNDO_WINDOW_MS / 1000)}s.`,
        variant: 'destructive',
        undoId,
        undoType: 'delete',
        undoDescription: 'Batch delete',
        timeout: UNDO_WINDOW_MS,
        undoCallback: async () => {
          const timer = pendingDeleteFinalizers.current.get(undoId);
          if (timer) {
            clearTimeout(timer);
            pendingDeleteFinalizers.current.delete(undoId);
          }
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, originals);
            originals.forEach((v) => void EnhancedFilterEngine.addVideoToSearchIndex(v));
            return { ...prev, videos: restored };
          });
        },
      });

      return {
        total: originals.length,
        success: originals.length,
        failed: 0,
        deferred: true,
        results: originals.map((v) => ({ id: v.id, success: true })),
      };
    },
    [state.videos],
  );

  const createDirectory = useCallback(async (relativeDirPath: string) => {
    const rootKey = DirectoryDatabase.getLastRootKey();
    if (!rootKey)
      return {
        success: false,
        message: 'No scanned root in this session. Scan a directory first.',
      };
    const res = await FilesystemOps.createDirectory(rootKey, relativeDirPath);
    return res;
  }, []);

  const deleteDirectory = useCallback(
    async (relativeDirPath: string) => {
      const rootKey = DirectoryDatabase.getLastRootKey();
      if (!rootKey)
        return {
          success: false,
          message: 'No scanned root in this session. Scan a directory first.',
        };
      const res = await FilesystemOps.deleteDirectory(rootKey, relativeDirPath);
      if (res.success) {
        const updated = VideoDatabase.removeVideosByDirectory(
          state.videos,
          rootKey,
          relativeDirPath,
        );
        setState((prev) => ({ ...prev, videos: updated }));
      }
      return res;
    },
    [state.videos],
  );

  const moveFileToDirectory = useCallback(
    async (
      videoId: string,
      targetRelativeDirPath: string,
      opts?: { overwrite?: boolean; conflictStrategy?: 'keep_both' },
    ) => {
      const vid = state.videos.find((v) => v.id === videoId);
      if (!vid) return { success: false, message: 'Video not found' };
      const originalPath = vid.path;
      const originalRootKey = vid.rootKey;
      const res = await FilesystemOps.moveFile(videoId, targetRelativeDirPath, opts);
      if (res.success) {
        const finalName = res.resolvedName ?? vid.filename;
        const newPath = `${DirectoryDatabase.normalizeDir(targetRelativeDirPath)}${finalName}`;
        let updated = VideoDatabase.updateVideoPath(state.videos, videoId, newPath, vid.rootKey);
        if (finalName !== vid.filename) {
          updated = VideoDatabase.renameVideoInDb(updated, videoId, vid.displayName, finalName);
        }
        const updatedVideo = updated.find((v) => v.id === videoId);
        if (updatedVideo) {
          EnhancedFilterEngine.updateVideoInSearchIndex(updatedVideo);
        }
        setState((prev) => ({ ...prev, videos: updated }));

        const undoId = `move-${videoId}-${Date.now()}`;
        toastWithUndo({
          title: 'Moved',
          description: `${vid.displayName || vid.filename} moved. Undo?`,
          undoId,
          undoType: 'move',
          undoDescription: 'Move video',
          timeout: UNDO_WINDOW_MS,
          undoCallback: async () => {
            const revertDir = getDirectoryFromPath(originalPath);
            const revert = await FilesystemOps.moveFile(videoId, revertDir, {
              overwrite: true,
              preferredName: vid.filename,
            });
            if (!revert.success) {
              throw new Error(revert.message || 'Failed to move file back to original location');
            }
            setState((prev) => {
              let restored = VideoDatabase.updateVideoPath(
                prev.videos,
                videoId,
                originalPath,
                originalRootKey,
              );
              restored = VideoDatabase.renameVideoInDb(
                restored,
                videoId,
                vid.displayName,
                vid.filename,
              );
              const restoredVideo = restored.find((v) => v.id === videoId);
              if (restoredVideo) {
                EnhancedFilterEngine.updateVideoInSearchIndex(restoredVideo);
              }
              return { ...prev, videos: restored };
            });
          },
        });
      }
      return res;
    },
    [state.videos],
  );

  const deleteFile = useCallback(
    async (videoId: string) => {
      const video = state.videos.find((v) => v.id === videoId);
      if (!video) return { success: false, message: 'Video not found' };

      EnhancedFilterEngine.removeVideoFromSearchIndex(videoId);
      const updated = VideoDatabase.removeVideo(state.videos, videoId);
      setState((prev) => ({ ...prev, videos: updated }));

      const undoId = `delete-${videoId}-${Date.now()}`;

      const finalize = async () => {
        pendingDeleteFinalizers.current.delete(undoId);
        const res = await FilesystemOps.deleteFile(videoId);
        if (!res.success) {
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, [video]);
            EnhancedFilterEngine.addVideoToSearchIndex(video);
            return { ...prev, videos: restored };
          });
          toast({
            title: 'Delete failed',
            description: res.message || 'Unable to delete file from disk.',
            variant: 'destructive',
          });
        }
      };

      pendingDeleteFinalizers.current.set(
        undoId,
        setTimeout(() => void finalize(), UNDO_WINDOW_MS),
      );

      toastWithUndo({
        title: 'Deleted',
        description: `${video.displayName || video.filename} deleted. Undo available for ${Math.floor(UNDO_WINDOW_MS / 1000)}s.`,
        variant: 'destructive',
        undoId,
        undoType: 'delete',
        undoDescription: 'Delete video',
        timeout: UNDO_WINDOW_MS,
        undoCallback: async () => {
          const timer = pendingDeleteFinalizers.current.get(undoId);
          if (timer) {
            clearTimeout(timer);
            pendingDeleteFinalizers.current.delete(undoId);
          }
          setState((prev) => {
            const restored = VideoDatabase.addVideos(prev.videos, [video]);
            EnhancedFilterEngine.addVideoToSearchIndex(video);
            return { ...prev, videos: restored };
          });
        },
      });

      return { success: true, message: 'Delete scheduled', deferred: true };
    },
    [state.videos],
  );

  const splitVideo = useCallback(
    async (videoId: string, options: SplitVideoOptions): Promise<SplitVideoResult> => {
      const source = state.videos.find((v) => v.id === videoId);
      if (!source) {
        return { success: false, message: 'Video not found' };
      }
      const result = await selectSplitterBackend(source).split(source, options);
      if (result.success) {
        setState((prev) => {
          const updated = VideoDatabase.addVideos(prev.videos, result.segments);
          result.segments.forEach((seg) => void EnhancedFilterEngine.addVideoToSearchIndex(seg));
          return { ...prev, videos: updated };
        });
      }
      return result;
    },
    [state.videos],
  );

  // Enhanced scanning methods
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
              // Update search index with the new video
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
        onPaused: (scanState) => {
          setState((prev) => ({
            ...prev,
            isScanning: false,
          }));
        },
        onResumed: (scanState) => {
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
  }, []);

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
            // Update search index with the new video
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
      onResumed: (scanState) => {
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
  }, []);

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
  }, []);

  const getScanState = useCallback((rootKey: string) => {
    return EnhancedFileScanner.getScanState(rootKey);
  }, []);

  const getIncompleteScans = useCallback(() => {
    return EnhancedFileScanner.getIncompleteScans();
  }, []);

  // Enhanced search methods
  const updateSearchSuggestions = useCallback((query: string) => {
    if (query.trim().length >= 1) {
      const suggestions = EnhancedFilterEngine.getSuggestions(query, { limit: 10 });
      setSearchSuggestions(suggestions);
    } else {
      setSearchSuggestions([]);
    }
  }, []);

  const performDetailedSearch = useCallback(
    (query: string): unknown => {
      const advancedFilters: AdvancedFilters = {
        dateRange: state.dateRange,
        fileSizeRange: state.fileSizeRange,
        durationRange: state.durationRange,
      };

      return EnhancedFilterEngine.searchWithDetails(state.videos, query, { useInstantSearch });
    },
    [state.videos, state.dateRange, state.fileSizeRange, state.durationRange, useInstantSearch],
  );

  const toggleInstantSearch = useCallback(() => {
    setUseInstantSearch((prev) => !prev);
  }, []);

  const getSearchIndexStats = useCallback(() => {
    return EnhancedFilterEngine.getSearchIndexStats() as Record<string, unknown>;
  }, []);

  // Update the stable API object with latest bindings
  apiRef.current.state = state;
  apiRef.current.activeScanStates = activeScanStates;
  apiRef.current.useInstantSearch = useInstantSearch;
  apiRef.current.searchSuggestions = searchSuggestions;
  apiRef.current.actions = {
    scanDirectory,
    handleDroppedFiles,
    toggleCategoryFilter,
    clearAllFilters,
    setSearchQuery,
    setDateRange,
    setAdvancedFilters,
    setCurrentVideo,
    updateVideoCategories,
    removeVideoCategory,
    exportData,
    importData,
    createBackup,
    saveFilterPreset,
    loadFilterPreset,
    renameVideo,
    batchRename,
    batchMove,
    batchDelete,
    createDirectory,
    deleteDirectory,
    moveFileToDirectory,
    deleteFile,
    splitVideo,
    cancelScan,
    setSort,
    rescanLastRoot,
    pinVideo,
    unpinVideo,
    applyToVisible,
    // Enhanced scanning methods
    startEnhancedScan,
    pauseEnhancedScan,
    resumeEnhancedScan,
    cancelEnhancedScan,
    getScanState,
    getIncompleteScans,
    // Enhanced search methods
    updateSearchSuggestions,
    performDetailedSearch,
    toggleInstantSearch,
    getSearchIndexStats,
  };

  return apiRef.current;
}
