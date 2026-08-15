import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DirectoryDatabase, DirectoryRootsState } from './directory-database';
import { ApiClient } from './api-client';
import { serverHealth } from './server-health';
import { AppSettingsService } from './app-settings';

// Mock dependencies
vi.mock('./api-client');
vi.mock('./server-health');
vi.mock('./app-settings');

const mockApiClient = vi.mocked(ApiClient, true);
const mockServerHealth = vi.mocked(serverHealth, true);
const mockAppSettings = vi.mocked(AppSettingsService, true);

// Helper to reset internal state
function resetInternalState() {
  // Access private state through reflection for testing
  (DirectoryDatabase as any).state = { lastRootKey: null, roots: {} };
}

describe('DirectoryDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInternalState();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('normalizeDir', () => {
    it('normalizes Windows-style paths to Unix-style', () => {
      expect(DirectoryDatabase.normalizeDir('folder\\subfolder\\')).toBe('folder/subfolder/');
      expect(DirectoryDatabase.normalizeDir('folder\\subfolder')).toBe('folder/subfolder/');
    });

    it('adds trailing slash to directories', () => {
      expect(DirectoryDatabase.normalizeDir('folder/subfolder')).toBe('folder/subfolder/');
      expect(DirectoryDatabase.normalizeDir('folder/subfolder/')).toBe('folder/subfolder/');
    });

    it('removes leading slashes', () => {
      expect(DirectoryDatabase.normalizeDir('/folder/subfolder/')).toBe('folder/subfolder/');
      expect(DirectoryDatabase.normalizeDir('///folder/subfolder')).toBe('folder/subfolder/');
    });

    it('removes trailing slashes then adds one', () => {
      expect(DirectoryDatabase.normalizeDir('folder/subfolder///')).toBe('folder/subfolder/');
    });

    it('handles root directory correctly', () => {
      expect(DirectoryDatabase.normalizeDir('')).toBe('');
      expect(DirectoryDatabase.normalizeDir('/')).toBe('');
      expect(DirectoryDatabase.normalizeDir('//')).toBe('');
    });

    it('handles single directory names', () => {
      expect(DirectoryDatabase.normalizeDir('folder')).toBe('folder/');
    });
  });

  describe('hydrateFromServer', () => {
    it('does nothing when server is not healthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(false);

      await DirectoryDatabase.hydrateFromServer();

      expect(mockApiClient.get).not.toHaveBeenCalled();
      expect(DirectoryDatabase.listRoots()).toEqual([]);
    });

    it('loads roots and last root key from server', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get
        .mockResolvedValueOnce({
          roots: [
            { rootKey: 'root1', name: 'First Root', directories: ['dir1', 'dir2/'] },
            { rootKey: 'root2', name: 'Second Root', directories: ['subdir\\test'] },
          ],
        })
        .mockResolvedValueOnce({ lastRootKey: 'root1' });

      await DirectoryDatabase.hydrateFromServer();

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/roots');
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/roots/last');

      const roots = DirectoryDatabase.listRoots();
      expect(roots).toHaveLength(2);
      expect(roots[0]).toEqual({ rootKey: 'root1', name: 'First Root' });
      expect(roots[1]).toEqual({ rootKey: 'root2', name: 'Second Root' });

      expect(DirectoryDatabase.getLastRootKey()).toBe('root1');
      expect(DirectoryDatabase.getDirectories('root1')).toEqual(['dir1/', 'dir2/']);
      expect(DirectoryDatabase.getDirectories('root2')).toEqual(['subdir/test/']);
    });

    it('handles empty server response', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get
        .mockResolvedValueOnce({ roots: [] })
        .mockResolvedValueOnce({ lastRootKey: null });

      await DirectoryDatabase.hydrateFromServer();

      expect(DirectoryDatabase.listRoots()).toEqual([]);
      expect(DirectoryDatabase.getLastRootKey()).toBeNull();
    });

    it('handles server error and marks unhealthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      await DirectoryDatabase.hydrateFromServer();

      expect(mockServerHealth.markUnhealthy).toHaveBeenCalled();
    });

    it('handles malformed server data', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValueOnce({ roots: null }).mockResolvedValueOnce({});

      await DirectoryDatabase.hydrateFromServer();

      expect(DirectoryDatabase.listRoots()).toEqual([]);
      expect(DirectoryDatabase.getLastRootKey()).toBeNull();
    });

    it('handles roots with missing directories', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get
        .mockResolvedValueOnce({
          roots: [
            { rootKey: 'root1', name: 'Root 1' }, // No directories
            { rootKey: 'root2', name: 'Root 2', directories: null }, // Null directories
          ],
        })
        .mockResolvedValueOnce({ lastRootKey: 'root1' });

      await DirectoryDatabase.hydrateFromServer();

      expect(DirectoryDatabase.getDirectories('root1')).toEqual([]);
      expect(DirectoryDatabase.getDirectories('root2')).toEqual([]);
    });
  });

  describe('setRootDirectories', () => {
    it('creates new root with directories', () => {
      void DirectoryDatabase.setRootDirectories('newRoot', ['dir1', 'dir2/'], 'New Root');

      const roots = DirectoryDatabase.listRoots();
      expect(roots).toEqual([{ rootKey: 'newRoot', name: 'New Root' }]);
      expect(DirectoryDatabase.getDirectories('newRoot')).toEqual(['dir1/', 'dir2/']);
      expect(DirectoryDatabase.getLastRootKey()).toBe('newRoot');
    });

    it('updates existing root directories', () => {
      void DirectoryDatabase.setRootDirectories('root1', ['initial/'], 'Root 1');
      void DirectoryDatabase.setRootDirectories(
        'root1',
        ['updated/', 'another/'],
        'Updated Root 1',
      );

      expect(DirectoryDatabase.getDirectories('root1')).toEqual(['updated/', 'another/']);
      const roots = DirectoryDatabase.listRoots();
      expect(roots[0].name).toBe('Updated Root 1');
    });

    it('uses rootKey as name when no name provided', () => {
      void DirectoryDatabase.setRootDirectories('autoName', ['dir/']);

      const roots = DirectoryDatabase.listRoots();
      expect(roots[0]).toEqual({ rootKey: 'autoName', name: 'autoName' });
    });

    it('preserves existing name when no new name provided', () => {
      void DirectoryDatabase.setRootDirectories('root1', ['dir/'], 'Original Name');
      void DirectoryDatabase.setRootDirectories('root1', ['newDir/']);

      const roots = DirectoryDatabase.listRoots();
      expect(roots[0].name).toBe('Original Name');
    });

    it('deduplicates directories', () => {
      void DirectoryDatabase.setRootDirectories(
        'root1',
        ['dir/', 'dir', 'dir2/', 'dir2'],
        'Test Root',
      );

      expect(DirectoryDatabase.getDirectories('root1')).toEqual(['dir/', 'dir2/']);
    });

    it('normalizes directory paths', () => {
      void DirectoryDatabase.setRootDirectories('root1', ['dir\\sub', 'another/sub/'], 'Test Root');

      expect(DirectoryDatabase.getDirectories('root1')).toEqual(['dir/sub/', 'another/sub/']);
    });

    it('calls sync method when server is available', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockResolvedValue(undefined);

      void DirectoryDatabase.setRootDirectories('root1', ['dir/'], 'Test Root');

      // Wait for async sync to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/roots', {
        rootKey: 'root1',
        directories: ['dir/'],
        name: 'Test Root',
      });
    });
  });

  describe('addDirectory', () => {
    beforeEach(() => {
      void DirectoryDatabase.setRootDirectories('existingRoot', ['existing/'], 'Existing Root');
    });

    it('adds directory to existing root', () => {
      DirectoryDatabase.addDirectory('existingRoot', 'newDir');

      expect(DirectoryDatabase.getDirectories('existingRoot')).toContain('newDir/');
      expect(DirectoryDatabase.getLastRootKey()).toBe('existingRoot');
    });

    it('creates new root if it does not exist', () => {
      DirectoryDatabase.addDirectory('newRoot', 'someDir');

      const roots = DirectoryDatabase.listRoots();
      expect(roots.some((r) => r.rootKey === 'newRoot')).toBe(true);
      expect(DirectoryDatabase.getDirectories('newRoot')).toEqual(['someDir/']);
    });

    it('does not add duplicate directories', () => {
      DirectoryDatabase.addDirectory('existingRoot', 'existing');

      const directories = DirectoryDatabase.getDirectories('existingRoot');
      const existingCount = directories.filter((d) => d === 'existing/').length;
      expect(existingCount).toBe(1);
    });

    it('normalizes paths when adding', () => {
      DirectoryDatabase.addDirectory('existingRoot', 'windows\\path');

      expect(DirectoryDatabase.getDirectories('existingRoot')).toContain('windows/path/');
    });

    it('uses rootKey as name for new roots', () => {
      DirectoryDatabase.addDirectory('autoNamedRoot', 'dir/');

      const roots = DirectoryDatabase.listRoots();
      const newRoot = roots.find((r) => r.rootKey === 'autoNamedRoot');
      expect(newRoot?.name).toBe('autoNamedRoot');
    });
  });

  describe('removeDirectory', () => {
    beforeEach(() => {
      void DirectoryDatabase.setRootDirectories(
        'testRoot',
        ['parent/', 'parent/child/', 'parent/child/grandchild/', 'other/'],
        'Test Root',
      );
    });

    it('removes specific directory', () => {
      DirectoryDatabase.removeDirectory('testRoot', 'other');

      const directories = DirectoryDatabase.getDirectories('testRoot');
      expect(directories).not.toContain('other/');
    });

    it('removes directory and all subdirectories', () => {
      DirectoryDatabase.removeDirectory('testRoot', 'parent');

      const directories = DirectoryDatabase.getDirectories('testRoot');
      expect(directories).toEqual(['other/']); // Only non-parent directories should remain
    });

    it('handles non-existent root gracefully', () => {
      expect(() => {
        DirectoryDatabase.removeDirectory('nonExistentRoot', 'someDir');
      }).not.toThrow();
    });

    it('handles non-existent directory gracefully', () => {
      const originalDirs = DirectoryDatabase.getDirectories('testRoot');

      DirectoryDatabase.removeDirectory('testRoot', 'nonExistent');

      expect(DirectoryDatabase.getDirectories('testRoot')).toEqual(originalDirs);
    });

    it('normalizes path when removing', () => {
      DirectoryDatabase.removeDirectory('testRoot', 'parent\\child');

      const directories = DirectoryDatabase.getDirectories('testRoot');
      expect(directories).not.toContain('parent/child/');
      expect(directories).not.toContain('parent/child/grandchild/');
    });
  });

  describe('getDirectories', () => {
    it('returns empty array for non-existent root', () => {
      expect(DirectoryDatabase.getDirectories('nonExistent')).toEqual([]);
    });

    it('returns directories for existing root', () => {
      void DirectoryDatabase.setRootDirectories('test', ['dir1/', 'dir2/']);

      expect(DirectoryDatabase.getDirectories('test')).toEqual(['dir1/', 'dir2/']);
    });
  });

  describe('listRoots', () => {
    it('returns empty array when no roots exist', () => {
      expect(DirectoryDatabase.listRoots()).toEqual([]);
    });

    it('returns all roots with keys and names', () => {
      void DirectoryDatabase.setRootDirectories('root1', ['dir/'], 'First Root');
      void DirectoryDatabase.setRootDirectories('root2', ['other/'], 'Second Root');

      const roots = DirectoryDatabase.listRoots();
      expect(roots).toHaveLength(2);
      expect(roots).toContainEqual({ rootKey: 'root1', name: 'First Root' });
      expect(roots).toContainEqual({ rootKey: 'root2', name: 'Second Root' });
    });
  });

  describe('lastRootKey management', () => {
    it('returns null initially', () => {
      expect(DirectoryDatabase.getLastRootKey()).toBeNull();
    });

    it('updates when setting root directories', () => {
      void DirectoryDatabase.setRootDirectories('test', ['dir/']);
      expect(DirectoryDatabase.getLastRootKey()).toBe('test');
    });

    it('updates when adding directory', () => {
      DirectoryDatabase.addDirectory('newRoot', 'dir/');
      expect(DirectoryDatabase.getLastRootKey()).toBe('newRoot');
    });

    it('can be set explicitly', () => {
      void DirectoryDatabase.setRootDirectories('root1', ['dir/']);
      void DirectoryDatabase.setRootDirectories('root2', ['other/']);

      DirectoryDatabase.setLastRootKey('root1');
      expect(DirectoryDatabase.getLastRootKey()).toBe('root1');
    });
  });

  describe('removeRoot', () => {
    beforeEach(() => {
      void DirectoryDatabase.setRootDirectories('root1', ['dir1/'], 'Root 1');
      void DirectoryDatabase.setRootDirectories('root2', ['dir2/'], 'Root 2');
      void DirectoryDatabase.setRootDirectories('root3', ['dir3/'], 'Root 3');
    });

    it('removes specified root', () => {
      DirectoryDatabase.removeRoot('root2');

      const roots = DirectoryDatabase.listRoots();
      expect(roots).toHaveLength(2);
      expect(roots.some((r) => r.rootKey === 'root2')).toBe(false);
    });

    it('updates lastRootKey when removing current root', () => {
      DirectoryDatabase.setLastRootKey('root2');
      DirectoryDatabase.removeRoot('root2');

      const lastRoot = DirectoryDatabase.getLastRootKey();
      expect(lastRoot).not.toBe('root2');
      expect(['root1', 'root3']).toContain(lastRoot); // Should be one of remaining roots
    });

    it('sets lastRootKey to null when removing last root', () => {
      DirectoryDatabase.removeRoot('root1');
      DirectoryDatabase.removeRoot('root2');
      DirectoryDatabase.removeRoot('root3');

      expect(DirectoryDatabase.getLastRootKey()).toBeNull();
    });

    it('handles removing non-existent root gracefully', () => {
      const originalRoots = DirectoryDatabase.listRoots();

      DirectoryDatabase.removeRoot('nonExistent');

      expect(DirectoryDatabase.listRoots()).toEqual(originalRoots);
    });
  });

  describe('server synchronization edge cases', () => {
    it('handles server sync failures silently', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockRejectedValue(new Error('Sync failed'));

      // Should not throw
      expect(() => {
        void DirectoryDatabase.setRootDirectories('test', ['dir/']);
      }).not.toThrow();

      // Wait for async sync to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockServerHealth.markUnhealthy).toHaveBeenCalled();
    });

    it('skips sync when server is unhealthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(false);

      void DirectoryDatabase.setRootDirectories('test', ['dir/']);
      void DirectoryDatabase.addDirectory('test', 'another/');
      void DirectoryDatabase.removeDirectory('test', 'another/');
      void DirectoryDatabase.setLastRootKey('test');
      void DirectoryDatabase.removeRoot('test');

      expect(mockApiClient.post).not.toHaveBeenCalled();
      expect(mockApiClient.delete).not.toHaveBeenCalled();
    });
  });
});
