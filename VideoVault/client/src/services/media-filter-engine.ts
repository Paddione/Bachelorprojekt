/**
 * MediaFilterEngine - Extended filter engine for all media types
 * Supports filtering videos, audiobooks, and ebooks
 */

import type {
  MediaItem,
  MediaType,
  VideoWithType,
  Audiobook,
  Ebook,
  EbookFormat,
  MediaFilterState,
} from '@/types/media';
import { isVideo, isAudiobook, isEbook } from '@/types/media';

export interface MediaAdvancedFilters {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  fileSizeRange: {
    min: number;
    max: number;
  };
  durationRange: {
    min: number;
    max: number;
  };
  // Media-specific filters
  mediaTypes: MediaType[];
  authors: string[];
  narrators: string[];
  genres: string[];
  series: string[];
  formats: EbookFormat[];
}

export const defaultMediaFilters: MediaAdvancedFilters = {
  dateRange: { startDate: '', endDate: '' },
  fileSizeRange: { min: 0, max: 0 },
  durationRange: { min: 0, max: 0 },
  mediaTypes: ['video', 'audiobook', 'ebook'],
  authors: [],
  narrators: [],
  genres: [],
  series: [],
  formats: [],
};

export class MediaFilterEngine {
  /**
   * Apply filters to a mixed array of media items
   */
  static applyFilters(
    items: MediaItem[],
    searchQuery: string = '',
    filters: Partial<MediaAdvancedFilters> = {},
  ): MediaItem[] {
    const effectiveFilters = { ...defaultMediaFilters, ...filters };
    let filtered = items;

    // Filter by media type
    if (
      effectiveFilters.mediaTypes.length > 0 &&
      effectiveFilters.mediaTypes.length < 3
    ) {
      filtered = filtered.filter((item) =>
        effectiveFilters.mediaTypes.includes(item.type),
      );
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((item) => this.matchesSearch(item, query));
    }

    // Apply date range filter
    if (effectiveFilters.dateRange.startDate && effectiveFilters.dateRange.endDate) {
      const startDate = new Date(effectiveFilters.dateRange.startDate);
      const endDate = new Date(effectiveFilters.dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);

      filtered = filtered.filter((item) => {
        const itemDate = new Date(item.lastModified);
        return itemDate >= startDate && itemDate <= endDate;
      });
    }

    // Apply file size filter
    if (effectiveFilters.fileSizeRange.min > 0 || effectiveFilters.fileSizeRange.max > 0) {
      filtered = filtered.filter((item) => {
        const size = this.getItemSize(item);
        const { min, max } = effectiveFilters.fileSizeRange;

        if (min > 0 && max > 0) return size >= min && size <= max;
        if (min > 0) return size >= min;
        if (max > 0) return size <= max;
        return true;
      });
    }

    // Apply duration filter (videos and audiobooks only)
    if (effectiveFilters.durationRange.min > 0 || effectiveFilters.durationRange.max > 0) {
      filtered = filtered.filter((item) => {
        const duration = this.getItemDuration(item);
        if (duration === null) return true; // Ebooks have no duration

        const { min, max } = effectiveFilters.durationRange;
        if (min > 0 && max > 0) return duration >= min && duration <= max;
        if (min > 0) return duration >= min;
        if (max > 0) return duration <= max;
        return true;
      });
    }

    // Apply author filter
    if (effectiveFilters.authors.length > 0) {
      filtered = filtered.filter((item) => {
        if (isAudiobook(item) || isEbook(item)) {
          return effectiveFilters.authors.some(
            (author) => item.author.toLowerCase() === author.toLowerCase(),
          );
        }
        return true; // Videos pass through
      });
    }

    // Apply narrator filter (audiobooks only)
    if (effectiveFilters.narrators.length > 0) {
      filtered = filtered.filter((item) => {
        if (isAudiobook(item) && item.metadata.narrator) {
          return effectiveFilters.narrators.some(
            (narrator) =>
              item.metadata.narrator?.toLowerCase() === narrator.toLowerCase(),
          );
        }
        return !isAudiobook(item); // Non-audiobooks pass through
      });
    }

    // Apply series filter
    if (effectiveFilters.series.length > 0) {
      filtered = filtered.filter((item) => {
        if (isAudiobook(item) && item.metadata.series) {
          return effectiveFilters.series.includes(item.metadata.series);
        }
        if (isEbook(item) && item.metadata.series) {
          return effectiveFilters.series.includes(item.metadata.series);
        }
        return true; // Items without series pass through
      });
    }

    // Apply format filter (ebooks only)
    if (effectiveFilters.formats.length > 0) {
      filtered = filtered.filter((item) => {
        if (isEbook(item)) {
          return item.files.some((f) => effectiveFilters.formats.includes(f.format));
        }
        return true; // Non-ebooks pass through
      });
    }

    return filtered;
  }

  /**
   * Check if an item matches a search query
   */
  private static matchesSearch(item: MediaItem, query: string): boolean {
    if (isVideo(item)) {
      return (
        item.displayName.toLowerCase().includes(query) ||
        item.filename.toLowerCase().includes(query) ||
        this.searchInVideoCategories(item, query)
      );
    }

    if (isAudiobook(item)) {
      return (
        item.title.toLowerCase().includes(query) ||
        item.author.toLowerCase().includes(query) ||
        (item.metadata.narrator?.toLowerCase().includes(query) ?? false) ||
        (item.metadata.series?.toLowerCase().includes(query) ?? false) ||
        item.chapters.some((ch) => ch.title.toLowerCase().includes(query))
      );
    }

    if (isEbook(item)) {
      return (
        item.title.toLowerCase().includes(query) ||
        item.author.toLowerCase().includes(query) ||
        (item.metadata.series?.toLowerCase().includes(query) ?? false) ||
        (item.metadata.description?.toLowerCase().includes(query) ?? false) ||
        (item.metadata.subjects?.some((s) => s.toLowerCase().includes(query)) ?? false)
      );
    }

    return false;
  }

  /**
   * Search in video categories
   */
  private static searchInVideoCategories(video: VideoWithType, query: string): boolean {
    const allCategories = Object.values(video.categories).flat();
    if (allCategories.some((cat) => cat.toLowerCase().includes(query))) {
      return true;
    }

    const allCustomCategories = Object.values(video.customCategories).flat();
    return allCustomCategories.some((cat) => cat.toLowerCase().includes(query));
  }

  /**
   * Get item size in bytes
   */
  private static getItemSize(item: MediaItem): number {
    if (isVideo(item)) return item.size;
    if (isAudiobook(item)) return item.totalSize;
    if (isEbook(item)) return item.files.reduce((acc, f) => acc + f.fileSize, 0);
    return 0;
  }

  /**
   * Get item duration in seconds (null for ebooks)
   */
  private static getItemDuration(item: MediaItem): number | null {
    if (isVideo(item)) return item.metadata.duration;
    if (isAudiobook(item)) return item.totalDuration;
    return null;
  }

  /**
   * Extract unique authors from media items
   */
  static getUniqueAuthors(items: MediaItem[]): string[] {
    const authors = new Set<string>();
    for (const item of items) {
      if (isAudiobook(item) || isEbook(item)) {
        authors.add(item.author);
      }
    }
    return Array.from(authors).sort();
  }

  /**
   * Extract unique narrators from audiobooks
   */
  static getUniqueNarrators(items: MediaItem[]): string[] {
    const narrators = new Set<string>();
    for (const item of items) {
      if (isAudiobook(item) && item.metadata.narrator) {
        narrators.add(item.metadata.narrator);
      }
    }
    return Array.from(narrators).sort();
  }

  /**
   * Extract unique series from media items
   */
  static getUniqueSeries(items: MediaItem[]): string[] {
    const series = new Set<string>();
    for (const item of items) {
      if (isAudiobook(item) && item.metadata.series) {
        series.add(item.metadata.series);
      }
      if (isEbook(item) && item.metadata.series) {
        series.add(item.metadata.series);
      }
    }
    return Array.from(series).sort();
  }

  /**
   * Get available ebook formats
   */
  static getAvailableFormats(items: MediaItem[]): EbookFormat[] {
    const formats = new Set<EbookFormat>();
    for (const item of items) {
      if (isEbook(item)) {
        for (const file of item.files) {
          formats.add(file.format);
        }
      }
    }
    return Array.from(formats).sort();
  }

  /**
   * Count items by media type
   */
  static getMediaTypeCounts(items: MediaItem[]): Record<MediaType, number> {
    const counts: Record<MediaType, number> = {
      video: 0,
      audiobook: 0,
      ebook: 0,
    };

    for (const item of items) {
      counts[item.type]++;
    }

    return counts;
  }

  /**
   * Sort media items
   */
  static sortItems(
    items: MediaItem[],
    field: 'title' | 'author' | 'lastModified' | 'size' | 'duration',
    direction: 'asc' | 'desc' = 'asc',
  ): MediaItem[] {
    const sorted = [...items];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (field) {
        case 'title':
          comparison = this.getItemTitle(a).localeCompare(this.getItemTitle(b));
          break;
        case 'author':
          comparison = this.getItemAuthor(a).localeCompare(this.getItemAuthor(b));
          break;
        case 'lastModified':
          comparison =
            new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
          break;
        case 'size':
          comparison = this.getItemSize(a) - this.getItemSize(b);
          break;
        case 'duration':
          comparison =
            (this.getItemDuration(a) ?? 0) - (this.getItemDuration(b) ?? 0);
          break;
      }

      return direction === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }

  /**
   * Get item title
   */
  private static getItemTitle(item: MediaItem): string {
    if (isVideo(item)) return item.displayName;
    return item.title;
  }

  /**
   * Get item author (empty for videos)
   */
  private static getItemAuthor(item: MediaItem): string {
    if (isAudiobook(item) || isEbook(item)) return item.author;
    return '';
  }
}
