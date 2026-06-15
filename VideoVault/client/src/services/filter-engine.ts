import { Video, Category, AdvancedFilters } from '../types/video';

export class FilterEngine {
  static applyFilters(
    videos: Video[],
    selectedCategories: string[],
    searchQuery: string = '',
    advancedFilters?: AdvancedFilters,
  ): Video[] {
    let filtered = videos;

    // Apply category filters (AND logic)
    if (selectedCategories.length > 0) {
      filtered = filtered.filter((video) => {
        return selectedCategories.every((selectedCategory) => {
          return this.videoHasCategory(video, selectedCategory);
        });
      });
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((video) => {
        return (
          video.displayName.toLowerCase().includes(query) ||
          video.filename.toLowerCase().includes(query) ||
          this.searchInCategories(video, query)
        );
      });
    }

    // Apply advanced filters
    if (advancedFilters) {
      // Apply date range filter
      if (advancedFilters.dateRange.startDate && advancedFilters.dateRange.endDate) {
        const startDate = new Date(advancedFilters.dateRange.startDate);
        const endDate = new Date(advancedFilters.dateRange.endDate);
        endDate.setHours(23, 59, 59, 999); // Include the entire end date

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

  private static videoHasCategory(video: Video, categoryString: string): boolean {
    const [type, ...valueParts] = categoryString.split(':');
    const value = valueParts.join(':');

    if (type === 'custom') {
      const [customType, customValue] = valueParts;
      return video.customCategories[customType]?.includes(customValue) || false;
    }

    const categoryArray = video.categories[type as keyof typeof video.categories];

    // "unassigned" matches videos with no values for this category type
    if (value === 'unassigned') {
      return !Array.isArray(categoryArray) || categoryArray.length === 0;
    }

    return Array.isArray(categoryArray) && categoryArray.includes(value);
  }

  private static searchInCategories(video: Video, query: string): boolean {
    // Search in standard categories
    const allStandardCategories = Object.values(video.categories).flat();
    if (allStandardCategories.some((cat) => cat.toLowerCase().includes(query))) {
      return true;
    }

    // Search in custom categories
    const allCustomCategories = Object.values(video.customCategories).flat();
    return allCustomCategories.some((cat) => cat.toLowerCase().includes(query));
  }

  static getAvailableCategories(videos: Video[], knownTags: Category[] = []): Category[] {
    const categoryMap = new Map<string, { count: number; url?: string }>();

    // Add known tags first (count 0 initially, will be incremented if found)
    knownTags.forEach((tag) => {
      const key = tag.isCustom ? `custom:${tag.type}:${tag.value}` : `${tag.type}:${tag.value}`;
      categoryMap.set(key, { count: 0, url: tag.url });
    });

    videos.forEach((video) => {
      // Standard categories
      Object.entries(video.categories).forEach(([type, values]) => {
        (values as string[]).forEach((value: string) => {
          const key = `${type}:${value}`;
          const existing = categoryMap.get(key);
          categoryMap.set(key, { count: (existing?.count || 0) + 1, url: existing?.url });
        });
      });

      // Custom categories
      Object.entries(video.customCategories).forEach(([type, values]) => {
        values.forEach((value: string) => {
          const key = `custom:${type}:${value}`;
          const existing = categoryMap.get(key);
          categoryMap.set(key, { count: (existing?.count || 0) + 1, url: existing?.url });
        });
      });
    });

    const results = Array.from(categoryMap.entries()).map(([key, data]) => {
      const [type, ...valueParts] = key.split(':');
      const value = valueParts.join(':');
      const isCustom = type === 'custom';

      return {
        type: isCustom ? valueParts[0] : type,
        value: isCustom ? valueParts.slice(1).join(':') : value,
        count: data.count,
        isCustom,
        url: data.url,
      };
    });

    // Add virtual "unassigned" entries for standard category types
    const STANDARD_TYPES = ['age', 'physical', 'ethnicity', 'relationship', 'acts', 'setting', 'quality'];
    for (const type of STANDARD_TYPES) {
      const unassignedCount = videos.filter(
        (v) => !Array.isArray(v.categories[type]) || v.categories[type].length === 0,
      ).length;
      if (unassignedCount > 0) {
        results.push({
          type,
          value: 'unassigned',
          count: unassignedCount,
          isCustom: false,
          url: undefined,
        });
      }
    }

    return results;
  }

  static updateFilterCounts(
    allVideos: Video[],
    selectedCategories: string[],
    searchQuery: string = '',
    advancedFilters?: AdvancedFilters,
  ): Category[] {
    // Get all possible categories from all videos
    const allCategories = this.getAvailableCategories(allVideos);

    // For each category, calculate how many videos would remain if this category was selected
    return allCategories.map((category) => {
      const categoryKey = category.isCustom
        ? `custom:${category.type}:${category.value}`
        : `${category.type}:${category.value}`;

      // Create a test filter with this category included
      const testCategories = selectedCategories.includes(categoryKey)
        ? selectedCategories
        : [...selectedCategories, categoryKey];

      const filteredVideos = this.applyFilters(
        allVideos,
        testCategories,
        searchQuery,
        advancedFilters,
      );

      return {
        ...category,
        count: filteredVideos.length,
      };
    });
  }

  static groupCategoriesByType(categories: Category[]): { [type: string]: Category[] } {
    const grouped: { [type: string]: Category[] } = {};

    categories.forEach((category) => {
      const type = category.isCustom ? 'custom' : category.type;
      if (!grouped[type]) {
        grouped[type] = [];
      }
      grouped[type].push(category);
    });

    // Sort categories within each group by count (descending)
    Object.keys(grouped).forEach((type) => {
      grouped[type].sort((a, b) => b.count - a.count);
    });

    return grouped;
  }

  // New utility methods for filter presets
  static getFileSizeFilters(): { label: string; min: number; max: number }[] {
    return [
      { label: 'Small (< 100 MB)', min: 0, max: 100 * 1024 * 1024 },
      { label: 'Medium (100 MB - 1 GB)', min: 100 * 1024 * 1024, max: 1024 * 1024 * 1024 },
      { label: 'Large (1 GB - 10 GB)', min: 1024 * 1024 * 1024, max: 10 * 1024 * 1024 * 1024 },
      { label: 'Very Large (> 10 GB)', min: 10 * 1024 * 1024 * 1024, max: 0 },
    ];
  }

  static getDurationFilters(): { label: string; min: number; max: number }[] {
    return [
      { label: 'Short (< 5 min)', min: 0, max: 5 * 60 },
      { label: 'Medium (5-30 min)', min: 5 * 60, max: 30 * 60 },
      { label: 'Long (30 min - 2 hours)', min: 30 * 60, max: 2 * 60 * 60 },
      { label: 'Very Long (> 2 hours)', min: 2 * 60 * 60, max: 0 },
    ];
  }

  static formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
  }

  static formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
