import { describe, it, expect, beforeEach } from 'vitest';
import { InstantSearchService } from './instant-search';
import { Video } from '../types/video';

describe('InstantSearchService', () => {
  let searchService: InstantSearchService;
  let testVideos: Video[];

  beforeEach(() => {
    searchService = new InstantSearchService();
    
    testVideos = [
      {
        id: 'video1',
        filename: 'amazing_sunset_beach.mp4',
        displayName: 'Amazing Sunset Beach',
        path: 'videos/amazing_sunset_beach.mp4',
        size: 1024000,
        lastModified: '2024-01-01T12:00:00Z',
        categories: {
          age: ['adult'],
          physical: ['athletic'],
          ethnicity: ['asian'],
          relationship: ['couple'],
          acts: ['romantic'],
          setting: ['outdoor'],
          quality: ['hd'],
          performer: ['professional']
        },
        customCategories: {
          location: ['beach', 'california'],
          mood: ['romantic', 'peaceful']
        },
        metadata: {
          duration: 120,
          width: 1920,
          height: 1080,
          bitrate: 0,
          codec: '',
          fps: 0,
          aspectRatio: ''
        },
        thumbnail: {
          dataUrl: 'data:image/jpeg;base64,test',
          generated: true,
          timestamp: '2024-01-01T12:00:00Z'
        },
        rootKey: 'root1'
      },
      {
        id: 'video2',
        filename: 'city_night_drive.mp4',
        displayName: 'City Night Drive',
        path: 'videos/city_night_drive.mp4',
        size: 2048000,
        lastModified: '2024-01-02T12:00:00Z',
        categories: {
          age: ['adult'],
          physical: ['slim'],
          ethnicity: ['caucasian'],
          relationship: ['single'],
          acts: ['driving'],
          setting: ['urban'],
          quality: ['4k'],
          performer: ['amateur']
        },
        customCategories: {
          location: ['city', 'downtown'],
          mood: ['energetic', 'nightlife']
        },
        metadata: {
          duration: 180,
          width: 3840,
          height: 2160,
          bitrate: 0,
          codec: '',
          fps: 0,
          aspectRatio: ''
        },
        thumbnail: {
          dataUrl: 'data:image/jpeg;base64,test2',
          generated: true,
          timestamp: '2024-01-02T12:00:00Z'
        },
        rootKey: 'root1'
      }
    ];

    searchService.addVideos(testVideos);
  });

  describe('addVideo and basic search', () => {
    it('should add videos to search index', () => {
      const stats = searchService.getStats();
      expect(stats.totalVideos).toBe(2);
    });

    it('should search by filename', () => {
      const results = searchService.search('sunset');
      expect(results).toHaveLength(1);
      expect(results[0].video.id).toBe('video1');
      expect(results[0].matchedFields).toContain('filename');
    });

    it('should search by display name', () => {
      const results = searchService.search('City Night');
      expect(results).toHaveLength(1);
      expect(results[0].video.id).toBe('video2');
      expect(results[0].matchedFields).toContain('displayName');
    });

    it('should search by categories', () => {
      const results = searchService.search('beach');
      expect(results).toHaveLength(1);
      expect(results[0].video.id).toBe('video1');
      expect(results[0].matchedFields).toContain('tags');
    });

    it('should search by custom categories', () => {
      const results = searchService.search('california');
      expect(results).toHaveLength(1);
      expect(results[0].video.id).toBe('video1');
    });
  });

  describe('updateVideo and removeVideo', () => {
    it('should update video in search index', () => {
      const updatedVideo = {
        ...testVideos[0],
        displayName: 'Updated Amazing Sunset',
        customCategories: {
          ...testVideos[0].customCategories,
          mood: ['updated', 'test']
        }
      };

      searchService.updateVideo(updatedVideo);
      
      const results = searchService.search('updated');
      expect(results).toHaveLength(1);
      expect(results[0].video.displayName).toBe('Updated Amazing Sunset');
    });

    it('should remove video from search index', () => {
      searchService.removeVideo('video1');
      
      const results = searchService.search('sunset');
      expect(results).toHaveLength(0);
      
      const stats = searchService.getStats();
      expect(stats.totalVideos).toBe(1);
    });
  });

  describe('search suggestions', () => {
    it('should provide search suggestions', () => {
      const suggestions = searchService.suggest('c');
      expect(suggestions).toContain('city');
      expect(suggestions).toContain('california');
    });

    it('should limit suggestions', () => {
      const suggestions = searchService.suggest('a', { limit: 2 });
      expect(suggestions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('root-specific operations', () => {
    it('should search within specific root', () => {
      const results = searchService.search('sunset', { rootKey: 'root1' });
      expect(results).toHaveLength(1);
      expect(results[0].video.rootKey).toBe('root1');
    });

    it('should clear root-specific videos', () => {
      searchService.clearRoot('root1');
      
      const results = searchService.search('sunset');
      expect(results).toHaveLength(0);
      
      const stats = searchService.getStats();
      expect(stats.totalVideos).toBe(0);
    });
  });

  describe('search ranking', () => {
    it('should rank results by relevance', () => {
      const results = searchService.search('adult');
      expect(results).toHaveLength(2);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[1].score).toBeGreaterThan(0);
    });

    it('should include matched fields in results', () => {
      const results = searchService.search('amazing sunset');
      expect(results).toHaveLength(1);
      expect(results[0].matchedFields.length).toBeGreaterThan(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all videos from search index', () => {
      searchService.clearAll();
      
      const results = searchService.search('sunset');
      expect(results).toHaveLength(0);
      
      const stats = searchService.getStats();
      expect(stats.totalVideos).toBe(0);
    });
  });
});
