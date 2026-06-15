import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { VideoPlayerModal } from './video-player-modal';
import { Video } from '@/types/video';

vi.mock('@/services/video-url-registry', () => {
  const get = vi.fn();
  return { VideoUrlRegistry: { get } };
});
import { VideoUrlRegistry } from '@/services/video-url-registry';

const makeVideo = (): Video => ({
  id: 'v1',
  filename: 'clip.mp4',
  displayName: 'clip',
  path: 'sub/clip.mp4',
  size: 12345,
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
    duration: 0,
    width: 0,
    height: 0,
    bitrate: 0,
    codec: 'h264',
    fps: 30,
    aspectRatio: '16:9',
  },
  thumbnail: {
    dataUrl: '',
    generated: false,
    timestamp: '',
  },
  rootKey: 'root1',
});

describe('VideoPlayerModal (missing source)', () => {
  beforeEach(() => {
    (VideoUrlRegistry.get as any).mockReturnValue(undefined);
  });
  it('shows fallback message, path hint, and rescan CTA', () => {
    const onRescan = vi.fn();
    render(
      <VideoPlayerModal video={makeVideo()} isOpen={true} onClose={() => {}} onRescan={onRescan} />,
    );

    expect(screen.getByText(/player\.videoUnavailable/i)).toBeTruthy();
    expect(screen.getByText(/player\.path/i)).toBeTruthy();

    const btn = screen.getByTestId('button-rescan-root');
    expect(btn.textContent).toMatch(/player\.rescanRoot/i);
    fireEvent.click(btn);
    expect(onRescan).toHaveBeenCalled();
  });
});

describe('VideoPlayerModal keyboard shortcuts', () => {
  beforeEach(() => {
    (VideoUrlRegistry.get as any).mockReturnValue('blob:mock');
  });
  it('skips ±30s when holding Shift with Arrow keys', () => {
    const video = makeVideo();
    const { container } = render(
      <VideoPlayerModal video={video} isOpen={true} onClose={() => {}} />,
    );

    const videos = screen.getAllByTestId('video-player');
    const videoEl = videos[videos.length - 1] as HTMLVideoElement;
    // Initialize time and duration on element
    Object.defineProperty(videoEl, 'currentTime', { value: 200, writable: true });
    Object.defineProperty(videoEl, 'duration', { value: 400, writable: true });
    // Trigger metadata load to update component state.duration
    fireEvent.loadedMetadata(videoEl);

    const surfaces = screen.getAllByTestId('player-surface');
    const surface = surfaces[surfaces.length - 1];

    // Shift+ArrowRight => +30
    fireEvent.keyDown(surface, { key: 'ArrowRight', shiftKey: true });
    expect(videoEl.currentTime).toBe(230);

    // Shift+ArrowLeft => -30
    fireEvent.keyDown(surface, { key: 'ArrowLeft', shiftKey: true });
    expect(videoEl.currentTime).toBe(200);
  });

  it('shows hover preview container when moving mouse over progress area', async () => {
    const video = makeVideo();
    const { container } = render(
      <VideoPlayerModal video={video} isOpen={true} onClose={() => {}} />,
    );

    const allVideos = screen.getAllByTestId('video-player');
    const videoEl = allVideos[allVideos.length - 1] as HTMLVideoElement;
    Object.defineProperty(videoEl, 'duration', { value: 120, writable: true });
    fireEvent.loadedMetadata(videoEl);

    const areas = screen.getAllByTestId('progress-area');
    const area = areas[areas.length - 1];
    // Simulate a mouse move roughly at 50%
    const rect = { left: 0, width: 400 } as any;
    vi.spyOn(area, 'getBoundingClientRect').mockReturnValue(rect);
    fireEvent.mouseMove(area, { clientX: 200 });

    // allow state to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('thumbnail-preview')).toBeTruthy();
  });
});

describe('VideoPlayerModal forward 10 minutes control', () => {
  beforeEach(() => {
    (VideoUrlRegistry.get as any).mockReturnValue('blob:mock');
  });
  it('advances currentTime by 600 seconds when clicking +10m', () => {
    const video = makeVideo();
    render(<VideoPlayerModal video={video} isOpen={true} onClose={() => {}} />);

    const vids = screen.getAllByTestId('video-player');
    const videoEl = vids[vids.length - 1] as HTMLVideoElement;
    Object.defineProperty(videoEl, 'currentTime', { value: 50, writable: true });
    Object.defineProperty(videoEl, 'duration', { value: 1200, writable: true });
    fireEvent.loadedMetadata(videoEl);

    const btns = screen.getAllByTestId('button-forward-10m');
    const btn = btns[btns.length - 1];
    fireEvent.click(btn);
    expect(videoEl.currentTime).toBe(650);
  });
});
