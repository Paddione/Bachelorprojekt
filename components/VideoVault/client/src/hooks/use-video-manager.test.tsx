import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { useVideoManager } from './use-video-manager';
import { VideoDatabase } from '../services/video-database';
import { serverHealth } from '@/services/server-health';
import { DirectoryDatabase } from '@/services/directory-database';

// Mock video-splitter to avoid ffmpeg import issues
vi.mock('@/services/video-splitter', () => ({
  VideoSplitter: {
    splitVideo: vi.fn(),
  },
}));

// Test component that uses the hook
function TestHarness() {
  const vm = useVideoManager();
  (globalThis as any).__testVM = vm;
  return <div data-testid="hook-mounted" />;
}

describe('useVideoManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock services to avoid side effects
    vi.spyOn(VideoDatabase, 'loadFromStorage').mockReturnValue([]);
    vi.spyOn(VideoDatabase, 'load').mockResolvedValue([]);
    vi.spyOn(serverHealth, 'isHealthy').mockResolvedValue(false);
    vi.spyOn(DirectoryDatabase, 'hydrateFromServer').mockResolvedValue(undefined);
    vi.spyOn(DirectoryDatabase, 'getLastRootKey').mockReturnValue(null);
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      render(<TestHarness />);
      const vm = (globalThis as any).__testVM as ReturnType<typeof useVideoManager>;
      expect(vm).toBeTruthy();
      expect(vm.state).toMatchObject({
        videos: [],
        filteredVideos: [],
        selectedCategories: [],
        searchQuery: '',
        dateRange: { startDate: '', endDate: '' },
        fileSizeRange: { min: 0, max: 0 },
        durationRange: { min: 0, max: 0 },
        isScanning: false,
        scanProgress: { current: 0, total: 0 },
        currentVideo: null,
        availableCategories: [],
        sort: { field: 'displayName', direction: 'asc' },
      });
    });
  });
});
