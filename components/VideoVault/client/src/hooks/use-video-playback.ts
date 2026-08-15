import { useCallback, Dispatch, SetStateAction } from 'react';
import { VideoManagerState, Video, SortField, SortDirection, AdvancedFilters } from '../types/video';
import { EnhancedFilterEngine } from '@/services/enhanced-filter-engine';
import { AppSettingsService } from '@/services/app-settings';

export function useVideoPlayback(
  state: VideoManagerState,
  setState: Dispatch<SetStateAction<VideoManagerState>>,
  useInstantSearch: boolean,
  setUseInstantSearch: Dispatch<SetStateAction<boolean>>,
  setSearchSuggestions: Dispatch<SetStateAction<string[]>>
) {
  const toggleCategoryFilter = useCallback((categoryKey: string) => {
    setState((prev) => ({
      ...prev,
      selectedCategories: prev.selectedCategories.includes(categoryKey)
        ? prev.selectedCategories.filter((c) => c !== categoryKey)
        : [...prev.selectedCategories, categoryKey],
    }));
  }, [setState]);

  const clearAllFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedCategories: [],
      searchQuery: '',
      dateRange: { startDate: '', endDate: '' },
      fileSizeRange: { min: 0, max: 0 },
      durationRange: { min: 0, max: 0 },
    }));
  }, [setState]);

  const setSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));
  }, [setState]);

  const setDateRange = useCallback((dateRange: { startDate: string; endDate: string }) => {
    setState((prev) => ({ ...prev, dateRange }));
  }, [setState]);

  const setAdvancedFilters = useCallback((advancedFilters: AdvancedFilters) => {
    setState((prev) => ({
      ...prev,
      dateRange: advancedFilters.dateRange,
      fileSizeRange: advancedFilters.fileSizeRange,
      durationRange: advancedFilters.durationRange,
    }));
  }, [setState]);

  const setCurrentVideo = useCallback((video: Video | null) => {
    setState((prev) => ({ ...prev, currentVideo: video }));
  }, [setState]);

  const pinVideo = useCallback((videoId: string) => {
    setState((prev) => ({ ...prev, pinnedVideoId: videoId }));
  }, [setState]);

  const unpinVideo = useCallback(() => {
    setState((prev) => ({ ...prev, pinnedVideoId: null }));
  }, [setState]);

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
  }, [setState]);

  const updateSearchSuggestions = useCallback((query: string) => {
    if (query.trim().length >= 1) {
      const suggestions = EnhancedFilterEngine.getSuggestions(query, { limit: 10 });
      setSearchSuggestions(suggestions);
    } else {
      setSearchSuggestions([]);
    }
  }, [setSearchSuggestions]);

  const performDetailedSearch = useCallback(
    (query: string): unknown => {
      return EnhancedFilterEngine.searchWithDetails(state.videos, query, { useInstantSearch });
    },
    [state.videos, useInstantSearch],
  );

  const toggleInstantSearch = useCallback(() => {
    setUseInstantSearch((prev) => !prev);
  }, [setUseInstantSearch]);

  const getSearchIndexStats = useCallback(() => {
    return EnhancedFilterEngine.getSearchIndexStats() as Record<string, unknown>;
  }, []);

  return {
    toggleCategoryFilter,
    clearAllFilters,
    setSearchQuery,
    setDateRange,
    setAdvancedFilters,
    setCurrentVideo,
    pinVideo,
    unpinVideo,
    setSort,
    updateSearchSuggestions,
    performDetailedSearch,
    toggleInstantSearch,
    getSearchIndexStats,
  };
}
