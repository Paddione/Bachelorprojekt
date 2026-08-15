import { useState, useEffect, useRef } from 'react';
import {
  VideoManagerState,
  Category,
  SortField,
  SortDirection,
  AdvancedFilters,
} from '../types/video';
import { VideoDatabase } from '@/services/video-database';
import { serverHealth } from '@/services/server-health';
import { FilterEngine } from '@/services/filter-engine';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { DirectoryDatabase } from '@/services/directory-database';
import { SortEngine } from '@/services/sort-engine';
import { ScanState } from '@/services/scan-state-manager';
import { WatchStateService } from '@/services/watch-state-service';
import { AppSettingsService } from '@/services/app-settings';

import { useVideoUpload } from './use-video-upload';
import { useVideoProcessing } from './use-video-processing';
import { useVideoPlayback } from './use-video-playback';

export type UseVideoManagerReturn = {
  state: VideoManagerState;
  activeScanStates: Map<string, ScanState>;
  useInstantSearch: boolean;
  searchSuggestions: string[];
  actions: Record<string, any>;
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

  const upload = useVideoUpload(state, setState, currentScanAbortRef, setActiveScanStates);
  const processing = useVideoProcessing(state, setState, pendingDeleteFinalizers);
  const playback = useVideoPlayback(
    state,
    setState,
    useInstantSearch,
    setUseInstantSearch,
    setSearchSuggestions,
  );

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

  useEffect(() => {
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

    void (async () => {
      if (
        !(typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') &&
        !(await serverHealth.isHealthy())
      )
        return;
      try {
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

        setState((prev) => ({
          ...prev,
          knownTags,
          availableCategories: FilterEngine.getAvailableCategories(prev.videos, knownTags),
        }));

        if (remoteVideos.length > 1000) {
          console.log(`Loading ${remoteVideos.length} videos progressively...`);
          setState((prev) => ({ ...prev, isProgressiveLoading: true }));

          const { ProgressiveLoader } = await import('@/services/progressive-loader');
          let loadedCount = 0;
          await ProgressiveLoader.loadInChunks(remoteVideos, {
            chunkSize: 500,
            onProgress: (loaded, total) => {
              console.log(`Loaded ${loaded}/${total} videos`);
            },
            onChunkLoaded: (chunk, totalLoaded) => {
              loadedCount = totalLoaded;
              setState((prev) => {
                const chunkVideos = chunk;
                const newVideos = prev.videos.concat(chunkVideos);
                const tagPool = prev.knownTags.length > 0 ? prev.knownTags : knownTags;
                return {
                  ...prev,
                  videos: newVideos,
                  filteredVideos: newVideos,
                  knownTags: tagPool,
                  isProgressiveLoading: true,
                };
              });
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
          EnhancedFilterEngine.initializeSearchIndex(remoteVideos);
          setState((prev) => ({
            ...prev,
            videos: remoteVideos,
            filteredVideos: remoteVideos,
            knownTags,
            availableCategories: FilterEngine.getAvailableCategories(remoteVideos, knownTags),
          }));
        }

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
      } catch {}
    })();
  }, []);

  useEffect(() => {
    return () => {
      pendingDeleteFinalizers.current.forEach((handle) => clearTimeout(handle));
      pendingDeleteFinalizers.current.clear();
    };
  }, []);

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

  apiRef.current.state = state;
  apiRef.current.activeScanStates = activeScanStates;
  apiRef.current.useInstantSearch = useInstantSearch;
  apiRef.current.searchSuggestions = searchSuggestions;
  apiRef.current.actions = {
    ...upload,
    ...processing,
    ...playback,
  };

  return apiRef.current;
}
