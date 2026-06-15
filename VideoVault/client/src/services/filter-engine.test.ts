import { describe, it, expect } from 'vitest';
import { FilterEngine } from './filter-engine';
import { Video, AdvancedFilters } from '@/types/video';

function createMockVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    filename: 'test-video.mp4',
    displayName: 'Test Video',
    path: '/path/to/test-video.mp4',
    size: 50 * 1024 * 1024, // 50 MB
    lastModified: '2024-01-15T10:30:00Z',
    categories: {
      age: [],
      physical: [],
      ethnicity: [],
      relationship: [],
      acts: [],
      setting: [],
      quality: [],
      performer: [],
    },
    customCategories: {},
    metadata: {
      duration: 600, // 10 minutes
      width: 1920,
      height: 1080,
      bitrate: 5000,
      codec: 'H.264/AVC',
      fps: 30,
      aspectRatio: '16:9',
    },
    thumbnail: { dataUrl: '', generated: false, timestamp: '' },
    rootKey: 'test-root',
    ...overrides,
  };
}

describe('FilterEngine', () => {
  describe('applyFilters', () => {
    it('returns all videos when no filters applied', () => {
      const videos = [createMockVideo({ id: '1' }), createMockVideo({ id: '2' })];
      const result = FilterEngine.applyFilters(videos, [], '');
      expect(result).toHaveLength(2);
      expect(result).toEqual(videos);
    });

    it('filters by category with AND logic', () => {
      const videos = [
        createMockVideo({
          id: '1',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['hd'] },
        }),
        createMockVideo({
          id: '2',
          categories: { ...createMockVideo().categories, age: ['teen'] },
        }),
        createMockVideo({
          id: '3',
          categories: { ...createMockVideo().categories, quality: ['hd'] },
        }),
      ];

      // Should only return video with both 'teen' AND 'hd'
      const result = FilterEngine.applyFilters(videos, ['age:teen', 'quality:hd'], '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('filters by custom categories', () => {
      const videos = [
        createMockVideo({
          id: '1',
          customCategories: { genre: ['action'], mood: ['intense'] },
        }),
        createMockVideo({
          id: '2',
          customCategories: { genre: ['comedy'] },
        }),
      ];

      const result = FilterEngine.applyFilters(videos, ['custom:genre:action'], '');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('filters by search query in display name', () => {
      const videos = [
        createMockVideo({ id: '1', displayName: 'Amazing Action Movie' }),
        createMockVideo({ id: '2', displayName: 'Boring Comedy Film' }),
      ];

      const result = FilterEngine.applyFilters(videos, [], 'amazing');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('filters by search query in filename', () => {
      const videos = [
        createMockVideo({ id: '1', filename: 'action_movie_2024.mp4' }),
        createMockVideo({ id: '2', filename: 'comedy_film.mp4' }),
      ];

      const result = FilterEngine.applyFilters(videos, [], '2024');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('filters by search query in categories', () => {
      const videos = [
        createMockVideo({
          id: '1',
          categories: { ...createMockVideo().categories, genre: ['action'] },
        }),
        createMockVideo({
          id: '2',
          customCategories: { mood: ['exciting'] },
        }),
      ];

      const result = FilterEngine.applyFilters(videos, [], 'action');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('applies date range filter', () => {
      const videos = [
        createMockVideo({ id: '1', lastModified: '2024-01-10T10:00:00Z' }),
        createMockVideo({ id: '2', lastModified: '2024-01-20T10:00:00Z' }),
        createMockVideo({ id: '3', lastModified: '2024-01-30T10:00:00Z' }),
      ];

      const advancedFilters: AdvancedFilters = {
        dateRange: { startDate: '2024-01-15', endDate: '2024-01-25' },
        fileSizeRange: { min: 0, max: 0 },
        durationRange: { min: 0, max: 0 },
      };

      const result = FilterEngine.applyFilters(videos, [], '', advancedFilters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('applies file size filter - both min and max', () => {
      const videos = [
        createMockVideo({ id: '1', size: 10 * 1024 * 1024 }), // 10 MB
        createMockVideo({ id: '2', size: 50 * 1024 * 1024 }), // 50 MB
        createMockVideo({ id: '3', size: 150 * 1024 * 1024 }), // 150 MB
      ];

      const advancedFilters: AdvancedFilters = {
        dateRange: { startDate: '', endDate: '' },
        fileSizeRange: { min: 20 * 1024 * 1024, max: 100 * 1024 * 1024 }, // 20-100 MB
        durationRange: { min: 0, max: 0 },
      };

      const result = FilterEngine.applyFilters(videos, [], '', advancedFilters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('applies file size filter - min only', () => {
      const videos = [
        createMockVideo({ id: '1', size: 10 * 1024 * 1024 }),
        createMockVideo({ id: '2', size: 50 * 1024 * 1024 }),
      ];

      const advancedFilters: AdvancedFilters = {
        dateRange: { startDate: '', endDate: '' },
        fileSizeRange: { min: 30 * 1024 * 1024, max: 0 },
        durationRange: { min: 0, max: 0 },
      };

      const result = FilterEngine.applyFilters(videos, [], '', advancedFilters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('applies file size filter - max only', () => {
      const videos = [
        createMockVideo({ id: '1', size: 10 * 1024 * 1024 }),
        createMockVideo({ id: '2', size: 50 * 1024 * 1024 }),
      ];

      const advancedFilters: AdvancedFilters = {
        dateRange: { startDate: '', endDate: '' },
        fileSizeRange: { min: 0, max: 30 * 1024 * 1024 },
        durationRange: { min: 0, max: 0 },
      };

      const result = FilterEngine.applyFilters(videos, [], '', advancedFilters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('applies duration filter - both min and max', () => {
      const videos = [
        createMockVideo({ id: '1', metadata: { ...createMockVideo().metadata, duration: 300 } }), // 5 min
        createMockVideo({ id: '2', metadata: { ...createMockVideo().metadata, duration: 900 } }), // 15 min
        createMockVideo({ id: '3', metadata: { ...createMockVideo().metadata, duration: 2400 } }), // 40 min
      ];

      const advancedFilters: AdvancedFilters = {
        dateRange: { startDate: '', endDate: '' },
        fileSizeRange: { min: 0, max: 0 },
        durationRange: { min: 600, max: 1800 }, // 10-30 min
      };

      const result = FilterEngine.applyFilters(videos, [], '', advancedFilters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('handles videos with no metadata duration', () => {
      const videos = [
        createMockVideo({ id: '1', metadata: undefined }),
        createMockVideo({ id: '2', metadata: { ...createMockVideo().metadata, duration: 900 } }),
      ];

      const advancedFilters: AdvancedFilters = {
        dateRange: { startDate: '', endDate: '' },
        fileSizeRange: { min: 0, max: 0 },
        durationRange: { min: 600, max: 0 },
      };

      const result = FilterEngine.applyFilters(videos, [], '', advancedFilters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });
  });

  describe('getAvailableCategories', () => {
    it('extracts standard categories with counts', () => {
      const videos = [
        createMockVideo({
          id: '1',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['hd'] },
        }),
        createMockVideo({
          id: '2',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['sd'] },
        }),
      ];

      const result = FilterEngine.getAvailableCategories(videos);

      const teenCategory = result.find((cat) => cat.type === 'age' && cat.value === 'teen');
      expect(teenCategory).toBeDefined();
      expect(teenCategory?.count).toBe(2);
      expect(teenCategory?.isCustom).toBe(false);

      const hdCategory = result.find((cat) => cat.type === 'quality' && cat.value === 'hd');
      expect(hdCategory?.count).toBe(1);
    });

    it('extracts custom categories with counts', () => {
      const videos = [
        createMockVideo({
          id: '1',
          customCategories: { genre: ['action'], mood: ['intense'] },
        }),
        createMockVideo({
          id: '2',
          customCategories: { genre: ['action'], mood: ['calm'] },
        }),
      ];

      const result = FilterEngine.getAvailableCategories(videos);

      const actionCategory = result.find((cat) => cat.type === 'genre' && cat.value === 'action');
      expect(actionCategory).toBeDefined();
      expect(actionCategory?.count).toBe(2);
      expect(actionCategory?.isCustom).toBe(true);

      const intenseCategory = result.find((cat) => cat.type === 'mood' && cat.value === 'intense');
      expect(intenseCategory?.count).toBe(1);
      expect(intenseCategory?.isCustom).toBe(true);
    });
  });

  describe('updateFilterCounts', () => {
    it('updates counts based on current filters', () => {
      const videos = [
        createMockVideo({
          id: '1',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['hd'] },
          displayName: 'Action Movie',
        }),
        createMockVideo({
          id: '2',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['sd'] },
          displayName: 'Comedy Film',
        }),
      ];

      const result = FilterEngine.updateFilterCounts(videos, ['age:teen'], 'action');

      const hdCategory = result.find((cat) => cat.type === 'quality' && cat.value === 'hd');
      expect(hdCategory?.count).toBe(1); // Only 1 video matches teen + hd + "action"

      const sdCategory = result.find((cat) => cat.type === 'quality' && cat.value === 'sd');
      expect(sdCategory?.count).toBe(0); // No video matches teen + sd + "action"
    });
  });

  describe('groupCategoriesByType', () => {
    it('groups categories by type and sorts by count', () => {
      const categories = [
        { type: 'age', value: 'teen', count: 5, isCustom: false },
        { type: 'age', value: 'adult', count: 10, isCustom: false },
        { type: 'quality', value: 'hd', count: 3, isCustom: false },
        { type: 'genre', value: 'action', count: 7, isCustom: true },
        { type: 'genre', value: 'comedy', count: 2, isCustom: true },
      ];

      const result = FilterEngine.groupCategoriesByType(categories);

      expect(result.age).toHaveLength(2);
      expect(result.age[0].value).toBe('adult'); // Higher count first
      expect(result.age[1].value).toBe('teen');

      expect(result.custom).toHaveLength(2);
      expect(result.custom[0].value).toBe('action'); // Higher count first
      expect(result.custom[1].value).toBe('comedy');
    });
  });

  describe('utility methods', () => {
    it('returns file size filters', () => {
      const filters = FilterEngine.getFileSizeFilters();
      expect(filters).toHaveLength(4);
      expect(filters[0].label).toBe('Small (< 100 MB)');
      expect(filters[0].max).toBe(100 * 1024 * 1024);
    });

    it('returns duration filters', () => {
      const filters = FilterEngine.getDurationFilters();
      expect(filters).toHaveLength(4);
      expect(filters[0].label).toBe('Short (< 5 min)');
      expect(filters[0].max).toBe(5 * 60);
    });

    it('formats file size correctly', () => {
      expect(FilterEngine.formatFileSize(0)).toBe('0 B');
      expect(FilterEngine.formatFileSize(1024)).toBe('1 KB');
      expect(FilterEngine.formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(FilterEngine.formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(FilterEngine.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('formats duration correctly', () => {
      expect(FilterEngine.formatDuration(30)).toBe('0:30');
      expect(FilterEngine.formatDuration(90)).toBe('1:30');
      expect(FilterEngine.formatDuration(3661)).toBe('1:01:01');
      expect(FilterEngine.formatDuration(7200)).toBe('2:00:00');
    });
  });

  describe('edge cases', () => {
    it('handles empty video array', () => {
      const result = FilterEngine.applyFilters([], ['age:teen'], 'query');
      expect(result).toHaveLength(0);
    });

    it('handles empty search query', () => {
      const videos = [createMockVideo()];
      const result = FilterEngine.applyFilters(videos, [], '   ');
      expect(result).toHaveLength(1);
    });

    it('handles category with special characters in value', () => {
      const videos = [
        createMockVideo({
          id: '1',
          customCategories: { site: ['example.com'] },
        }),
      ];

      const result = FilterEngine.applyFilters(videos, ['custom:site:example.com'], '');
      expect(result).toHaveLength(1);
    });
  });
});
