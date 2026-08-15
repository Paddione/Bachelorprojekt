import { Video, Category, AdvancedFilters } from '../types/video';
import { FilterEngine } from './filter-engine';
import { instantSearch, SearchResult, SearchOptions } from './instant-search';

export interface EnhancedSearchOptions extends SearchOptions {
  useInstantSearch?: boolean;
  fallbackToBasic?: boolean;
  minQueryLength?: number;
}

export class EnhancedFilterEngine extends FilterEngine {
  static applyFiltersWithSearch(
    videos: Video[],
    selectedCategories: string[],
    searchQuery: string = '',
    advancedFilters?: AdvancedFilters,
    searchOptions: EnhancedSearchOptions = {},
  ): Video[] {
    const {
      useInstantSearch = true,
      fallbackToBasic = true,
      minQueryLength = 2,
      ...flexSearchOptions
    } = searchOptions;

    // Use instant search if enabled and query is long enough
    if (useInstantSearch && searchQuery.trim().length >= minQueryLength) {
      try {
        return this.applyFiltersWithInstantSearch(
          videos,
          selectedCategories,
          searchQuery,
          advancedFilters,
          flexSearchOptions,
        );
      } catch (error) {
        console.warn('Instant search failed, falling back to basic search:', error);
        if (!fallbackToBasic) {
          throw error;
        }
      }
    }

    // Fall back to basic filtering
    return this.applyFilters(videos, selectedCategories, searchQuery, advancedFilters);
  }

  private static applyFiltersWithInstantSearch(
    videos: Video[],
    selectedCategories: string[],
    searchQuery: string,
    advancedFilters?: AdvancedFilters,
    flexSearchOptions: SearchOptions = {},
  ): Video[] {
    let filtered = videos;

    // Step 1: Apply instant search first if we have a query
    if (searchQuery.trim()) {
      const searchResults = instantSearch.search(searchQuery.trim(), {
        limit: videos.length, // Get all matching videos
        ...flexSearchOptions,
      });

      // Extract video IDs from search results
      const searchedVideoIds = new Set(searchResults.map((result) => result.video.id));

      // Filter to only include videos that matched the search
      filtered = filtered.filter((video) => searchedVideoIds.has(video.id));

      // Optionally sort by search relevance
      if (searchResults.length > 0) {
        const scoreMap = new Map(searchResults.map((result) => [result.video.id, result.score]));
        filtered.sort((a, b) => (scoreMap.get(b.id) || 0) - (scoreMap.get(a.id) || 0));
      }
    }

    // Step 2: Apply category filters (AND logic)
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((video) => {
        return selectedCategories.every((selectedCategory) => {
          return FilterEngine['videoHasCategory'](video, selectedCategory);
        });
      });
    }

    // Step 3: Apply advanced filters
    if (advancedFilters) {
      // Apply date range filter
      if (advancedFilters.dateRange.startDate && advancedFilters.dateRange.endDate) {
        const startDate = new Date(advancedFilters.dateRange.startDate);
        const endDate = new Date(advancedFilters.dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);

        filtered = filtered.filter((video) => {
          const videoDate = new Date(video.lastModified);
          return videoDate >= startDate && videoDate <= endDate;
        });
      }

      // Apply file size filter
      if (advancedFilters.fileSizeRange.min > 0 || advancedFilters.fileSizeRange.max > 0) {
        filtered = filtered.filter((video) => {
          const size = video.size;
          const min = advancedFilters.fileSizeRange.min;
          const max = advancedFilters.fileSizeRange.max;

          if (min > 0 && max > 0) {
            return size >= min && size <= max;
          } else if (min > 0) {
            return size >= min;
          } else if (max > 0) {
            return size <= max;
          }
          return true;
        });
      }

      // Apply duration filter
      if (advancedFilters.durationRange.min > 0 || advancedFilters.durationRange.max > 0) {
        filtered = filtered.filter((video) => {
          const duration = video.metadata?.duration || 0;
          const min = advancedFilters.durationRange.min;
          const max = advancedFilters.durationRange.max;

          if (min > 0 && max > 0) {
            return duration >= min && duration <= max;
          } else if (min > 0) {
            return duration >= min;
          } else if (max > 0) {
            return duration <= max;
          }
          return true;
        });
      }
    }

    return filtered;
  }

  // Enhanced search with detailed results
  static searchWithDetails(
    videos: Video[],
    searchQuery: string,
    options: EnhancedSearchOptions = {},
  ): { results: Video[]; searchResults: SearchResult[]; stats: any } {
    const { useInstantSearch = true, minQueryLength = 2, ...flexSearchOptions } = options;

    if (!useInstantSearch || searchQuery.trim().length < minQueryLength) {
      // Use basic search
      const basicResults = videos.filter((video) => {
        const query = searchQuery.toLowerCase().trim();
        return (
          video.displayName.toLowerCase().includes(query) ||
          video.filename.toLowerCase().includes(query) ||
          FilterEngine['searchInCategories'](video, query)
        );
      });

      return {
        results: basicResults,
        searchResults: basicResults.map((video) => ({
          video,
          score: 1,
          matchedFields: ['basic'],
        })),
        stats: instantSearch.getStats(),
      };
    }

    // Use instant search
    const searchResults = instantSearch.search(searchQuery.trim(), {
      limit: videos.length,
      ...flexSearchOptions,
    });

    return {
      results: searchResults.map((result) => result.video),
      searchResults,
      stats: instantSearch.getStats(),
    };
  }

  // Get search suggestions
  static getSuggestions(
    query: string,
    options: { limit?: number; rootKey?: string } = {},
  ): string[] {
    return instantSearch.suggest(query, options);
  }

  // Initialize the search index with videos
  static initializeSearchIndex(videos: Video[]): void {
    instantSearch.clearAll();
    instantSearch.addVideos(videos);
  }

  // Update search index when videos change
  static updateSearchIndex(videos: Video[], previousVideos: Video[] = []): void {
    // Find videos to remove
    const previousVideoIds = new Set(previousVideos.map((v) => v.id));
    const currentVideoIds = new Set(videos.map((v) => v.id));

    // Remove videos that no longer exist
    for (const prevId of Array.from(previousVideoIds)) {
      if (!currentVideoIds.has(prevId)) {
        instantSearch.removeVideo(prevId);
      }
    }

    // Add or update current videos
    for (const video of videos) {
      if (previousVideoIds.has(video.id)) {
        instantSearch.updateVideo(video);
      } else {
        instantSearch.addVideo(video);
      }
    }
  }

  // Add single video to search index
  static addVideoToSearchIndex(video: Video): void {
    instantSearch.addVideo(video);
  }

  // Add multiple videos to search index (for progressive loading)
  static addVideosToSearchIndex(videos: Video[]): void {
    instantSearch.addVideos(videos);
  }

  // Remove video from search index
  static removeVideoFromSearchIndex(videoId: string): void {
    instantSearch.removeVideo(videoId);
  }

  // Update single video in search index
  static updateVideoInSearchIndex(video: Video): void {
    instantSearch.updateVideo(video);
  }

  // Clear search index for a specific root
  static clearSearchIndexForRoot(rootKey: string): void {
    instantSearch.clearRoot(rootKey);
  }

  // Get search index statistics
  static getSearchIndexStats(): any {
    return instantSearch.getStats();
  }

  // Enhanced filter counts that consider search results
  static updateFilterCountsWithSearch(
    allVideos: Video[],
    selectedCategories: string[],
    searchQuery: string = '',
    advancedFilters?: AdvancedFilters,
    searchOptions: EnhancedSearchOptions = {},
    knownTags: Category[] = [],
  ): Category[] {
    // If we have a search query, first filter by search results
    let videosToConsider = allVideos;

    if (searchQuery.trim() && searchOptions.useInstantSearch !== false) {
      try {
        const searchResults = instantSearch.search(searchQuery.trim(), {
          limit: allVideos.length,
          ...searchOptions,
        });
        const searchedVideoIds = new Set(searchResults.map((result) => result.video.id));
        videosToConsider = allVideos.filter((video) => searchedVideoIds.has(video.id));
      } catch (error) {
        console.warn('Search failed in filter count update, using all videos:', error);
      }
    }

    // Get all possible categories from the searched videos
    const allCategories = this.getAvailableCategories(videosToConsider, knownTags);

    // For each category, calculate how many videos would remain if this category was selected
    return allCategories.map((category) => {
      const categoryKey = category.isCustom
        ? `custom:${category.type}:${category.value}`
        : `${category.type}:${category.value}`;

      // Create a test filter with this category included
      const testCategories = selectedCategories.includes(categoryKey)
        ? selectedCategories
        : [...selectedCategories, categoryKey];

      const filteredVideos = this.applyFiltersWithSearch(
        videosToConsider,
        testCategories,
        '', // Don't apply search again
        advancedFilters,
        { useInstantSearch: false }, // Use basic filtering for count calculation
      );

      return {
        ...category,
        count: filteredVideos.length,
      };
    });
  }

  // Performance monitoring for search operations
  static measureSearchPerformance<T>(
    operation: () => T,
    operationName: string = 'search',
  ): { result: T; duration: number } {
    const startTime = performance.now();
    const result = operation();
    const duration = performance.now() - startTime;

    if (duration > 100) {
      console.warn(`Slow ${operationName} operation: ${duration.toFixed(2)}ms`);
    }

    return { result, duration };
  }
}
