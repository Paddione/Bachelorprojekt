import { useCallback } from 'react';
import type { Video, AdvancedFilters } from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { FilterEngine } from '@/services/filter-engine';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { FilterPresetsService } from '@/services/filter-presets';
import { LibraryMetadataService } from '@/services/library-metadata';
import { WatchStateService, type WatchStatesByRoot } from '@/services/watch-state-service';
import { DirectoryDatabase } from '@/services/directory-database';
import type { VideoManagerState } from '../types/video';

export function useLibraryIo(
  state: VideoManagerState,
  setState: React.Dispatch<React.SetStateAction<VideoManagerState>>,
) {
  const exportData = useCallback(
    async (options?: { fileHandle?: FileSystemFileHandle; fileName?: string }) => {
      let presets = FilterPresetsService.loadAllPresets();
      try { presets = await FilterPresetsService.hydrateFromServer(); } catch {}
      let watchStates: WatchStatesByRoot = {};
      try { watchStates = await WatchStateService.ensureHydrated(); } catch { watchStates = WatchStateService.getSnapshot(); }
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
    if (result.videos.length > 1000) {
      const { ProgressiveLoader } = await import('@/services/progressive-loader');
      setState((prev) => ({
        ...prev, videos: [], filteredVideos: [], selectedCategories: [],
        searchQuery: '', availableCategories: [], isProgressiveLoading: true,
      }));
      let allVideos: Video[] = [];
      await ProgressiveLoader.loadInChunks(result.videos, {
        chunkSize: 500,
        onProgress: (loaded, total) => { console.log(`Imported ${loaded}/${total} videos`); },
        onChunkLoaded: (chunk) => {
          allVideos = allVideos.concat(chunk);
          setState((prev) => ({ ...prev, videos: allVideos, filteredVideos: allVideos, isProgressiveLoading: true }));
          EnhancedFilterEngine.addVideosToSearchIndex(chunk);
        },
      });
      setState((prev) => ({
        ...prev,
        availableCategories: FilterEngine.getAvailableCategories(allVideos, prev.knownTags),
        isProgressiveLoading: false,
      }));
    } else {
      EnhancedFilterEngine.initializeSearchIndex(result.videos);
      setState((prev) => ({
        ...prev, videos: result.videos, filteredVideos: result.videos, selectedCategories: [],
        searchQuery: '', availableCategories: FilterEngine.getAvailableCategories(result.videos, state.knownTags),
      }));
    }
    return {
      videos: result.videos.length, presets: result.presets.length,
      roots: Object.keys(result.directoryRoots.roots || {}).length,
      watchStates: Object.values(result.watchStates || {}).reduce(
        (total, rootMap) => total + Object.keys(rootMap || {}).length, 0,
      ),
    };
  }, [state.knownTags, setState]);

  const createBackup = useCallback((description?: string) => {
    VideoDatabase.createBackup(description);
  }, []);

  const saveFilterPreset = useCallback(
    (name: string) => {
      const advancedFilters: AdvancedFilters = {
        dateRange: state.dateRange, fileSizeRange: state.fileSizeRange, durationRange: state.durationRange,
      };
      FilterPresetsService.savePreset(name, state.selectedCategories, state.searchQuery, advancedFilters);
    },
    [state.selectedCategories, state.searchQuery, state.dateRange, state.fileSizeRange, state.durationRange],
  );

  const loadFilterPreset = useCallback((name: string) => {
    const preset = FilterPresetsService.loadPreset(name);
    if (preset) {
      setState((prev) => ({
        ...prev, selectedCategories: preset.categories, searchQuery: preset.searchQuery,
        dateRange: preset.dateRange, fileSizeRange: preset.fileSizeRange, durationRange: preset.durationRange,
      }));
    }
  }, [setState]);

  return { exportData, importData, createBackup, saveFilterPreset, loadFilterPreset };
}
