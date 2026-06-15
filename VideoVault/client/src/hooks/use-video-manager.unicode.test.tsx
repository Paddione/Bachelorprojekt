import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { useVideoManager } from './use-video-manager';
import { VideoThumbnailService } from '@/services/video-thumbnail';
import { VideoUrlRegistry } from '@/services/video-url-registry';
import { VideoDatabase } from '@/services/video-database';
import { serverHealth } from '@/services/server-health';
import { FileScanner } from '@/services/file-scanner';

// Mock video-splitter to avoid ffmpeg import issues
vi.mock('@/services/video-splitter', () => ({
  VideoSplitter: {
    splitVideo: vi.fn(),
  },
}));

// Lightweight test component to exercise the hook
function TestHarness() {
  const vm = useVideoManager();
  (globalThis as any).__vm = vm;
  return <div data-testid="hook-mounted" />;
}

describe('useVideoManager unicode scan smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles a directory scan with non-Latin filenames without errors', async () => {
    // Keep initial load minimal and avoid remote hydration
    vi.spyOn(VideoDatabase, 'loadFromStorage').mockReturnValue([]);
    vi.spyOn(serverHealth, 'isHealthy').mockResolvedValue(false as any);

    // Cheap stubs for heavy services (not strictly needed when mocking FileScanner)
    vi.spyOn(VideoThumbnailService, 'generateThumbnail').mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,',
      generated: false,
      timestamp: new Date().toISOString(),
    });
    vi.spyOn(VideoThumbnailService, 'extractVideoMetadata').mockResolvedValue({
      duration: 1,
      width: 1280,
      height: 720,
      bitrate: 0,
      codec: 'Unknown',
      fps: 30,
      aspectRatio: '16:9',
    });
    vi.spyOn(VideoUrlRegistry, 'register').mockReturnValue('blob:mock');

    render(<TestHarness />);
    const vm0 = (globalThis as any).__vm as ReturnType<typeof useVideoManager>;
    expect(vm0).toBeTruthy();

    const filename = 'こんにちは — тест.mp4';
    const video = {
      id: 'mockid',
      filename,
      displayName: 'Smoke',
      path: filename,
      size: 1,
      lastModified: new Date().toISOString(),
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
        duration: 1,
        width: 1280,
        height: 720,
        bitrate: 0,
        codec: 'Unknown',
        fps: 30,
        aspectRatio: '16:9',
      },
      thumbnail: {
        dataUrl: 'data:image/jpeg;base64,',
        generated: false,
        timestamp: new Date().toISOString(),
      },
      rootKey: 'test',
    } as const;
    vi.spyOn(FileScanner, 'scanDirectory').mockResolvedValue([video] as any);

    await act(async () => {
      const vm = (globalThis as any).__vm as ReturnType<typeof useVideoManager>;
      await vm.actions.scanDirectory();
    });

    await waitFor(
      () => {
        const vmLatest = (globalThis as any).__vm as ReturnType<typeof useVideoManager>;
        expect(vmLatest.state.videos.length).toBe(1);
        expect(vmLatest.state.videos[0].filename).toBe(filename);
        expect(typeof vmLatest.state.videos[0].id).toBe('string');
        expect(vmLatest.state.videos[0].id.length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });
});
