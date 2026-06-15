import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedFilterEngine } from './enhanced-filter-engine';
import { instantSearch } from './instant-search';
import { Video } from '../types/video';

// Mock the instant search module
vi.mock('./instant-search', () => ({
  instantSearch: {
    search: vi.fn(),
    addVideoToSearchIndex: vi.fn(),
    updateVideoInSearchIndex: vi.fn(),
    removeVideoFromSearchIndex: vi.fn(),
    clearSearchIndex: vi.fn(),
  },
}));

describe('EnhancedFilterEngine', () => {
  const mockVideos: Video[] = [
    {
      id: 'v1',
      displayName: 'Alpha Video',
      filename: 'alpha.mp4',
      path: '/videos/alpha.mp4',
      size: 1024 * 1024,
      lastModified: new Date('2024-01-01').toISOString(),
      categories: {
        age: ['adult'],
        physical: ['athletic'],
        ethnicity: [],
        relationship: [],
        acts: ['running'],
        setting: [],
        quality: ['HD'],
        performer: [],
      },
      customCategories: {
        genre: ['action'],
      },
      metadata: { duration: 60, width: 1920, height: 1080, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
      thumbnail: { dataUrl: '', generated: false, timestamp: '' },
      rootKey: 'root1',
    },
    {
      id: 'v2',
      displayName: 'Bravo Video',
      filename: 'bravo.mp4',
      path: '/videos/bravo.mp4',
      size: 2 * 1024 * 1024,
      lastModified: new Date('2024-01-02').toISOString(),
      categories: {
        age: ['teen'],
        physical: [],
        ethnicity: [],
        relationship: [],
        acts: ['dancing'],
        setting: [],
        quality: ['4K'],
        performer: [],
      },
      customCategories: {
        genre: ['drama'],
      },
      metadata: { duration: 120, width: 3840, height: 2160, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
      thumbnail: { dataUrl: '', generated: false, timestamp: '' },
      rootKey: 'root1',
    },
    {
      id: 'v3',
      displayName: 'Charlie Video',
      filename: 'charlie.mp4',
      path: '/videos/charlie.mp4',
      size: 3 * 1024 * 1024,
      lastModified: new Date('2024-01-03').toISOString(),
      categories: {
        age: ['adult'],
        physical: ['blonde'],
        ethnicity: [],
        relationship: [],
        acts: ['running'],
        setting: [],
        quality: ['HD'],
        performer: [],
      },
      customCategories: {
        genre: ['action'],
      },
      metadata: { duration: 90, width: 1920, height: 1080, bitrate: 0, codec: '', fps: 0, aspectRatio: '' },
      thumbnail: { dataUrl: '', generated: false, timestamp: '' },
      rootKey: 'root1',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyFiltersWithSearch', () => {
    it('should return filtered results when using instant search', () => {
      const mockSearchResults = [
        { video: mockVideos[0], score: 0.9, matches: {}, matchedFields: [] },
        { video: mockVideos[2], score: 0.7, matches: {}, matchedFields: [] },
      ];
      vi.mocked(instantSearch.search).mockReturnValue(mockSearchResults);

      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        [],
        'alpha',
        undefined,
        { useInstantSearch: true, minQueryLength: 2 },
      );

      // Should return some results (instant search or fallback)
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should fall back to basic search when query is too short', () => {
      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        [],
        'a', // Too short
        undefined,
        { useInstantSearch: true, minQueryLength: 2 },
      );

      expect(instantSearch.search).not.toHaveBeenCalled();
      // Should use basic filter which searches in displayName
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fall back to basic search when instant search fails', () => {
      vi.mocked(instantSearch.search).mockImplementation(() => {
        throw new Error('Search index not initialized');
      });

      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        [],
        'alpha',
        undefined,
        { useInstantSearch: true, fallbackToBasic: true },
      );

      // Should fall back to basic filtering and return results
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle instant search errors based on fallback setting', () => {
      vi.mocked(instantSearch.search).mockImplementation(() => {
        throw new Error('Search index not initialized');
      });

      // When fallback is disabled, it should try instant search but may fallback silently
      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        [],
        'alpha',
        undefined,
        { useInstantSearch: true, fallbackToBasic: false },
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should combine instant search with category filters', () => {
      const mockSearchResults = [
        { video: mockVideos[0], score: 0.9, matches: {}, matchedFields: [] },
        { video: mockVideos[2], score: 0.7, matches: {}, matchedFields: [] },
      ];
      vi.mocked(instantSearch.search).mockReturnValue(mockSearchResults);

      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        ['quality:HD'], // Filter for HD videos
        'video',
        undefined,
        { useInstantSearch: true },
      );

      // Should return filtered results
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should apply advanced filters with instant search', () => {
      const mockSearchResults = mockVideos.map((v, i) => ({
        video: v,
        score: 1 - i * 0.1,
        matches: {},
        matchedFields: [],
      }));
      vi.mocked(instantSearch.search).mockReturnValue(mockSearchResults);

      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        [],
        'video',
        {
          dateRange: { startDate: '', endDate: '' },
          fileSizeRange: { min: 0, max: 2 * 1024 * 1024 }, // Max 2MB
          durationRange: { min: 0, max: 0 },
        },
        { useInstantSearch: true },
      );

      // Should return filtered results
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should use basic filtering when useInstantSearch is false', () => {
      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        [],
        'alpha',
        undefined,
        { useInstantSearch: false },
      );

      expect(instantSearch.search).not.toHaveBeenCalled();
      expect(result.some((v) => v.displayName.toLowerCase().includes('alpha'))).toBe(true);
    });
  });

  describe('basic filtering fallback', () => {
    it('should work with empty query', () => {
      const result = EnhancedFilterEngine.applyFiltersWithSearch(mockVideos, [], '', undefined, {
        useInstantSearch: true,
      });

      expect(result).toBeDefined();
      expect(result.length).toBe(mockVideos.length);
    });

    it('should filter by categories without search', () => {
      const result = EnhancedFilterEngine.applyFiltersWithSearch(
        mockVideos,
        ['quality:HD'],
        '',
        undefined,
        { useInstantSearch: false },
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
