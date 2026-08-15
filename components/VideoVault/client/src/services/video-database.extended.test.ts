import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoDatabase } from './video-database';
import { Video, CustomCategories } from '@/types/video';
import { serverHealth } from './server-health';
import { ApiClient } from './api-client';

// Mock external dependencies
vi.mock('./server-health', () => ({
  serverHealth: {
    isHealthy: vi.fn(),
    markUnhealthy: vi.fn(),
  }
}));

vi.mock('./api-client', () => ({
  ApiClient: {
    get: vi.fn(),
    post: vi.fn(),
  }
}));

function createMockVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-1',
    filename: 'test-video.mp4',
    displayName: 'Test Video',
    path: '/path/to/test-video.mp4',
    size: 50 * 1024 * 1024,
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
      duration: 600,
      width: 1920,
      height: 1080,
      bitrate: 5000,
      codec: 'H.264/AVC',
      fps: 30,
      aspectRatio: '16:9',
    },
    thumbnail: { dataUrl: 'data:image/jpeg;base64,abc123', generated: true, timestamp: '2024-01-15T10:30:00Z' },
    rootKey: 'test-root',
    ...overrides,
  };
}

describe('VideoDatabase - Extended Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset memory cache
    (VideoDatabase as any).memoryCache = [];
  });

  describe('sanitization and normalization', () => {
    it('sanitizes video for localStorage by removing thumbnail dataUrl', () => {
      const video = createMockVideo();
      const videos = [video];
      
      VideoDatabase.saveToStorage(videos);
      const loaded = VideoDatabase.loadFromStorage();
      const first = loaded?.[0];
      
      expect(first?.thumbnail?.dataUrl).toBe('');
      expect(first?.thumbnail?.generated).toBe(true);
      expect(first?.thumbnail?.timestamp).toBe('2024-01-15T10:30:00Z');
    });

    it('normalizes categories on load', () => {
      const mockData = [{
        ...createMockVideo(),
        categories: {
          age: ['TEEN', 'Adult'],
          physical: [],
          ethnicity: [],
          relationship: [],
          acts: [],
          setting: [],
          quality: [],
          performer: [],
        },
        customCategories: {
          'Genre': ['ACTION', 'Comedy']
        }
      }];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(true);
      vi.mocked(ApiClient.get).mockResolvedValue(mockData);

      return VideoDatabase.load().then(result => {
        expect(result[0].categories.age).toEqual(['teen', 'adult']);
        expect(result[0].customCategories.genre).toEqual(['action', 'comedy']);
      });
    });
  });

  describe('server integration', () => {
    it('loads from server when healthy', async () => {
      const mockVideos = [createMockVideo({ id: 'server-1' })];
      vi.mocked(serverHealth.isHealthy).mockResolvedValue(true);
      vi.mocked(ApiClient.get).mockResolvedValue(mockVideos);

      const result = await VideoDatabase.load();

      expect(ApiClient.get).toHaveBeenCalledWith('/api/videos');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('server-1');
    });

    it('falls back to local storage when server is unhealthy', async () => {
      const localVideos = [createMockVideo({ id: 'local-1' })];
      VideoDatabase.saveToStorage(localVideos);
      
      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = await VideoDatabase.load();

      expect(ApiClient.get).not.toHaveBeenCalled();
      expect(result[0].id).toBe('local-1');
    });

    it('marks server unhealthy on API error and falls back', async () => {
      const localVideos = [createMockVideo({ id: 'local-1' })];
      VideoDatabase.saveToStorage(localVideos);
      
      vi.mocked(serverHealth.isHealthy).mockResolvedValue(true);
      vi.mocked(ApiClient.get).mockRejectedValue(new Error('Network error'));

      const result = await VideoDatabase.load();

      expect(serverHealth.markUnhealthy).toHaveBeenCalled();
      expect(result[0].id).toBe('local-1');
    });
  });

  describe('video management', () => {
    it('adds new video', () => {
      const videos = [createMockVideo({ id: '1' })];
      const newVideo = createMockVideo({ id: '2', displayName: 'New Video' });

      const result = VideoDatabase.addVideo(videos, newVideo);

      expect(result).toHaveLength(2);
      expect(result.find(v => v.id === '2')?.displayName).toBe('New Video');
    });

    it('updates existing video when adding duplicate id', () => {
      const videos = [createMockVideo({ id: '1', displayName: 'Original' })];
      const updatedVideo = createMockVideo({ id: '1', displayName: 'Updated' });

      const result = VideoDatabase.addVideo(videos, updatedVideo);

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Updated');
    });

    it('adds multiple videos and deduplicates', () => {
      const existingVideos = [createMockVideo({ id: '1' })];
      const newVideos = [
        createMockVideo({ id: '1', displayName: 'Updated' }),
        createMockVideo({ id: '2', displayName: 'New', filename: 'new-video.mp4', path: '/path/to/new-video.mp4' })
      ];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.addVideos(existingVideos, newVideos);

      expect(result).toHaveLength(2);
      expect(result.find(v => v.id === '1')?.displayName).toBe('Updated');
      expect(result.find(v => v.id === '2')?.displayName).toBe('New');
    });
  });

  describe('category management', () => {
    it('updates video categories', () => {
      const videos = [createMockVideo({ id: '1' })];
      const newCategories = {
        categories: {
          age: ['adult'],
          physical: ['athletic'],
          ethnicity: [],
          relationship: [],
          acts: [],
          setting: [],
          quality: [],
          performer: [],
        }
      };

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.updateVideoCategories(videos, '1', newCategories);

      expect(result[0].categories.age).toEqual(['adult']);
      expect(result[0].categories.physical).toEqual(['athletic']);
    });

    it('removes standard category', () => {
      const videos = [createMockVideo({ 
        id: '1', 
        categories: {
          age: ['teen', 'adult'],
          physical: [],
          ethnicity: [],
          relationship: [],
          acts: [],
          setting: [],
          quality: [],
          performer: [],
        }
      })];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.removeCategory(videos, '1', 'age', 'teen');

      expect(result[0].categories.age).toEqual(['adult']);
    });

    it('removes custom category', () => {
      const videos = [createMockVideo({ 
        id: '1', 
        customCategories: {
          genre: ['action', 'thriller'],
          mood: ['intense']
        }
      })];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.removeCategory(videos, '1', 'custom', 'genre:action');

      expect(result[0].customCategories.genre).toEqual(['thriller']);
      expect(result[0].customCategories.mood).toEqual(['intense']);
    });

    it('removes entire custom category type when last value removed', () => {
      const videos = [createMockVideo({ 
        id: '1', 
        customCategories: {
          genre: ['action'],
          mood: ['intense']
        }
      })];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.removeCategory(videos, '1', 'custom', 'genre:action');

      expect(result[0].customCategories.genre).toBeUndefined();
      expect(result[0].customCategories.mood).toEqual(['intense']);
    });
  });

  describe('data export/import', () => {
    it('exports data with metadata', () => {
      const videos = [createMockVideo({ id: '1', displayName: 'Export Test' })];
      VideoDatabase.saveToStorage(videos);

      const exported = VideoDatabase.exportData();
      const data = JSON.parse(exported);

      expect(data.version).toBe('1.0');
      expect(data.totalVideos).toBe(1);
      expect(data.videos[0].id).toBe('1');
      expect(data.videos[0].displayName).toBe('Export Test');
      expect(data.exportDate).toBeDefined();
    });

    it('imports valid data', () => {
      const importData = {
        version: '1.0',
        exportDate: '2024-01-15T10:30:00Z',
        videos: [createMockVideo({ id: 'imported', displayName: 'Imported Video' })],
        totalVideos: 1
      };

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.importData(JSON.stringify(importData));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('imported');
      expect(result[0].displayName).toBe('Imported Video');
    });

    it('throws error on invalid import data', () => {
      expect(() => {
        VideoDatabase.importData('invalid json');
      }).toThrow();

      expect(() => {
        VideoDatabase.importData(JSON.stringify({ invalid: 'data' }));
      }).toThrow('Invalid data format');
    });
  });

  describe('backup operations', () => {
    it('backup operations are no-ops', () => {
      expect(() => VideoDatabase.createBackup('test')).not.toThrow();
      expect(VideoDatabase.getBackups()).toEqual([]);
      expect(VideoDatabase.restoreFromBackup('test')).toEqual([]);
    });
  });

  describe('category extraction', () => {
    it('extracts all categories with counts', () => {
      const videos = [
        createMockVideo({ 
          id: '1',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['hd'] }
        }),
        createMockVideo({ 
          id: '2',
          categories: { ...createMockVideo().categories, age: ['teen'], quality: ['sd'] },
          customCategories: { genre: ['action'] }
        })
      ];

      const result = VideoDatabase.getAllCategories(videos);

      const teenCategory = result.find(cat => cat.type === 'age' && cat.value === 'teen');
      expect(teenCategory?.count).toBe(2);
      expect(teenCategory?.isCustom).toBe(false);

      const actionCategory = result.find(cat => cat.type === 'genre' && cat.value === 'action');
      expect(actionCategory?.count).toBe(1);
      expect(actionCategory?.isCustom).toBe(true);
    });
  });

  describe('rename operations', () => {
    it('renames single video in database', () => {
      const videos = [createMockVideo({ id: '1', displayName: 'Old Name', filename: 'old.mp4' })];

      const result = VideoDatabase.renameVideoInDb(videos, '1', 'New Name', 'new.mp4');

      expect(result[0].displayName).toBe('New Name');
      expect(result[0].filename).toBe('new.mp4');
    });

    it('batch renames videos', () => {
      const videos = [
        createMockVideo({ id: '1', displayName: 'Video 1' }),
        createMockVideo({ id: '2', displayName: 'Video 2' })
      ];

      const renames = [
        { id: '1', displayName: 'Renamed 1', filename: 'renamed1.mp4' },
        { id: '2', displayName: 'Renamed 2' }
      ];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.batchRenameInDb(videos, renames);

      expect(result[0].displayName).toBe('Renamed 1');
      expect(result[0].filename).toBe('renamed1.mp4');
      expect(result[1].displayName).toBe('Renamed 2');
      expect(result[1].filename).toBe('test-video.mp4'); // unchanged
    });
  });

  describe('path and deletion operations', () => {
    it('updates video path', () => {
      const videos = [createMockVideo({ id: '1', path: '/old/path.mp4' })];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.updateVideoPath(videos, '1', '/new/path.mp4', 'new-root');

      expect(result[0].path).toBe('/new/path.mp4');
      expect(result[0].rootKey).toBe('new-root');
    });

    it('removes single video', () => {
      const videos = [
        createMockVideo({ id: '1' }),
        createMockVideo({ id: '2' })
      ];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.removeVideo(videos, '1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('removes videos by directory', () => {
      const videos = [
        createMockVideo({ id: '1', rootKey: 'root1', path: 'folder1/video1.mp4' }),
        createMockVideo({ id: '2', rootKey: 'root1', path: 'folder1/subfolder/video2.mp4' }),
        createMockVideo({ id: '3', rootKey: 'root1', path: 'folder2/video3.mp4' }),
        createMockVideo({ id: '4', rootKey: 'root2', path: 'folder1/video4.mp4' })
      ];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.removeVideosByDirectory(videos, 'root1', 'folder1');

      expect(result).toHaveLength(2);
      expect(result.find(v => v.id === '3')).toBeDefined(); // different folder
      expect(result.find(v => v.id === '4')).toBeDefined(); // different root
    });

    it('removes videos by IDs', () => {
      const videos = [
        createMockVideo({ id: '1' }),
        createMockVideo({ id: '2' }),
        createMockVideo({ id: '3' })
      ];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.removeVideosByIds(videos, ['1', '3']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });
  });

  describe('thumbnail management', () => {
    it('updates video thumbnail', () => {
      const videos = [createMockVideo({ id: '1' })];
      const newThumbnail = { dataUrl: 'new-data', generated: true, timestamp: '2024-02-01T10:00:00Z' };

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      const result = VideoDatabase.updateVideoThumbnail(videos, '1', newThumbnail);

      expect(result[0].thumbnail).toEqual(newThumbnail);
    });
  });

  describe('server sync operations', () => {
    it('syncs data to server when healthy', async () => {
      const videos = [createMockVideo({ id: '1' })];
      vi.mocked(serverHealth.isHealthy).mockResolvedValue(true);
      vi.mocked(ApiClient.post).mockResolvedValue(undefined);

      await VideoDatabase.syncAllToServer(videos);

      expect(ApiClient.post).toHaveBeenCalledWith('/api/videos/bulk_upsert', {
        videos: expect.arrayContaining([
          expect.objectContaining({ id: '1', lastModified: expect.any(String) })
        ])
      });
    });

    it('skips sync when server is unhealthy', async () => {
      const videos = [createMockVideo({ id: '1' })];
      vi.mocked(serverHealth.isHealthy).mockResolvedValue(false);

      await VideoDatabase.syncAllToServer(videos);

      expect(ApiClient.post).not.toHaveBeenCalled();
    });

    it('marks server unhealthy on sync error', async () => {
      const videos = [createMockVideo({ id: '1' })];
      VideoDatabase.saveToStorage(videos);
      
      vi.mocked(serverHealth.isHealthy).mockResolvedValue(true);
      vi.mocked(ApiClient.post).mockRejectedValue(new Error('Sync failed'));

      const newVideo = createMockVideo({ id: '2' });
      VideoDatabase.addVideos(videos, [newVideo]);

      // Wait for async sync to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(serverHealth.markUnhealthy).toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('handles empty video arrays gracefully', () => {
      expect(VideoDatabase.getAllCategories([])).toEqual([]);
      expect(VideoDatabase.removeVideosByIds([], ['nonexistent'])).toEqual([]);
    });

    it('handles nonexistent video IDs gracefully', () => {
      const videos = [createMockVideo({ id: '1' })];
      
      const result1 = VideoDatabase.updateVideoCategories(videos, 'nonexistent', { categories: {} });
      expect(result1).toEqual(videos);

      const result2 = VideoDatabase.removeCategory(videos, 'nonexistent', 'age', 'teen');
      expect(result2).toEqual(videos);
    });

    it('handles malformed thumbnail data during normalization', () => {
      const mockData = [{
        ...createMockVideo(),
        thumbnail: { dataUrl: null, generated: 'yes', timestamp: 123 }
      }];

      vi.mocked(serverHealth.isHealthy).mockResolvedValue(true);
      vi.mocked(ApiClient.get).mockResolvedValue(mockData);

      return VideoDatabase.load().then(result => {
        expect(result[0]?.thumbnail?.dataUrl).toBe('');
        expect(result[0]?.thumbnail?.generated).toBe(true);
        expect(result[0]?.thumbnail?.timestamp).toBe('');
      });
    });
  });
});
