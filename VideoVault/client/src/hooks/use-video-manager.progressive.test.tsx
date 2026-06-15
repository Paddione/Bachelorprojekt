import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { useVideoManager } from './use-video-manager';
import { VideoDatabase } from '@/services/video-database';
import { serverHealth } from '@/services/server-health';
import { DirectoryDatabase } from '@/services/directory-database';
import { Video } from '@/types/video';
import { FilterEngine } from '@/services/filter-engine';

// Mock video-splitter
vi.mock('@/services/video-splitter', () => ({
  VideoSplitter: {
    splitVideo: vi.fn(),
  },
}));

// Mock FilterEngine and EnhancedFilterEngine
vi.mock('@/services/filter-engine', () => ({
  FilterEngine: {
    getAvailableCategories: vi.fn().mockReturnValue([{ type: 'test', value: 'mock', count: 1 }]),
    getAvailableCategoriesFromVideos: vi.fn(),
  },
}));

vi.mock('@/services/enhanced-filter-engine', () => ({
  EnhancedFilterEngine: {
    addVideosToSearchIndex: vi.fn(),
    initializeSearchIndex: vi.fn(),
    applyFiltersWithSearch: vi.fn().mockImplementation((videos: any[]): any => videos),
    updateFilterCountsWithSearch: vi
      .fn()
      .mockReturnValue([{ type: 'test', value: 'mock', count: 1 }]),
  },
}));

// Mock ProgressiveLoader to control execution
vi.mock('@/services/progressive-loader', () => {
  return {
    ProgressiveLoader: {
      loadInChunks: async (data: any[], options: any): Promise<any[]> => {
        const { chunkSize = 500, onProgress, onChunkLoaded } = options;
        const chunks: any[] = [];
        for (let i = 0; i < data.length; i += chunkSize) {
          chunks.push(data.slice(i, i + chunkSize));
        }

        let totalLoaded = 0;
        for (const chunk of chunks) {
          // Simulate async delay
          await new Promise((resolve) => setTimeout(resolve, 100));
          totalLoaded += chunk.length;
          onProgress?.(totalLoaded, data.length);
          onChunkLoaded?.(chunk, totalLoaded);
        }
        return data;
      },
    },
  };
});

function TestHarness() {
  const vm = useVideoManager();
  (globalThis as any).__testVM = vm;
  return <div data-testid="hook-mounted" />;
}

describe('useVideoManager - Progressive Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(serverHealth, 'isHealthy').mockResolvedValue(true);
    vi.spyOn(DirectoryDatabase, 'hydrateFromServer').mockResolvedValue(undefined);
    vi.spyOn(DirectoryDatabase, 'getLastRootKey').mockReturnValue(null);
    vi.spyOn(VideoDatabase, 'loadTags').mockResolvedValue([]);
  });

  it('should defer availableCategories calculation until loading is complete', async () => {
    // Generate 1500 mock videos
    const mockVideos: Video[] = Array.from({ length: 1500 }, (_, i) => ({
      id: `vid-${i}`,
      filename: `video-${i}.mp4`,
      displayName: `Video ${i}`,
      path: `/path/to/video-${i}.mp4`,
      size: 1000,
      lastModified: new Date().toISOString(),
      categories: {
        age: ['test'],
        physical: [],
        ethnicity: [],
        relationship: [],
        acts: [],
        setting: [],
        quality: [],
        performer: [],
      },
      customCategories: {},
      tags: [],
      metadata: {
        duration: 0,
        width: 0,
        height: 0,
        bitrate: 0,
        codec: '',
        fps: 0,
        aspectRatio: '',
      },
      thumbnail: { dataUrl: '', timestamp: '', generated: false },
    }));

    vi.spyOn(VideoDatabase, 'load').mockResolvedValue(mockVideos);

    render(<TestHarness />);

    // Wait for some videos to be loaded
    await waitFor(() => {
      const vm = (globalThis as any).__testVM;
      expect(vm.state.videos.length).toBeGreaterThan(0);
    });

    // Check state during loading
    let vm = (globalThis as any).__testVM;
    expect(vm.state.isProgressiveLoading).toBe(true);

    // Verify getAvailableCategories was NOT called during chunk loading
    // It should have been called once during initialization (line 125)
    expect(FilterEngine.getAvailableCategories).toHaveBeenCalledTimes(1);

    // Wait for loading to finish
    await waitFor(
      () => {
        vm = (globalThis as any).__testVM;
        expect(vm.state.isProgressiveLoading).toBe(false);
      },
      { timeout: 5000 },
    );

    // Now availableCategories should be populated (called again at the end)
    vm = (globalThis as any).__testVM;

    expect(vm.state.videos.length).toBe(1500);
    expect(FilterEngine.getAvailableCategories).toHaveBeenCalledTimes(2);
    expect(vm.state.availableCategories.length).toBeGreaterThan(0);
  });
});
