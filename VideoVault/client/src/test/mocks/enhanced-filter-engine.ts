import { FilterEngine } from '@/services/filter-engine';

export const EnhancedFilterEngine = {
  applyFiltersWithSearch: (
    videos: any[],
    selectedCategories: string[],
    searchQuery: string = '',
    advancedFilters?: any,
  ) => FilterEngine.applyFilters(videos, selectedCategories, searchQuery, advancedFilters),

  updateFilterCountsWithSearch: (
    videos: any[],
    selectedCategories: string[],
    searchQuery: string = '',
    advancedFilters?: any,
  ) => FilterEngine.updateFilterCounts(videos, selectedCategories, searchQuery, advancedFilters),

  getSuggestions: (_q: string) => [] as string[],
  initializeSearchIndex: (_videos: any[]) => {},
  searchWithDetails: (videos: any[], query: string) => ({
    results: FilterEngine.applyFilters(videos, [], query),
    searchResults: [] as any[],
    stats: {},
  }),
};

