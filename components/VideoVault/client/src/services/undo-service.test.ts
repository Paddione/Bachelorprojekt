import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UndoService } from './undo-service';

describe('UndoService', () => {
  let service: UndoService;

  beforeEach(() => {
    service = new UndoService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    service.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('register', () => {
    it('should register an undo operation', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file.mp4', undoCallback);

      expect(service.has('test-1')).toBe(true);
      expect(service.size).toBe(1);
    });

    it('should store the correct entry details', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'rename', 'Rename video', undoCallback);
      const entry = service.get('test-1');

      expect(entry).toMatchObject({
        id: 'test-1',
        type: 'rename',
        description: 'Rename video',
      });
      expect(entry?.undoCallback).toBe(undoCallback);
      expect(entry?.createdAt).toBeTypeOf('number');
    });

    it('should return a cleanup function', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      const cleanup = service.register('test-1', 'delete', 'Delete file', undoCallback);

      expect(service.has('test-1')).toBe(true);
      cleanup();
      expect(service.has('test-1')).toBe(false);
    });

    it('should auto-cleanup after default timeout', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback);
      expect(service.has('test-1')).toBe(true);

      // Fast-forward past default timeout (10 seconds)
      vi.advanceTimersByTime(10001);

      expect(service.has('test-1')).toBe(false);
    });

    it('should respect custom timeout', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback, { timeout: 5000 });
      expect(service.has('test-1')).toBe(true);

      // Advance past custom timeout
      vi.advanceTimersByTime(5001);

      expect(service.has('test-1')).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute the undo callback', async () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback);

      await service.execute('test-1');

      expect(undoCallback).toHaveBeenCalledOnce();
    });

    it('should clean up after execution', async () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback);
      expect(service.has('test-1')).toBe(true);

      await service.execute('test-1');

      expect(service.has('test-1')).toBe(false);
    });

    it('should throw error for non-existent operation', async () => {
      await expect(service.execute('non-existent')).rejects.toThrow(
        'Undo operation non-existent not found or has expired',
      );
    });

    it('should clean up even if callback throws', async () => {
      const undoCallback = vi.fn().mockRejectedValue(new Error('Undo failed'));

      service.register('test-1', 'delete', 'Delete file', undoCallback);

      await expect(service.execute('test-1')).rejects.toThrow('Undo failed');

      // Should still be cleaned up
      expect(service.has('test-1')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return entry if it exists', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'move', 'Move file', undoCallback);
      const entry = service.get('test-1');

      expect(entry).toBeDefined();
      expect(entry?.id).toBe('test-1');
    });

    it('should return undefined for non-existent entry', () => {
      const entry = service.get('non-existent');
      expect(entry).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for existing operation', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback);
      expect(service.has('test-1')).toBe(true);
    });

    it('should return false for non-existent operation', () => {
      expect(service.has('non-existent')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no operations', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('should return all registered operations', () => {
      const cb1 = vi.fn().mockResolvedValue(undefined);
      const cb2 = vi.fn().mockResolvedValue(undefined);
      const cb3 = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file 1', cb1);
      service.register('test-2', 'rename', 'Rename file 2', cb2);
      service.register('test-3', 'move', 'Move file 3', cb3);

      const all = service.getAll();
      expect(all).toHaveLength(3);
      expect(all.map((e) => e.id)).toEqual(['test-1', 'test-2', 'test-3']);
    });
  });

  describe('cancel', () => {
    it('should remove the operation without executing', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback);
      expect(service.has('test-1')).toBe(true);

      service.cancel('test-1');

      expect(service.has('test-1')).toBe(false);
      expect(undoCallback).not.toHaveBeenCalled();
    });

    it('should clear the timeout', () => {
      const undoCallback = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete file', undoCallback);
      service.cancel('test-1');

      // Advance time past when timeout would have fired
      vi.advanceTimersByTime(10001);

      // Should still be gone (no double cleanup issues)
      expect(service.has('test-1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all operations', () => {
      const cb1 = vi.fn().mockResolvedValue(undefined);
      const cb2 = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete 1', cb1);
      service.register('test-2', 'delete', 'Delete 2', cb2);

      expect(service.size).toBe(2);

      service.clear();

      expect(service.size).toBe(0);
      expect(service.getAll()).toEqual([]);
    });

    it('should clear all timeouts', () => {
      const cb1 = vi.fn().mockResolvedValue(undefined);
      const cb2 = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete 1', cb1);
      service.register('test-2', 'delete', 'Delete 2', cb2);

      service.clear();

      // Advance time to ensure no timeouts fire
      vi.advanceTimersByTime(10001);

      expect(service.size).toBe(0);
    });
  });

  describe('size', () => {
    it('should return 0 for empty service', () => {
      expect(service.size).toBe(0);
    });

    it('should return correct count', () => {
      const cb = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete 1', cb);
      expect(service.size).toBe(1);

      service.register('test-2', 'delete', 'Delete 2', cb);
      expect(service.size).toBe(2);

      service.cancel('test-1');
      expect(service.size).toBe(1);
    });
  });

  describe('multiple operations', () => {
    it('should handle multiple operations independently', async () => {
      const cb1 = vi.fn().mockResolvedValue(undefined);
      const cb2 = vi.fn().mockResolvedValue(undefined);
      const cb3 = vi.fn().mockResolvedValue(undefined);

      service.register('test-1', 'delete', 'Delete 1', cb1, { timeout: 5000 });
      service.register('test-2', 'rename', 'Rename 2', cb2, { timeout: 10000 });
      service.register('test-3', 'move', 'Move 3', cb3, { timeout: 15000 });

      expect(service.size).toBe(3);

      // Execute one
      await service.execute('test-2');
      expect(cb2).toHaveBeenCalled();
      expect(service.size).toBe(2);

      // Let one timeout
      vi.advanceTimersByTime(5001);
      expect(service.size).toBe(1);
      expect(service.has('test-1')).toBe(false);

      // Cancel the last one
      service.cancel('test-3');
      expect(service.size).toBe(0);
    });
  });
});
