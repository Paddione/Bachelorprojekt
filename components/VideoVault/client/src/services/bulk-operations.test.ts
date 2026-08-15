import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BulkOperationsService, BulkOperation } from './bulk-operations';
import { Video } from '../types/video';

const mockVideo1: Video = {
  id: 'video-1',
  filename: 'test-video-1.mp4',
  path: '/test/path/test-video-1.mp4',
  size: 1000000,
  lastModified: new Date('2023-01-01').toISOString(),
  displayName: 'Test Video 1',
  rootKey: 'test-root',
  categories: {
    age: [],
    physical: [],
    ethnicity: [],
    relationship: [],
    acts: [],
    setting: [],
    quality: [],
    performer: []
  },
  customCategories: {},
  metadata: {
    duration: 0,
    width: 0,
    height: 0,
    bitrate: 0,
    codec: '',
    fps: 0,
    aspectRatio: ''
  },
  thumbnail: null
};

const mockVideo2: Video = {
  id: 'video-2',
  filename: 'test-video-2.mp4',
  path: '/test/path/test-video-2.mp4',
  size: 2000000,
  lastModified: new Date('2023-01-02').toISOString(),
  displayName: 'Test Video 2',
  rootKey: 'test-root',
  categories: {
    age: [],
    physical: [],
    ethnicity: [],
    relationship: [],
    acts: [],
    setting: [],
    quality: [],
    performer: []
  },
  customCategories: {},
  metadata: {
    duration: 0,
    width: 0,
    height: 0,
    bitrate: 0,
    codec: '',
    fps: 0,
    aspectRatio: ''
  },
  thumbnail: null
};

describe('BulkOperationsService', () => {
  let service: BulkOperationsService;

  beforeEach(() => {
    // Reset singleton instance
    (BulkOperationsService as any).instance = undefined;
    service = BulkOperationsService.getInstance();
    service.deselectAll();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = BulkOperationsService.getInstance();
      const instance2 = BulkOperationsService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(service);
    });
  });

  describe('video selection', () => {
    it('should start with no selection', () => {
      expect(service.getSelectedCount()).toBe(0);
      expect(service.hasSelection()).toBe(false);
      expect(service.getSelectedVideos().size).toBe(0);
    });

    it('should select video', () => {
      service.selectVideo('video-1');

      expect(service.isVideoSelected('video-1')).toBe(true);
      expect(service.getSelectedCount()).toBe(1);
      expect(service.hasSelection()).toBe(true);
    });

    it('should deselect video', () => {
      service.selectVideo('video-1');
      service.deselectVideo('video-1');

      expect(service.isVideoSelected('video-1')).toBe(false);
      expect(service.getSelectedCount()).toBe(0);
      expect(service.hasSelection()).toBe(false);
    });

    it('should toggle video selection', () => {
      service.toggleVideoSelection('video-1');
      expect(service.isVideoSelected('video-1')).toBe(true);

      service.toggleVideoSelection('video-1');
      expect(service.isVideoSelected('video-1')).toBe(false);
    });

    it('should select all videos', () => {
      const videoIds = ['video-1', 'video-2', 'video-3'];
      service.selectAll(videoIds);

      expect(service.getSelectedCount()).toBe(3);
      videoIds.forEach(id => {
        expect(service.isVideoSelected(id)).toBe(true);
      });
    });

    it('should deselect all videos', () => {
      service.selectVideo('video-1');
      service.selectVideo('video-2');
      service.deselectAll();

      expect(service.getSelectedCount()).toBe(0);
      expect(service.hasSelection()).toBe(false);
    });

    it('should clear existing selection when selecting all', () => {
      service.selectVideo('existing-video');
      service.selectAll(['video-1', 'video-2']);

      expect(service.getSelectedCount()).toBe(2);
      expect(service.isVideoSelected('existing-video')).toBe(false);
      expect(service.isVideoSelected('video-1')).toBe(true);
      expect(service.isVideoSelected('video-2')).toBe(true);
    });

    it('should return copy of selected videos set', () => {
      service.selectVideo('video-1');
      const selected = service.getSelectedVideos();
      
      selected.add('video-2');
      expect(service.isVideoSelected('video-2')).toBe(false);
    });
  });

  describe('selection listeners', () => {
    it('should notify listeners on selection changes', () => {
      const listener = vi.fn();
      const unsubscribe = service.addSelectionListener(listener);

      service.selectVideo('video-1');
      expect(listener).toHaveBeenCalledWith(new Set(['video-1']));

      service.deselectVideo('video-1');
      expect(listener).toHaveBeenCalledWith(new Set());

      unsubscribe();
      service.selectVideo('video-2');
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = service.addSelectionListener(listener);

      service.selectVideo('video-1');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      service.selectVideo('video-2');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('keyboard shortcuts', () => {
    it('should handle Ctrl+A to select all', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
      const preventDefault = vi.fn();
      event.preventDefault = preventDefault;

      const handled = service.handleKeyboardSelection(event, 'video-1', ['video-1', 'video-2']);

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(service.getSelectedCount()).toBe(2);
    });

    it('should handle Cmd+A to select all on Mac', () => {
      const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true });
      const preventDefault = vi.fn();
      event.preventDefault = preventDefault;

      const handled = service.handleKeyboardSelection(event, 'video-1', ['video-1', 'video-2']);

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(service.getSelectedCount()).toBe(2);
    });

    it('should handle Escape to deselect all', () => {
      service.selectVideo('video-1');
      service.selectVideo('video-2');

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const preventDefault = vi.fn();
      event.preventDefault = preventDefault;

      const handled = service.handleKeyboardSelection(event, 'video-1', ['video-1', 'video-2']);

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(service.getSelectedCount()).toBe(0);
    });

    it('should handle Ctrl+Space to toggle selection', () => {
      const event = new KeyboardEvent('keydown', { key: ' ', ctrlKey: true });
      const preventDefault = vi.fn();
      event.preventDefault = preventDefault;

      const handled = service.handleKeyboardSelection(event, 'video-1', ['video-1', 'video-2']);

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(service.isVideoSelected('video-1')).toBe(true);
    });

    it('should not handle unrecognized keys', () => {
      const event = new KeyboardEvent('keydown', { key: 'x' });
      const handled = service.handleKeyboardSelection(event, 'video-1', ['video-1', 'video-2']);

      expect(handled).toBe(false);
    });

    it('should not handle regular "a" without modifier', () => {
      const event = new KeyboardEvent('keydown', { key: 'a' });
      const handled = service.handleKeyboardSelection(event, 'video-1', ['video-1', 'video-2']);

      expect(handled).toBe(false);
      expect(service.getSelectedCount()).toBe(0);
    });
  });

  describe('bulk operations creation', () => {
    it('should create category add operation', async () => {
      const operation = await service.addCategoryToVideos([mockVideo1], 'age', 'young');

      expect(operation).toMatchObject({
        type: 'category',
        videos: [mockVideo1],
        metadata: {
          categoryType: 'age',
          categoryValue: 'young'
        },
        status: 'pending'
      });
      expect(operation.id).toMatch(/^bulk-\d+-[a-z0-9]+$/);
      expect(operation.createdAt).toBeInstanceOf(Date);
    });

    it('should create category remove operation', async () => {
      const operation = await service.removeCategoryFromVideos([mockVideo1], 'age', 'young');

      expect(operation).toMatchObject({
        type: 'category',
        videos: [mockVideo1],
        metadata: {
          categoryType: 'age',
          categoryValue: 'young'
        },
        status: 'pending'
      });
    });

    it('should create rename operation', async () => {
      const operation = await service.renameVideos([mockVideo1], 'Video_{index}');

      expect(operation).toMatchObject({
        type: 'rename',
        videos: [mockVideo1],
        metadata: {
          renamePattern: 'Video_{index}'
        },
        status: 'pending'
      });
    });

    it('should create move operation', async () => {
      const operation = await service.moveVideos([mockVideo1], '/new/path');

      expect(operation).toMatchObject({
        type: 'move',
        videos: [mockVideo1],
        metadata: {
          destinationPath: '/new/path'
        },
        status: 'pending'
      });
    });

    it('should create delete operation', async () => {
      const operation = await service.deleteVideos([mockVideo1]);

      expect(operation).toMatchObject({
        type: 'delete',
        videos: [mockVideo1],
        metadata: {},
        status: 'pending'
      });
    });
  });

  describe('operation management', () => {
    let operation: BulkOperation;

    beforeEach(async () => {
      operation = await service.addCategoryToVideos([mockVideo1], 'age', 'young');
    });

    it('should store and retrieve operations', () => {
      const retrieved = service.getOperation(operation.id);
      expect(retrieved).toBe(operation);
    });

    it('should return undefined for non-existent operation', () => {
      const retrieved = service.getOperation('non-existent');
      expect(retrieved).toBeUndefined();
    });

    it('should get all operations sorted by creation date', async () => {
      const operation2 = await service.renameVideos([mockVideo2], 'Pattern');
      
      const allOps = service.getAllOperations();
      expect(allOps).toHaveLength(2);
      expect(allOps[0].createdAt.getTime()).toBeGreaterThanOrEqual(allOps[1].createdAt.getTime());
    });

    it('should update operation status', () => {
      const results = { success: 1, failed: 0, errors: [] };
      service.updateOperationStatus(operation.id, 'completed', results);

      const updated = service.getOperation(operation.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.results).toEqual(results);
    });

    it('should update operation status without results', () => {
      service.updateOperationStatus(operation.id, 'in-progress');

      const updated = service.getOperation(operation.id);
      expect(updated?.status).toBe('in-progress');
      expect(updated?.results).toBeUndefined();
    });

    it('should not update non-existent operation', () => {
      service.updateOperationStatus('non-existent', 'completed');
      // Should not throw error
    });

    it('should remove operation', () => {
      service.removeOperation(operation.id);

      const retrieved = service.getOperation(operation.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('utility methods', () => {
    it('should get selected videos from list', () => {
      service.selectVideo('video-1');
      service.selectVideo('video-3');

      const videoList = [mockVideo1, mockVideo2];
      const selected = service.getSelectedVideosFromList(videoList);

      expect(selected).toEqual([mockVideo1]);
    });

    it('should return empty array when no videos selected', () => {
      const videoList = [mockVideo1, mockVideo2];
      const selected = service.getSelectedVideosFromList(videoList);

      expect(selected).toEqual([]);
    });

    it('should check if operation can be performed', () => {
      expect(service.canPerformOperation('delete')).toBe(false);
      expect(service.canPerformOperation('move')).toBe(false);
      expect(service.canPerformOperation('rename')).toBe(false);
      expect(service.canPerformOperation('category')).toBe(false);

      service.selectVideo('video-1');

      expect(service.canPerformOperation('delete')).toBe(true);
      expect(service.canPerformOperation('move')).toBe(true);
      expect(service.canPerformOperation('rename')).toBe(true);
      expect(service.canPerformOperation('category')).toBe(true);
    });

    it('should return false for unknown operation type', () => {
      service.selectVideo('video-1');
      expect(service.canPerformOperation('unknown' as any)).toBe(false);
    });
  });

  describe('operation ID generation', () => {
    it('should generate unique operation IDs', async () => {
      const operation1 = await service.addCategoryToVideos([mockVideo1], 'age', 'young');
      const operation2 = await service.addCategoryToVideos([mockVideo1], 'age', 'old');

      expect(operation1.id).not.toBe(operation2.id);
      expect(operation1.id).toMatch(/^bulk-\d+-[a-z0-9]+$/);
      expect(operation2.id).toMatch(/^bulk-\d+-[a-z0-9]+$/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty video arrays in operations', async () => {
      const operation = await service.addCategoryToVideos([], 'age', 'young');
      expect(operation.videos).toEqual([]);
    });

    it('should handle multiple listeners correctly', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      service.addSelectionListener(listener1);
      service.addSelectionListener(listener2);

      service.selectVideo('video-1');

      expect(listener1).toHaveBeenCalledWith(new Set(['video-1']));
      expect(listener2).toHaveBeenCalledWith(new Set(['video-1']));
    });

    it('should handle operation status update for non-existent operation gracefully', () => {
      expect(() => {
        service.updateOperationStatus('non-existent', 'completed');
      }).not.toThrow();
    });

    it('should handle removal of non-existent operation gracefully', () => {
      expect(() => {
        service.removeOperation('non-existent');
      }).not.toThrow();
    });
  });
});
