import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppSettingsService } from './app-settings';
import { ApiClient } from './api-client';
import { serverHealth } from './server-health';

// Mock dependencies
vi.mock('./api-client');
vi.mock('./server-health');

const mockApiClient = vi.mocked(ApiClient, true);
const mockServerHealth = vi.mocked(serverHealth, true);

describe('AppSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getJson', () => {
    it('returns undefined when server is not healthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(false);

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBeUndefined();
      expect(mockApiClient.get).not.toHaveBeenCalled();
    });

    it('parses JSON response correctly', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      const testData = { setting: true, value: 42 };
      mockApiClient.get.mockResolvedValue({ 
        key: 'test-key', 
        value: JSON.stringify(testData) 
      });

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toEqual(testData);
      expect(mockApiClient.get).toHaveBeenCalledWith('/api/settings/test-key');
    });

    it('handles string values (non-JSON)', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'test-key', 
        value: 'plain string' 
      });

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBe('plain string');
    });

    it('handles boolean migration - parses valid JSON boolean', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'boolean-setting', 
        value: 'true'  // This is valid JSON and will be parsed as boolean
      });

      const result = await AppSettingsService.getJson('boolean-setting');

      expect(result).toBe(true);
    });

    it('handles boolean migration - parses JSON boolean correctly', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'boolean-setting', 
        value: JSON.stringify(true)
      });

      const result = await AppSettingsService.getJson('boolean-setting');

      expect(result).toBe(true);
    });

    it('handles malformed JSON gracefully', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'test-key', 
        value: '{"malformed": json}' 
      });

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBe('{"malformed": json}');
    });

    it('returns undefined for empty/null response', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue(null);

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBeUndefined();
    });

    it('returns undefined when response has no value', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ key: 'test-key' });

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBeUndefined();
    });

    it('handles API client errors and marks server unhealthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBeUndefined();
      expect(mockServerHealth.markUnhealthy).toHaveBeenCalled();
    });

    it('URL encodes the key parameter', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'test key with spaces', 
        value: 'test' 
      });

      await AppSettingsService.getJson('test key with spaces');

      expect(mockApiClient.get).toHaveBeenCalledWith('/api/settings/test%20key%20with%20spaces');
    });

    it('handles complex object JSON parsing', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      const complexData = {
        nested: { object: true },
        array: [1, 2, 3],
        null: null,
        boolean: false
      };
      mockApiClient.get.mockResolvedValue({ 
        key: 'complex', 
        value: JSON.stringify(complexData) 
      });

      const result = await AppSettingsService.getJson('complex');

      expect(result).toEqual(complexData);
    });
  });

  describe('setJson', () => {
    it('does nothing when server is not healthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(false);

      await AppSettingsService.setJson('test-key', { value: 'test' });

      expect(mockApiClient.post).not.toHaveBeenCalled();
    });

    it('posts JSON data to API', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockResolvedValue(undefined);

      const testData = { setting: true, count: 5 };
      await AppSettingsService.setJson('test-key', testData);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/settings/test-key', { value: testData });
    });

    it('handles string values', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockResolvedValue(undefined);

      await AppSettingsService.setJson('test-key', 'string value');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/settings/test-key', { value: 'string value' });
    });

    it('handles boolean values', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockResolvedValue(undefined);

      await AppSettingsService.setJson('boolean-key', true);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/settings/boolean-key', { value: true });
    });

    it('handles null values', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockResolvedValue(undefined);

      await AppSettingsService.setJson('null-key', null);

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/settings/null-key', { value: null });
    });

    it('handles API client errors and marks server unhealthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockRejectedValue(new Error('Network error'));

      await AppSettingsService.setJson('test-key', 'value');

      expect(mockServerHealth.markUnhealthy).toHaveBeenCalled();
    });

    it('URL encodes the key parameter', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.post.mockResolvedValue(undefined);

      await AppSettingsService.setJson('key with spaces & symbols', 'value');

      expect(mockApiClient.post).toHaveBeenCalledWith('/api/settings/key%20with%20spaces%20%26%20symbols', { value: 'value' });
    });
  });

  describe('remove', () => {
    it('does nothing when server is not healthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(false);

      await AppSettingsService.remove('test-key');

      expect(mockApiClient.delete).not.toHaveBeenCalled();
    });

    it('calls API delete endpoint', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.delete.mockResolvedValue(undefined);

      await AppSettingsService.remove('test-key');

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/settings/test-key');
    });

    it('handles API client errors and marks server unhealthy', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.delete.mockRejectedValue(new Error('Network error'));

      await AppSettingsService.remove('test-key');

      expect(mockServerHealth.markUnhealthy).toHaveBeenCalled();
    });

    it('URL encodes the key parameter', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.delete.mockResolvedValue(undefined);

      await AppSettingsService.remove('key/with/slashes');

      expect(mockApiClient.delete).toHaveBeenCalledWith('/api/settings/key%2Fwith%2Fslashes');
    });
  });

  describe('type safety and edge cases', () => {
    it('handles undefined values in getJson', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'test-key', 
        value: undefined as any
      });

      const result = await AppSettingsService.getJson('test-key');

      expect(result).toBeUndefined();
    });

    it('handles numeric values correctly', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      mockApiClient.get.mockResolvedValue({ 
        key: 'number-key', 
        value: JSON.stringify(42)
      });

      const result = await AppSettingsService.getJson<number>('number-key');

      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('handles array values correctly', async () => {
      mockServerHealth.isHealthy.mockResolvedValue(true);
      const arrayData = ['item1', 'item2', 'item3'];
      mockApiClient.get.mockResolvedValue({ 
        key: 'array-key', 
        value: JSON.stringify(arrayData)
      });

      const result = await AppSettingsService.getJson<string[]>('array-key');

      expect(result).toEqual(arrayData);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
